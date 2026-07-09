import { useState, useEffect } from 'react';

interface MonacoPlaybackProps {
  startTyping: boolean;
}

export default function MonacoPlayback({ startTyping }: MonacoPlaybackProps) {
  const [code, setCode] = useState('');
  const [currentLine, setCurrentLine] = useState(0);

  const codeLines = [
    '// Welcome to CollabRoom IDE',
    'import { useState } from "react";',
    '',
    'function CollaborativeEditor() {',
    '  const [code, setCode] = useState("");',
    '  const [users, setUsers] = useState([]);',
    '',
    '  // Real-time collaboration with CRDT',
    '  useEffect(() => {',
    '    const ydoc = new Y.Doc();',
    '    const provider = new WebsocketProvider(',
    '      "ws://localhost:1234",',
    '      roomId,',
    '      ydoc',
    '    );',
    '    ',
    '    return () => provider.destroy();',
    '  }, []);',
    '',
    '  return <Editor value={code} />;',
    '}',
  ];

  useEffect(() => {
    if (!startTyping) return;

    const interval = setInterval(() => {
      setCurrentLine((prev) => {
        if (prev >= codeLines.length) {
          clearInterval(interval);
          return prev;
        }
        setCode((prevCode) => prevCode + codeLines[prev] + '\n');
        return prev + 1;
      });
    }, 200);

    return () => clearInterval(interval);
  }, [startTyping]);

  return (
    <div className="monaco-playback">
      <div className="monaco-header">
        <div className="monaco-tabs">
          <div className="monaco-tab active">
            <span className="tab-icon">⚛️</span>
            <span>CollabRoom.tsx</span>
          </div>
        </div>
      </div>
      <div className="monaco-editor">
        <div className="line-numbers">
          {code.split('\n').map((_, i) => (
            <div key={i} className="line-number">
              {i + 1}
            </div>
          ))}
        </div>
        <pre className="code-content">
          <code>{code}</code>
          <span className="cursor-blink">|</span>
        </pre>
      </div>
    </div>
  );
}
