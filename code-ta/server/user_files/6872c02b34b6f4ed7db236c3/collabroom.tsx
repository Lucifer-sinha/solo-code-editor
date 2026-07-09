import { useState, useEffect, useRef } from 'react';
import CodeEditor from './Editor/CodeEditor';
import XTerminal from './Terminal/Terminal';
import FileExplorer from './FileExplorer';
import FileTabs from './FileTabs';
import MultiLanguageEditor from './Editor/MultiLanguageEditor';
import type { MultiLanguageEditorProps } from './Editor/MultiLanguageEditor';
import { useAuth } from '../context/AuthContext';
import { getSocket } from '../utils/socket';
import { CollabProvider } from '../context/CollabContext';
import { useBackendRunner } from '../utils/useBackendRunner';
import CollabBashTerminal from './CollabBashTerminal';

interface Tab {
  path: string;
  name: string;
  content: string;
  language: string;
  isDirty: boolean;
}

interface CollabRoomProps {
  room: string;
  users: Array<{ userId: string; username: string }>;
  currentUser: { userId: string; username: string };
  onEnd: () => void;
  socket: any;
  initialFilePath: string;
  initialFileContent: string;
  collabRoot: string;
  collabFileType?: string;
  collabFileName?: string;
  senderId: string;
}

const getLanguageFromFileName = (fileName: string): string => {
  const extension = fileName.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'py': return 'python';
    case 'js': return 'javascript';
    case 'ts': return 'typescript';
    case 'html': return 'html';
    case 'css': return 'css';
    case 'json': return 'json';
    case 'md': return 'markdown';
    case 'sql': return 'sql';
    case 'java': return 'java';
    case 'cpp': case 'cc': case 'cxx': return 'cpp';
    case 'c': return 'c';
    case 'cs': return 'csharp';
    case 'php': return 'php';
    case 'rb': return 'ruby';
    case 'go': return 'go';
    case 'rs': return 'rust';
    case 'swift': case 'kt': return 'kotlin';
    case 'scala': case 'r': case 'm': return 'matlab';
    case 'sh': return 'bash';
    default: return 'plaintext';
  }
};

// Helper to recursively gather all files from the file tree
const getAllFiles = (node: any, parentPath = ''): string[] => {
  const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;
  let files: string[] = [];
  if (node.type === 'file') {
    files.push(currentPath);
  } else if (node.type === 'directory' && node.children) {
    node.children.forEach((child: any) => {
      files = files.concat(getAllFiles(child, currentPath));
    });
  }
  return files;
};

// Helper to get run command for a file/language
function getRunCommand(fileName: string, language: string) {
  switch (language) {
    case 'python': return `python3 ${fileName}`;
    case 'javascript': return `node ${fileName}`;
    case 'typescript': return `ts-node ${fileName}`;
    case 'java': return `javac ${fileName} && java ${fileName.replace('.java', '')}`;
    case 'cpp': return `g++ ${fileName} -o main && ./main`;
    case 'c': return `gcc ${fileName} -o main && ./main`;
    case 'bash': return `bash ${fileName}`;
    case 'php': return `php ${fileName}`;
    case 'ruby': return `ruby ${fileName}`;
    case 'go': return `go run ${fileName}`;
    case 'rust': return `rustc ${fileName} && ./main`;
    default: return '';
  }
}

function getRunCommandWithCd(activeTabPath: string, language: string) {
  const fileName = activeTabPath.split('/').pop() || '';
  const dir = activeTabPath.includes('/') ? activeTabPath.substring(0, activeTabPath.lastIndexOf('/')) : '';
  const runCmd = getRunCommand(fileName, language);
  if (dir) {
    return `cd ${dir} && ${runCmd} 2>&1; cd /server/collabroom`;
  }
  return `${runCmd} 2>&1`;
}

