import { useEffect, useRef, useState, forwardRef, memo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'
import { useAuth } from '../../context/AuthContext'
import { getWebSocketUrl } from '../../config/api'

// Terminal types configuration
const TERMINAL_TYPES = {
  bash: { name: 'Bash', icon: '🐧', color: '#4CAF50' },
  powershell: { name: 'PowerShell', icon: '🔷', color: '#0078D4' },
  cmd: { name: 'Command Prompt', icon: '⚫', color: '#000000' },
  gitbash: { name: 'Git Bash', icon: '🌿', color: '#F05032' },
  ubuntu: { name: 'Ubuntu', icon: '🟠', color: '#E95420' },
  zsh: { name: 'Zsh', icon: '⚡', color: '#FFD700' }
}

// Security configuration
const SECURITY_CONFIG = {
  // Commands that are completely blocked
  BLOCKED_COMMANDS: [
    'cd /', 'cd ..', 'cd ~', 'cd /root', 'cd /etc', 'cd /var', 'cd /usr', 'cd /bin', 'cd /sbin',
    'sudo', 'su -', 'su root', 'passwd', 'useradd', 'userdel', 'usermod',
    'systemctl', 'service', 'mount', 'umount', 'fdisk', 'mkfs',
    'iptables', 'ufw', 'firewall-cmd', 'netstat', 'ss -a', 'lsof',
    'kill -9', 'killall -9', 'pkill -9'
  ],
  
  // Commands that trigger warnings but are allowed
  WARNING_COMMANDS: [
    'rm -rf', 'chmod 777', 'chown', 'find /', 'locate', 'ps aux',
    'cat /etc', 'ls /etc', 'cat /root', 'ls /root'
  ],
  
  // Allowed directories (relative to user directory)
  ALLOWED_PATHS: [
    '.', './', '../user_files', './projects', './uploads', './temp'
  ],
  
  // Security messages
  MESSAGES: {
    BLOCKED: '🚫 Security: This command is blocked for security reasons.',
    WARNING: '⚠️  Security Warning: Use this command carefully.',
    RESTRICTED: '🔒 You are restricted to your user directory for security.',
    NOTICE: '📁 Working in secure user environment.'
  }
}

interface TerminalTab {
  id: string
  type: keyof typeof TERMINAL_TYPES
  name: string
  isActive: boolean
}

interface TerminalInstance {
  id: string
  terminal: Terminal | null
  fitAddon: FitAddon | null
  ws: WebSocket | null
  container: HTMLDivElement | null
  status: 'connecting' | 'connected' | 'error'
}

const XTerminal = memo(forwardRef(({
  isCodeExecutionTerminal = false,
  streamedOutput,
  onSendInput,
  visible = true,
  sessionId,
  collabRoom,
  socket
}: {
  isCodeExecutionTerminal?: boolean
  streamedOutput?: string
  onSendInput?: (input: string) => void
  visible?: boolean
  sessionId?: string
  collabRoom?: string
  socket?: any
}, ref) => {

  // Terminal management state
  const [terminals, setTerminals] = useState<TerminalTab[]>([
    { id: '1', type: 'bash', name: 'Terminal 1', isActive: true }
  ])
  const [activeTerminalId, setActiveTerminalId] = useState('1')
  const [showTypeSelector, setShowTypeSelector] = useState(false)
  const [nextTerminalId, setNextTerminalId] = useState(2)
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 })
  const dropdownButtonRef = useRef<HTMLButtonElement>(null)
  const [showTabPanel, setShowTabPanel] = useState(true)

  // Terminal instances storage - each terminal gets its own instance
  const terminalInstances = useRef<Map<string, TerminalInstance>>(new Map())
  const mainContainerRef = useRef<HTMLDivElement>(null)

  const { token } = useAuth() || {};
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const xtermInstanceRef = useRef<Terminal | null>(null);
  const fitAddonInstanceRef = useRef<FitAddon | null>(null);
  const isDisposedRef = useRef(false);

  const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const lastOutputLength = useRef(0);
  const prevStreamedOutputRef = useRef<string | undefined>(undefined);

  // Terminal management functions
  const addNewTerminal = useCallback((type: keyof typeof TERMINAL_TYPES = 'bash') => {
    const newId = nextTerminalId.toString()
    const newTerminal: TerminalTab = {
      id: newId,
      type,
      name: `${TERMINAL_TYPES[type].name} ${nextTerminalId}`,
      isActive: false
    }
    
    setTerminals(prev => prev.map(t => ({ ...t, isActive: false })).concat({ ...newTerminal, isActive: true }))
    setActiveTerminalId(newId)
    setNextTerminalId(prev => prev + 1)
    setShowTypeSelector(false)
  }, [nextTerminalId])

  const switchTerminal = useCallback((terminalId: string) => {
    setTerminals(prev => prev.map(t => ({ ...t, isActive: t.id === terminalId })))
    setActiveTerminalId(terminalId)
  }, [])

  const closeTerminal = useCallback((terminalId: string) => {
    // Clean up terminal instance
    const instance = terminalInstances.current.get(terminalId);
    if (instance) {
      // Call cleanup function if it exists
      if ((instance as any).cleanup) {
        (instance as any).cleanup();
      }
      if (instance.ws) {
        instance.ws.close();
      }
      if (instance.terminal && !(instance.terminal as any)._isDisposed) {
        instance.terminal.dispose();
      }
      if (instance.container && instance.container.parentNode) {
        instance.container.parentNode.removeChild(instance.container);
      }
      terminalInstances.current.delete(terminalId);
    }

    setTerminals(prev => {
      const filtered = prev.filter(t => t.id !== terminalId)
      if (filtered.length === 0) {
        // Always keep at least one terminal
        const newTerminal = { id: '1', type: 'bash' as keyof typeof TERMINAL_TYPES, name: 'Terminal 1', isActive: true };
        setActiveTerminalId('1');
        return [newTerminal];
      }
      
      // If we closed the active terminal, activate the first remaining one
      if (terminalId === activeTerminalId) {
        const newActive = filtered[0]
        setActiveTerminalId(newActive.id)
        return filtered.map(t => ({ ...t, isActive: t.id === newActive.id }))
      }
      
      return filtered
    })
  }, [activeTerminalId])

  const getCurrentTerminal = useCallback(() => {
    return terminals.find(t => t.id === activeTerminalId) || terminals[0]
  }, [terminals, activeTerminalId])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showTypeSelector && dropdownButtonRef.current) {
        const target = event.target as Node;
        const dropdown = document.querySelector('.terminal-type-dropdown');
        
        // Don't close if clicking on the button or inside the dropdown
        if (!dropdownButtonRef.current.contains(target) && 
            (!dropdown || !dropdown.contains(target))) {
          setShowTypeSelector(false);
        }
      }
    }
    
    if (showTypeSelector) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showTypeSelector])



  // Toolbar actions (memoized)
  const handleClear = useCallback(() => {
    if (isCodeExecutionTerminal) {
      if (xtermInstanceRef.current && !(xtermInstanceRef.current as any)._isDisposed) {
        xtermInstanceRef.current.clear();
        xtermInstanceRef.current.write('\x1b[1;32mTerminal cleared\x1b[0m\r\n\x1b[1;36mSystem:/sys/user/23656412/file_name>\x1b[0m ');
      }
    } else {
      const instance = terminalInstances.current.get(activeTerminalId);
      if (instance && instance.ws && instance.ws.readyState === WebSocket.OPEN) {
        // Send Ctrl+L to backend (standard clear command)
        instance.ws.send(JSON.stringify({ type: 'input', data: '\x0C' }));
      } else if (instance && instance.terminal && !(instance.terminal as any)._isDisposed) {
        // Fallback to local clear if no connection
        instance.terminal.clear();
      }
    }
  }, [isCodeExecutionTerminal, activeTerminalId]);

  const handleCopy = useCallback(() => {
    if (isCodeExecutionTerminal) {
      if (xtermInstanceRef.current && !(xtermInstanceRef.current as any)._isDisposed) {
        const selection = xtermInstanceRef.current.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection);
        }
      }
    } else {
      const instance = terminalInstances.current.get(activeTerminalId);
      if (instance && instance.terminal && !(instance.terminal as any)._isDisposed) {
        const selection = instance.terminal.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection);
        }
      }
    }
  }, [isCodeExecutionTerminal, activeTerminalId]);



  // ----------------------------------------------------------------------
  // EFFECT 1: Terminal Instance Management (creates individual terminals)
  // ----------------------------------------------------------------------
  useEffect(() => {
    if (!visible || isCodeExecutionTerminal) return;

    // Create terminal instance for active terminal if it doesn't exist
    const activeTerminal = terminals.find(t => t.id === activeTerminalId);
    if (!activeTerminal) return;

    let instance = terminalInstances.current.get(activeTerminalId);
    
    if (!instance) {
      // Create new terminal instance
      const terminal = new Terminal({
        theme: {
          background: '#181818',
          foreground: '#e5e5e5',
          cursor: '#00ff00',
        },
        fontSize: 16,
        fontFamily: 'Fira Mono, monospace',
        cursorBlink: true,
        disableStdin: false,
        allowProposedApi: true,
        cols: 80,
        rows: 24,
        scrollback: 2000,
        windowsMode: false, // Set to false for better Linux compatibility
        // Better cursor handling
        cursorStyle: 'block',
        cursorWidth: 1,
        // Ensure proper ANSI handling
        convertEol: false,
        screenReaderMode: false,
      });

      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);

      // Create container for this terminal
      const container = document.createElement('div');
      container.style.width = '100%';
      container.style.height = '100%';
      container.style.display = 'none'; // Initially hidden

      instance = {
        id: activeTerminalId,
        terminal,
        fitAddon,
        ws: null,
        container,
        status: 'connecting'
      };

      terminalInstances.current.set(activeTerminalId, instance);

      // Open terminal in its container
      terminal.open(container);
      
      // Setup WebSocket connection for this terminal
      setupTerminalConnection(instance, activeTerminal);
      
      // Add resize handler
      const resizeHandler = () => {
        if (instance.fitAddon && instance.ws && instance.ws.readyState === WebSocket.OPEN) {
          try {
            instance.fitAddon.fit();
            instance.ws.send(JSON.stringify({
              type: 'resize',
              cols: terminal.cols,
              rows: terminal.rows
            }));
          } catch (e) {
            console.error('Error resizing terminal:', e);
          }
        }
      };
      
      window.addEventListener('resize', resizeHandler);
      
      // Store cleanup function
      (instance as any).cleanup = () => {
        window.removeEventListener('resize', resizeHandler);
      };
    }

    // Show active terminal and hide others
    terminalInstances.current.forEach((inst, id) => {
      if (inst.container) {
        inst.container.style.display = id === activeTerminalId ? 'block' : 'none';
      }
    });

    // Append active terminal container to main container
    if (terminalContainerRef.current && instance.container) {
      // Clear container first
      terminalContainerRef.current.innerHTML = '';
      terminalContainerRef.current.appendChild(instance.container);
      
      // Fit and focus the active terminal
      if (instance.fitAddon && instance.terminal) {
        try {
          instance.fitAddon.fit();
          instance.terminal.focus();
        } catch (e) {
          console.error('Error fitting terminal:', e);
        }
      }
    }

    return () => {
      // Cleanup is handled when terminals are removed
    };
  }, [visible, activeTerminalId, terminals, isCodeExecutionTerminal]);

  // Security checking functions
  const checkCommandSecurity = useCallback((command: string) => {
    const cmd = command.toLowerCase().trim();
    
    // Check for blocked commands
    const isBlocked = SECURITY_CONFIG.BLOCKED_COMMANDS.some(blocked => 
      cmd.startsWith(blocked.toLowerCase()) || cmd === blocked.toLowerCase()
    );
    
    if (isBlocked) {
      return { type: 'blocked', message: SECURITY_CONFIG.MESSAGES.BLOCKED };
    }
    
    // Check for warning commands
    const needsWarning = SECURITY_CONFIG.WARNING_COMMANDS.some(warning => 
      cmd.startsWith(warning.toLowerCase()) || cmd.includes(warning.toLowerCase())
    );
    
    if (needsWarning) {
      return { type: 'warning', message: SECURITY_CONFIG.MESSAGES.WARNING };
    }
    
    return { type: 'allowed', message: null };
  }, []);

  // Setup WebSocket connection for a terminal instance
  const setupTerminalConnection = useCallback((instance: TerminalInstance, terminalTab: TerminalTab) => {
    if (!token || !instance.terminal) return;

    const terminal = instance.terminal;
    terminal.writeln('\x1b[1;34mConnecting to backend terminal...\x1b[0m');
    terminal.writeln('\x1b[1;33m⚠️  Security Notice: You are restricted to your user directory only.\x1b[0m');

    const wsUrl = `${getWebSocketUrl(`terminal?token=${encodeURIComponent(token)}&type=${terminalTab.type}&terminalId=${terminalTab.id}&restricted=true`)}`;
    const ws = new WebSocket(wsUrl);
    instance.ws = ws;

    ws.onopen = () => {
      instance.status = 'connected';
      const terminalConfig = TERMINAL_TYPES[terminalTab.type];
      terminal.writeln(`\x1b[1;32mConnected to ${terminalConfig.name}!\x1b[0m`);
      terminal.writeln('\x1b[1;36m📁 Working Directory: /server/user_files/[your-user-id]\x1b[0m');
      terminal.writeln('\x1b[1;33m🔒 Security: Access restricted to your user directory only.\x1b[0m');
      terminal.writeln('\x1b[1;90m   • Navigation outside user directory is blocked\x1b[0m');
      terminal.writeln('\x1b[1;90m   • System commands are restricted\x1b[0m');
      terminal.writeln('\x1b[1;90m   • File operations are scoped to your files only\x1b[0m');
      terminal.writeln('\x1b[1;32m   Type "help security" for more information.\x1b[0m');
      
      setTimeout(() => {
        if (instance.fitAddon) {
          try {
            instance.fitAddon.fit();
            // Send terminal size to backend with security flag
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'resize',
                cols: terminal.cols,
                rows: terminal.rows,
                restricted: true
              }));
            }
          } catch (e) {
            console.error('Error fitting terminal on connect:', e);
          }
        }
      }, 500);
    };

    ws.onclose = (event) => {
      instance.status = 'error';
      terminal.writeln(`\r\n\x1b[1;31m[Disconnected from backend terminal] Code: ${event.code}\x1b[0m`);
    };

    ws.onerror = (err) => {
      instance.status = 'error';
      terminal.writeln('\r\n\x1b[1;31m[WebSocket error: cannot connect to backend terminal]\x1b[0m');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'output') {
          // Write output directly without additional processing
          terminal.write(msg.data);
        } else if (msg.type === 'error') {
          terminal.writeln(`\x1b[1;31mError: ${msg.data}\x1b[0m`);
        } else if (msg.type === 'echo') {
          // Handle echo from backend (for input characters)
          terminal.write(msg.data);
        }
      } catch {
        // Handle raw data from backend
        terminal.write(event.data);
      }
    };

    // Handle input for this terminal with security filtering
    let commandBuffer = '';
    terminal.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        // Build command buffer to check for security issues
        for (let i = 0; i < data.length; i++) {
          const char = data[i];
          if (char === '\r' || char === '\n') {
            // Command completed, check security
            if (commandBuffer.trim()) {
              const security = checkCommandSecurity(commandBuffer);
              
              // Handle special help command
              if (commandBuffer.trim() === 'help security') {
                terminal.writeln('\r\n\x1b[1;36m🔒 Security Information:\x1b[0m');
                terminal.writeln('\x1b[1;33mYou are in a secure, sandboxed environment.\x1b[0m');
                terminal.writeln('\x1b[1;90m');
                terminal.writeln('📁 Allowed Operations:');
                terminal.writeln('   • File operations within your user directory');
                terminal.writeln('   • Running code and scripts in your workspace');
                terminal.writeln('   • Installing packages in user scope');
                terminal.writeln('');
                terminal.writeln('🚫 Blocked Operations:');
                terminal.writeln('   • Accessing system directories (/, /etc, /root, etc.)');
                terminal.writeln('   • Running system administration commands');
                terminal.writeln('   • Modifying system files or configurations');
                terminal.writeln('   • Network administration commands');
                terminal.writeln('\x1b[0m');
                terminal.write('\x1b[1;32m$ \x1b[0m');
                commandBuffer = '';
                return;
              }
              
              if (security.type === 'blocked') {
                terminal.writeln(`\r\n\x1b[1;31m${security.message}\x1b[0m`);
                terminal.writeln(`\x1b[1;90mBlocked command: "${commandBuffer.trim()}"\x1b[0m`);
                terminal.writeln(`\x1b[1;33m${SECURITY_CONFIG.MESSAGES.RESTRICTED}\x1b[0m`);
                terminal.writeln(`\x1b[1;32mTip: Type "help security" for more information.\x1b[0m`);
                terminal.write('\x1b[1;32m$ \x1b[0m'); // Show new prompt
                commandBuffer = '';
                return; // Don't send the command to backend
              } else if (security.type === 'warning') {
                terminal.writeln(`\r\n\x1b[1;33m${security.message}\x1b[0m`);
                // Continue to send the command but with warning
              }
            }
            commandBuffer = '';
          } else if (char === '\u007F') { // Backspace
            commandBuffer = commandBuffer.slice(0, -1);
          } else if (char >= ' ') { // Printable characters
            commandBuffer += char;
          }
        }
        
        // Send raw input data to backend with security context
        ws.send(JSON.stringify({ 
          type: 'input', 
          data: data,
          security: { restricted: true, userScoped: true }
        }));
      }
    });

    // Keyboard shortcuts - only handle copy, let everything else go to terminal
    terminal.attachCustomKeyEventHandler((e) => {
      // Only handle Ctrl+Shift+C for copy, let everything else pass through
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        const selection = terminal.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection);
        }
        return false;
      }
      // Let all other keys pass through to normal terminal handling
      return true;
    });
  }, [token]);

  // Code execution terminal initialization (separate from interactive terminals)
  useEffect(() => {
    if (!isCodeExecutionTerminal || !visible || !terminalContainerRef.current) return;

    isDisposedRef.current = false;

    const terminal = new Terminal({
      theme: {
        background: '#181818',
        foreground: '#e5e5e5',
        cursor: '#00ff00',
      },
      fontSize: 16,
      fontFamily: 'Fira Mono, monospace',
      cursorBlink: true,
      disableStdin: false,
      allowProposedApi: true,
      cols: 80,
      rows: 24,
      scrollback: 2000,
      windowsMode: false,
      // Better cursor handling for code execution
      cursorStyle: 'block',
      cursorWidth: 1,
      convertEol: false,
      screenReaderMode: false,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    
    xtermInstanceRef.current = terminal;
    fitAddonInstanceRef.current = fitAddon;

    terminal.open(terminalContainerRef.current);
    
    try {
      fitAddon.fit();
      terminal.focus();
    } catch (e) {
      console.error('Error fitting code execution terminal:', e);
    }

    // Handle input for code execution
    let inputBuffer = '';
    terminal.onData((data) => {
      for (let i = 0; i < data.length; i++) {
        const char = data[i];
        if (char === '\r') {
          if (onSendInput) {
            onSendInput(inputBuffer + '\n');
          }
          terminal.write('\r\n');
          inputBuffer = '';
        } else if (char === '\u007F') {
          if (inputBuffer.length > 0) {
            inputBuffer = inputBuffer.slice(0, -1);
            terminal.write('\b \b');
          }
        } else {
          inputBuffer += char;
          terminal.write(char);
        }
      }
    });

    return () => {
      isDisposedRef.current = true;
      if (terminal && !(terminal as any)._isDisposed) {
        terminal.dispose();
      }
      xtermInstanceRef.current = null;
      fitAddonInstanceRef.current = null;
    };
  }, [isCodeExecutionTerminal, visible, onSendInput]);



  // Handle session changes for code execution terminal
  useEffect(() => {
    if (!isCodeExecutionTerminal || !xtermInstanceRef.current || !sessionId) return;
    
    const terminal = xtermInstanceRef.current;
    if (terminal && !(terminal as any)._isDisposed) {
      terminal.write('\x1b[1;36mSystem:/sys/user/23656412/file_name>\x1b[0m ');
      lastOutputLength.current = 0;
      prevStreamedOutputRef.current = '';
    }
  }, [sessionId, isCodeExecutionTerminal]);

  // Handle streamed output for code execution terminal
  useEffect(() => {
    if (!isCodeExecutionTerminal || !xtermInstanceRef.current || streamedOutput === undefined) return;
    
    const terminal = xtermInstanceRef.current;
    if (terminal && !(terminal as any)._isDisposed) {
      const currentOutputLength = streamedOutput.length;
      if (currentOutputLength > lastOutputLength.current) {
        const newText = streamedOutput.substring(lastOutputLength.current);
        const lines = newText.split('\n');
        lines.forEach((line) => {
          if (line !== '') {
            terminal.writeln(line);
          }
        });
        terminal.scrollToBottom();
      }
      lastOutputLength.current = currentOutputLength;
      prevStreamedOutputRef.current = streamedOutput;
    }
  }, [streamedOutput, isCodeExecutionTerminal]);

  // Expose methods via ref
  useEffect(() => {
    if (ref) {
      (ref as any).current = {
        writeToTerminal: (text: string) => {
          if (isCodeExecutionTerminal && xtermInstanceRef.current && !(xtermInstanceRef.current as any)._isDisposed) {
            xtermInstanceRef.current.writeln(text);
            xtermInstanceRef.current.scrollToBottom();
          } else {
            const instance = terminalInstances.current.get(activeTerminalId);
            if (instance && instance.terminal && !(instance.terminal as any)._isDisposed) {
              instance.terminal.writeln(text);
              instance.terminal.scrollToBottom();
            }
          }
        },
        sendRunCommand: (cmd: string) => {
          if (!isCodeExecutionTerminal) {
            const instance = terminalInstances.current.get(activeTerminalId);
            if (instance && instance.ws && instance.ws.readyState === WebSocket.OPEN) {
              instance.ws.send(JSON.stringify({ type: 'run', data: cmd }));
            }
          }
        }
      };
    }
  }, [ref, isCodeExecutionTerminal, activeTerminalId]);

  // Cleanup all terminal instances on unmount
  useEffect(() => {
    return () => {
      terminalInstances.current.forEach((instance) => {
        if (instance.ws) {
          instance.ws.close();
        }
        if (instance.terminal && !(instance.terminal as any)._isDisposed) {
          instance.terminal.dispose();
        }
        if (instance.container && instance.container.parentNode) {
          instance.container.parentNode.removeChild(instance.container);
        }
      });
      terminalInstances.current.clear();
    };
  }, []);

  // Don't render anything if not visible
  if (!visible) return null;

  const currentTerminal = getCurrentTerminal()

  // VS Code-like Terminal UI
  return (
    <div style={{
      width: '100%',
      height: '100%',
      maxHeight: '100%',
      minHeight: 150,
      background: '#1e1e1e',
      border: '1px solid #333',
      borderRadius: 4,
      boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
      display: 'flex',
      flexDirection: 'row',
      fontFamily: "Menlo, Monaco, 'Courier New', monospace",
      position: 'relative',
      zIndex: 1,
      overflow: 'hidden',
      boxSizing: 'border-box'
    }}>
      {/* Main Terminal Content */}
      <div style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        borderTopLeftRadius: 4,
        borderBottomLeftRadius: 4,
        borderRight: (!isCodeExecutionTerminal && showTabPanel) ? '1px solid #333' : 'none',
        borderTopRightRadius: (!isCodeExecutionTerminal && !showTabPanel) ? 4 : 0,
        borderBottomRightRadius: (!isCodeExecutionTerminal && !showTabPanel) ? 4 : 0,
        height: '100%',
        overflow: 'hidden',
        boxSizing: 'border-box'
      }}>

        {/* Header Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          background: '#23272e',
          borderTopLeftRadius: 4,
          borderBottom: '1px solid #222',
          padding: '0 8px',
          height: 28,
          fontWeight: 500,
          color: '#c7d0dc',
          fontSize: 12,
          letterSpacing: 0.1,
          userSelect: 'none'
        }}>
          <span style={{ marginRight: 6, fontSize: 14 }}>≫</span>
          <span style={{ flex: 1, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {isCodeExecutionTerminal ? 'Code Output' : 
             `${currentTerminal ? TERMINAL_TYPES[currentTerminal.type].name : 'Terminal'}`}
          </span>
          {!isCodeExecutionTerminal && (
            <>
              {/* New Terminal Button */}
              <button
                onClick={() => addNewTerminal()}
                style={{
                  background: '#007acc',
                  border: 'none',
                  borderRadius: 2,
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: 10,
                  padding: '2px 6px',
                  marginRight: 4,
                  fontWeight: 500,
                  transition: 'background 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#005a9e';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#007acc';
                }}
                title="New terminal"
              >
                +
              </button>
              
              {/* Terminal Type Selector */}
              <div style={{ position: 'relative', marginRight: 8 }}>
                <button
                  ref={dropdownButtonRef}
                  onClick={() => {
                    if (!showTypeSelector && dropdownButtonRef.current) {
                      const rect = dropdownButtonRef.current.getBoundingClientRect();
                      const dropdownHeight = 200; // Estimated dropdown height
                      const spaceBelow = window.innerHeight - rect.bottom;
                      const spaceAbove = rect.top;
                      
                      // Position above if not enough space below
                      const shouldPositionAbove = spaceBelow < dropdownHeight && spaceAbove > dropdownHeight;
                      
                      setDropdownPosition({
                        top: shouldPositionAbove ? rect.top - dropdownHeight - 4 : rect.bottom + 4,
                        right: window.innerWidth - rect.right
                      });
                    }
                    setShowTypeSelector(!showTypeSelector);
                  }}
                  style={{
                    background: 'none',
                    border: '1px solid #555',
                    borderRadius: 3,
                    color: '#aaa',
                    cursor: 'pointer',
                    fontSize: 12,
                    padding: '4px 8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                  title="Select terminal type"
                >
                  <span>Type</span>
                  <span>⌄</span>
                </button>
              </div>
              
              <button 
                onClick={() => setShowTabPanel(!showTabPanel)} 
                title="Toggle tab panel" 
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  color: '#bbb', 
                  marginRight: 8, 
                  cursor: 'pointer', 
                  fontSize: 16 
                }}
              >
                {showTabPanel ? '⫸' : '⫷'}
              </button>
              <button onClick={handleClear} title="Clear" style={{ background: 'none', border: 'none', color: '#bbb', marginRight: 8, cursor: 'pointer', fontSize: 16 }}>↻</button>
            </>
          )}
          <button onClick={handleCopy} title="Copy" style={{ background: 'none', border: 'none', color: '#bbb', cursor: 'pointer', fontSize: 16 }}>⿻</button>
        </div>
        
        {/* Terminal */}
        <div
          ref={terminalContainerRef}
          style={{
            width: '100%',
            flex: 1,
            minWidth: 400,
            background: '#1e1e1e',
            padding: 0,
            overflow: 'hidden',
            fontFamily: "Menlo, Monaco, 'Courier New', monospace"
          }}
        />
        
        {/* Status Bar */}
        <div style={{
          height: 18,
          background: '#23272e',
          borderBottomLeftRadius: 4,
          borderTop: '1px solid #222',
          color: (() => {
            if (isCodeExecutionTerminal) {
              return status === 'connected' ? '#0f0' : status === 'error' ? '#f44' : '#ff0';
            } else {
              const instance = terminalInstances.current.get(activeTerminalId);
              const instanceStatus = instance?.status || 'connecting';
              return instanceStatus === 'connected' ? '#0f0' : instanceStatus === 'error' ? '#f44' : '#ff0';
            }
          })(),
          fontSize: 10,
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 8
        }}>
          {(() => {
            if (isCodeExecutionTerminal) {
              return status === 'connecting' ? 'Connecting...' : status === 'connected' ? 'Connected' : 'Disconnected';
            } else {
              const instance = terminalInstances.current.get(activeTerminalId);
              const instanceStatus = instance?.status || 'connecting';
              return instanceStatus === 'connecting' ? 'Connecting...' : instanceStatus === 'connected' ? 'Connected' : 'Disconnected';
            }
          })()}
        </div>
      </div>

      {/* Vertical Terminal Tabs Panel - Right Side */}
      {!isCodeExecutionTerminal && showTabPanel && (
        <div style={{
          width: '25%',
          minWidth: '120px',
          maxWidth: '180px',
          background: '#2d2d2d',
          borderTopRightRadius: 4,
          borderBottomRightRadius: 4,
          borderLeft: '1px solid #333',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden',
          boxSizing: 'border-box'
        }}>
          {/* Tabs Header */}
          <div style={{
            height: 28,
            background: '#23272e',
            borderTopRightRadius: 4,
            borderBottom: '1px solid #222',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            color: '#c7d0dc',
            fontWeight: 500,
            letterSpacing: 0.1
          }}>
            Tabs
          </div>

          {/* Vertical Terminal Tabs */}
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            padding: '8px 0',
            overflowY: 'auto'
          }}>
            {terminals.map((terminal, index) => (
              <div
                key={terminal.id}
                onClick={() => switchTerminal(terminal.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '6px 8px',
                  background: terminal.isActive ? '#1e1e1e' : 'transparent',
                  border: terminal.isActive ? '1px solid #444' : '1px solid transparent',
                  borderLeft: terminal.isActive ? '3px solid #007acc' : '3px solid transparent',
                  cursor: 'pointer',
                  fontSize: 12,
                  color: terminal.isActive ? '#fff' : '#aaa',
                  marginBottom: 2,
                  transition: 'all 0.2s ease',
                  position: 'relative'
                }}
                onMouseEnter={(e) => {
                  if (!terminal.isActive) {
                    e.currentTarget.style.background = '#404040';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!terminal.isActive) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
                  <span style={{ marginRight: 8, fontSize: 14, flexShrink: 0 }}>
                    {TERMINAL_TYPES[terminal.type].icon}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ 
                      overflow: 'hidden', 
                      textOverflow: 'ellipsis', 
                      whiteSpace: 'nowrap',
                      fontWeight: terminal.isActive ? 500 : 400
                    }}>
                      {terminal.name}
                    </div>
                    <div style={{
                      fontSize: 10,
                      color: '#888',
                      marginTop: 2
                    }}>
                      {TERMINAL_TYPES[terminal.type].name}
                    </div>
                  </div>
                </div>
                
                {terminals.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTerminal(terminal.id);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#999',
                      cursor: 'pointer',
                      fontSize: 16,
                      padding: '2px 4px',
                      marginLeft: 8,
                      borderRadius: 2,
                      flexShrink: 0,
                      opacity: 0.7,
                      transition: 'opacity 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = '1';
                      e.currentTarget.style.background = '#555';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = '0.7';
                      e.currentTarget.style.background = 'none';
                    }}
                    title="Close terminal"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>


        </div>
      )}
      
      {/* Portal-based dropdown to ensure it appears above everything */}
      {showTypeSelector && (() => {
        // Create or get a dedicated dropdown root element
        let dropdownRoot = document.getElementById('terminal-dropdown-root');
        if (!dropdownRoot) {
          dropdownRoot = document.createElement('div');
          dropdownRoot.id = 'terminal-dropdown-root';
          dropdownRoot.style.cssText = `
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            pointer-events: none !important;
            z-index: 999999999 !important;
          `;
          document.body.appendChild(dropdownRoot);
        }
        
        return createPortal(
          <>
            {/* Invisible backdrop to catch clicks */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 1,
                pointerEvents: 'auto'
              }}
              onClick={() => setShowTypeSelector(false)}
            />
            {/* Dropdown content */}
            <div 
              style={{
                position: 'absolute',
                top: dropdownPosition.top,
                right: dropdownPosition.right,
                background: '#2d2d2d',
                border: '1px solid #555',
                borderRadius: 4,
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                zIndex: 2,
                minWidth: 180,
                maxHeight: '300px',
                overflowY: 'auto',
                pointerEvents: 'auto'
              }}>
          {Object.entries(TERMINAL_TYPES).map(([key, config]) => (
            <div
              key={key}
              onClick={() => addNewTerminal(key as keyof typeof TERMINAL_TYPES)}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '12px 16px',
                cursor: 'pointer',
                fontSize: 12,
                color: '#fff',
                borderBottom: '1px solid #444',
                transition: 'background 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#404040'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <span style={{ marginRight: 12, fontSize: 16 }}>{config.icon}</span>
              <div>
                <div style={{ fontWeight: 500 }}>{config.name}</div>
                <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>
                  {key === 'bash' && 'Unix shell'}
                  {key === 'powershell' && 'Windows shell'}
                  {key === 'cmd' && 'Command prompt'}
                  {key === 'python' && 'Python REPL'}
                  {key === 'node' && 'Node.js REPL'}
                </div>
              </div>
            </div>
          ))}
            </div>
          </>,
          dropdownRoot
        );
      })()}
    </div>
  );
}));

export default XTerminal;
