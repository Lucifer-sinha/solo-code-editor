import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { getApiUrl } from '../config/api';
import { 
  Bot, 
  Wand2, 
  Search, 
  FileText, 
  Code2, 
  Play, 
  Settings, 
  Sparkles, 
  Zap, 
  Brain, 
  Terminal,
  FolderOpen,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Clock,
  Activity,
  MessageSquare,
  Plus,
  Send,
  Copy,
  X,
  Loader
} from 'lucide-react';
import CodeEditor from './Editor/CodeEditor';

interface AdvancedAIToolsPanelProps {
  currentFilePath?: string;
  allOpenFiles?: { [path: string]: string };
  collabId?: string;
  senderId?: string;
  onRefreshFileTree?: () => void;
  onFileUpdate?: (filePath: string, content: string) => void;
  onFileOpen?: (filePath: string) => void;
  terminalRef?: React.RefObject<{ writeToTerminal: (text: string) => void; sendRunCommand: (cmd: string) => void }>;
}

interface ToolResult {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  content: string;
  timestamp: Date;
  duration?: number;
  toolId: string;
}

interface AIConversation {
  id: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  title: string;
  createdAt: Date;
}

// Utility to check for HTML response
function isHTMLResponse(responseText: string) {
  return responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html');
}

// Update all fetch calls to use absolute URL and handle HTML error
const fetchWithJsonCheck = async (url: string, options?: any) => {
  const res = await fetch(url, options);
  const text = await res.text();
  if (isHTMLResponse(text)) {
    throw new Error('Backend not reachable or returned HTML. Check your backend server and API URL.');
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('Invalid JSON response from backend.');
  }
};

