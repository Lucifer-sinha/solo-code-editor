import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getSocket } from '../utils/socket';
import { getApiUrl } from '../config/api';
import { Users, UserPlus, X, Send, Check, Clock, AlertCircle } from 'lucide-react';
import { createCollabInviteData, generateCollabId } from '../utils/collabPaths';

interface MultiUserCollabInviteProps {
  onClose: () => void;
  selectedFile?: any;
  existingCollabId?: string; // If inviting to existing collab
  existingParticipants?: Array<{ userId: string; username: string }>; // Current participants
}

interface Friend {
  id: string;
  username: string;
  email?: string;
}

interface InviteStatus {
  userId: string;
  username: string;
  status: 'pending' | 'accepted' | 'declined';
  timestamp: number;
}

export default function MultiUserCollabInvite({ 
  onClose, 
  selectedFile, 
  existingCollabId,
  existingParticipants = []
}: MultiUserCollabInviteProps) {
  const { user, token } = useAuth() || {};
  const socket = getSocket();
  
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<Friend[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [inviteStatuses, setInviteStatuses] = useState<InviteStatus[]>([]);
  const [showInviteStatus, setShowInviteStatus] = useState(false);
  const [currentInviteTs, setCurrentInviteTs] = useState<number | null>(null);

  // Load friends list
  useEffect(() => {
    if (!token) return;
    
    fetch(getApiUrl('friends/list'), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.json())
      .then(data => {
        const normalized = (data.friends || []).map(f => ({
          ...f,
          id: f.id || f._id,
        }));
        
        // Filter out existing participants if this is for an existing collab
        const availableFriends = existingCollabId 
          ? normalized.filter(f => !existingParticipants.some(p => p.userId === f.id))
          : normalized;
          
        setFriends(availableFriends);
      })
      .catch(console.error);
  }, [token, existingCollabId, existingParticipants]);

  // Listen for invite responses
  useEffect(() => {
    const handleInviteResponse = (data: any) => {
      setInviteStatuses(prev => 
        prev.map(status => 
          status.userId === data.userId 
            ? { ...status, status: data.response }
            : status
        )
      );
    };

    socket.on('collab-invite-response', handleInviteResponse);
    return () => socket.off('collab-invite-response', handleInviteResponse);
  }, [socket]);

  // Also listen for DM-based responses to update statuses in this modal
  useEffect(() => {
    const onDmMessage = (msg: any) => {
      if (!msg || msg.type !== 'collab-invite-response') return;
      if (currentInviteTs && msg.originalInviteTimestamp !== currentInviteTs) return;
      // Update status when the invited friend responds
      setInviteStatuses(prev => prev.map(s => (
        s.userId === msg.from ? { ...s, status: msg.status } : s
      )));
    };
    socket.on('dm-message', onDmMessage);
    return () => socket.off('dm-message', onDmMessage);
  }, [socket, currentInviteTs]);

  // Filter friends based on search
  const filteredFriends = friends.filter(friend =>
    friend.username.toLowerCase().includes(searchQuery.toLowerCase()) &&
    !selectedFriends.some(selected => selected.id === friend.id)
  );

  const handleSelectFriend = (friend: Friend) => {
    setSelectedFriends(prev => [...prev, friend]);
  };

  const handleRemoveFriend = (friendId: string) => {
    setSelectedFriends(prev => prev.filter(f => f.id !== friendId));
  };

  const handleSendInvites = async () => {
    if (selectedFriends.length === 0) return;
    
    setIsSending(true);
    setShowInviteStatus(true);
    
    // Initialize invite statuses
    const initialStatuses: InviteStatus[] = selectedFriends.map(friend => ({
      userId: friend.id,
      username: friend.username,
      status: 'pending',
      timestamp: Date.now()
    }));
    setInviteStatuses(initialStatuses);

    try {
      // Standardized collab ID generation for multi-user collaboration
      // Use sorted user IDs for consistency across all components
      const allUserIds = [user?.id, ...selectedFriends.map(f => f.id), ...(existingParticipants || []).map(p => p.userId)].filter(Boolean);
      const sortedUserIds = Array.from(new Set(allUserIds)).sort();
      // Use systematic collabId generation for consistency
      const generatedCollabId = existingCollabId || generateCollabId();
      
      const inviteData = {
        type: existingCollabId ? 'join-existing-collab' : 'new-multi-collab',
        collabId: generatedCollabId,
        selectedFile: selectedFile,
        invitedUsers: selectedFriends.map(f => ({ id: f.id, username: f.username })),
        message: inviteMessage,
        from: {
          id: user?.id,
          username: user?.username
        },
        timestamp: Date.now(),
        // Enhanced metadata for better room management
        roomMetadata: {
          ownerId: user?.id,
          createdAt: Date.now(),
          maxParticipants: selectedFriends.length + (existingParticipants?.length || 0) + 1, // +1 for owner
          fileType: selectedFile?.type || (selectedFile?.children ? 'directory' : 'file'),
          filePath: selectedFile?.path
        }
      };
      setCurrentInviteTs(inviteData.timestamp);

      // Send invites to all selected friends with enhanced data
      for (const friend of selectedFriends) {
        socket.emit('multi-collab-invite', {
          ...inviteData,
          to: friend.id,
          toUsername: friend.username,
          // Add room creation priority (first to accept becomes room creator)
          roomCreationPriority: Date.now()
        });

        // Create standardized collaboration invite data for each friend
        const standardInviteData = createCollabInviteData(selectedFile, user?.id, friend.id, generatedCollabId);
        
        const invitedIds = selectedFriends.map(u => u.id);
        const existingIds = (existingParticipants || []).map(p => p.userId);
        const usersAll = Array.from(new Set([user?.id, ...invitedIds, ...existingIds].filter(Boolean)));
        
        const dmInvite = {
          ...standardInviteData,
          content: `[Multi-User Collab Invitation${existingCollabId ? ' (Existing Room)' : ''}] ${standardInviteData.fileType === 'directory' ? 'Directory' : 'File'}: ${standardInviteData.fileName}`,
          type: 'multi-collab-invite',
          users: usersAll,
          // Enhanced metadata
          roomMetadata: inviteData.roomMetadata,
          inviteType: 'multi-user'
        };
        
        console.log('[MultiUserCollabInvite] Sending standardized invite:', dmInvite);
        socket.emit('dm-message', dmInvite);
      }

      // Save to backend with enhanced persistence
      await fetch(getApiUrl('collab/multi-invite'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(inviteData)
      });

    } catch (error) {
      console.error('Error sending invites:', error);
    } finally {
      setIsSending(false);
    }
  };

  const allResponded = inviteStatuses.length > 0 && 
    inviteStatuses.every(status => status.status !== 'pending');

  const acceptedCount = inviteStatuses.filter(status => status.status === 'accepted').length;

  return (
    <div className="multi-user-collab-invite-overlay">
      <div className="multi-user-collab-invite-modal">
        <div className="modal-header">
          <div className="header-content">
            <Users size={20} />
            <h3>
              {existingCollabId ? 'Invite to Collaboration' : 'Start Multi-User Collaboration'}
            </h3>
          </div>
          <button onClick={onClose} className="close-btn">
            <X size={18} />
          </button>
        </div>

        {!showInviteStatus ? (
          <>
            {/* File/Project Info */}
            {selectedFile && (
              <div className="selected-file-info">
                <div className="file-icon">
                  {selectedFile.type === 'directory' ? '📁' : '📄'}
                </div>
                <div className="file-details">
                  <div className="file-name">{selectedFile.title || selectedFile.name}</div>
                  <div className="file-path">{selectedFile.path}</div>
                </div>
              </div>
            )}

            {/* Existing Participants (if any) */}
            {existingParticipants.length > 0 && (
              <div className="existing-participants">
                <h4>Current Participants</h4>
                <div className="participants-list">
                  {existingParticipants.map(participant => (
                    <div key={participant.userId} className="participant-item">
                      <div className="participant-avatar">
                        {participant.username[0].toUpperCase()}
                      </div>
                      <span>{participant.username}</span>
                      {participant.userId === user?.id && <span className="you-badge">You</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Friend Search */}
            <div className="friend-search">
              <input
                type="text"
                placeholder="Search friends to invite..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
              />
            </div>

            {/* Selected Friends */}
            {selectedFriends.length > 0 && (
              <div className="selected-friends">
                <h4>Selected Friends ({selectedFriends.length})</h4>
                <div className="selected-friends-list">
                  {selectedFriends.map(friend => (
                    <div key={friend.id} className="selected-friend-item">
                      <div className="friend-avatar">
                        {friend.username[0].toUpperCase()}
                      </div>
                      <span>{friend.username}</span>
                      <button
                        onClick={() => handleRemoveFriend(friend.id)}
                        className="remove-friend-btn"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Available Friends */}
            <div className="available-friends">
              <h4>Available Friends</h4>
              <div className="friends-list">
                {filteredFriends.length === 0 ? (
                  <div className="no-friends">
                    {searchQuery ? 'No friends found matching your search' : 'No friends available to invite'}
                  </div>
                ) : (
                  filteredFriends.map(friend => (
                    <div
                      key={friend.id}
                      className="friend-item"
                      onClick={() => handleSelectFriend(friend)}
                    >
                      <div className="friend-avatar">
                        {friend.username[0].toUpperCase()}
                      </div>
                      <span>{friend.username}</span>
                      <UserPlus size={16} className="add-icon" />
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Invite Message */}
            <div className="invite-message">
              <textarea
                placeholder="Add a message to your invitation (optional)..."
                value={inviteMessage}
                onChange={(e) => setInviteMessage(e.target.value)}
                className="message-input"
                rows={3}
              />
            </div>

            {/* Action Buttons */}
            <div className="action-buttons">
              <button onClick={onClose} className="cancel-btn">
                Cancel
              </button>
              <button
                onClick={handleSendInvites}
                disabled={selectedFriends.length === 0 || isSending}
                className="send-invites-btn"
              >
                {isSending ? (
                  <>
                    <div className="spinner" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    Send Invites ({selectedFriends.length})
                  </>
                )}
              </button>
            </div>
          </>
        ) : (
          /* Invite Status View */
          <div className="invite-status-view">
            <div className="status-header">
              <h4>Invitation Status</h4>
              <div className="status-summary">
                {acceptedCount} of {inviteStatuses.length} accepted
              </div>
            </div>

            <div className="status-list">
              {inviteStatuses.map(status => (
                <div key={status.userId} className="status-item">
                  <div className="friend-info">
                    <div className="friend-avatar">
                      {status.username[0].toUpperCase()}
                    </div>
                    <span>{status.username}</span>
                  </div>
                  <div className={`status-badge ${status.status}`}>
                    {status.status === 'pending' && <Clock size={14} />}
                    {status.status === 'accepted' && <Check size={14} />}
                    {status.status === 'declined' && <X size={14} />}
                    <span>{status.status}</span>
                  </div>
                </div>
              ))}
            </div>

            {allResponded && (
              <div className="final-actions">
                {acceptedCount > 0 ? (
                  <div className="success-message">
                    <Check size={20} />
                    <span>
                      {acceptedCount} friend{acceptedCount !== 1 ? 's' : ''} accepted! 
                      The collaboration will start automatically.
                    </span>
                  </div>
                ) : (
                  <div className="no-accepts-message">
                    <AlertCircle size={20} />
                    <span>No one accepted the invitation. You can try again later.</span>
                  </div>
                )}
                <button onClick={onClose} className="done-btn">
                  Done
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        .multi-user-collab-invite-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
        }

        .multi-user-collab-invite-modal {
          background: #1e1e1e;
          border-radius: 12px;
          width: 90%;
          max-width: 500px;
          max-height: 80vh;
          overflow-y: auto;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          border-bottom: 1px solid #333;
        }

        .header-content {
          display: flex;
          align-items: center;
          gap: 12px;
          color: #fff;
        }

        .header-content h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
        }

        .close-btn {
          background: none;
          border: none;
          color: #999;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          transition: color 0.2s;
        }

        .close-btn:hover {
          color: #fff;
        }

        .selected-file-info {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 20px;
          background: #252525;
          margin: 0 20px 20px 20px;
          border-radius: 8px;
          margin-top: 20px;
        }

        .file-icon {
          font-size: 24px;
        }

        .file-details {
          flex: 1;
        }

        .file-name {
          color: #fff;
          font-weight: 600;
          margin-bottom: 4px;
        }

        .file-path {
          color: #999;
          font-size: 14px;
        }

        .existing-participants {
          padding: 0 20px 20px 20px;
        }

        .existing-participants h4 {
          color: #fff;
          margin: 0 0 12px 0;
          font-size: 14px;
          font-weight: 600;
        }

        .participants-list {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .participant-item {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #333;
          padding: 6px 12px;
          border-radius: 20px;
          color: #fff;
          font-size: 14px;
        }

        .participant-avatar {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #4CAF50;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 600;
          color: white;
        }

        .you-badge {
          background: #2196F3;
          color: white;
          padding: 2px 6px;
          border-radius: 10px;
          font-size: 10px;
          font-weight: 600;
        }

        .friend-search {
          padding: 0 20px 20px 20px;
        }

        .search-input {
          width: 100%;
          padding: 12px;
          background: #252525;
          border: 1px solid #333;
          border-radius: 8px;
          color: #fff;
          font-size: 14px;
        }

        .search-input:focus {
          outline: none;
          border-color: #4CAF50;
        }

        .selected-friends {
          padding: 0 20px 20px 20px;
        }

        .selected-friends h4 {
          color: #fff;
          margin: 0 0 12px 0;
          font-size: 14px;
          font-weight: 600;
        }

        .selected-friends-list {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .selected-friend-item {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #4CAF50;
          padding: 6px 12px;
          border-radius: 20px;
          color: white;
          font-size: 14px;
        }

        .friend-avatar {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #666;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 600;
          color: white;
        }

        .remove-friend-btn {
          background: none;
          border: none;
          color: white;
          cursor: pointer;
          padding: 2px;
          border-radius: 2px;
          opacity: 0.8;
        }

        .remove-friend-btn:hover {
          opacity: 1;
        }

        .available-friends {
          padding: 0 20px 20px 20px;
        }

        .available-friends h4 {
          color: #fff;
          margin: 0 0 12px 0;
          font-size: 14px;
          font-weight: 600;
        }

        .friends-list {
          max-height: 200px;
          overflow-y: auto;
        }

        .friend-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: #252525;
          border-radius: 8px;
          margin-bottom: 8px;
          cursor: pointer;
          transition: background 0.2s;
          color: #fff;
        }

        .friend-item:hover {
          background: #333;
        }

        .add-icon {
          margin-left: auto;
          color: #4CAF50;
        }

        .no-friends {
          color: #999;
          text-align: center;
          padding: 20px;
          font-style: italic;
        }

        .invite-message {
          padding: 0 20px 20px 20px;
        }

        .message-input {
          width: 100%;
          padding: 12px;
          background: #252525;
          border: 1px solid #333;
          border-radius: 8px;
          color: #fff;
          font-size: 14px;
          resize: vertical;
          min-height: 60px;
        }

        .message-input:focus {
          outline: none;
          border-color: #4CAF50;
        }

        .action-buttons {
          display: flex;
          gap: 12px;
          padding: 20px;
          border-top: 1px solid #333;
        }

        .cancel-btn {
          flex: 1;
          padding: 12px;
          background: #333;
          color: #fff;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          transition: background 0.2s;
        }

        .cancel-btn:hover {
          background: #444;
        }

        .send-invites-btn {
          flex: 2;
          padding: 12px;
          background: #4CAF50;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: background 0.2s;
        }

        .send-invites-btn:hover:not(:disabled) {
          background: #45a049;
        }

        .send-invites-btn:disabled {
          background: #666;
          cursor: not-allowed;
        }

        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid transparent;
          border-top: 2px solid white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .invite-status-view {
          padding: 20px;
        }

        .status-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .status-header h4 {
          color: #fff;
          margin: 0;
          font-size: 16px;
          font-weight: 600;
        }

        .status-summary {
          color: #4CAF50;
          font-size: 14px;
          font-weight: 600;
        }

        .status-list {
          space-y: 8px;
        }

        .status-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px;
          background: #252525;
          border-radius: 8px;
          margin-bottom: 8px;
        }

        .friend-info {
          display: flex;
          align-items: center;
          gap: 12px;
          color: #fff;
        }

        .status-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 12px;
          border-radius: 16px;
          font-size: 12px;
          font-weight: 600;
        }

        .status-badge.pending {
          background: #FFA726;
          color: white;
        }

        .status-badge.accepted {
          background: #4CAF50;
          color: white;
        }

        .status-badge.declined {
          background: #F44336;
          color: white;
        }

        .final-actions {
          margin-top: 20px;
          text-align: center;
        }

        .success-message, .no-accepts-message {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-bottom: 16px;
          padding: 12px;
          border-radius: 8px;
        }

        .success-message {
          background: #4CAF50;
          color: white;
        }

        .no-accepts-message {
          background: #FF9800;
          color: white;
        }

        .done-btn {
          padding: 12px 24px;
          background: #4CAF50;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}