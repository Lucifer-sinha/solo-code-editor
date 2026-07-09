import React, { useState } from 'react';
import ChatPanel from './ChatPanel';
import FriendsPanel from './FriendsPanel';
import DMPanel from './DMPanel';
import { ChevronLeft, ChevronRight, Users, MessageCircle } from 'lucide-react';

const SIDEBAR_WIDTH = 340;

export default function RightSidebar() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'friends'>('chat');

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      right: 0,
      height: '100vh',
      width: open ? SIDEBAR_WIDTH : 48,
      background: '#23272e',
      boxShadow: open ? '-2px 0 8px rgba(0,0,0,0.15)' : 'none',
      transition: 'width 0.3s cubic-bezier(.4,2,.6,1)',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      borderLeft: '1px solid #222',
    }}>
      {/* Arrow Button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'absolute',
          left: -32,
          top: 24,
          width: 32,
          height: 48,
          background: '#23272e',
          border: '1px solid #222',
          borderRadius: '8px 0 0 8px',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          cursor: 'pointer',
          zIndex: 1001,
        }}
        aria-label={open ? 'Close sidebar' : 'Open sidebar'}
      >
        {open ? <ChevronRight size={24} /> : <ChevronLeft size={24} />}
      </button>
      {/* Tabs */}
      {open && (
        <div style={{ display: 'flex', borderBottom: '1px solid #333', background: '#23272e' }}>
          <button
            onClick={() => setActiveTab('chat')}
            style={{
              flex: 1,
              padding: '12px 0',
              background: 'none',
              border: 'none',
              color: activeTab === 'chat' ? '#3794ff' : '#fff',
              fontWeight: activeTab === 'chat' ? 'bold' : 'normal',
              borderBottom: activeTab === 'chat' ? '2px solid #3794ff' : 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <MessageCircle size={18} /> Chat
          </button>
          <button
            onClick={() => setActiveTab('friends')}
            style={{
              flex: 1,
              padding: '12px 0',
              background: 'none',
              border: 'none',
              color: activeTab === 'friends' ? '#3794ff' : '#fff',
              fontWeight: activeTab === 'friends' ? 'bold' : 'normal',
              borderBottom: activeTab === 'friends' ? '2px solid #3794ff' : 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <Users size={18} /> Friends
          </button>
        </div>
      )}
      {/* Panel Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: open ? 16 : 0, transition: 'padding 0.3s' }}>
        {open && (
          // Show DMPanel for Discord-like DMs
          <DMPanel />
        )}
      </div>
    </div>
  );
} 