export default function AdvancedAIToolsPanel({
  currentFilePath,
  allOpenFiles = {},
  collabId,
  senderId,
  onRefreshFileTree,
  onFileUpdate,
  onFileOpen,
  terminalRef
}: AdvancedAIToolsPanelProps) {
  const { user, token } = useAuth() || {};
  const [activeMode, setActiveMode] = useState<'tools' | 'chat' | 'insights'>('tools');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExecutingTools, setIsExecutingTools] = useState(false);
  const [toolResults, setToolResults] = useState<ToolResult[]>([]);
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // 1. Add state for file search results, selected file, and file content
  const [fileSearchResults, setFileSearchResults] = useState<{file: string, matches: any[]}[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedFileContent, setSelectedFileContent] = useState<string>('');
  const [isFileLoading, setIsFileLoading] = useState(false);

  // AI Tool Categories with Real Implementations
  const toolCategories = [
    {
      id: 'file-ops',
      name: 'File Operations',
      icon: FileText,
      color: '#3b82f6',
      tools: [
        { 
          id: 'create-file', 
          name: 'Create File', 
          description: 'Create files with AI-generated content',
          action: () => handleCreateFile()
        },
        { 
          id: 'analyze-file', 
          name: 'Analyze Code', 
          description: 'Deep code analysis with suggestions',
          action: () => handleAnalyzeFile()
        },
        { 
          id: 'optimize-code', 
          name: 'Optimize Code', 
          description: 'AI-powered code optimization',
          action: () => handleOptimizeCode()
        },
        { 
          id: 'generate-docs', 
          name: 'Generate Docs', 
          description: 'Auto-generate documentation',
          action: () => handleGenerateDocs()
        }
      ]
    },
    {
      id: 'search-ops',
      name: 'Search & Discovery',
      icon: Search,
      color: '#8b5cf6',
      tools: [
        { 
          id: 'smart-search', 
          name: 'Smart Search', 
          description: 'AI-powered code search',
          action: () => handleSmartSearch()
        },
        { 
          id: 'find-bugs', 
          name: 'Find Bugs', 
          description: 'Detect potential issues',
          action: () => handleFindBugs()
        },
        { 
          id: 'find-files', 
          name: 'Find Files', 
          description: 'Advanced file search',
          action: () => handleFindFiles()
        },
        { 
          id: 'grep-search', 
          name: 'Text Search', 
          description: 'Search text in files',
          action: () => handleGrepSearch()
        }
      ]
    },
    {
      id: 'terminal-ops',
      name: 'Terminal Operations',
      icon: Terminal,
      color: '#06d6a0',
      tools: [
        { 
          id: 'run-command', 
          name: 'Run Command', 
          description: 'Execute terminal commands',
          action: () => handleRunCommand()
        },
        { 
          id: 'install-package', 
          name: 'Install Package', 
          description: 'Install dependencies',
          action: () => handleInstallPackage()
        },
        { 
          id: 'git-operations', 
          name: 'Git Operations', 
          description: 'Git commands',
          action: () => handleGitOperations()
        },
        { 
          id: 'system-info', 
          name: 'System Info', 
          description: 'Get system information',
          action: () => handleSystemInfo()
        }
      ]
    },
    {
      id: 'ai-tools',
      name: 'AI Intelligence',
      icon: Brain,
      color: '#f59e0b',
      tools: [
        { 
          id: 'generate-tests', 
          name: 'Generate Tests', 
          description: 'Create unit tests',
          action: () => handleGenerateTests()
        },
        { 
          id: 'refactor-code', 
          name: 'Refactor Code', 
          description: 'Intelligent refactoring',
          action: () => handleRefactorCode()
        },
        { 
          id: 'explain-code', 
          name: 'Explain Code', 
          description: 'Code explanation',
          action: () => handleExplainCode()
        },
        { 
          id: 'code-review', 
          name: 'Code Review', 
          description: 'AI code review',
          action: () => handleCodeReview()
        }
      ]
    }
  ];

  // Real Tool Implementations using Gemini API

  const handleCreateFile = async () => {
    const fileName = prompt('Enter file name (with extension):');
    if (!fileName) return;

    const description = prompt('Describe what this file should contain:');
    if (!description) return;

    await executeAITool('create-file', { fileName, description });
  };

  const handleAnalyzeFile = async () => {
    if (!currentFilePath) {
      alert('Please select a file to analyze');
      return;
    }
    await executeAITool('analyze-file', { 
      filePath: currentFilePath, 
      content: allOpenFiles[currentFilePath] 
    });
  };

  const handleOptimizeCode = async () => {
    if (!currentFilePath) {
      alert('Please select a file to optimize');
      return;
    }
    await executeAITool('optimize-code', { 
      filePath: currentFilePath, 
      content: allOpenFiles[currentFilePath] 
    });
  };

  const handleGenerateDocs = async () => {
    if (!currentFilePath) {
      alert('Please select a file to document');
      return;
    }
    await executeAITool('generate-docs', { 
      filePath: currentFilePath, 
      content: allOpenFiles[currentFilePath] 
    });
  };

  // 2. Add function to fetch file content from backend
  const fetchFileContent = async (filePath: string) => {
    setIsFileLoading(true);
    try {
      const res = await fetch(getApiUrl(`fs/file?path=${encodeURIComponent(filePath)}${collabId ? `&collab_id=${collabId}` : ''}${senderId ? `&senderId=${senderId}` : ''}`), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setSelectedFileContent(data.content || '');
    } catch (e) {
      setSelectedFileContent('// Error loading file');
    } finally {
      setIsFileLoading(false);
    }
  };

  // 3. Add function to save file content to backend
  const saveFileContent = async (filePath: string, content: string) => {
    setIsFileLoading(true);
    try {
      await fetch(getApiUrl('fs/file'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ path: filePath, content, collab_id: collabId, senderId })
      });
      setSelectedFileContent(content);
      addToolResult('success', 'File Saved', `Saved ${filePath}`, 0, 'edit-file');
      onRefreshFileTree?.();
    } catch (e: any) {
      addToolResult('error', 'Save Failed', e.message, 0, 'edit-file');
    } finally {
      setIsFileLoading(false);
    }
  };

  // 4. Update handleSmartSearch to store results and allow file open
  const handleSmartSearch = async () => {
    const query = prompt('Enter search query:');
    if (!query) return;
    setIsProcessing(true);
    setFileSearchResults([]);
    try {
      const result = await executeAITool('smart-search', { query });
      // Parse result.result for file matches (AI returns formatted string)
      const matches = (result.result || '').split('📄').slice(1).map((block: string) => {
        const [fileLine, ...lines] = block.trim().split('\n');
        return { file: fileLine.replace('**', '').replace('**', '').trim(), matches: lines };
      });
      setFileSearchResults(matches);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFindBugs = async () => {
    const files = Object.keys(allOpenFiles);
    if (files.length === 0) {
      alert('No files open to analyze');
      return;
    }
    await executeAITool('find-bugs', { files: allOpenFiles });
  };

  const handleFindFiles = () => {
    const pattern = prompt('Enter file pattern (e.g., *.js, *.py):');
    if (!pattern && terminalRef?.current) {
      terminalRef.current.sendRunCommand(`find . -name "${pattern}" -type f`);
      addToolResult('info', 'File Search', `Searching for files matching: ${pattern}`, 0, 'find-files');
    }
  };

  const handleGrepSearch = () => {
    const text = prompt('Enter text to search:');
    if (!text && terminalRef?.current) {
      terminalRef.current.sendRunCommand(`grep -r "${text}" . -n --color=always`);
      addToolResult('info', 'Text Search', `Searching for text: ${text}`, 0, 'grep-search');
    }
  };

  const handleRunCommand = () => {
    const command = prompt('Enter terminal command:');
    if (!command) return;

    if (terminalRef?.current) {
      terminalRef.current.sendRunCommand(command);
      addToolResult('info', 'Command Executed', `Executed: ${command}`, 0, 'run-command');
    } else {
      addToolResult('error', 'Terminal Not Available', 'Terminal reference not available', 0, 'run-command');
    }
  };

  const handleInstallPackage = () => {
    const packageName = prompt('Enter package name to install:');
    if (!packageName) return;

    const packageManager = prompt('Package manager (npm/pip/pip3):', 'npm');
    
    if (terminalRef?.current) {
      const command = packageManager === 'npm' ? `npm install ${packageName}` : `${packageManager} install ${packageName}`;
      terminalRef.current.sendRunCommand(command);
      addToolResult('info', 'Package Installation', `Installing: ${packageName}`, 0, 'install-package');
    }
  };

  const handleGitOperations = () => {
    const operation = prompt('Git operation (status/add/commit/push/pull):', 'status');
    if (!operation) return;

    let command = '';
    switch (operation.toLowerCase()) {
      case 'status':
        command = 'git status';
        break;
      case 'add':
        const files = prompt('Files to add (. for all):', '.');
        command = `git add ${files}`;
        break;
      case 'commit':
        const message = prompt('Commit message:');
        if (message) command = `git commit -m "${message}"`;
        break;
      case 'push':
        command = 'git push';
        break;
      case 'pull':
        command = 'git pull';
        break;
      default:
        command = `git ${operation}`;
    }

    if (command && terminalRef?.current) {
      terminalRef.current.sendRunCommand(command);
      addToolResult('info', 'Git Operation', `Executed: ${command}`, 0, 'git-operations');
    }
  };

  const handleSystemInfo = () => {
    if (terminalRef?.current) {
      terminalRef.current.sendRunCommand('uname -a && whoami && pwd && ls -la');
      addToolResult('info', 'System Info', 'Gathering system information...', 0, 'system-info');
    }
  };

  const handleGenerateTests = async () => {
    if (!currentFilePath) {
      alert('Please select a file to generate tests for');
      return;
    }
    await executeAITool('generate-tests', { 
      filePath: currentFilePath, 
      content: allOpenFiles[currentFilePath] 
    });
  };

  const handleRefactorCode = async () => {
    if (!currentFilePath) {
      alert('Please select a file to refactor');
      return;
    }
    const refactorType = prompt('Refactor type (cleanup/performance/structure):', 'cleanup');
    if (!refactorType) return;

    await executeAITool('refactor-code', { 
      filePath: currentFilePath, 
      content: allOpenFiles[currentFilePath],
      refactorType 
    });
  };

  const handleExplainCode = async () => {
    if (!currentFilePath) {
      alert('Please select a file to explain');
      return;
    }
    await executeAITool('explain-code', { 
      filePath: currentFilePath, 
      content: allOpenFiles[currentFilePath] 
    });
  };

  const handleCodeReview = async () => {
    if (!currentFilePath) {
      alert('Please select a file to review');
      return;
    }
    await executeAITool('code-review', { 
      filePath: currentFilePath, 
      content: allOpenFiles[currentFilePath] 
    });
  };

  // Execute AI Tool with Gemini
  const executeAITool = async (toolId: string, params: any = {}) => {
    setIsProcessing(true);
    const startTime = Date.now();

    try {
      const response = await fetchWithJsonCheck(getApiUrl('ai-tools/execute'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          toolId,
          params: {
            ...params,
            currentFilePath,
            allOpenFiles
          },
          collab_id: collabId,
          senderId: senderId,
        }),
      });

      const duration = Date.now() - startTime;

      if (response.success) {
        addToolResult('success', response.title || `${toolId} completed`, response.result, duration, toolId);
        
        // Handle specific actions
        if (response.refreshFileTree) {
          onRefreshFileTree?.();
        }
        if (response.fileUpdate) {
          onFileUpdate?.(response.fileUpdate.path, response.fileUpdate.content);
        }
        if (response.fileOpen) {
          onFileOpen?.(response.fileOpen.path);
        }
        if (response.newFile) {
          onRefreshFileTree?.();
          onFileOpen?.(response.newFile.path);
        }

        // Terminal output
        if (terminalRef?.current) {
          terminalRef.current.writeToTerminal(`✅ ${response.title || toolId}: ${response.message || 'Completed'}`);
        }
      } else {
        addToolResult('error', `${toolId} failed`, response.error, duration, toolId);
      }

      return response;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      addToolResult('error', `${toolId} failed`, error.message, duration, toolId);
      throw error;
    } finally {
      setIsProcessing(false);
    }
  };

  // Function to parse and execute tool commands from Gemini's response
  const parseAndExecuteToolCommands = async (response: string) => {
    // Look for tool command patterns in Gemini's response
    const toolPatterns = [
      { pattern: /```tool_code\s+(\w+)\s*\(([^)]*)\)\s*```/g, type: 'tool_code' },
      { pattern: /TOOL:\s*(\w+)\s*\(([^)]*)\)/g, type: 'tool' },
      { pattern: /EXECUTE:\s*(\w+)\s*\(([^)]*)\)/g, type: 'execute' },
      { pattern: /RUN:\s*(\w+)\s*\(([^)]*)\)/g, type: 'run' }
    ];

    let hasExecutedTool = false;
    setIsExecutingTools(true);

    try {
      for (const { pattern, type } of toolPatterns) {
        const matches = [...response.matchAll(pattern)];
        
        for (const match of matches) {
          const toolName = match[1];
          const params = match[2];
          
          console.log(`[GEMINI TOOL] Detected ${type} command: ${toolName}(${params})`);
          
          try {
            // Map tool names to actual tool handlers
            const toolHandlers: { [key: string]: (() => void) | (() => Promise<void>) } = {
              'create_file': handleCreateFile,
              'analyze_file': handleAnalyzeFile,
              'optimize_code': handleOptimizeCode,
              'generate_docs': handleGenerateDocs,
              'smart_search': handleSmartSearch,
              'find_bugs': handleFindBugs,
              'find_files': handleFindFiles,
              'grep_search': handleGrepSearch,
              'run_command': handleRunCommand,
              'install_package': handleInstallPackage,
              'git_operations': handleGitOperations,
              'system_info': handleSystemInfo,
              'generate_tests': handleGenerateTests,
              'refactor_code': handleRefactorCode,
              'explain_code': handleExplainCode,
              'code_review': handleCodeReview,
              // Add more mappings as needed
            };

            const handler = toolHandlers[toolName];
            if (handler) {
              hasExecutedTool = true;
              const result = handler();
              if (result instanceof Promise) {
                await result;
              }
              console.log(`[GEMINI TOOL] Successfully executed: ${toolName}`);
            } else {
              console.log(`[GEMINI TOOL] Unknown tool: ${toolName}`);
            }
          } catch (error) {
            console.error(`[GEMINI TOOL] Error executing ${toolName}:`, error);
          }
        }
      }
    } finally {
      setIsExecutingTools(false);
    }

    return hasExecutedTool;
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isProcessing) return;

    const message = chatInput;
    setChatInput('');
    setIsProcessing(true);

    try {
      // Create new conversation if none active
      if (!activeConversation) {
        const newConversation: AIConversation = {
          id: Date.now().toString(),
          messages: [],
          title: message.slice(0, 50) + (message.length > 50 ? '...' : ''),
          createdAt: new Date()
        };
        setConversations(prev => [newConversation, ...prev]);
        setActiveConversation(newConversation.id);
      }

      // Add user message
      const userMessage = {
        role: 'user' as const,
        content: message,
        timestamp: new Date()
      };

      setConversations(prev => prev.map(conv => 
        conv.id === activeConversation 
          ? { ...conv, messages: [...conv.messages, userMessage] }
          : conv
      ));

      // Send to AI
      const response = await fetchWithJsonCheck(getApiUrl('ai-tools/chat'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          message,
          conversationId: activeConversation,
          currentFilePath,
          allOpenFiles,
          collab_id: collabId,
          senderId: senderId,
          context: {
            availableTools: toolCategories.flatMap(cat => cat.tools.map(tool => tool.id))
          }
        }),
      });

      const result = response;

      if (result.success) {
        const assistantMessage = {
          role: 'assistant' as const,
          content: result.response,
          timestamp: new Date()
        };

        setConversations(prev => prev.map(conv => 
          conv.id === activeConversation 
            ? { ...conv, messages: [...conv.messages, assistantMessage] }
            : conv
        ));

        // Parse and execute any tool commands in Gemini's response
        const hasExecutedTool = await parseAndExecuteToolCommands(result.response);
        
        if (hasExecutedTool) {
          // Add a system message indicating tools were executed
          const systemMessage = {
            role: 'assistant' as const,
            content: '🤖 I\'ve executed the requested tools. Check the results above!',
            timestamp: new Date()
          };
          
          setConversations(prev => prev.map(conv => 
            conv.id === activeConversation 
              ? { ...conv, messages: [...conv.messages, systemMessage] }
              : conv
          ));
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Utility functions
  const addToolResult = (type: ToolResult['type'], title: string, content: string, duration: number, toolId: string) => {
    const result: ToolResult = {
      id: Date.now().toString(),
      type,
      title,
      content,
      timestamp: new Date(),
      duration,
      toolId
    };
    setToolResults(prev => [result, ...prev.slice(0, 29)]);
  };

  // Quick Actions
  const quickActions = [
    {
      id: 'analyze-current',
      name: 'Analyze File',
      icon: Code2,
      color: '#3b82f6',
      action: handleAnalyzeFile
    },
    {
      id: 'create-file',
      name: 'Create File',
      icon: Plus,
      color: '#06d6a0',
      action: handleCreateFile
    },
    {
      id: 'search-code',
      name: 'Search',
      icon: Search,
      color: '#8b5cf6',
      action: handleSmartSearch
    },
    {
      id: 'run-terminal',
      name: 'Terminal',
      icon: Terminal,
      color: '#f59e0b',
      action: handleRunCommand
    }
  ];

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversations, activeConversation]);

  const getCurrentConversation = () => {
    return conversations.find(conv => conv.id === activeConversation);
  };

  const filteredResults = toolResults.filter(result => 
    !searchQuery || 
    result.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    result.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="advanced-ai-tools-panel">
      {/* Header */}
      <div className="ai-tools-header">
        <div className="ai-tools-header-content">
          <div className="ai-tools-avatar">
            <Brain size={18} />
            {isProcessing && <div className="ai-tools-pulse-ring" />}
          </div>
          <div className="ai-tools-title">
            <h3>AI Tools</h3>
            <span className="ai-tools-subtitle">Powered by Gemini</span>
          </div>
          <div className="ai-tools-status">
            {isProcessing ? (
              <Loader className="ai-tools-activity processing" size={12} />
            ) : (
              <Activity className="ai-tools-activity idle" size={12} />
            )}
            <span>{isProcessing ? 'Processing...' : 'Ready'}</span>
          </div>
        </div>
      </div>

      {/* Mode Selector */}
      <div className="ai-tools-mode-selector">
        {[
          { mode: 'tools', icon: Wand2, label: 'Tools', color: '#3b82f6' },
          { mode: 'chat', icon: MessageSquare, label: 'Chat', color: '#06d6a0' },
          { mode: 'insights', icon: Brain, label: 'Insights', color: '#f59e0b' }
        ].map(({ mode, icon: Icon, label, color }) => (
          <button
            key={mode}
            onClick={() => setActiveMode(mode as any)}
            className={`ai-tools-mode-btn ${activeMode === mode ? 'active' : ''}`}
            style={{ '--mode-color': color } as any}
          >
            <Icon size={12} />
            <span>{label}</span>
            {activeMode === mode && <div className="ai-tools-mode-indicator" />}
          </button>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="ai-tools-quick-actions">
        <div className="ai-tools-section-title">
          <Zap size={12} />
          <span>Quick Actions</span>
        </div>
        <div className="ai-tools-quick-grid">
          {quickActions.map(action => (
            <button
              key={action.id}
              onClick={action.action}
              disabled={isProcessing}
              className="ai-tools-quick-action"
              style={{ '--action-color': action.color } as any}
            >
              <action.icon size={14} />
              <span>{action.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="ai-tools-content">
        {activeMode === 'tools' && (
          <div className="ai-tools-categories">
            {toolCategories.map(category => (
              <div key={category.id} className="ai-tools-category">
                <div className="ai-tools-category-header">
                  <category.icon size={14} style={{ color: category.color }} />
                  <span>{category.name}</span>
                </div>
                <div className="ai-tools-category-tools">
                  {category.tools.map(tool => (
                    <div key={tool.id} className="ai-tools-tool-card">
                      <div className="ai-tools-tool-info">
                        <h4>{tool.name}</h4>
                        <p>{tool.description}</p>
                      </div>
                      <button
                        onClick={tool.action}
                        disabled={isProcessing || !currentFilePath}
                        className="ai-tools-tool-execute"
                        style={{ '--tool-color': category.color } as any}
                      >
                        {isProcessing ? <Loader size={10} /> : <Play size={10} />}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeMode === 'chat' && (
          <div className="ai-tools-chat">
            <div className="ai-tools-chat-header">
              <div className="ai-tools-chat-title">
                <Bot size={12} />
                <span>Gemini AI</span>
              </div>
              <button 
                onClick={() => {
                  setActiveConversation(null);
                  setChatInput('');
                }}
                className="ai-tools-new-chat-btn"
              >
                <Plus size={10} />
                New
              </button>
            </div>

            <div className="ai-tools-chat-messages">
              {getCurrentConversation()?.messages.map((message, index) => (
                <div key={index} className={`ai-tools-message ${message.role}`}>
                  <div className="ai-tools-message-avatar">
                    {message.role === 'user' ? (
                      <div className="ai-tools-user-avatar">
                        {user?.username?.[0]?.toUpperCase()}
                      </div>
                    ) : (
                      <Bot size={12} />
                    )}
                  </div>
                  <div className="ai-tools-message-content">
                    <div className="ai-tools-message-header">
                      <span className="ai-tools-message-author">
                        {message.role === 'user' ? 'You' : 'Gemini'}
                      </span>
                      <span className="ai-tools-message-time">
                        {message.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="ai-tools-message-text">
                      {message.content}
                    </div>
                  </div>
                </div>
              )) || (
                <div className="ai-tools-chat-welcome">
                  <Brain size={32} />
                  <h4>Gemini AI Ready</h4>
                  <p>Ask me about your code, files, or anything else!</p>
                </div>
              )}
              {isProcessing && (
                <div className="ai-tools-message assistant processing">
                  <div className="ai-tools-message-avatar">
                    <Loader size={12} />
                  </div>
                  <div className="ai-tools-message-content">
                    <div className="ai-tools-thinking">
                      <span>Gemini is thinking...</span>
                    </div>
                  </div>
                </div>
              )}
              {isExecutingTools && (
                <div className="ai-tools-message assistant executing">
                  <div className="ai-tools-message-avatar">
                    <Zap size={12} />
                  </div>
                  <div className="ai-tools-message-content">
                    <div className="ai-tools-executing">
                      <span>S Executing tools...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <form onSubmit={handleChatSubmit} className="ai-tools-chat-input">
              <div className="ai-tools-input-container">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask Gemini AI..."
                  disabled={isProcessing}
                  className="ai-tools-chat-field"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || isProcessing}
                  className="ai-tools-send-btn"
                >
                  {isProcessing ? <Loader size={12} /> : <Send size={12} />}
                </button>
              </div>
            </form>
          </div>
        )}

        {activeMode === 'insights' && (
          <div className="ai-tools-insights">
            <div className="ai-tools-section-title">
              <Brain size={12} />
              <span>Project Insights</span>
            </div>
            <div className="ai-tools-empty-state">
              <Brain size={32} />
              <h4>Project Analysis</h4>
              <p>Use tools to analyze your codebase</p>
            </div>
          </div>
        )}
      </div>

      {/* Results Panel */}
      <div className="ai-tools-results">
        <div className="ai-tools-section-title">
          <Terminal size={12} />
          <span>Results ({filteredResults.length})</span>
          <div className="ai-tools-results-actions">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter..."
              className="ai-tools-results-search"
            />
            <button 
              onClick={() => setToolResults([])}
              className="ai-tools-clear-btn"
            >
              <X size={8} />
            </button>
          </div>
        </div>
        <div className="ai-tools-results-list">
          {filteredResults.length === 0 ? (
            <div className="ai-tools-empty-results">
              <Clock size={20} />
              <span>No results yet</span>
            </div>
          ) : (
            filteredResults.slice(0, 4).map(result => (
              <div key={result.id} className={`ai-tools-result-item ${result.type}`}>
                <div className="ai-tools-result-header">
                  <div className="ai-tools-result-icon">
                    {result.type === 'success' && <CheckCircle size={10} />}
                    {result.type === 'error' && <AlertCircle size={10} />}
                    {result.type === 'info' && <Activity size={10} />}
                    {result.type === 'warning' && <AlertCircle size={10} />}
                  </div>
                  <span className="ai-tools-result-title">{result.title}</span>
                  <span className="ai-tools-result-time">
                    {result.duration ? `${result.duration}ms` : 'now'}
                  </span>
                  <button 
                    onClick={() => navigator.clipboard.writeText(result.content)}
                    className="ai-tools-copy-btn"
                  >
                    <Copy size={8} />
                  </button>
                </div>
                <div className="ai-tools-result-content">
                  {result.content.length > 100 
                    ? result.content.slice(0, 100) + '...'
                    : result.content
                  }
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 5. Add UI for file search results and file viewing/editing */}
      {activeMode === 'tools' && fileSearchResults.length > 0 && (
        <div className="ai-tools-file-search-results">
          <h4>File Search Results</h4>
          <ul>
            {fileSearchResults.map((res, idx) => (
              <li key={idx}>
                <button onClick={() => {
                  setSelectedFile(res.file);
                  fetchFileContent(res.file);
                }}>{res.file}</button>
                <ul>
                  {res.matches.map((m: any, i: number) => <li key={i}>{m}</li>)}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
      {selectedFile && (
        <div className="ai-tools-file-viewer">
          <h4>Viewing: {selectedFile}</h4>
          {isFileLoading ? <div>Loading...</div> : (
            <CodeEditor
              code={selectedFileContent}
              onCodeChange={c => saveFileContent(selectedFile, c)}
              filePath={selectedFile}
              userId={user?.userId || ''}
              username={user?.username || ''}
              collabId={collabId || ''}
            />
          )}
          <button onClick={() => setSelectedFile(null)}>Close</button>
        </div>
      )}
    </div>
  );
}
