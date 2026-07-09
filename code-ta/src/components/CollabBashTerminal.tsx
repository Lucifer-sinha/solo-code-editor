import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { getWebSocketUrl } from '../config/api';

interface CollabBashTerminalProps {
  collabId: string;
  senderId: string;
  token: string;
}

const CollabBashTerminal = forwardRef<any, CollabBashTerminalProps>(
  ({ collabId, senderId, token }, ref) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
    const wsRef = useRef<WebSocket | null>(null);

    useImperativeHandle(ref, () => ({
      sendCommand: (cmd: string) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(cmd);
        }
      }
    }));

  useEffect(() => {
    const xterm = new Terminal({
      theme: { 
        background: '#1e1e1e', 
        foreground: '#d4d4d4', 
        cursor: '#ffffff',
        selection: '#264f78'
      },
      fontSize: 13,
      fontFamily: 'Consolas, "Courier New", monospace',
      cursorBlink: false,
      disableStdin: false,
      allowProposedApi: true,
      cols: 80,
      rows: 24,
      scrollback: 1000,
      windowsMode: true,
    });
    xtermRef.current = xterm;
    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    xterm.loadAddon(fitAddon);
    if (terminalRef.current) {
      xterm.open(terminalRef.current);
      fitAddon.fit();
      xterm.focus();
    }

      // Connect to the shared collabroom terminal WebSocket
      const ws = new WebSocket(
        getWebSocketUrl(`collab-terminal?collab_id=${collabId}&senderId=${senderId}&token=${token}`)
      );
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'output') {
            xterm.write(msg.data);
          } else if (msg.type === 'exit') {
            xterm.write('\r\n[Session ended]\r\n');
      }
        } catch (e) {
          // Ignore malformed messages
        }
      };

      xterm.onData((input) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(input);
        }
      });

    return () => {
        ws.close();
      xterm.dispose();
    };
    }, [collabId, senderId, token]);

  return (
    <div
      ref={terminalRef}
      style={{ 
        width: '100%', 
        height: '100%', 
        background: '#1e1e1e', 
        fontFamily: 'Consolas, "Courier New", monospace'
      }}
    />
  );
  }
);

export default CollabBashTerminal; 