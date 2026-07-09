import { useState, useEffect, useRef } from 'react'
import MultiLanguageEditor from '../components/Editor/MultiLanguageEditor'
import XTerminal from '../components/Terminal/Terminal'
import { useBackendRunner } from '../utils/useBackendRunner'
import AIHelp from '../components/AIHelp'
import FileExplorer from '../components/FileExplorer'
import FileTabs from '../components/FileTabs'
import CodeEditor from '../components/Editor/CodeEditor';
import { useCollab } from '../context/CollabContext';
import RightPanelStack from '../components/RightPanelStack';
import { getApiUrl } from '../config/api';
import { useAuth } from '../context/AuthContext';
import { getSocket } from '../utils/socket';
import CollabRoom from '../components/CollabRoom';


interface Tab {
  path: string
  name: string
  content: string
  language: string
  isDirty: boolean
}

const getLanguageFromFileName = (fileName: string): string => {
  const extension = fileName.split('.').pop()?.toLowerCase()
  switch (extension) {
    case 'py':
      return 'python'
    case 'js':
      return 'javascript'
    case 'ts':
      return 'typescript'
    case 'html':
      return 'html'
    case 'css':
      return 'css'
    case 'json':
      return 'json'
    case 'md':
      return 'markdown'
    case 'sql':
      return 'sql'
    case 'java':
      return 'java'
    case 'cpp':
    case 'cc':
    case 'cxx':
      return 'cpp'
    case 'c':
      return 'c'
    case 'cs':
      return 'csharp'
    case 'php':
      return 'php'
    case 'rb':
      return 'ruby'
    case 'go':
      return 'go'
    case 'rs':
      return 'rust'
    case 'swift':
    case 'kt':
      return 'kotlin'
    case 'scala':
    case 'r':
    case 'm':
      return 'matlab'
    case 'sh':
      return 'bash'
    default:
      return 'plaintext'
  }
}

