import React from 'react';
import { Check, X, Users, File, Folder } from 'lucide-react';

interface CollabInviteMessageProps {
  msg: {
    type: 'collab-invite' | 'multi-collab-invite';
    content: string;
    fileName: string;
    fileType: 'file' | 'directory';
    filePath: string;
    collabId?: string;
    users?: string[];
    roomMetadata?: any;
    inviteType?: 'single' | 'multi-user';
    timestamp: number;
    from: string;
    to: string;
  };
  isSender: boolean;
  isRecipient: boolean;
  onRespond: (status: 'accepted' | 'rejected') => void;
  inviteStatus: 'pending' | 'accepted' | 'rejected';
}

export default function CollabInviteMessage({
  msg,
  isSender,
  isRecipient,
  onRespond,
  inviteStatus
}: CollabInviteMessageProps) {
  const isMultiUser = msg.type === 'multi-collab-invite' || msg.inviteType === 'multi-user';
  const isPending = inviteStatus === 'pending';
  const isAccepted = inviteStatus === 'accepted';
  const isRejected = inviteStatus === 'rejected';

  const getStatusColor = () => {
    if (isAccepted) return '#4CAF50';
    if (isRejected) return '#f44336';
    return '#FFA726';
  };

  const getStatusText = () => {
    if (isAccepted) return 'Accepted';
    if (isRejected) return 'Rejected';
    return 'Pending';
  };

  const getStatusIcon = () => {
    if (isAccepted) return <Check size={16} />;
    if (isRejected) return <X size={16} />;
    return null;
  };

  return (
    <div style={{
      marginBottom: 12,
      display: 'flex',
      flexDirection: 'column',
      alignItems: isSender ? 'flex-end' : 'flex-start',
    }}>
      <div style={{
        background: isSender ? '#3794ff' : '#2d2d30',
        color: '#fff',
        borderRadius: 12,
        padding: '12px 16px',
        maxWidth: '80%',
        border: `2px solid ${getStatusColor()}`,
        position: 'relative'
      }}>
        {/* Header with invite type and status */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '8px',
          fontSize: '12px',
          fontWeight: 600,
          color: getStatusColor()
        }}>
          {isMultiUser ? <Users size={14} /> : <File size={14} />}
          <span>{isMultiUser ? 'Multi-User Collaboration' : 'Collaboration'} Invitation</span>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            marginLeft: 'auto',
            background: getStatusColor(),
            color: 'white',
            padding: '2px 8px',
            borderRadius: '12px',
            fontSize: '10px'
          }}>
            {getStatusIcon()}
            {getStatusText()}
          </div>
        </div>

        {/* File/Directory info */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '8px'
        }}>
          {msg.fileType === 'directory' ? <Folder size={16} color="#FFA726" /> : <File size={16} color="#4CAF50" />}
          <div>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>
              {msg.fileName}
            </div>
            <div style={{ fontSize: '12px', color: '#ccc', marginTop: '2px' }}>
              {msg.fileType === 'directory' ? 'Directory' : 'File'}
              {msg.filePath && ` • ${msg.filePath}`}
            </div>
          </div>
        </div>

        {/* Multi-user specific info */}
        {isMultiUser && msg.users && (
          <div style={{
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            padding: '8px',
            marginBottom: '8px',
            fontSize: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
              <Users size={12} />
              <span style={{ fontWeight: 600 }}>Participants ({msg.users.length})</span>
            </div>
            <div style={{ color: '#ccc' }}>
              {msg.users.slice(0, 3).join(', ')}
              {msg.users.length > 3 && ` +${msg.users.length - 3} more`}
            </div>
          </div>
        )}

        {/* Action buttons for recipients */}
        {isRecipient && isPending && (
          <div style={{
            display: 'flex',
            gap: '8px',
            marginTop: '8px'
          }}>
            <button
              onClick={() => onRespond('accepted')}
              style={{
                background: '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'background 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.background = '#45a049'}
              onMouseOut={(e) => e.currentTarget.style.background = '#4CAF50'}
            >
              <Check size={14} />
              Accept
            </button>
            <button
              onClick={() => onRespond('rejected')}
              style={{
                background: '#f44336',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'background 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.background = '#da190b'}
              onMouseOut={(e) => e.currentTarget.style.background = '#f44336'}
            >
              <X size={14} />
              Reject
            </button>
          </div>
        )}

        {/* Status message for senders */}
        {isSender && !isPending && (
          <div style={{
            marginTop: '8px',
            padding: '6px 8px',
            background: getStatusColor(),
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 600,
            textAlign: 'center'
          }}>
            {isAccepted ? '✅ Invitation Accepted' : '❌ Invitation Rejected'}
          </div>
        )}

        {/* Timestamp */}
        <div style={{
          fontSize: '10px',
          color: '#999',
          marginTop: '8px',
          textAlign: 'right'
        }}>
          {new Date(msg.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}
