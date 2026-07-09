import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCollab } from '../context/CollabContext';
import { UserPlus, UserCheck, UserX, Search } from 'lucide-react';
import { getSocket } from '../utils/socket';
import { getApiUrl } from '../config/api';
import ChatPanel from './ChatPanel';

interface User {
  id: string;
  username: string;
  email?: string;
}

export default function FriendsPanel() {
  const { user, token } = useAuth() || {};
  const { onlineUsers } = useCollab();
  const [friends, setFriends] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [requesting, setRequesting] = useState<string | null>(null);
  const [inviteMessage, setInviteMessage] = useState('');

  // New: inbox and pending requests
  const [receivedRequests, setReceivedRequests] = useState<any[]>([]);
  const [sentRequests, setSentRequests] = useState<any[]>([]);

  const [selectedFriend, setSelectedFriend] = useState<User | null>(null);

  const socket = getSocket();

  // Helper to fetch requests
  const fetchRequests = async () => {
    if (!token) return;
    const res = await fetch(getApiUrl('friends/requests'), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setReceivedRequests(data.received || []);
    setSentRequests(data.sent || []);
    console.log('Fetched requests:', data);
  };

  // Helper to fetch friends
  const fetchFriends = async () => {
    if (!token) return;
    const res = await fetch(getApiUrl('friends/list'), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setFriends(data.friends || []);
    console.log('[FriendsPanel] Friends fetched:', data.friends);
  };

  // Fetch friends and requests
  useEffect(() => {
    if (!token) return;
    fetchFriends();
    fetchRequests();
  }, [token]);

  // Real-time updates
  useEffect(() => {
    socket.on('friend-request', (req) => {
      setReceivedRequests(prev => [req, ...prev]);
    });
    socket.on('friend-accepted', (info) => {
      // Remove from sent requests if accepted
      setSentRequests(prev => prev.filter(r => r.to !== info.from));
      // Optionally update friends list
    });
    socket.on('friend-declined', (info) => {
      setSentRequests(prev => prev.filter(r => r.to !== info.from));
    });
    return () => {
      socket.off('friend-request');
      socket.off('friend-accepted');
      socket.off('friend-declined');
    };
  }, [socket]);

  // Search users
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await fetch(getApiUrl(`users/search?q=${encodeURIComponent(search)}`), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setSearchResults(data.users || []);
    setLoading(false);
  };

  // Send friend request with message
  const sendRequest = async (username: string) => {
    setRequesting(username);
    const res = await fetch(getApiUrl('friends/request'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ toUsername: username, message: inviteMessage }),
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || 'Failed to send request');
    } else {
      await fetchRequests();
    }
    setRequesting(null);
    setInviteMessage('');
  };

  // Accept/decline friend request
  const handleAccept = async (fromUserId: string) => {
    await fetch(getApiUrl('friends/accept'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ fromUserId }),
    });
    await fetchRequests();
    await fetchFriends(); // update friends list in real time
  };
  const handleDecline = async (fromUserId: string) => {
    await fetch(getApiUrl('friends/decline'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ fromUserId }),
    });
    await fetchRequests();
    await fetchFriends(); // update friends list in real time
  };

  // Online status helper
  const isOnline = (userId: string) => onlineUsers.some(u => u.userId === userId);

  // Filter unique friends by id
  const uniqueFriends = Array.from(new Map(friends.map(f => [f.id, f])).values());

  return (
    <div style={{ color: '#fff' }}>
      <h3 style={{ color: '#fff', marginBottom: 12 }}>Friends</h3>
      {/* Search Section */}
      <div style={{ marginBottom: 16 }}>
        <h4 style={{ color: '#fff', marginBottom: 8 }}>Search Users</h4>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search users..."
            style={{ 
              flex: 1, 
              padding: 8, 
              borderRadius: 4, 
              border: '1px solid #444',
              background: '#1e1e1e',
              color: '#fff'
            }}
          />
          <button 
            type="submit" 
            style={{ 
              background: '#3794ff', 
              color: '#fff', 
              border: 'none', 
              borderRadius: 4, 
              padding: '8px 12px',
              cursor: 'pointer'
            }}
          >
            <Search size={18} />
          </button>
        </form>
        {loading && <div style={{ color: '#aaa', marginTop: 4 }}>Searching...</div>}
        {searchResults.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <h5 style={{ color: '#fff', marginBottom: 8 }}>Search Results:</h5>
            {searchResults.map(u => (
              <div key={u.id || u.username} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8, padding: 8, background: '#2d2d2d', borderRadius: 4 }}>
                <span style={{ color: '#fff', flex: 1 }}>{u.username}</span>
                <textarea
                  value={inviteMessage}
                  onChange={e => setInviteMessage(e.target.value)}
                  placeholder="Add a message (optional)"
                  style={{ width: '100%', marginTop: 4, borderRadius: 4, padding: 4, background: '#222', color: '#fff' }}
                />
                <button
                  onClick={() => sendRequest(u.username)}
                  disabled={requesting === u.username}
                  style={{ 
                    background: '#10B981', 
                    color: '#fff', 
                    border: 'none', 
                    borderRadius: 4, 
                    padding: '4px 8px', 
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  {requesting === u.username ? 'Sending...' : <><UserPlus size={14} /> Add</>}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Inbox Section */}
      <div style={{ marginBottom: 16 }}>
        <h4 style={{ color: '#fff', marginBottom: 8 }}>Inbox</h4>
        {receivedRequests.length === 0 && <div style={{ color: '#aaa' }}>No incoming requests</div>}
        {receivedRequests.map(r => (
          <div key={((r.from?._id || r.from?.id || r.from) + '-' + (r.date ? new Date(r.date).getTime() : ''))} style={{ marginBottom: 8, background: '#2d2d2d', borderRadius: 4, padding: 8 }}>
            <div><b>{r.from?.username || r.from}</b> <span style={{ color: '#aaa', fontSize: 12 }}>{r.date ? new Date(r.date).toLocaleString() : ''}</span></div>
            {r.message && <div style={{ fontStyle: 'italic', color: '#aaa' }}>{r.message}</div>}
            <button onClick={() => handleAccept(r.from?._id || r.from)} style={{ marginRight: 8, background: '#3794ff', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}><UserCheck size={14} /> Accept</button>
            <button onClick={() => handleDecline(r.from?._id || r.from)} style={{ background: '#f44', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}><UserX size={14} /> Decline</button>
          </div>
        ))}
      </div>

      {/* Pending Sent Requests Section */}
      <div style={{ marginBottom: 16 }}>
        <h4 style={{ color: '#fff', marginBottom: 8 }}>Pending Sent Requests</h4>
        {sentRequests.length === 0 && <div style={{ color: '#aaa' }}>No pending sent requests</div>}
        {sentRequests.map(r => (
          <div key={((r.to?._id || r.to?.id || r.to) + '-' + (r.date ? new Date(r.date).getTime() : ''))} style={{ marginBottom: 8, background: '#2d2d2d', borderRadius: 4, padding: 8 }}>
            <div>To: <b>{r.to?.username || r.to}</b> <span style={{ color: '#aaa', fontSize: 12 }}>{r.date ? new Date(r.date).toLocaleString() : ''}</span></div>
            {r.message && <div style={{ fontStyle: 'italic', color: '#aaa' }}>{r.message}</div>}
            <span>Status: Pending</span>
          </div>
        ))}
      </div>

      {/* Friends List Section */}
      <div>
        <h4 style={{ color: '#fff', marginBottom: 8 }}>Your Friends</h4>
        {uniqueFriends.length === 0 && <div style={{ color: '#aaa' }}>No friends yet</div>}
        {uniqueFriends.map(f => (
          <div
            key={f.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 8,
              padding: 8,
              background: selectedFriend?.id === f.id ? '#2563eb' : '#2d2d2d',
              borderRadius: 8,
              cursor: 'pointer',
              boxShadow: selectedFriend?.id === f.id ? '0 2px 8px #2563eb44' : 'none',
              border: selectedFriend?.id === f.id ? '2px solid #3794ff' : '2px solid transparent',
              transition: 'background 0.2s, border 0.2s',
              position: 'relative',
            }}
            onClick={() => setSelectedFriend({ ...f, _selectedAt: Date.now() })}
            onMouseEnter={e => (e.currentTarget.style.background = '#313244')}
            onMouseLeave={e => (e.currentTarget.style.background = selectedFriend?.id === f.id ? '#2563eb' : '#2d2d2d')}
          >
            <div style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: '#3794ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 700,
              fontSize: 18,
              textTransform: 'uppercase',
              boxShadow: '0 1px 4px #0002',
            }}>{f.username[0]}</div>
            <span style={{ color: isOnline(f.id) ? '#10B981' : '#fff', fontWeight: 500 }}>{f.username}</span>
            {isOnline(f.id) && <span style={{ color: '#10B981', fontSize: 10, marginLeft: 4 }}>(online)</span>}
          </div>
        ))}
      </div>
      {/* DM Chat Panel */}
      {selectedFriend && (
        <div style={{ marginTop: 16 }}>
          <h4 style={{ color: '#fff' }}>Chat with {selectedFriend.username}</h4>
          <ChatPanel friend={selectedFriend} currentUser={user} token={token} />
        </div>
      )}
    </div>
  );
} 