export default function CollabRoom({
  room,
  users,
  currentUser,
  onEnd,
  initialFilePath,
  initialFileContent,
  collabRoot,
  collabFileType,
  collabFileName,
  senderId,
}: CollabRoomProps) {
  const { token, user } = useAuth() || {};
  const [openTabs, setOpenTabs] = useState<Tab[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(initialFilePath || null);
  const [fileTree, setFileTree] = useState<any>(null);
  const [tabContents, setTabContents] = useState<{ [path: string]: string }>({});
  const [currentOutput, setCurrentOutput] = useState('');
  const [isTreeLoading, setIsTreeLoading] = useState(false);
  const interactiveTerminalRef = useRef<any>(null);
  const codeEditorRef = useRef<any>(null);
  const collabTerminalRef = useRef<any>(null);
  const collabId = room;
  const socket = getSocket();
  const { runCode } = useBackendRunner();

  // Add a new state for file load errors
  const [fileLoadError, setFileLoadError] = useState<string | null>(null);

  // Join collaboration room for real-time sync
  useEffect(() => {
    if (socket && room) {
      socket.emit('join-collab-room', { 
        room: `collabroom_${room}`, 
        userId: user?.id, 
        username: user?.username,
        senderId 
      });
      
      console.log('[CollabRoom] Joined collaboration room:', `collabroom_${room}`);
    }

    return () => {
      if (socket && room) {
        socket.emit('leave-collab-room', { 
          room: `collabroom_${room}`, 
          userId: user?.id 
        });
      }
    };
  }, [socket, room, user?.id, user?.username, senderId]);

  // Real-time file tree sync
  const fetchTree = async (emitUpdate = false) => {
    if (!token || !user?.id) return;
    
    setIsTreeLoading(true);
    try {
      const url = `http://localhost:5000/api/fs/list?path=&collab_id=${room}&senderId=${senderId}`;
      console.log('[CollabRoom] Fetching tree from:', url);
      
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      
      const data = await res.json();
      console.log('[CollabRoom] Received tree data:', data);
      
      setFileTree(data);
      
      // Emit tree update to all users in real-time
      if (emitUpdate && socket) {
        socket.emit('collab-tree-update', {
          room: `collabroom_${room}`,
          tree: data,
          updatedBy: user?.id
        });
      }
    } catch (e) {
      console.error('[CollabRoom] fetchTree error:', e);
    } finally {
      setIsTreeLoading(false);
    }
  };

  // Real-time tree update listener
  useEffect(() => {
    if (!socket) return;

    const handleTreeUpdate = (data: { tree: any; updatedBy: string }) => {
      console.log('[CollabRoom] Real-time tree update received:', data);
      fetchTree(false); // Always fetch the latest tree from backend
    };

    const handleFileOperation = (data: { operation: string; path: string; success: boolean }) => {
      console.log('[CollabRoom] File operation completed:', data);
      if (data.success) {
        fetchTree(false); // Refresh tree without emitting to avoid loops
      }
    };

    socket.on('collab-tree-update', handleTreeUpdate);
    socket.on('collab-file-operation', handleFileOperation);

    return () => {
      socket.off('collab-tree-update', handleTreeUpdate);
      socket.off('collab-file-operation', handleFileOperation);
    };
  }, [socket, user?.id, room]);

  // Initial tree fetch
  useEffect(() => {
    fetchTree(false);
  }, [collabRoot, collabId, token, senderId]);

  // File Operations with Real-time Sync
  const handleFileOpen = async (path: string, type: string) => {
    if (!token || type !== 'file') return;

    // If tab is already open, just activate it
    const existingTab = openTabs.find(tab => tab.path === path);
    if (existingTab) {
      setActiveTabPath(path);
      return;
    }

    try {
      const res = await fetch(`http://localhost:5000/api/fs/file?path=${encodeURIComponent(path)}&collab_id=${collabId}&senderId=${senderId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error(`Failed to open file: ${res.status}`);
      }

      const data = await res.json();
      const fileName = path.split('/').pop() || 'untitled';
      const language = getLanguageFromFileName(fileName);

      setOpenTabs(prev => [...prev, {
        path,
        name: fileName,
        content: data.content,
        language,
        isDirty: false
      }]);
      setTabContents(prev => ({ ...prev, [path]: data.content }));
      setActiveTabPath(path);
    } catch (e) {
      console.error('[CollabRoom] File open error:', e);
    }
  };

  const handleSave = async () => {
    if (!activeTabPath || !token) return;
    // Get the latest code from Yjs via CodeEditor ref
    const latestCode = codeEditorRef.current?.getCurrentCode?.() ?? '';
    console.log('[CollabRoom] Saving file:', { activeTabPath, collabId, senderId, latestCode });
    try {
      const res = await fetch('http://localhost:5000/api/fs/file', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json', 
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ 
          path: activeTabPath, 
          content: latestCode, 
          collab_id: collabId, 
          senderId 
        }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to save file');
      }
      setOpenTabs(tabs => tabs.map(tab => tab.path === activeTabPath ? { ...tab, isDirty: false } : tab));
      alert('File saved to collabroom!');
    } catch (e) {
      alert('Failed to save file: ' + (e as Error).message);
    }
  };

  // Run code stub
  const handleRun = () => {
    if (!activeTabPath) return;
    const fileName = activeTabPath.split('/').pop() || '';
    const language = getLanguageFromFileName(fileName || '');
    const command = getRunCommandWithCd(activeTabPath, language);
    if (command && collabTerminalRef.current && collabTerminalRef.current.sendCommand) {
      collabTerminalRef.current.sendCommand(command + '\n');
    }
  };

  const handleCreateFile = async (path: string) => {
    if (!token) return;
    
    console.log('[CollabRoom] Creating file:', { path, collabId, senderId });
    
    try {
      const res = await fetch('http://localhost:5000/api/fs/file', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ 
          path, 
          content: '', 
          collab_id: collabId, 
          senderId 
        }),
      });
      
      if (!res.ok) {
        throw new Error(`Create file failed: ${res.status}`);
      }
      
      // Emit real-time update
      socket.emit('collab-file-created', {
        room: `collabroom_${room}`,
        path,
        createdBy: user?.id
      });
      
      await fetchTree(true);
    } catch (e) {
      console.error('[CollabRoom] Create file error:', e);
    }
  };

  const handleCreateDirectory = async (path: string) => {
    if (!token) return;
    
    console.log('[CollabRoom] Creating directory:', { path, collabId, senderId });
    
    try {
      const res = await fetch('http://localhost:5000/api/fs/dir', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ 
          path, 
          collab_id: collabId, 
          senderId 
        }),
      });
      
      if (!res.ok) {
        throw new Error(`Create directory failed: ${res.status}`);
      }
      
      // Emit real-time update
      socket.emit('collab-directory-created', {
        room: `collabroom_${room}`,
        path,
        createdBy: user?.id
      });
      
      await fetchTree(true);
    } catch (e) {
      console.error('[CollabRoom] Create directory error:', e);
    }
  };

  const handleDeleteItem = async (path: string) => {
    if (!token) return;
    
    console.log('[CollabRoom] Deleting item:', { path, collabId, senderId });
    
    try {
      const res = await fetch('http://localhost:5000/api/fs', {
        method: 'DELETE',
        headers: { 
          'Content-Type': 'application/json', 
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ 
          path, 
          collab_id: collabId, 
          senderId 
        }),
      });
      
      if (!res.ok) {
        throw new Error(`Delete failed: ${res.status}`);
      }
      
      // Close tab if it's open
      setOpenTabs(prev => prev.filter(t => t.path !== path));
      if (activeTabPath === path) {
        setActiveTabPath(null);
      }
      
      // Emit real-time update
      socket.emit('collab-item-deleted', {
        room: `collabroom_${room}`,
        path,
        deletedBy: user?.id
      });
      
      await fetchTree(true);
    } catch (e) {
      console.error('[CollabRoom] Delete error:', e);
    }
  };

  const handleRenameItem = async (oldPath: string, newName: string) => {
    if (!token) return;
    
    const pathParts = oldPath.split('/');
    pathParts[pathParts.length - 1] = newName;
    const newPath = pathParts.join('/');
    
    console.log('[CollabRoom] Renaming item:', { oldPath, newPath, collabId, senderId });
    
    try {
      const res = await fetch('http://localhost:5000/api/fs/rename', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json', 
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ 
          oldPath, 
          newPath, 
          collab_id: collabId, 
          senderId 
        }),
      });
      
      if (!res.ok) {
        throw new Error(`Rename failed: ${res.status}`);
      }
      
      // Update tabs if necessary
      setOpenTabs(prev => prev.map(t => 
        t.path === oldPath ? { ...t, path: newPath, name: newName } : t
      ));
      
      if (activeTabPath === oldPath) {
        setActiveTabPath(newPath);
      }
      
      // Emit real-time update
      socket.emit('collab-item-renamed', {
        room: `collabroom_${room}`,
        oldPath,
        newPath,
        renamedBy: user?.id
      });
      
      await fetchTree(true);
    } catch (e) {
      console.error('[CollabRoom] Rename error:', e);
    }
  };

  // Tab Management
  const handleTabSelect = async (tab: { path: string; name: string }) => {
    setActiveTabPath(tab.path);
    setFileLoadError(null);

    // If content is not loaded, fetch it
    if (!tabContents[tab.path]) {
      try {
        const res = await fetch(`http://localhost:5000/api/fs/file?path=${encodeURIComponent(tab.path)}&collab_id=${collabId}&senderId=${senderId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          setFileLoadError(`Failed to open file: ${res.status}`);
          throw new Error(`Failed to open file: ${res.status}`);
        }

        const data = await res.json();
        setTabContents(prev => ({ ...prev, [tab.path]: data.content }));
        setFileLoadError(null);
        console.log('[CollabRoom][TabSelect] Loaded content for', tab.path, data.content);
      } catch (e) {
        setFileLoadError('Could not load file content.');
        console.error('[CollabRoom] Tab select file load error:', e);
      }
    }
  };

  const handleTabClose = (path: string) => {
    setOpenTabs(tabs => tabs.filter(t => t.path !== path));
    if (activeTabPath === path) {
      const idx = openTabs.findIndex(t => t.path === path);
      const nextTab = openTabs[idx - 1] || openTabs[idx + 1] || null;
      setActiveTabPath(nextTab ? nextTab.path : null);
    }
  };

  // Editor Change
  const handleCodeChange = (newCode: string, path: string) => {
    setTabContents(prev => ({ ...prev, [path]: newCode }));
    setOpenTabs(tabs => tabs.map(t => 
      t.path === path ? { ...t, isDirty: true } : t
    ));
  };

  // Enhanced Collab End Handler
  const handleEndCollab = async () => {
    if (!collabId || !senderId || !token) {
      onEnd();
      return;
    }

    try {
      const res = await fetch('http://localhost:5000/api/collab/end', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ 
          collab_id: collabId, 
          senderId,
          room: `collabroom_${room}`
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to end collab');
      }

      // Emit collaboration end to all users
      socket.emit('collab-session-ended', {
        room: `collabroom_${room}`,
        endedBy: user?.id
      });

      console.log('[CollabRoom] Collaboration ended successfully');
    } catch (e) {
      console.error('[CollabRoom] Error ending collab:', e);
    }

    onEnd();
  };

  // FileTabs
  const fileTabs = openTabs.map(tab => ({ path: tab.path, name: tab.name }));
  const activeTab = openTabs.find(tab => tab.path === activeTabPath) || null;

  return (
    <div className="collab-room" style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#181a1b' }}>
      {/* Header */}
      <div className="collab-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 32px', background: '#23272e', borderBottom: '1px solid #333', minHeight: 60 }}>
        <h2 style={{ color: '#4caf50', fontWeight: 700, fontSize: 24, letterSpacing: 1 }}>Collaboration Room</h2>
        <button 
          onClick={handleEndCollab}
          className="end-collab-btn"
          style={{ background: '#dc3545', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 24px', fontWeight: 600, fontSize: 16, cursor: 'pointer', boxShadow: '0 2px 8px #0002' }}
        >
          End Collaboration
        </button>
      </div>

      {/* Main Content (explorer + editor) */}
      <div className="collab-content" style={{ flex: 1, display: 'flex', minHeight: 0, background: '#181a1b' }}>
        {/* File Explorer */}
        <div className="collab-file-explorer" style={{ width: 270, minWidth: 220, maxWidth: 340, borderRight: '1.5px solid #222', background: '#20232a', display: 'flex', flexDirection: 'column', height: '100%' }}>
          <FileExplorer
            onFileOpen={handleFileOpen}
            onCreateFile={handleCreateFile}
            onCreateDirectory={handleCreateDirectory}
            onDeleteItem={handleDeleteItem}
            onRenameItem={handleRenameItem}
            tree={fileTree}
            collabId={collabId}
            senderId={senderId}
            onRefresh={() => fetchTree(true)}
          />
        </div>
        {/* Divider */}
        <div style={{ width: 2, background: 'linear-gradient(to bottom, #333 60%, #222 100%)', minHeight: '100%' }} />

        {/* Editor + Tabs */}
        <div className="collab-editor-section" style={{ flex: 2.5, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#181a1b', height: '100%' }}>
          <FileTabs
            tabs={fileTabs}
            activeTab={activeTab}
            onTabSelect={handleTabSelect}
            onTabClose={handleTabClose}
          />
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#181a1b' }}>
            {activeTabPath && (
              <>
                {console.log('[CollabRoom][Render] activeTabPath:', activeTabPath, 'tabContents:', tabContents, 'fileLoadError:', fileLoadError)}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: '#23272e', padding: '8px 12px', borderBottom: '1px solid #333', zIndex: 2 }}>
                  <button
                    onClick={handleRun}
                    style={{ background: '#007acc', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 16px', fontWeight: 500, cursor: tabContents[activeTabPath] !== undefined ? 'pointer' : 'not-allowed' }}
                    title="Run Code (Ctrl+Enter)"
                    disabled={tabContents[activeTabPath] === undefined}
                  >
                    ▶ Run
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={tabContents[activeTabPath] === undefined}
                    style={{ background: tabContents[activeTabPath] !== undefined ? '#28a745' : '#444', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 16px', fontWeight: 500, cursor: tabContents[activeTabPath] !== undefined ? 'pointer' : 'not-allowed' }}
                    title="Save File (Ctrl+S)"
                  >
                    💾 Save
                  </button>
                </div>
                {fileLoadError ? (
                  <div style={{ color: 'red', textAlign: 'center', marginTop: 40 }}>{fileLoadError}</div>
                ) : tabContents[activeTabPath] === undefined ? (
                  <div style={{ color: '#888', textAlign: 'center', marginTop: 40 }}>Loading file...</div>
                ) : (
                  <CodeEditor
                    key={activeTabPath}
                    ref={codeEditorRef}
                    code={tabContents[activeTabPath]}
                    filePath={activeTabPath}
                    userId={user?.id}
                    username={user?.username}
                    collabId={collabId}
                    onCodeChange={newCode => handleCodeChange(newCode, activeTabPath)}
                    onFileOpen={(path) => handleFileOpen(path, 'file')}
                  />
                )}
              </>
            )}
            {!activeTabPath && (
              <div className="no-file-selected" style={{ color: '#888', fontSize: 18, textAlign: 'center', marginTop: 60 }}>
                Select a file from the explorer to start collaborating.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Shared Terminal at the bottom */}
      <div className="collab-terminal" style={{ width: '100%', minHeight: 220, maxHeight: 400, background: '#20232a', borderTop: '1.5px solid #222', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid #333', background: '#23272e', fontWeight: 600, color: '#9cdcfe', fontSize: 18 }}>Shared Terminal</div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <CollabBashTerminal
            ref={collabTerminalRef}
            collabId={collabId || ''}
            senderId={senderId || ''}
            token={token || ''}
          />
        </div>
      </div>
    </div>
  );
} 
