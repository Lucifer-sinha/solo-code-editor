import { useState, useEffect, useRef } from 'react'
import { askGemini } from '../utils/useGemini'
import CodeDiffEditor from './CodeDiffEditor'
import Tabs from './Tabs'
import SecureDevServer from './SecureDevServer'
import '../styles/secure-dev-server.css'

interface Props {
  code: string
  onCodeUpdate: (newCode: string) => void
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  mode: string
  timestamp: string
  toolCalls?: ToolCall[]
  isCode?: boolean
  codeLanguage?: string
}

interface CodeHistoryEntry {
  id: string
  code: string
  timestamp: string
  description: string
}

interface ToolCall {
  name: string
  args: Record<string, any>
}

// Helper function to generate unique IDs
function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

export default function AIHelp({ code, onCodeUpdate }: Props) {
  const [mode, setMode] = useState('explain')
  const [output, setOutput] = useState('👋 Ask me about your code...')
  const [loading, setLoading] = useState(false)
  const [suggestedCode, setSuggestedCode] = useState('')
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([])
  const [codeHistory, setCodeHistory] = useState<CodeHistoryEntry[]>([])
  const [activeTab, setActiveTab] = useState('Chat')
  const [autoMode, setAutoMode] = useState(false)
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [chatInput, setChatInput] = useState('')

  useEffect(() => {
    if (autoMode) {
      const timer = setTimeout(() => {
        handleAsk()
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [code, autoMode])

  useEffect(() => {
    if (autoMode && suggestedCode) {
      onCodeUpdate(suggestedCode)
      setSuggestedCode('')
    }
  }, [suggestedCode, autoMode, onCodeUpdate])

  // Handle tool calls from Gemini
  const handleToolCall = async (tool: ToolCall) => {
    if (mode === 'manual') {
      addSystemMessage('Manual mode: Only instructions are allowed, no tool calls.');
      return;
    }
    switch (tool.name) {
      case 'create_file':
        await createFile(tool.args.filePath, tool.args.content || '');
        addSystemMessage(`Created file: ${tool.args.filePath}`);
        refreshFileTree();
        break;
      case 'read_file': {
        const content = await readFile(tool.args.filePath);
        addSystemMessage(`Read file: ${tool.args.filePath}\n\n${content}`);
        break;
      }
      case 'delete_file':
        if (window.confirm(`Delete file ${tool.args.filePath}?`)) {
          await deleteFile(tool.args.filePath);
          addSystemMessage(`Deleted file: ${tool.args.filePath}`);
          refreshFileTree();
        }
        break;
      case 'rename_file':
        await renameFile(tool.args.oldPath, tool.args.newPath);
        addSystemMessage(`Renamed file from ${tool.args.oldPath} to ${tool.args.newPath}`);
        refreshFileTree();
        break;
      case 'copy_file':
        await copyFile(tool.args.srcPath, tool.args.destPath);
        addSystemMessage(`Copied file from ${tool.args.srcPath} to ${tool.args.destPath}`);
        refreshFileTree();
        break;
      case 'move_file':
        await moveFile(tool.args.srcPath, tool.args.destPath);
        addSystemMessage(`Moved file from ${tool.args.srcPath} to ${tool.args.destPath}`);
        refreshFileTree();
        break;
      case 'create_dir':
        await createDir(tool.args.path);
        addSystemMessage(`Created directory: ${tool.args.path}`);
        refreshFileTree();
        break;
      case 'list_dir': {
        const files = await listDir(tool.args.path);
        addSystemMessage(`Directory listing for ${tool.args.path}:\n${files.join('\n')}`);
        break;
      }
      case 'delete_dir':
        if (window.confirm(`Delete directory ${tool.args.path}?`)) {
          await deleteDir(tool.args.path, tool.args.recursive);
          addSystemMessage(`Deleted directory: ${tool.args.path}`);
          refreshFileTree();
        }
        break;
      case 'search_file': {
        const results = await searchFile(tool.args.query, tool.args.inPath, tool.args.caseSensitive);
        addSystemMessage(`Search results for "${tool.args.query}":\n${results.map(r => r.file + ':' + r.line).join('\n')}`);
        break;
      }
      case 'find_file': {
        const results = await findFile(tool.args.name, tool.args.inPath);
        addSystemMessage(`Files found: ${results.join(', ')}`);
        break;
      }
      case 'find_symbol': {
        const results = await findSymbol(tool.args.symbol, tool.args.inPath);
        addSystemMessage(`Symbol locations: ${results.join(', ')}`);
        break;
      }
      case 'run_code': {
        const output = await runCode(tool.args.filePath, tool.args.language);
        addSystemMessage(`Run output for ${tool.args.filePath}:\n${output}`);
        break;
      }
      case 'run_tests': {
        const results = await runTests(tool.args.testPath);
        addSystemMessage(`Test results: ${results}`);
        break;
      }
      case 'lint_file': {
        const results = await lintFile(tool.args.filePath, tool.args.linter);
        addSystemMessage(`Lint results for ${tool.args.filePath}:\n${results}`);
        break;
      }
      default:
        addSystemMessage(`Unknown tool: ${tool.name}`);
    }
  };
  
  // Add a message to chat history
  const addSystemMessage = (content: string) => {
    setChatHistory(prev => [...prev, {
      id: generateId(),
      role: 'system',
      content,
      mode: 'system',
      timestamp: new Date().toISOString()
    }]);
  };
  
  // Add code version to history
  const addToCodeHistory = (codeSnapshot: string, description: string) => {
    const newEntry: CodeHistoryEntry = {
      id: generateId(),
      code: codeSnapshot,
      timestamp: new Date().toISOString(),
      description
    };
    
    setCodeHistory(prev => [...prev, newEntry]);
    setHistoryIndex(prev => prev + 1);
  };
  
  // Ask Gemini for help
  const handleAsk = async () => {
    if (!chatInput.trim()) {
      addSystemMessage('Please enter a question before sending.');
      return;
    }

    setLoading(true);
    
    // Create a proper message object
    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: `${chatInput}\n\nCurrent code:\n${code}`,
      mode,
      timestamp: new Date().toISOString()
    };
    
    setChatHistory(prev => [...prev, userMessage]);
    setChatInput('');
    
    // Save code state before any modifications
    if (mode === 'auto' || mode === 'fix' || mode === 'optimize') {
      addToCodeHistory(code, `Before ${mode} operation`);
    }
    
    try {
      // For auto mode, pass the tool call handler
      const response = await askGemini(
        code, 
        mode,
        chatInput,
        autoMode ? handleToolCall : undefined
      );
      
      // Create assistant message
      // Detect if the response contains code
      const isCodeResponse = /```[a-z0-9]*\s*\n/gi.test(response);
      const codeLanguage = isCodeResponse ? response.match(/```([a-z0-9]*)\s*\n/gi)?.[0]?.replace(/```|\s*\n/g, '') : undefined;

      const assistantMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: response,
        mode,
        timestamp: new Date().toISOString(),
        isCode: isCodeResponse,
        codeLanguage
      };
      
      setChatHistory(prev => [...prev, assistantMessage]);
      
      // Only set suggested code for fix/optimize modes
      if (['fix', 'optimize'].includes(mode)) {
        setSuggestedCode(response);
      }
    } catch (error) {
      addSystemMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }

  // Apply suggested code changes
  const handleApply = () => {
    // Save to history before applying
    addToCodeHistory(code, 'Before applying suggested changes');
    
    // Apply changes
    onCodeUpdate(suggestedCode);
    setSuggestedCode('');
    
    // Add system message
    addSystemMessage('Applied suggested code changes');
  };
  
  // Restore code from history
  const restoreCodeVersion = (entry: CodeHistoryEntry) => {
    // Save current state first
    addToCodeHistory(code, 'Before restoring previous version');
    
    // Restore the selected version
    onCodeUpdate(entry.code);
    
    // Add system message
    addSystemMessage(`Restored code from history: ${entry.description}`);
  };
  
  // Format timestamp
  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString();
  };

  const showDiffEditor = ['fix', 'optimize'].includes(mode);

  // Detect if code is suitable for dev server
  const isWebFramework = (code: string) => {
    return code.includes('React') || 
           code.includes('import React') || 
           code.includes('export default') ||
           code.includes('<template>') ||
           code.includes('<!DOCTYPE html>') ||
           code.includes('<html');
  };

  const getFrameworkFromCode = (code: string) => {
    if (code.includes('React') || code.includes('import React')) return 'react';
    if (code.includes('<template>') || code.includes('Vue')) return 'vue';
    if (code.includes('<!DOCTYPE html>') || code.includes('<html')) return 'html';
    return 'javascript';
  };

  return (
    <div className="ai-help">
      <Tabs
        tabs={['Chat', 'Code Diff', 'History', 'Live Preview']}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />
      
      {activeTab === 'Chat' && (
        <div className="chat-panel">
          <div className="controls">
            <div className="mode-selector">
              <label>Mode:</label>
              <select value={mode} onChange={e => setMode(e.target.value)}>
                <option value="agent">Agent</option>
                <option value="ask">Ask</option>
                <option value="manual">Manual</option>
              <option value="explain">Explain</option>
              <option value="fix">Fix Code</option>
              <option value="optimize">Optimize</option>
              <option value="output">Predict Output</option>
              <option value="auto">Auto-Edit</option>
            </select>
            </div>
            
        <button
              onClick={handleAsk} 
              disabled={loading}
              className="ask-button"
            >
              {loading ? 'Analyzing...' : 'Ask Gemini'}
        </button>
            
            <label className="auto-mode-toggle">
              <input 
                type="checkbox" 
                checked={autoMode}
                onChange={(e) => setAutoMode(e.target.checked)}
              />
              Auto Apply Changes
            </label>
          </div>
          
          <div className="chat-history">
            {chatHistory.map((message) => (
              <div key={message.id} className={`message ${message.role}`}>
                <div className="message-header">
                  <span className="role">{message.role.toUpperCase()}</span>
                  <span className="mode">{message.mode}</span>
                  <span className="timestamp">{formatTime(message.timestamp)}</span>
                </div>
                <div className="message-content">
                  {message.isCode ? (
                    <div className="code-box">
                      <div className="code-header">
                        <span className="language">{message.codeLanguage?.toUpperCase() || 'CODE'}</span>
                        <div className="code-actions">
                          <button 
                            onClick={() => {
                              if (message.content.includes('```')) {
                                const code = message.content
                                  .split('```')[1]
                                  .split('```')[0]
                                  .trim();
                                onCodeUpdate(code);
                              }
                            }}
                          >
                            Apply Code
                          </button>
                          <button 
                            onClick={() => {
                              if (message.content.includes('```')) {
                                const code = message.content
                                  .split('```')[1]
                                  .split('```')[0]
                                  .trim();
                                navigator.clipboard.writeText(code);
                              }
                            }}
                          >
                            Copy Code
                          </button>
                        </div>
                      </div>
                      <pre className="code-content">
                        {message.content}
                      </pre>
                    </div>
                  ) : (
                    <pre>{message.content}</pre>
                  )}
                    </div>
                  </div>
                ))}
            {loading && (
              <div className="message system">
                <div className="loading-indicator">Gemini is thinking...</div>
              </div>
            )}
          </div>

          <div className="chat-input">
            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Type your question here..."
              rows={3}
              disabled={loading}
              />
              <button
              onClick={() => handleAsk()}
              disabled={loading || !chatInput.trim()}
              className="send-button"
              >
              Send
              </button>
            </div>

          {autoMode && (
            <div className="auto-mode-help">
              <p>
                <strong>Auto Mode Enabled</strong> - Gemini will automatically analyze and improve your code.
              </p>
              <p className="tool-help">
                Gemini can call tools to edit code directly.
                <br/>
                Example: <code>[TOOL] edit_file(filePath="main.py", startLine=3, endLine=5, newContent="fixed code")</code>
              </p>
              </div>
            )}
          </div>
        )}

      {activeTab === 'Code Diff' && suggestedCode ? (
        <CodeDiffEditor
          original={code}
          modified={suggestedCode}
          onApply={handleApply}
          onEdit={setSuggestedCode}
          onDiscard={() => setSuggestedCode('')}
        />
      ) : activeTab === 'Code Diff' && (
        <div className="empty-diff">
          <p>No code suggestions yet. Ask Gemini to fix or optimize your code first.</p>
            </div>
      )}
      
      {activeTab === 'History' && (
        <div className="history-panel">
          <h3>Code History</h3>
          <div className="history-entries">
            {codeHistory.length === 0 ? (
              <p>No code history yet. Make changes to see them here.</p>
            ) : (
              codeHistory.map((entry) => (
                <div key={entry.id} className="history-entry">
                  <div className="entry-header">
                    <span className="timestamp">{formatTime(entry.timestamp)}</span>
                    <span className="description">{entry.description}</span>
                  </div>
                  <div className="entry-actions">
                    <button onClick={() => restoreCodeVersion(entry)}>Restore</button>
                  </div>
                </div>
              ))
            )}
          </div>
          </div>
        )}

      {activeTab === 'Live Preview' && (
        <div className="live-preview-panel">
          {isWebFramework(code) ? (
            <SecureDevServer
              code={code}
              language="javascript"
              framework={getFrameworkFromCode(code)}
              onServerCreated={(server) => {
                console.log('Development server created:', server.proxyUrl);
              }}
            />
          ) : (
            <div className="preview-unavailable">
              <h4>Live Preview Not Available</h4>
              <p>
                Live preview is only available for web frameworks:
                React, Vue, HTML, JavaScript, and TypeScript.
              </p>
              <p>
                Your current code appears to be: <strong>{mode}</strong>
              </p>
              <div className="preview-suggestions">
                <h5>To enable live preview, try:</h5>
                <ul>
                  <li>Create a React component with JSX</li>
                  <li>Write HTML with CSS and JavaScript</li>
                  <li>Build a Vue.js application</li>
                  <li>Create an interactive web page</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
