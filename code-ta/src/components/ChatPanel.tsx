import React, { useState, useRef, useEffect } from 'react';
import { useCollab } from '../context/CollabContext';
import { getSocket } from '../utils/socket';
import { getApiUrl } from '../config/api';

interface ChatPanelProps {
  friend: { id: string; username: string; email?: string };
  currentUser: { id: string; username: string; email?: string };
  token: string;
}

export default function ChatPanel({ friend, currentUser, token }: ChatPanelProps) {
  if (!friend || !currentUser || !friend.id || !currentUser.id) {
    return <div style={{ color: '#fff', padding: 16 }}>Loading chat...</div>;
  }
  const socket = getSocket();
  const [messages, setMessages] = useState<Array<{ userId: string; username: string; message: string; timestamp: number }>>([]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Generate a unique DM room name (sorted user IDs)
  const room = [currentUser.id, friend.id].sort().join('_');

  useEffect(() => {
    setMessages([]); // Clear messages when switching rooms
    socket.emit('join-dm', { room });
    // Fetch chat history from backend
    fetch(getApiUrl(`dm/history?roomId=${room}`), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data.messages)) setMessages(data.messages);
      });
    socket.on('dm-message', (msg) => {
      if (msg.room === room) {
        setMessages((prev) => [...prev, msg]);
      }
    });
    return () => {
      socket.emit('leave-dm', { room });
      socket.off('dm-message');
    };
    // eslint-disable-next-line
  }, [room, socket, friend._selectedAt]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      const msg = {
        room,
        userId: currentUser.id,
        username: currentUser.username,
        message: input.trim(),
        timestamp: Date.now(),
      };
      socket.emit('dm-message', msg);
      setInput('');
      // Do NOT setMessages here; only update on backend echo
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 320, width: 350, background: '#181a20', borderRadius: 6, padding: 8 }}>
      <div style={{ marginBottom: 8, color: '#fff', fontWeight: 'bold' }}>
        Chat with {friend.username}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', background: '#222', borderRadius: 6, padding: 8, marginBottom: 8 }}>
        {messages.length === 0 && <div style={{ color: '#aaa' }}>No messages yet.</div>}
        {messages.map((msg, i) => (
          <div
            key={msg.timestamp + '-' + msg.userId}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: msg.userId === currentUser.id ? 'flex-end' : 'flex-start',
              marginBottom: 10
            }}
          >
            <div
              style={{
                background: msg.userId === currentUser.id ? '#3794ff' : '#2d2d2d',
                color: '#fff',
                borderRadius: 16,
                padding: '8px 14px',
                maxWidth: '70%',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                fontSize: 15,
                wordBreak: 'break-word',
                alignSelf: msg.userId === currentUser.id ? 'flex-end' : 'flex-start',
              }}
            >
              <span style={{ fontWeight: 'bold', color: msg.userId === currentUser.id ? '#fff' : '#10B981' }}>{msg.username}</span>
              <span style={{ marginLeft: 8, color: '#bbb', fontSize: 11 }}>{new Date(msg.timestamp).toLocaleTimeString()}</span>
              <div style={{ marginTop: 2 }}>{msg.message}</div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSend} style={{ display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Type a message..."
          style={{ flex: 1, padding: 8, borderRadius: 4, border: 'none' }}
        />
        <button type="submit" style={{ background: '#3794ff', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px' }}>
          Send
        </button>
      </form>
    </div>
  );
} 