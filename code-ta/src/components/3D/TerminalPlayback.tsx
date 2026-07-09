import { useState, useEffect } from 'react';

interface TerminalPlaybackProps {
  startPlayback: boolean;
}

export default function TerminalPlayback({ startPlayback }: TerminalPlaybackProps) {
  const [lines, setLines] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const terminalCommands = [
    '$ npm install',
    '⠋ Installing dependencies...',
    '✓ Dependencies installed successfully',
    '',
    '$ npm run dev',
    '⠋ Starting development server...',
    '',
    '  VITE v5.0.0  ready in 234 ms',
    '',
    '  ➜  Local:   http://localhost:5173/',
    '  ➜  Network: http://192.168.1.100:5173/',
    '',
    '  ➜  WebSocket: ws://localhost:1234',
    '  ➜  Collaboration: Active',
    '  ➜  Connected users: 3',
    '',
    '✓ Server running successfully',
    '✓ Hot Module Replacement enabled',
    '✓ Real-time collaboration ready',
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
