import { GoogleGenerativeAI } from '@google/generative-ai';

interface ToolCall {
  name: string;
  args: Record<string, any>;
}

interface ParsedResponse {
  reasoning: string;
  toolCalls: ToolCall[];
  code: string;
}

export interface EditRequest {
  filePath: string;
  startLine: number;
  endLine: number;
  newContent: string;
}

// Parse tool calls from Gemini response
function extractToolCalls(text: string): ToolCall[] {
  const toolCallPattern = /\[TOOL\]\s*([a-zA-Z_]+)\s*\(([\s\S]*?)\)\s*\[\/TOOL\]/g;
  const tools: ToolCall[] = [];
  
  let match;
  while ((match = toolCallPattern.exec(text)) !== null) {
    const toolName = match[1];
    const argsText = match[2];
    
    // Parse arguments
    const args: Record<string, any> = {};
    const argPattern = /([a-zA-Z_]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\d+))/g;
    
    let argMatch;
    while ((argMatch = argPattern.exec(argsText)) !== null) {
      const argName = argMatch[1];
      const stringValue1 = argMatch[2];
      const stringValue2 = argMatch[3];
      const numberValue = argMatch[4];
      
      args[argName] = stringValue1 !== undefined ? stringValue1 : 
                    stringValue2 !== undefined ? stringValue2 :
                    numberValue !== undefined ? parseInt(numberValue) : null;
    }
    
    tools.push({
      name: toolName,
      args
    });
  }
  
  return tools;
}

export type GeminiMode = 'auto' | 'explain' | 'fix' | 'optimize' | 'output' | 'agent' | 'ask' | 'manual';

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY)

function getPrompt(mode: GeminiMode, code: string, query: string): string {
  switch (mode) {
    case 'agent':
      return `You are an advanced AI coding agent with access to the following tools for interacting with the codebase:
[TOOL] create_file(filePath="...", content="...") [/TOOL]
[TOOL] read_file(filePath="...") [/TOOL]
[TOOL] edit_file(filePath="...", startLine=1, endLine=5, newContent="...") [/TOOL]
[TOOL] delete_file(filePath="...") [/TOOL]
[TOOL] rename_file(oldPath="...", newPath="...") [/TOOL]
[TOOL] copy_file(srcPath="...", destPath="...") [/TOOL]
[TOOL] move_file(srcPath="...", destPath="...") [/TOOL]
[TOOL] create_dir(path="...") [/TOOL]
[TOOL] list_dir(path="...") [/TOOL]
[TOOL] delete_dir(path="...", recursive=true) [/TOOL]
[TOOL] search_file(query="...", inPath="...", caseSensitive=false) [/TOOL]
[TOOL] find_file(name="*.ts", inPath="src/") [/TOOL]
[TOOL] find_symbol(symbol="useState", inPath="src/") [/TOOL]
[TOOL] run_code(filePath="...", language="...") [/TOOL]
[TOOL] run_tests(testPath="...") [/TOOL]
[TOOL] lint_file(filePath="...", linter="eslint") [/TOOL]
For each improvement, explain your reasoning, then use the appropriate tool(s). Format your response as:
[REASONING] ...
[TOOL] ... [/TOOL]
`;
    case 'ask':
      return `You are an AI coding assistant. Answer the user's question about the codebase. If a tool is needed to answer, use the appropriate tool call as described below:
[TOOL] create_file(filePath="...", content="...") [/TOOL]
[TOOL] read_file(filePath="...") [/TOOL]
[TOOL] edit_file(filePath="...", startLine=1, endLine=5, newContent="...") [/TOOL]
[TOOL] delete_file(filePath="...") [/TOOL]
[TOOL] rename_file(oldPath="...", newPath="...") [/TOOL]
[TOOL] search_file(query="...", inPath="...", caseSensitive=false) [/TOOL]
[TOOL] list_dir(path="...") [/TOOL]
[TOOL] run_code(filePath="...", language="...") [/TOOL]
Explain your reasoning, then use the tool if needed. Format:
[REASONING] ...
[TOOL] ... [/TOOL]
`;
    case 'manual':
      return `You are in manual mode. Only provide step-by-step instructions for the user to follow. Do not use any tool calls.`;
    case 'auto':
      return `You are an AI coding assistant with the ability to use tools to edit code.
    You have access to the following tools to help edit code files:
    [TOOL] edit_file(filePath="path/to/file.py", startLine=1, endLine=5, newContent="new code here") [/TOOL]
    ${query ? `Your task: ${query}\n\n` : ''}
    Analyze this Python code and make necessary improvements. For each improvement:
    1. Explain your reasoning briefly
    2. Use the edit_file tool to apply your change
    3. Use precise line numbers
    Current file: can be any file of any language.
    Code:
    ${code}
    Format your response like this:
    [REASONING] Brief explanation of what needs to be fixed
    [TOOL] edit_file(filePath="main.py", startLine=3, endLine=5, newContent="fixed code here") [/TOOL]
    [REASONING] Next issue explanation
    [TOOL] edit_file(...) [/TOOL]
`;
    case 'explain':
      return `${query ? `Your task: ${query}\n\n` : ''}Explain the functionality of this Python code in bullet points:\n\n${code}`;
    case 'fix':
      return `${query ? `Your task: ${query}\n\n` : ''}Fix this Python code. Return ONLY the corrected code with inline comments explaining changes:\n\n${code}`;
    case 'optimize':
      return `${query ? `Your task: ${query}\n\n` : ''}Optimize this Python code for performance. Return ONLY the optimized code with brief comments:\n\n${code}`;
    case 'output':
      return `${query ? `Your task: ${query}\n\n` : ''}Predict the exact output of this Python code when executed. Only show the output:\n\n${code}`;
    default:
      return 'Explain the following code:';
  }
}

export async function askGemini(
  code: string,
  mode: GeminiMode = 'explain',
  query: string = '',
  onToolCall?: (tool: ToolCall) => void
) {
  if (!code.trim() && !['agent', 'ask', 'manual'].includes(mode)) return 'Please provide code to analyze.';

  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash-latest'
  });

  const prompt = getPrompt(mode, code, query);

  function parseResponse(text: string): ParsedResponse {
    const reasoningSections = text.match(/\[REASONING\]([\s\S]*?)(?=\[(?:REASONING|TOOL|CODE)|$)/g) || [];
    const reasoning = reasoningSections
      .map(section => section.replace(/\[REASONING\]\s*/, '').trim())
      .join('\n\n');
    const toolCalls = extractToolCalls(text);
    let codeBlock = '';
    const codeMatch = text.match(/```python\n([\s\S]*?)\n```/);
    if (codeMatch) {
      codeBlock = codeMatch[1];
    } else if (!toolCalls.length) {
      codeBlock = text;
    }
    return { reasoning, toolCalls, code: codeBlock };
  }

  function processResponse(text: string, mode: string): string {
    if (['fix', 'optimize'].includes(mode)) {
      const codeBlock = text.match(/```python\n([\s\S]*?)\n```/)?.[1] || text;
      return codeBlock;
    }
    if (mode === 'auto') {
      const parsed = parseResponse(text);
      if (onToolCall) {
        parsed.toolCalls.forEach(tool => {
          onToolCall(tool);
        });
      }
      return parsed.reasoning || parsed.code || 'Auto changes applied';
    }
    return text;
  }

  try {
    const result = await model.generateContent(prompt);
    const text = await result.response.text();
    return processResponse(text, mode);
  } catch (err: any) {
    return `API Error: ${err.message}`;
  }
}

