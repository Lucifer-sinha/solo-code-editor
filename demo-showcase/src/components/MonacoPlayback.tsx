import { useState, useEffect } from 'react';

interface MonacoPlaybackProps {
  startTyping: boolean;
}

export default function MonacoPlayback({ startTyping }: MonacoPlaybackProps) {
  const [code, setCode] = useState('');
  const [currentLine, setCurrentLine] = useState(0);

  const codeLines = [
    '// CollabRoom - Real-time Collaborative IDE',
    '// 14+ Languages | Docker Execution | CRDT Sync',
    '',
    'import { useState, useEffect } from "react";',
    'import { useAuth } from "../context/AuthContext";',
    'import { getSocket } from "../utils/socket";',
    'import * as Y from "yjs";',
    'import { WebsocketProvider } from "y-websocket";',
    'import { MonacoBinding } from "y-monaco";',
    '',
    'export default function CollabRoom({ roomId, senderId }) {',
    '  const { user, token } = useAuth();',
    '  const socket = getSocket();',
    '  const [participants, setParticipants] = useState([]);',
    '',
    '  // Initialize CRDT for conflict-free collaboration',
    '  useEffect(() => {',
    '    const ydoc = new Y.Doc();',
    '    const ytext = ydoc.getText("monaco");',
    '    ',
    '    const provider = new WebsocketProvider(',
    '      "ws://localhost:1234",',
    '      `collab-${roomId}`,',
    '      ydoc',
    '    );',
    '',
    '    // Real-time cursor tracking & awareness',
    '    provider.awareness.setLocalStateField("user", {',
    '      name: user.username,',
    '      color: generateUserColor(),',
    '      cursor: null',
    '    });',
    '',
    '    // Bind to Monaco Editor',
    '    const binding = new MonacoBinding(',
    '      ytext,',
    '      editor.getModel(),',
    '      new Set([editor]),',
    '      provider.awareness',
    '    );',
    '',
    '    return () => {',
    '      binding.destroy();',
    '      provider.destroy();',
    '    };',
    '  }, [roomId]);',
    '',
    '  // Participant management with Socket.IO',
    '  useEffect(() => {',
    '    socket.emit("join-collab-room", {',
    '      room: `collabroom_${roomId}`,',
    '      userId: user.id,',
    '      username: user.username',
    '    });',
    '',
    '    socket.on("collab-participant-added", (data) => {',
    '      setParticipants(prev => [...prev, {',
    '        userId: data.newParticipantId,',
    '        username: data.newParticipantUsername,',
    '        role: "editor"',
    '      }]);',
    '    });',
    '',
    '    return () => socket.off("collab-participant-added");',
    '  }, [socket, roomId]);',
    '',
    '  return (',
    '    <div className="collab-room">',
    '      <FileExplorer tree={fileTree} />',
    '      <CodeEditor binding={binding} />',
    '      <CollabTerminal roomId={roomId} />',
    '      <ParticipantList users={participants} />',
    '    </div>',
    '  );',
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
