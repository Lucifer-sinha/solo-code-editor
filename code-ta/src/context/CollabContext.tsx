import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { getSocket } from '../utils/socket';

interface CollabContextType {
  socket: ReturnType<typeof getSocket>;
  fileContent: string;
  setFileContent: (content: string) => void;
  sendEdit: (content: string) => void;
  chatMessages: Array<{ userId: string; username: string; message: string; timestamp: number }>;
  sendMessage: (message: string) => void;
  joinFile: (filePath: string, userId: string, username: string) => void;
  leaveFile: (filePath: string, userId: string, username: string) => void;
  onlineUsers: Array<{ userId: string; username: string }>;
  collabId?: string;
}

const CollabContext = createContext<CollabContextType | undefined>(undefined);

export const CollabProvider: React.FC<{ children: React.ReactNode, collabId?: string }> = ({ children, collabId }) => {
  const socket = getSocket();
  const [fileContent, setFileContent] = useState('');
  const [chatMessages, setChatMessages] = useState<CollabContextType['chatMessages']>([]);
  const [onlineUsers, setOnlineUsers] = useState<CollabContextType['onlineUsers']>([]);
  const filePathRef = useRef<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  const usernameRef = useRef<string | null>(null);

  // Join a file room
  const joinFile = (filePath: string, userId: string, username: string) => {
    filePathRef.current = filePath;
    userIdRef.current = userId;
    usernameRef.current = username;
    socket.emit('join-file', { filePath, userId, username });
  };

  // Leave a file room
  const leaveFile = (filePath: string, userId: string, username: string) => {
    socket.emit('leave-file', { filePath, userId, username });
    filePathRef.current = null;
    userIdRef.current = null;
    usernameRef.current = null;
  };

  // Send file edit
  const sendEdit = (content: string) => {
    if (filePathRef.current && userIdRef.current) {
      socket.emit('edit-file', {
        filePath: filePathRef.current,
        content,
        userId: userIdRef.current,
      });
    }
  };

  // Send chat message
  const sendMessage = (message: string) => {
    if (filePathRef.current && userIdRef.current && usernameRef.current) {
      socket.emit('chat-message', {
        filePath: filePathRef.current,
        userId: userIdRef.current,
        username: usernameRef.current,
        message,
      });
    }
  };

  // Listen for file updates and chat messages
  useEffect(() => {
    socket.on('file-update', ({ content }) => {
      setFileContent(content);
    });
    socket.on('chat-message', (msg) => {
      setChatMessages((prev) => [...prev, msg]);
    });
    socket.on('user-joined', ({ userId, username }) => {
      setOnlineUsers((prev) => [...prev, { userId, username }]);
    });
    socket.on('user-left', ({ userId }) => {
      setOnlineUsers((prev) => prev.filter((u) => u.userId !== userId));
    });
    return () => {
      socket.off('file-update');
      socket.off('chat-message');
      socket.off('user-joined');
      socket.off('user-left');
    };
  }, [socket]);

  const value: CollabContextType = {
    socket,
    fileContent,
    setFileContent,
    sendEdit,
    chatMessages,
    sendMessage,
    joinFile,
    leaveFile,
    onlineUsers,
    collabId,
  };

  return <CollabContext.Provider value={value}>{children}</CollabContext.Provider>;
};

export function useCollab() {
  const ctx = useContext(CollabContext);
  if (!ctx) throw new Error('useCollab must be used within a CollabProvider');
  return ctx;
} 