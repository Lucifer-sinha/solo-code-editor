import { useState, useEffect } from 'react';

interface TerminalPlaybackProps {
  startPlayback: boolean;
}

export default function TerminalPlayback({ startPlayback }: TerminalPlaybackProps) {
  const [lines, setLines] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const terminalCommands = [
    '$ cd code-ta && npm install',
    '⠋ Installing dependencies...',
    '✓ react@18.2.0',
    '✓ socket.io-client@4.7.2',
    '✓ yjs@13.6.10',
    '✓ monaco-editor@0.45.0',
    '✓ docker (for code execution)',
    '',
    '$ npm run dev',
    '⠋ Starting CollabRoom IDE...',
    '',
    '  VITE v5.0.0  ready in 234 ms',
    '',
    '  ➜  Local:   http://localhost:5173/',
    '  ➜  Network: http://192.168.1.100:5173/',
    '',
    '  ➜  WebSocket Server: ws://localhost:1234',
    '  ➜  Collaboration: Active ✓',
    '  ➜  Docker Engine: Running ✓',
    '  ➜  Languages: 14+ supported',
    '',
    '$ docker ps',
    'CONTAINER ID   IMAGE           STATUS',
    'a1b2c3d4e5f6   python:3.11     Up 2 minutes',
    '6f5e4d3c2b1a   node:18         Up 2 minutes',
    '9g8h7i6j5k4l   gcc:latest      Up 2 minutes',
    '',
    '✓ CollabRoom IDE ready!',
    '✓ Real-time collaboration enabled',
    '✓ Multi-language execution ready',
    '✓ 200+ concurrent users supported',
  ];

  useEffect(() => {
    if (!startPlayback) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => {
        if (prev >= terminalCommands.length) {
          clearInterval(interval);
          return prev;
        }
        setLines((prevLines) => [...prevLines, terminalCommands[prev]]);
        return prev + 1;
      });
    }, 300);

    return () => clearInterval(interval);
  }, [startPlayback]);

  return (
    <div className="terminal-playback">
      <div className="terminal-header">
        <div className="terminal-buttons">
          <span className="btn red"></span>
          <span className="btn yellow"></span>
          <span className="btn green"></span>
        </div>
        <div className="terminal-title">bash</div>
      </div>
      <div className="terminal-body">
        {lines.map((line, i) => (
          <div key={i} className="terminal-line">
            {line}
          </div>
        ))}
        <div className="terminal-cursor">▊</div>
      </div>
      <div className="scanlines"></div>
    </div>
  );
}
