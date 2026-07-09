import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCollab } from '../context/CollabContext';
import { getSocket } from '../utils/socket';
import { getApiUrl } from '../config/api';
import { MoreVertical, Users, UserPlus } from 'lucide-react';
import FileExplorer from './FileExplorer';
import MultiUserCollabInvite from './MultiUserCollabInvite';
import CollabInviteMessage from './CollabInviteMessage';
import { createCollabInviteData, createCollabSessionData } from '../utils/collabPaths';

export default function DMPanel({ onCollabSessionStart }: { onCollabSessionStart?: (fileOrDir: any) => void }) {
  const { user, token } = useAuth() || {};
  const [friends, setFriends] = useState<any[]>([]);
  const [activeFriend, setActiveFriend] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const socket = getSocket();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [sendingCollab, setSendingCollab] = useState(false);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [showMultiUserInvite, setShowMultiUserInvite] = useState(false);
  const [inviteType, setInviteType] = useState<'single' | 'multi'>('single');

  // Debug socket connection and user state
  useEffect(() => {
    console.log('[DMPanel] Socket connected:', socket.connected);
    console.log('[DMPanel] User:', user);
    console.log('[DMPanel] Token:', !!token);
    
    const onConnect = () => {
      console.log('[DMPanel] Socket connected');
      // Re-emit user-online when socket reconnects
      if (user?.username && user?.id) {
        console.log('[DMPanel] Re-emitting user-online after reconnect');
        socket.emit('user-online', { username: user.username, userId: user.id });
      }
    };
    const onDisconnect = () => console.log('[DMPanel] Socket disconnected');
    const onError = (error) => console.error('[DMPanel] Socket error:', error);
    
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('error', onError);
    
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('error', onError);
    };
  }, [socket, user]);



  useEffect(() => {
    if (!token) return;
    
    fetch(getApiUrl('friends/list'), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.json())
      .then(data => {
        // Normalize: always use .id
        const normalized = (data.friends || []).map(f => ({
          ...f,
          id: f.id || f._id, // prefer id, fallback to _id
        }));
        setFriends(normalized);
      })
      .catch(err => {
        console.error('[DMPanel] Failed to load friends:', err);
        setFriends([]);
      });
  }, [token]);

  // Helper to load chat history for a friend
  const loadChatHistory = async (friend) => {
    if (!friend || !friend.id || !user || !user.id || !token) return;
    setLoadingHistory(true);
    const roomId = [user.id, friend.id].sort().join('_');
    try {
      const res = await fetch(getApiUrl(`dm/history?friendId=${friend.id}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setMessages(data.messages || []);
    } catch (e) {
      setMessages([]);
    }
    setLoadingHistory(false);
  };

  // Filter unique friends by id
  const uniqueFriends = Array.from(new Map(friends.map(f => [f.id, f])).values());

  // Show all friends, even if IDs are duplicated, by using the original friends array and a unique key
  // When a friend is clicked, set as active and load chat (always reload, even if same)
  const handleSelectFriend = (f, idx) => {
    if (f.id) {
      const newFriend = { ...f, _selectedAt: Date.now() };
      setActiveFriend(newFriend); // force new object to trigger effect
    }
  };

  // Load chat history and join room when activeFriend changes
  useEffect(() => {
    let cancelled = false;
    if (!activeFriend || !activeFriend.id || !user || !user.id || !token) {
      return;
    }
    
    const roomId = [user.id, activeFriend.id].sort().join('_');
    setLoadingHistory(true);
    setMessages([]); // Clear messages immediately on friend change
    
    // Fetch history
    fetch(getApiUrl(`dm/history?friendId=${activeFriend.id}`), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.json())
      .then(data => { 
        if (!cancelled) {
          setMessages(data.messages || []); 
        }
      })
      .catch(err => {
        console.error('[DMPanel] Failed to load history:', err);
        if (!cancelled) setMessages([]);
      })
      .finally(() => { if (!cancelled) setLoadingHistory(false); });

    // Join room
    console.log('[DMPanel] Joining room:', roomId);
    socket.emit('join-dm', { room: roomId });
    
    const onMessage = (msg) => {
      console.log('[DMPanel] Received dm-message:', msg);
      if (msg.room === roomId) {
        console.log('[DMPanel] Message is for current room, updating messages');
        setMessages((prev) => {
          // If it's a response to an existing invite, update the original invite status
          if (msg.type === 'collab-invite-response') {
            return prev.map(m => 
              m.timestamp === msg.originalInviteTimestamp 
                ? { ...m, status: msg.status }
                : m
            );
          }
          const newMessages = [...prev, msg];
          console.log('[DMPanel] New messages count:', newMessages.length);
          return newMessages;
        });
      } else {
        console.log('[DMPanel] Message not for current room:', msg.room, 'vs', roomId);
      }
    };
    socket.on('dm-message', onMessage);

    // Listen for collab-session-start
    const onCollabSessionStartSocket = (data) => {
      console.log('[DMPanel] Received collab-session-start event:', data);
      if (onCollabSessionStart && data && data.fileOrDir) {
        console.log('[DMPanel] Starting collaboration session from socket event');
        const augmented = { 
          ...data.fileOrDir, 
          collabId: data.collabId, 
          users: data.users,
          roomMetadata: data.roomMetadata,
          inviteType: data.inviteType
        };
        onCollabSessionStart(augmented);
      } else {
        console.log('[DMPanel] Cannot start collaboration:', {
          hasCallback: !!onCollabSessionStart,
          hasData: !!data,
          hasFileOrDir: !!(data && data.fileOrDir)
        });
      }
    };
    socket.on('collab-session-start', onCollabSessionStartSocket);

    return () => {
      cancelled = true;
      socket.emit('leave-dm', { room: roomId });
      socket.off('dm-message', onMessage);
      socket.off('collab-session-start', onCollabSessionStartSocket);
    };
  }, [activeFriend, user, token, socket, onCollabSessionStart]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !activeFriend || !activeFriend.id || !user || !user.id) {
      console.log('[DMPanel] Cannot send - missing data:', {
        input: !!input.trim(),
        activeFriend: !!activeFriend,
        activeFriendId: activeFriend?.id,
        user: !!user,
        userId: user?.id
      });
      return;
    }
    
    const roomId = [user.id, activeFriend.id].sort().join('_');
    const msg = {
      from: user.id,
      to: activeFriend.id,
      content: input.trim(),
      timestamp: Date.now(),
      room: roomId,
    };
    
    console.log('[DMPanel] Sending message:', msg);
    console.log('[DMPanel] Socket connected:', socket.connected);
    socket.emit('dm-message', msg);
    setInput('');
    // Do NOT setMessages here; only update on backend echo
  };

  // Send collab invitation (with file/dir info)
  const handleSendCollabInvite = (type: 'single' | 'multi' = 'single') => {
    setInviteType(type);
    setShowFilePicker(true);
    setShowOptions(false);
  };

  // When file/dir is picked in modal
  const handleFilePicked = (fileOrDir: any) => {
    if (!user || !fileOrDir) return;
    
    if (inviteType === 'multi') {
      // Show multi-user invite modal
      setSelectedFile(fileOrDir);
      setShowMultiUserInvite(true);
      setShowFilePicker(false);
      return;
    }
    
    // Single user invite (existing functionality)
    if (!activeFriend) return;
    setSendingCollab(true);
    
    // Create standardized collaboration invite data
    const inviteData = createCollabInviteData(fileOrDir, user.id, activeFriend.id);
    
    const msg = {
      ...inviteData,
      content: `[Collab Invitation] ${inviteData.fileType === 'directory' ? 'Directory' : 'File'}: ${inviteData.fileName}`,
      type: 'collab-invite'
    };
    
    console.log('[DMPanel] Sending collaboration invite:', msg);
    socket.emit('dm-message', msg);
    setShowFilePicker(false);
    setSendingCollab(false);
  };

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ width: 160, borderRight: '1px solid #333', background: '#20232a', padding: 8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: 12, fontSize: 18 }}>Friends</div>
        {friends.map((f, idx) => (
          <div
            key={(f.id || 'friend') + '-' + idx}
            style={{
              color: activeFriend?.id === f.id ? '#fff' : '#bbb',
              background: activeFriend?.id === f.id ? '#3794ff' : 'transparent',
              borderRadius: 8,
              cursor: 'pointer',
              marginBottom: 8,
              padding: '8px 12px',
              width: '100%',
              textAlign: 'center',
              fontWeight: 500,
              fontSize: 16,
              transition: 'background 0.2s, color 0.2s',
              boxShadow: activeFriend?.id === f.id ? '0 2px 8px #3794ff44' : 'none',
            }}
            onClick={() => handleSelectFriend(f, idx)}
          >
            <div style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: '#23272e',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#3794ff',
              fontWeight: 700,
              fontSize: 18,
              marginBottom: 4,
              marginRight: 6,
              textTransform: 'uppercase',
              boxShadow: '0 1px 4px #0002',
            }}>{f.username[0]}</div>
            {f.username}
          </div>
        ))}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#181a20', borderRadius: 8, margin: 8, boxShadow: '0 2px 8px #0002' }}>
        {/* Chat header with options button */}
        {activeFriend && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderBottom: '1px solid #222', background: '#20232a', borderRadius: '8px 8px 0 0' }}>
            <span style={{ color: '#fff', fontWeight: 'bold', fontSize: 17 }}>{activeFriend.username}</span>
            <button
              style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 4, borderRadius: 4 }}
              onClick={() => setShowOptions((v) => !v)}
              title="More options"
            >
              <MoreVertical size={22} />
            </button>
            {showOptions && (
              <div style={{ position: 'absolute', right: 32, top: 48, background: '#23272e', border: '1px solid #333', borderRadius: 6, boxShadow: '0 2px 8px #0008', zIndex: 10, minWidth: 180 }}>
                <button
                  style={{ width: '100%', background: 'none', border: 'none', color: '#fff', padding: '10px 16px', textAlign: 'left', cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}
                  onClick={() => handleSendCollabInvite('single')}
                  disabled={sendingCollab}
                >
                  <UserPlus size={16} />
                  {sendingCollab ? 'Sending...' : 'Invite to Collab'}
                </button>
                <button
                  style={{ width: '100%', background: 'none', border: 'none', color: '#fff', padding: '10px 16px', textAlign: 'left', cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid #333' }}
                  onClick={() => handleSendCollabInvite('multi')}
                  disabled={sendingCollab}
                >
                  <Users size={16} />
                  Multi-User Collab
                </button>
              </div>
            )}
          </div>
        )}
        {/* File picker modal for collab invitation */}
        {showFilePicker && (
          <div style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            width: '100vw', 
            height: '100vh', 
            background: 'rgba(0,0,0,0.5)', 
            zIndex: 10000, 
            display: 'flex', 
            alignItems: 'flex-start', 
            justifyContent: 'flex-start' 
          }}>
            <div style={{ 
              background: '#23272e', 
              borderRadius: '0 8px 8px 0', 
              padding: 24, 
              minWidth: 320, 
              width: 400, 
              height: '100vh', 
              maxHeight: '100vh', 
              boxShadow: '2px 0 24px #0008', 
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              left: 0,
              top: 0
            }}>
              <h3 style={{ color: '#fff', marginBottom: 16 }}>Select file or directory to share</h3>
              <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                <FileExplorer
                  onFileOpen={(path, type) => {
                    const node = { path, title: path.split('/').pop(), type };
                    setSelectedFile(node);
                    handleFilePicked(node);
                  }}
                  onCreateFile={() => {}}
                  onCreateDirectory={() => {}}
                  onDeleteItem={() => {}}
                  onRenameItem={() => {}}
                />
              </div>
              <button
                style={{ 
                  position: 'absolute', 
                  top: 12, 
                  right: 12, 
                  background: 'none', 
                  border: 'none', 
                  color: '#fff', 
                  fontSize: 22, 
                  cursor: 'pointer',
                  zIndex: 10001
                }}
                onClick={() => setShowFilePicker(false)}
                title="Close"
              >
                ×
              </button>
            </div>
          </div>
        )}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {activeFriend ? (
            loadingHistory ? <div style={{ color: '#aaa' }}>Loading chat...</div> :
            messages.length === 0 ? <div style={{ color: '#aaa' }}>No messages yet.</div> :
            messages.map((msg) => (
              (msg.type === 'collab-invite' || msg.type === 'multi-collab-invite') ? (
                <CollabInviteMessage
                  key={msg.timestamp + '-' + msg.from}
                  msg={msg}
                  isSender={msg.from === user.id}
                  isRecipient={msg.to === user.id}
                  onRespond={(status) => {
                    // Send a response message in chat
                    const responseMsg = {
                      from: user.id,
                      to: activeFriend.id,
                      content: `[${msg.type === 'multi-collab-invite' ? 'Multi-User Collab' : 'Collab'} Invitation ${status === 'accepted' ? 'Accepted' : 'Rejected'}] ${msg.fileType === 'directory' ? 'Directory' : 'File'}: ${msg.fileName}`,
                      type: 'collab-invite-response',
                      fileId: msg.fileId,
                      fileName: msg.fileName,
                      fileType: msg.fileType,
                      filePath: msg.filePath,
                      status,
                      timestamp: Date.now(),
                      room: msg.room,
                      originalInviteTimestamp: msg.timestamp,
                      collabId: msg.collabId,
                      // Enhanced metadata for multi-user invites
                      users: msg.users,
                      roomMetadata: msg.roomMetadata,
                      inviteType: msg.inviteType || (msg.type === 'multi-collab-invite' ? 'multi-user' : 'single')
                    };
                    socket.emit('dm-message', responseMsg);

                    // If accepted, start the collaboration session
                    if (status === 'accepted' && onCollabSessionStart) {
                      const users = msg.users || [user.id, activeFriend.id];
                      const ownerId = msg.from; // Original sender is the owner
                      
                      // Create standardized collaboration session data
                      const sessionData = createCollabSessionData(msg, users, ownerId);
                      
                      console.log('[DMPanel] Starting collaboration session:', sessionData);
                      
                      // Call the callback to start the collaboration session in the UI
                      const augmentedFileOrDir = {
                        filePath: sessionData.filePath,
                        fileName: sessionData.fileName,
                        fileType: sessionData.fileType,
                        fileId: msg.fileId,
                        collabId: sessionData.collabId,
                        collabRoot: sessionData.collabRoot,
                        users: sessionData.users,
                        ownerId: sessionData.ownerId,
                        from: msg.from,
                        to: msg.to,
                        room: sessionData.room,
                        roomMetadata: msg.roomMetadata,
                        inviteType: msg.inviteType || (msg.type === 'multi-collab-invite' ? 'multi-user' : 'single')
                      };
                      
                      onCollabSessionStart(augmentedFileOrDir);
                      
                      // Also emit the collaboration session start event to notify other users
                      socket.emit('collab-session-start', {
                        users: sessionData.users,
                        fileOrDir: augmentedFileOrDir,
                        collabId: sessionData.collabId,
                        roomMetadata: msg.roomMetadata,
                        inviteType: msg.inviteType || (msg.type === 'multi-collab-invite' ? 'multi-user' : 'single')
                      });
                    }
                  }}
                  inviteStatus={(() => {
                    // Find the latest response for this invite
                    const responses = messages.filter(m => m.type === 'collab-invite-response' && m.originalInviteTimestamp === msg.timestamp);
                    return responses.length > 0 ? responses[responses.length - 1].status : msg.status || 'pending';
                  })()}
                />
              ) : msg.type === 'collab-invite-response' ? null : (
                <div key={msg.timestamp + '-' + msg.from} style={{
                  marginBottom: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: msg.from === user.id ? 'flex-end' : 'flex-start',
                }}>
                  <div style={{
                    background: msg.from === user.id ? '#3794ff' : '#23272e',
                    color: '#fff',
                    borderRadius: 16,
                    padding: '8px 16px',
                    maxWidth: '70%',
                    fontSize: 15,
                    wordBreak: 'break-word',
                    boxShadow: '0 1px 4px #0002',
                  }}>
                    <span style={{ fontWeight: 'bold', color: msg.from === user.id ? '#fff' : '#10B981' }}>{msg.from === user.id ? 'You' : activeFriend.username}</span>
                    <span style={{ marginLeft: 8, color: '#bbb', fontSize: 11 }}>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                    <div style={{ marginTop: 2 }}>{msg.content}</div>
                  </div>
                </div>
              )
            ))
          ) : <div style={{ color: '#aaa' }}>Select a friend to chat.</div>}
          <div ref={messagesEndRef} />
        </div>
        {activeFriend && (
          <form onSubmit={handleSend} style={{ display: 'flex', borderTop: '1px solid #333', padding: 12, background: '#20232a', borderRadius: '0 0 8px 8px' }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Type a message..."
              style={{ flex: 1, background: '#1e1e1e', color: '#fff', border: 'none', borderRadius: 4, padding: 10, fontSize: 15 }}
            />
            <button type="submit" style={{ marginLeft: 10, background: '#3794ff', color: '#fff', border: 'none', borderRadius: 4, padding: '10px 20px', fontWeight: 'bold', fontSize: 15, boxShadow: '0 1px 4px #3794ff44', cursor: 'pointer' }}>Send</button>
          </form>
        )}

        {/* Multi-User Collaboration Invite Modal */}
        {showMultiUserInvite && (
          <MultiUserCollabInvite
            selectedFile={selectedFile}
            onClose={() => {
              setShowMultiUserInvite(false);
              setSelectedFile(null);
            }}
          />
        )}
      </div>
    </div>
  );
} 