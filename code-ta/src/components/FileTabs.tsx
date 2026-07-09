import React from 'react';
import '../styles/file-tabs.css';

interface FileTab {
  path: string;
  name: string;
}

interface FileTabsProps {
  tabs: FileTab[];
  activeTab: FileTab | null;
  onTabSelect: (tab: FileTab) => void;
  onTabClose: (path: string) => void;
  isCollaborating?: boolean;
}

const FileTabs: React.FC<FileTabsProps> = ({ 
  tabs, 
  activeTab, 
  onTabSelect, 
  onTabClose,
  isCollaborating = false
}) => {
  if (tabs.length === 0 && !isCollaborating) return null;

  return (
    <div style={{ 
      display: 'flex', 
      background: '#2d2d30', 
      borderBottom: '1px solid #3c3c3c',
      minHeight: '32px',
      overflowX: 'auto',
      alignItems: 'center'
    }}>
      {isCollaborating && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          padding: '6px 12px',
          background: '#0e639c',
          color: '#ffffff',
          fontSize: '11px',
          fontWeight: 500,
          gap: '6px'
        }}>
          <div style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: '#00d4aa'
          }} />
          Collaborating
        </div>
      )}
      {tabs.map((tab) => (
        <div 
          key={tab.path}
          onClick={() => onTabSelect(tab)}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '6px 12px',
            background: activeTab?.path === tab.path ? '#1e1e1e' : 'transparent',
            borderRight: '1px solid #3c3c3c',
            cursor: 'pointer',
            minWidth: '120px',
            maxWidth: '200px',
            fontSize: '12px',
            color: activeTab?.path === tab.path ? '#ffffff' : '#cccccc',
            borderTop: activeTab?.path === tab.path ? '2px solid #0e639c' : '2px solid transparent'
          }}
        >
          <span style={{ 
            flex: 1, 
            overflow: 'hidden', 
            textOverflow: 'ellipsis', 
            whiteSpace: 'nowrap' 
          }}>
            {tab.name}
          </span>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onTabClose(tab.path);
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#cccccc',
              cursor: 'pointer',
              padding: '2px 4px',
              marginLeft: '6px',
              borderRadius: '2px',
              fontSize: '14px',
              lineHeight: 1
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#464647';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'none';
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
};

export default FileTabs;
