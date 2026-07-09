import React, { useState } from 'react';
import ChatPanel from './ChatPanel';
import FriendsPanel from './FriendsPanel';
import DMPanel from './DMPanel';
import AIHelp from './AIHelp';
import AdvancedAIToolsPanel from './AdvancedAIToolsPanel';
import { 
  ChevronLeft, 
  ChevronRight, 
  Users, 
  Bot, 
  Wand2,
  Heart,
  
} from 'lucide-react';

const SIDEBAR_WIDTH = 350;

interface RightPanelStackProps {
  currentFilePath?: string;
  allOpenFiles?: { [path: string]: string };
  collabId?: string;
  senderId?: string;
  onRefreshFileTree?: () => void;
  onFileUpdate?: (filePath: string, content: string) => void;
  onFileOpen?: (filePath: string) => void;
  onCollabSessionStart?: (fileOrDir: any) => void;
  terminalRef?: React.RefObject<{ writeToTerminal: (text: string) => void; sendRunCommand: (cmd: string) => void }>;
}

export default function RightPanelStack({
  currentFilePath,
  allOpenFiles,
  collabId,
  senderId,
  onRefreshFileTree,
  onFileUpdate,
  onFileOpen,
  onCollabSessionStart,
  terminalRef
}: RightPanelStackProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'friends' | 'dm' | 'ai-help' | 'advanced-ai'>('advanced-ai');

  const tabs = [
    { id: 'friends', label: 'Friends', icon: Users, color: '#06d6a0' },
    { id: 'dm', label: 'DM', icon: Heart, color: '#ec4899' },
    { id: 'ai-help', label: 'AI Help', icon: Bot, color: '#8b5cf6' },
    { id: 'advanced-ai', label: 'AI Tools', icon: Wand2, color: '#f59e0b' }
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'friends':
        return <FriendsPanel />;
      case 'dm':
        return <DMPanel onCollabSessionStart={onCollabSessionStart} />;
      case 'ai-help':
        return (
          <AIHelp
            code={allOpenFiles?.[currentFilePath || ''] || ''}
            onCodeUpdate={(newCode) => onFileUpdate?.(currentFilePath || '', newCode)}
          />
        );
      case 'advanced-ai':
        return (
          <AdvancedAIToolsPanel
            currentFilePath={currentFilePath}
            allOpenFiles={allOpenFiles}
            collabId={collabId}
            senderId={senderId}
            onRefreshFileTree={onRefreshFileTree}
            onFileUpdate={onFileUpdate}
            onFileOpen={onFileOpen}
            terminalRef={terminalRef}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="right-panel-stack-container">
      {/* Toggle Button */}
      <button 
        className={`right-panel-toggle ${open ? 'open' : 'closed'}`}
        onClick={() => setOpen(!open)}
      >
        <div className="toggle-content">
          {open ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          
        </div>
      </button>

      {/* Sidebar Panel */}
      <div className={`right-panel-sidebar ${open ? 'panel-open' : 'panel-closed'}`}>
        {/* Tab Bar */}
        <div className="panel-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`panel-tab ${activeTab === tab.id ? 'active' : ''}`}
              style={{ '--tab-color': tab.color } as any}
            >
              <div className="tab-icon">
                <tab.icon size={16} />
              </div>
              <span className="tab-label">{tab.label}</span>
              {activeTab === tab.id && <div className="tab-active-indicator" />}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="panel-content">
          {renderContent()}
        </div>
      </div>

      {/* Overlay when open (for mobile/small screens) */}
      {open && <div className="panel-overlay" onClick={() => setOpen(false)} />}
    </div>
  );
}