export default function Playground() {
  console.log('Playground rendered');
  const { user, token } = useAuth() || {};
  const socket = getSocket();

  // Set user as online on mount
  useEffect(() => {
    if (user?.username && user?.id) {
      socket.emit('user-online', { username: user.username, userId: user.id });
      console.log('[SOCKET] user-online emitted:', user.username, user.id);
    }
  }, [user, socket]);

  const {
    runCode,
    stopExecution,
    clearSession,
    getCurrentSession,
    getAllSessions,
    currentSessionId,
    setCurrentSessionId,
    isLoading,
    currentOutput,
    sendInput
  } = useBackendRunner()

  const [openTabs, setOpenTabs] = useState<Tab[]>([])
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null)
  const [fileTree, setFileTree] = useState<any>(null)
  // --- Real-time Collab State ---
  const [collabSession, setCollabSession] = useState<any>(null);
  const [collabFileContent, setCollabFileContent] = useState<string | null>(null);
  const [collabFilePath, setCollabFilePath] = useState<string | null>(null);
  const [isCollabOwner, setIsCollabOwner] = useState<boolean>(false);
  const [collabInvitation, setCollabInvitation] = useState<any>(null);

  const interactiveTerminalRef = useRef<{ writeToTerminal: (text: string) => void, sendRunCommand: (cmd: string) => void }>(null);

  useEffect(() => {
    // console.log('[Playground] Output routing effect triggered. currentOutput length:', currentOutput?.length); // DEBUG
    if (interactiveTerminalRef.current && currentOutput) {
      // console.log('[Playground] interactiveTerminalRef is available. Writing output to Powercell terminal.', currentOutput.length, 'chars.'); // DEBUG
      interactiveTerminalRef.current.writeToTerminal(currentOutput);
    } else if (currentOutput) {
      // console.log('[Playground] interactiveTerminalRef NOT available yet for writing output.', currentOutput.length, 'chars.', 'Ref value:', interactiveTerminalRef.current); // DEBUG
    }
  }, [currentOutput, interactiveTerminalRef]); // Added interactiveTerminalRef to deps for clarity, though it's a ref

  // Open file in tab
  const handleFileOpen = async (path: string, type: 'file' | 'directory' = 'file') => {
    if (!token || !user?.id) return;

    // Don't try to open directories as files
    if (type === 'directory') return;

    // Strip userId prefix if present
    let backendPath = path;
    if (user?.id && path.startsWith(user.id + '/')) {
      backendPath = path.slice(user.id.length + 1);
    }
    try {
      const response = await fetch(getApiUrl(`fs/file?path=${encodeURIComponent(backendPath)}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json()
        const fileName = path.split('/').pop() || 'untitled';
        const language = getLanguageFromFileName(fileName)
        const newTab: Tab = {
          path,
          name: fileName,
          content: data.content,
          language,
          isDirty: false
        }
        setOpenTabs(prev => [...prev, newTab])
        setActiveTabPath(path)
      } else {
        console.error('Failed to open file:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Failed to open file:', error)
    }
  }

  // Tab switching
  const handleTabSelect = (tab: { path: string; name: string }) => {
    setActiveTabPath(tab.path);
  };

  // Tab closing
  const handleTabClose = (path: string) => {
    setOpenTabs(tabs => tabs.filter(t => t.path !== path))
    if (activeTabPath === path) {
      // Switch to last tab or null
      const idx = openTabs.findIndex(t => t.path === path)
      const nextTab = openTabs[idx - 1] || openTabs[idx + 1] || null
      setActiveTabPath(nextTab ? nextTab.path : null)
    }
  }

  // Editor change
  const handleCodeChange = (newCode: string) => {
    setOpenTabs(tabs => tabs.map(tab =>
      tab.path === activeTabPath ? { ...tab, content: newCode, isDirty: true } : tab
    ))
  }

  // Save file
  const handleSave = async () => {
    if (!token || !user?.id) return;
    const tab = openTabs.find(t => t.path === activeTabPath)
    if (!tab) return
    // Strip userId prefix if present
    let backendPath = tab.path;
    if (user?.id && tab.path.startsWith(user.id + '/')) {
      backendPath = tab.path.slice(user.id.length + 1);
    }
    try {
      console.log('Saving file:', tab.path, '-> backend path:', backendPath);
      const res = await fetch(getApiUrl('fs/file'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ path: backendPath, content: tab.content })
      })
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to save file');
      }
      setOpenTabs(tabs => tabs.map(t => t.path === tab.path ? { ...t, isDirty: false } : t))
      alert('File saved!')
    } catch (e) {
      console.error('Save error:', e);
      alert('Failed to save file: ' + (e as Error).message)
    }
  }

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

  // Remove handleRunCode and any calls to runCode for the Run button
  // Only use handleRunInTerminal for running code

  // File operation handlers
  const handleCreateFile = (path: string) => {
    refreshFileTree();
  }

  const handleCreateDirectory = (path: string) => {
    refreshFileTree();
  }

  const handleDeleteItem = (path: string) => {
    // Close tab if it's open
    setOpenTabs(prev => prev.filter(tab => tab.path !== path))
    if (activeTabPath === path) {
      setActiveTabPath(null)
    }
    // Refresh file tree after deleting
    refreshFileTree();
  }

  const handleRenameItem = (oldPath: string, newPath: string) => {
    // Update tab if it's open
    setOpenTabs(prev => prev.map(tab =>
      tab.path === oldPath
        ? { ...tab, path: newPath, name: newPath.split('/').pop() || 'Untitled' }
        : tab
    ))
    if (activeTabPath === oldPath) {
      setActiveTabPath(newPath)
    }
    // Refresh file tree after renaming
    refreshFileTree();
  }

  // FileTabs expects {path, name}
  const fileTabs = openTabs.map(tab => ({ path: tab.path, name: tab.name }))
  const activeTab = openTabs.find(tab => tab.path === activeTabPath) || null

  // Helper function to get all Python files from the tree
  const getAllPythonFiles = (node: any, parentPath = ''): string[] => {
    const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;
    let files: string[] = [];

    if (node.type === 'file' && node.name.endsWith('.py')) {
      files.push(currentPath);
    } else if (node.type === 'directory' && node.children) {
      node.children.forEach((child: any) => {
        files = files.concat(getAllPythonFiles(child, currentPath));
      });
    }

    return files;
  };

  const availablePythonFiles = fileTree ? getAllPythonFiles(fileTree) : [];

  // Fetch file tree
  useEffect(() => {
    const fetchFileTree = async () => {
      if (!token || !user?.id) return;
      console.log('[DEBUG][Playground] Fetching file tree with token:', token);
      try {
        const response = await fetch(getApiUrl(`fs/list?path=`), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const tree = await response.json();
          setFileTree(tree);
        } else {
          console.error('Failed to fetch file tree:', response.status, response.statusText);
        }
      } catch (error) {
        console.error('Failed to fetch file tree:', error);
      }
    };

    fetchFileTree();
  }, [token, user?.id]);

  // Update file tree when files are created, renamed, or deleted
  const refreshFileTree = async () => {
    if (!token || !user?.id) return;
    console.log('[DEBUG][Playground] Refreshing file tree with token:', token);
    try {
      const response = await fetch(getApiUrl(`fs/list?path=`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const tree = await response.json();
        setFileTree(tree);
      } else {
        console.error('Failed to refresh file tree:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Failed to refresh file tree:', error);
    }
  };

  // In Playground, when rendering the editor, pass filePath, userId, and username props
  // For demo, use mock userId/username
  const userId = 'user1';
  const username = 'User One';
  const { onlineUsers, chatMessages, sendMessage } = useCollab();
  const [chatOpen, setChatOpen] = useState(false);
  const [aiHelpOpen, setAiHelpOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');

  useEffect(() => {
    const onCollabSessionStart = (data: { fileOrDir: any, collabId?: string, users?: string[] }) => {
      console.log('[COLLAB] collab-session-start received in Playground:', data);
      if (data && data.fileOrDir) {
        // If this user is the recipient (not the sender), show invitation
        if (user?.id !== data.fileOrDir.from) {
          setCollabInvitation({ ...data.fileOrDir, collabId: data.collabId, users: data.users });
        } else {
          // If this user is the sender, start the session immediately
          const collabId = data.collabId || '';
          const usersList = data.users && data.users.length ? data.users : [data.fileOrDir.from, data.fileOrDir.to];

          setCollabSession({
            fileOrDir: data.fileOrDir,
            room: collabId,
            isSender: true,
            users: usersList,
          });
          console.log('[COLLAB] setCollabSession called, fileType:', data.fileOrDir.fileType, 'filePath:', data.fileOrDir.filePath);
          // Only open the file in the editor if it's a file
          if (data.fileOrDir.fileType === 'file') {
            setCollabFilePath(data.fileOrDir.filePath);
          } else {
            setCollabFilePath(null); // For directories, no single file to open
          }
        }
      }
    };
    socket.on('collab-session-start', onCollabSessionStart);
    return () => {
      socket.off('collab-session-start', onCollabSessionStart);
    };
  }, [socket, user]);

  // --- Real-time Collab Socket Logic ---
  useEffect(() => {
    if (!collabSession) return;
    const room = collabSession.room;
    socket.emit('join-file', { filePath: room, userId: user?.id, username: user?.username });
    setIsCollabOwner(collabSession.isSender);
    setCollabFilePath(collabSession.fileOrDir.filePath);
    if (collabSession.isSender) {
      // Owner: fetch file and emit to room
      (async () => {
        let backendPath = collabSession.fileOrDir.filePath;
        if (user?.id && backendPath.startsWith(user.id + '/')) {
          backendPath = backendPath.slice(user.id.length + 1);
        }
        const response = await fetch(getApiUrl(`fs/file?path=${encodeURIComponent(backendPath)}`), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();
          setCollabFileContent(data.content);
          socket.emit('collab-file-init', { room, filePath: collabSession.fileOrDir.filePath, content: data.content });
        }
      })();
    }
    // Listen for file init and edits
    const onFileInit = (data: { filePath: string, content: string }) => {
      setCollabFileContent(data.content);
    };
    const onFileEdit = (data: { filePath: string, content: string }) => {
      setCollabFileContent(data.content);
    };
    socket.on('collab-file-init', onFileInit);
    socket.on('collab-file-edit', onFileEdit);
    return () => {
      socket.off('collab-file-init', onFileInit);
      socket.off('collab-file-edit', onFileEdit);
      socket.emit('leave-file', { filePath: room, userId: user?.id, username: user?.username });
    };
  }, [collabSession, socket, token, user]);

  // --- Collab Editor Change Handler ---
  const handleCollabCodeChange = (newCode: string) => {
    setCollabFileContent(newCode);
    if (collabSession) {
      socket.emit('collab-file-edit', { room: collabSession.room, filePath: collabFilePath, content: newCode });
    }
  };

  // --- Collab Save Handler (only owner can save) ---
  const handleCollabSave = async () => {
    if (!isCollabOwner || !collabFilePath || !token || !user?.id) return;
    let backendPath = collabFilePath;
    if (user?.id && backendPath.startsWith(user.id + '/')) {
      backendPath = backendPath.slice(user.id.length + 1);
    }
    try {
      const res = await fetch(getApiUrl('fs/file'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ path: backendPath, content: collabFileContent })
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to save file');
      }
      alert('File saved!');
    } catch (e) {
      alert('Failed to save file: ' + (e as Error).message);
    }
  };

  // --- CollabRoom Modal State ---
  const [collabRoomOpen, setCollabRoomOpen] = useState(false);

  // --- CollabRoom Integration ---
  useEffect(() => {
    if (collabSession) {
      setCollabRoomOpen(true);
    } else {
      setCollabRoomOpen(false);
    }
  }, [collabSession]);

  const handleEndCollab = () => {
    setCollabRoomOpen(false);
    setCollabSession(null);
    setCollabFileContent(null);
    setCollabFilePath(null);
    // Optionally emit leave event
  };

  // Handle collaboration invitation
  const handleAcceptCollab = () => {
    if (!collabInvitation) return;

    // Create consistent collabId for recipient
    const senderId = collabInvitation.from;
    const recipientId = collabInvitation.to;
    // Use the collabId from the invitation for consistency
    const collabId = collabInvitation.collabId;

    setCollabSession({
      fileOrDir: collabInvitation,
      room: collabId,
      isSender: false,
      users: [collabInvitation.from, collabInvitation.to],
    });

    if (collabInvitation.fileType === 'file') {
      setCollabFilePath(collabInvitation.filePath);
    } else {
      setCollabFilePath(null);
    }

    setCollabInvitation(null);
  };

  const handleDeclineCollab = () => {
    setCollabInvitation(null);
  };

  // Helper to get the run command for a file
  const getRunCommand = (fileName: string) => {
    if (fileName.endsWith('.py')) return `python3 ${fileName}`;
    if (fileName.endsWith('.js')) return `node ${fileName}`;
    if (fileName.endsWith('.ts')) return `npx ts-node ${fileName}`;
    if (fileName.endsWith('.java')) return `javac ${fileName} && java ${fileName.replace(/\.java$/, '')}`;
    if (fileName.endsWith('.cpp')) return `g++ ${fileName} -o main && ./main`;
    if (fileName.endsWith('.c')) return `gcc ${fileName} -o main && ./main`;
    if (fileName.endsWith('.cs')) return `mcs ${fileName} && mono ${fileName.replace(/\.cs$/, '')}.exe`;
    if (fileName.endsWith('.go')) return `go run ${fileName}`;
    if (fileName.endsWith('.rb')) return `ruby ${fileName}`;
    if (fileName.endsWith('.php')) return `php ${fileName}`;
    if (fileName.endsWith('.rs')) return `rustc ${fileName} && ./${fileName.replace(/\.rs$/, '')}`;
    if (fileName.endsWith('.sh')) return `bash ${fileName}`;
    if (fileName.endsWith('.swift')) return `swift ${fileName}`;
    if (fileName.endsWith('.kt')) return `kotlinc ${fileName} -include-runtime -d main.jar && java -jar main.jar`;
    if (fileName.endsWith('.scala')) return `scalac ${fileName} && scala ${fileName.replace(/\.scala$/, '')}`;
    // HTML FILES - NEW ADDITION
    if (fileName.endsWith('.html') || fileName.endsWith('.htm')) {
      return `html-server ${fileName}`;
    }
    return '';
  };

  // Reference to the interactive terminal WebSocket
  const terminalRef = useRef<any>(null);

  const handleRunInTerminal = () => {
    const tab = openTabs.find(t => t.path === activeTabPath);
    if (!tab) return;
    const command = getRunCommand(tab.name);
    if (command && terminalRef.current && typeof terminalRef.current.sendRunCommand === 'function') {
      // Strip userId prefix if present
      const userId = user?.id || '';
      let filePath = tab.path;
      if (userId && filePath.startsWith(userId + '/')) {
        filePath = filePath.slice(userId.length + 1);
      }
      const fileDir = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '.';
      const fullCommand = `cd "${fileDir}" && ${command} && cd -`;
      terminalRef.current.sendRunCommand(fullCommand);
    }
  };

  // In your JSX, replace the existing right panel with:
  const allOpenFiles = Object.fromEntries(openTabs.map(tab => [tab.path, tab.content]));
  return (
    <>
      {collabRoomOpen && collabSession ? (
        (() => {
          const users: string[] = collabSession.users;
          const filePath: string = collabFilePath || '';
          const fileContent: string = collabFileContent || '';
          // --- FIX: Use the collabId from the session directly ---
          const senderId = collabSession.fileOrDir.from;
          const recipientId = collabSession.fileOrDir.to;
          // Use the collabId from the session (generated by MultiUserCollabInvite)
          const collabId = collabSession.room; // This is the collabId from the invite
          const room = collabId;

          // For multi-user collaboration, use the original sender as the owner
          const ownerId = collabSession.fileOrDir.from;
          // Fix: compute collabRoot as the relative path inside the collabroom folder
          let collabRoot = collabSession.fileOrDir.filePath || '';
          // Remove userId prefix if present
          if (collabRoot.startsWith(ownerId + '/')) collabRoot = collabRoot.slice(ownerId.length + 1);
          // Remove any collabroom_.../ prefix if present
          collabRoot = collabRoot.replace(/^collabroom_[^/]+\//, '');
          // Pass senderId to CollabRoom
          return (
            <CollabRoom
              room={room}
              users={users.map(uid => ({ userId: uid, username: uid }))}
              currentUser={{ userId: user?.id || '', username: user?.username || '' }}
              onEnd={handleEndCollab}
              socket={socket}
              initialFilePath={filePath}
              initialFileContent={fileContent}
              collabRoot={collabRoot}
              collabFileType={collabSession.fileOrDir.fileType}
              collabFileName={collabSession.fileOrDir.fileName}
              senderId={ownerId}
            />
          );
        })()
      ) : null}
      {/* Stacked right panels (AIHelp, Chat, Friends) */}
      <div style={{ display: 'flex', height: '100vh', position: 'relative', overflow: 'hidden' }}>
        <div style={{ width: '250px', borderRight: '1px solid #333', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <FileExplorer
            onFileOpen={handleFileOpen}
            onCreateFile={handleCreateFile}
            onCreateDirectory={handleCreateDirectory}
            onDeleteItem={handleDeleteItem}
            onRenameItem={handleRenameItem}
            collabId={collabSession ? collabSession.room : ''}
          />
        </div>

        <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          <FileTabs
            tabs={fileTabs}
            activeTab={fileTabs.find(tab => tab.path === activeTabPath) || null}
            onTabSelect={handleTabSelect}
            onTabClose={handleTabClose}
            isCollaborating={!!collabSession}
          />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, height: 'calc(100vh - 350px - 40px)' }}>
            {/* --- Collab Editor UI --- */}
            {collabSession && collabFileContent !== null ? (
              <MultiLanguageEditor
                language={getLanguageFromFileName(collabFilePath?.split('/').pop() || '')}
                code={collabFileContent}
                onCodeChange={handleCollabCodeChange}
                onFileOpen={handleFileOpen}
                availableFiles={availablePythonFiles}
                onSave={handleCollabSave}
                onRunCode={handleRunInTerminal}
                onStopExecution={stopExecution}
                isDirty={false}
              />
            ) : (
              // ... existing code for normal editor ...
              activeTabPath && (
                <MultiLanguageEditor
                  language={openTabs.find(tab => tab.path === activeTabPath)?.language || 'plaintext'}
                  code={openTabs.find(tab => tab.path === activeTabPath)?.content || ''}
                  onCodeChange={handleCodeChange}
                  onFileOpen={handleFileOpen}
                  availableFiles={availablePythonFiles}
                  onSave={handleSave}
                  onRunCode={handleRunInTerminal}
                  onStopExecution={stopExecution}
                  isDirty={openTabs.find(tab => tab.path === activeTabPath)?.isDirty || false}
                />
              )
            )}
            {!activeTabPath && (
              <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#888' }}>
                Select a file from the explorer to start coding.
              </div>
            )}
          </div>
          {/* Chat toggle arrow */}
          <div
            style={{
              position: 'absolute',
              top: '30%',
              right: chatOpen ? 320 : 0,
              zIndex: 100,
              background: '#23272e',
              borderRadius: '8px 0 0 8px',
              cursor: 'pointer',
              width: 32,
              height: 64,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              transition: 'right 0.3s',
            }}
            onClick={() => setChatOpen((v) => !v)}
          >
            <span style={{ color: '#9cdcfe', fontSize: 24 }}>{chatOpen ? '→' : '←'}</span>
          </div>
          {/* Chat panel */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              right: chatOpen ? 0 : -320,
              width: 320,
              height: '100%',
              background: '#23272e',
              color: '#fff',
              boxShadow: '-2px 0 8px rgba(0,0,0,0.2)',
              transition: 'right 0.3s',
              display: 'flex',
              flexDirection: 'column',
              zIndex: 200,
            }}
          >
            <div style={{ padding: 16, borderBottom: '1px solid #333', fontWeight: 'bold', fontSize: 18 }}>Collaboration</div>
            <div style={{ padding: 8, borderBottom: '1px solid #333', fontSize: 14 }}>
              <div style={{ marginBottom: 4 }}>Online Users:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {onlineUsers.map((u) => (
                  <span key={u.userId} style={{ background: '#264f78', borderRadius: 4, padding: '2px 8px', fontSize: 13 }}>{u.username}</span>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
              {chatMessages.map((msg, i) => (
                <div key={i} style={{ marginBottom: 8 }}>
                  <span style={{ color: '#9cdcfe', fontWeight: 'bold' }}>{msg.username}:</span>
                  <span style={{ marginLeft: 6 }}>{msg.message}</span>
                  <span style={{ float: 'right', color: '#888', fontSize: 11 }}>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
            <form
              onSubmit={e => {
                e.preventDefault();
                if (chatInput.trim()) {
                  sendMessage(chatInput);
                  setChatInput('');
                }
              }}
              style={{ display: 'flex', borderTop: '1px solid #333', padding: 8 }}
            >
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Type a message..."
                style={{ flex: 1, background: '#1e1e1e', color: '#fff', border: 'none', borderRadius: 4, padding: 8, fontSize: 14 }}
              />
              <button type="submit" style={{ marginLeft: 8, background: '#3794ff', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', fontWeight: 'bold' }}>Send</button>
            </form>
          </div>
          {/* AIHelp toggle arrow */}
          <div
            style={{
              position: 'absolute',
              top: '60%',
              right: aiHelpOpen ? 320 : 0,
              zIndex: 100,
              background: '#23272e',
              borderRadius: '8px 0 0 8px',
              cursor: 'pointer',
              width: 32,
              height: 64,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              transition: 'right 0.3s',
            }}
            onClick={() => setAiHelpOpen((v) => !v)}
          >
            <span style={{ color: '#00ff99', fontSize: 24 }}>{aiHelpOpen ? '→' : '←'}</span>
          </div>
          {/* AIHelp panel */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              right: aiHelpOpen ? 0 : -320,
              width: 320,
              height: '100%',
              background: '#181a1b',
              color: '#fff',
              boxShadow: '-2px 0 8px rgba(0,0,0,0.2)',
              transition: 'right 0.3s',
              display: 'flex',
              flexDirection: 'column',
              zIndex: 201,
            }}
          >
            <AIHelp code={activeTab?.content || ''} onCodeUpdate={handleCodeChange} />
          </div>

          {/* Right Panel Stack with Advanced AI Tools */}
          <RightPanelStack
            currentFilePath={activeTabPath || undefined}
            allOpenFiles={allOpenFiles}
            onRefreshFileTree={refreshFileTree}
            onFileUpdate={(filePath, content) => {
              setOpenTabs(tabs => tabs.map(tab => tab.path === filePath ? { ...tab, content, isDirty: false } : tab));
            }}
            onFileOpen={handleFileOpen}
            onCollabSessionStart={(data) => {
              console.log('[COLLAB] onCollabSessionStart called from RightPanelStack:', data);
              if (data && data.fileOrDir) {
                const collabId = data.collabId || '';
                const usersList = data.users && data.users.length ? data.users : [data.fileOrDir.from, data.fileOrDir.to];

                setCollabSession({
                  fileOrDir: data.fileOrDir,
                  room: collabId,
                  isSender: data.fileOrDir.from === user?.id,
                  users: usersList,
                });
                console.log('[COLLAB] setCollabSession called from RightPanelStack, fileType:', data.fileOrDir.fileType, 'filePath:', data.fileOrDir.filePath);
                // Only open the file in the editor if it's a file
                if (data.fileOrDir.fileType === 'file') {
                  setCollabFilePath(data.fileOrDir.filePath);
                } else {
                  setCollabFilePath(null); // For directories, no single file to open
                }
              }
            }}
            terminalRef={terminalRef}
          />

          {/* Interactive Terminal at the bottom */}
          <div style={{
            height: '350px',
            minHeight: '350px',
            borderTop: '1px solid #333',
            display: 'flex',
            flexShrink: 0,
            background: '#181818',
            boxSizing: 'border-box',
            position: 'relative'
          }}>
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              padding: '4px',
              minHeight: 0,
              boxSizing: 'border-box'
            }}>
              <h3 style={{
                color: '#eee',
                fontSize: '1.1em',
                margin: '0 0 4px 0',
                flexShrink: 0,
                height: '20px'
              }}>
                Interactive Terminal
              </h3>
              <div style={{
                flex: 1,
                minHeight: 0,
                height: 'calc(100% - 24px)'
              }}>
                <XTerminal
                  isCodeExecutionTerminal={false}
                  ref={terminalRef}
                  visible={true}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Collaboration Invitation Notification */}
      {collabInvitation && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          background: '#252526',
          border: '1px solid #3c3c3c',
          borderRadius: '6px',
          padding: '16px',
          minWidth: '300px',
          zIndex: 1000,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
        }}>
          <div style={{
            color: '#ffffff',
            fontSize: '14px',
            fontWeight: 500,
            marginBottom: '8px'
          }}>
            Collaboration Invitation
          </div>
          <div style={{
            color: '#cccccc',
            fontSize: '12px',
            marginBottom: '12px'
          }}>
            Someone wants to collaborate on: <strong>{collabInvitation.fileName}</strong>
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button
              onClick={handleDeclineCollab}
              style={{
                padding: '6px 12px',
                background: '#3c3c3c',
                border: '1px solid #464647',
                borderRadius: '4px',
                color: '#cccccc',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              Decline
            </button>
            <button
              onClick={handleAcceptCollab}
              style={{
                padding: '6px 12px',
                background: '#0e639c',
                border: 'none',
                borderRadius: '4px',
                color: '#ffffff',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              Accept
            </button>
          </div>
        </div>
      )}
    </>
  )
}
