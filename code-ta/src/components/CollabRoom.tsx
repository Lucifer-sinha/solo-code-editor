import { useState, useEffect, useRef } from 'react';
import CodeEditor from './Editor/CodeEditor';
import FileExplorer from './FileExplorer';
import FileTabs from './FileTabs';
import { useAuth } from '../context/AuthContext';
import { getSocket } from '../utils/socket';
import { getApiUrl } from '../config/api';
import { useBackendRunner } from '../utils/useBackendRunner';
import CollabBashTerminal from './CollabBashTerminal';
import MultiUserCollabInvite from './MultiUserCollabInvite';
import { UserPlus, Users, Settings } from 'lucide-react';
import '../styles/collab.css';

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

  // Permission management state
  const [showPermissions, setShowPermissions] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);

  // Participant management state
  const [friends, setFriends] = useState<any[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [participants, setParticipants] = useState(() =>
    users.map(u => ({
      userId: u.userId,
      username: u.username,
      role: u.userId === senderId ? 'owner' as const : 'editor' as const,
      canEdit: true,
      canDelete: u.userId === senderId,
      canInvite: u.userId === senderId
    }))
  );
  const isOwner = currentUser.userId === senderId;

  // Enhanced collaboration room management
  useEffect(() => {
    if (socket && room) {
      // Enhanced room join with better metadata
      const roomData = {
        room: `collabroom_${room}`,
        userId: user?.id,
        username: user?.username,
        senderId,
        // Enhanced metadata for better room management
        roomMetadata: {
          collabId: room,
          ownerId: senderId,
          participantId: user?.id,
          joinTimestamp: Date.now(),
          isOwner: user?.id === senderId
        }
      };

      socket.emit('join-collab-room', roomData);
      console.log('[CollabRoom] Joined collaboration room:', `collabroom_${room}`, 'as', user?.id === senderId ? 'owner' : 'participant');
    }

    return () => {
      if (socket && room) {
        socket.emit('leave-collab-room', {
          room: `collabroom_${room}`,
          userId: user?.id,
          collabId: room
        });
      }
    };
  }, [socket, room, user?.id, user?.username, senderId]);

  // Debounced real-time file tree sync
  const [fetchTreeTimeout, setFetchTreeTimeout] = useState<NodeJS.Timeout | null>(null);

  const fetchTree = async (emitUpdate = false, immediate = false) => {
    if (!token || !user?.id) return;

    // Clear existing timeout if not immediate
    if (!immediate && fetchTreeTimeout) {
      clearTimeout(fetchTreeTimeout);
    }

    const doFetch = async () => {
      setIsTreeLoading(true);
      try {
        const url = getApiUrl(`fs/list?path=&collab_id=${room}&senderId=${senderId}`);
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

    if (immediate) {
      await doFetch();
    } else {
      // Debounce by 500ms for collaboration operations
      const timeout = setTimeout(doFetch, 500);
      setFetchTreeTimeout(timeout);
    }
  };

  // Enhanced real-time synchronization listeners
  useEffect(() => {
    if (!socket) return;

    const handleTreeUpdate = (data: { tree: any; updatedBy: string; operation?: string; path?: string }) => {
      console.log('[CollabRoom] Real-time tree update received:', data);
      // Only fetch if the update wasn't initiated by current user to avoid loops
      if (data.updatedBy !== user?.id) {
        fetchTree(false);
      }
    };

    const handleFileOperation = (data: { operation: string; path: string; success: boolean; userId: string }) => {
      console.log('[CollabRoom] File operation completed:', data);
      if (data.success && data.userId !== user?.id) {
        fetchTree(false); // Refresh tree without emitting to avoid loops
      }
    };

    const handleUserJoined = (data: { userId: string; username: string; timestamp: number }) => {
      console.log('[CollabRoom] User joined:', data);
      // Update participants list
      setParticipants(prev => {
        const exists = prev.find(p => p.userId === data.userId);
        if (!exists) {
          return [...prev, {
            userId: data.userId,
            username: data.username,
            role: data.userId === senderId ? 'owner' as const : 'editor' as const,
            canEdit: true,
            canDelete: data.userId === senderId,
            canInvite: data.userId === senderId
          }];
        }
        return prev;
      });
    };

    const handleUserLeft = (data: { userId: string; timestamp: number }) => {
      console.log('[CollabRoom] User left:', data);
      setParticipants(prev => prev.filter(p => p.userId !== data.userId));
    };

    const handleCollabSessionEnded = (data: { endedBy: string; timestamp: number }) => {
      console.log('[CollabRoom] Collaboration session ended:', data);
      // Show notification and close collaboration
      alert('Collaboration session has been ended by another participant.');
      onEnd();
    };

    // Participant management event handlers
    const handleParticipantAdded = (data: any) => {
      console.log('[DEBUG] handleParticipantAdded received:', data);
      if (data.newParticipantId && data.newParticipantUsername) {
        console.log('[DEBUG] Adding participant to state');
        setParticipants(prev => {
          // Check if participant already exists
          if (prev.some(p => p.userId === data.newParticipantId)) {
            console.log('[DEBUG] Participant already exists');
            return prev;
          }
          console.log('[DEBUG] Adding new participant to list');
          return [...prev, {
            userId: data.newParticipantId,
            username: data.newParticipantUsername,
            role: 'editor' as const,
            canEdit: true,
            canDelete: false
          }];
        });

        // Show notification if it's not the current user adding themselves
        if (data.addedBy !== user?.id) {
          console.log(`${data.newParticipantUsername} joined the collaboration`);
        }
      }
    };

    const handleParticipantRemoved = (data: any) => {
      console.log('[DEBUG] handleParticipantRemoved received:', data);
      if (data.participantId) {
        console.log('[DEBUG] Removing participant from state:', data.participantId);
        setParticipants(prev => {
          const newParticipants = prev.filter(p => p.userId !== data.participantId);
          console.log('[DEBUG] Participants before:', prev.length, 'after:', newParticipants.length);
          return newParticipants;
        });

        // If current user was removed, end the session
        if (data.participantId === user?.id) {
          console.log('[CollabRoom] Current user was removed from collaboration');
          alert('You have been removed from this collaboration session.');
          onEnd();
        } else {
          console.log(`[DEBUG] Participant ${data.participantUsername} was removed by ${data.removedBy}`);
        }
      }
    };

    socket.on('collab-tree-update', handleTreeUpdate);
    socket.on('collab-file-operation', handleFileOperation);
    socket.on('user-joined-collab', handleUserJoined);
    socket.on('user-left-collab', handleUserLeft);
    socket.on('collab-session-ended', handleCollabSessionEnded);
    socket.on('collab-participant-added', handleParticipantAdded);
    socket.on('collab-participant-removed', handleParticipantRemoved);

    // Test socket connection
    console.log('[DEBUG] Socket listeners attached, socket connected:', socket.connected);
    socket.on('connect', () => {
      console.log('[DEBUG] Socket connected successfully');
    });
    socket.on('disconnect', () => {
      console.log('[DEBUG] Socket disconnected');
    });


    return () => {
      socket.off('collab-tree-update', handleTreeUpdate);
      socket.off('collab-file-operation', handleFileOperation);
      socket.off('user-joined-collab', handleUserJoined);
      socket.off('user-left-collab', handleUserLeft);
      socket.off('collab-session-ended', handleCollabSessionEnded);
      socket.off('collab-participant-added', handleParticipantAdded);
      socket.off('collab-participant-removed', handleParticipantRemoved);
    };
  }, [socket, user?.id, room, senderId, onEnd]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (fetchTreeTimeout) {
        clearTimeout(fetchTreeTimeout);
      }
    };
  }, [fetchTreeTimeout]);

  // Initial tree fetch
  useEffect(() => {
    fetchTree(false, true); // Immediate fetch for initial load
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
      const res = await fetch(getApiUrl(`fs/file?path=${encodeURIComponent(path)}&collab_id=${collabId}&senderId=${senderId}`), {
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
      const res = await fetch(getApiUrl('fs/file'), {
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
      const res = await fetch(getApiUrl('fs/file'), {
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

      // Enhanced real-time update with operation details
      socket.emit('collab-file-created', {
        room: `collabroom_${room}`,
        path,
        createdBy: user?.id,
        operation: 'create-file',
        timestamp: Date.now(),
        metadata: {
          fileName: path.split('/').pop(),
          fileType: 'file',
          collabId: room
        }
      });

      // Emit tree update to all participants
      socket.emit('collab-tree-update', {
        room: `collabroom_${room}`,
        operation: 'create-file',
        path,
        updatedBy: user?.id,
        timestamp: Date.now()
      });

      await fetchTree(false); // Don't emit again to avoid loops
    } catch (e) {
      console.error('[CollabRoom] Create file error:', e);
    }
  };

  const handleCreateDirectory = async (path: string) => {
    if (!token) return;

    console.log('[CollabRoom] Creating directory:', { path, collabId, senderId });

    try {
      const res = await fetch(getApiUrl('fs/dir'), {
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

      // Enhanced real-time update with operation details
      socket.emit('collab-directory-created', {
        room: `collabroom_${room}`,
        path,
        createdBy: user?.id,
        operation: 'create-directory',
        timestamp: Date.now(),
        metadata: {
          dirName: path.split('/').pop(),
          fileType: 'directory',
          collabId: room
        }
      });

      // Emit tree update to all participants
      socket.emit('collab-tree-update', {
        room: `collabroom_${room}`,
        operation: 'create-directory',
        path,
        updatedBy: user?.id,
        timestamp: Date.now()
      });

      await fetchTree(false); // Don't emit again to avoid loops
    } catch (e) {
      console.error('[CollabRoom] Create directory error:', e);
    }
  };

  const handleDeleteItem = async (path: string) => {
    if (!token) return;

    console.log('[CollabRoom] Deleting item:', { path, collabId, senderId });

    try {
      const res = await fetch(getApiUrl('fs'), {
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
      const res = await fetch(getApiUrl('fs/rename'), {
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
        const res = await fetch(getApiUrl(`fs/file?path=${encodeURIComponent(tab.path)}&collab_id=${collabId}&senderId=${senderId}`), {
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
      const res = await fetch(getApiUrl('collab/end'), {
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

  // Fetch friends list for participant management
  const fetchFriends = async () => {
    console.log('[DEBUG] fetchFriends called:', { token: !!token, userId: user?.id });
    if (!token || !user?.id) return;
    setLoadingFriends(true);
    try {
      const url = getApiUrl('friends/list');
      console.log('[DEBUG] Fetching friends from:', url);
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('[DEBUG] Friends response status:', res.status);
      if (res.ok) {
        const data = await res.json();
        console.log('[DEBUG] Friends data received:', data);
        setFriends(data.friends || []);
      } else {
        console.error('[DEBUG] Friends fetch failed:', res.status, res.statusText);
      }
    } catch (e) {
      console.error('Failed to fetch friends:', e);
    } finally {
      setLoadingFriends(false);
    }
  };

  // Add participant to collaboration
  const handleAddParticipant = async (friendId: string, friendUsername: string) => {
    console.log('[DEBUG] handleAddParticipant called:', {
      friendId,
      friendUsername,
      socket: !!socket,
      socketConnected: socket?.connected,
      collabId,
      userId: user?.id
    });

    if (!socket) {
      console.error('[DEBUG] No socket available');
      alert('Socket connection not available');
      return;
    }

    if (!socket.connected) {
      console.error('[DEBUG] Socket not connected');
      alert('Socket not connected to server');
      return;
    }

    if (!collabId) {
      console.error('[DEBUG] No collabId available');
      alert('No collaboration ID available');
      return;
    }

    if (!user?.id) {
      console.error('[DEBUG] No user ID available');
      alert('User not authenticated');
      return;
    }

    try {
      console.log('[DEBUG] Emitting collab-add-participant event');
      const eventData = {
        collabId,
        room: `collabroom_${collabId}`,
        newParticipantId: friendId,
        newParticipantUsername: friendUsername,
        addedBy: user?.id,
        timestamp: Date.now()
      };
      console.log('[DEBUG] Event data:', eventData);

      // Emit add participant event
      socket.emit('collab-add-participant', eventData);

      console.log(`[CollabRoom] Added participant: ${friendUsername}`);
    } catch (e) {
      console.error('Failed to add participant:', e);
      alert(`Error adding participant: ${e}`);
    }
  };

  // Remove participant from collaboration
  const handleRemoveParticipant = async (participantId: string, participantUsername: string) => {
    console.log('[DEBUG] handleRemoveParticipant called:', { participantId, participantUsername, socket: !!socket, collabId, senderId });

    if (!socket) {
      console.error('[DEBUG] No socket available');
      return;
    }

    if (!collabId) {
      console.error('[DEBUG] No collabId available');
      return;
    }

    if (participantId === senderId) {
      console.error('[DEBUG] Cannot remove owner');
      return;
    }

    try {
      console.log('[DEBUG] Emitting collab-remove-participant event');
      // Emit remove participant event
      socket.emit('collab-remove-participant', {
        collabId,
        room: `collabroom_${collabId}`,
        participantId,
        participantUsername,
        removedBy: user?.id,
        timestamp: Date.now()
      });

      console.log(`[CollabRoom] Removed participant: ${participantUsername}`);
    } catch (e) {
      console.error('Failed to remove participant:', e);
    }
  };

  // Fetch friends when permissions modal opens
  useEffect(() => {
    console.log('[DEBUG] Modal state changed:', {
      showPermissions,
      isOwner,
      friendsCount: friends.length,
      participantsCount: participants.length,
      token: !!token,
      userId: user?.id
    });
    if (showPermissions && isOwner) {
      console.log('[DEBUG] Fetching friends because modal opened');
      fetchFriends();
    }
  }, [showPermissions, isOwner, token, user?.id]);

  // Debug participants and friends state
  useEffect(() => {
    console.log('[DEBUG] Participants updated:', participants);
  }, [participants]);

  useEffect(() => {
    console.log('[DEBUG] Friends updated:', friends);
  }, [friends]);

  return (
    <div className="collab-room" style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#1e1e1e', fontFamily: 'Inter, system-ui, sans-serif', overflow: 'hidden' }}>
      {/* Header */}
      <div className="collab-header" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 24px',
        background: '#252526',
        borderBottom: '1px solid #3c3c3c',
        height: '48px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: '#00d4aa'
          }} />
          <h2 style={{
            color: '#ffffff',
            fontWeight: 500,
            fontSize: 14,
            margin: 0,
            letterSpacing: '0.5px'
          }}>
            Collaboration Session (βeta)
          </h2>
          <div style={{
            background: '#2d2d30',
            color: '#cccccc',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            <Users size={12} />
            {users.length} participant{users.length !== 1 ? 's' : ''}
          </div>

          {/* Participants List */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {users.slice(0, 3).map((participant, index) => (
              <div
                key={participant.userId}
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: participant.userId === senderId ? '#4CAF50' : '#2196F3',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '10px',
                  fontWeight: 600,
                  color: 'white',
                  marginLeft: index > 0 ? '-8px' : '0',
                  border: '2px solid #252526',
                  zIndex: users.length - index
                }}
                title={participant.username}
              >
                {participant.username[0].toUpperCase()}
              </div>
            ))}
            {users.length > 3 && (
              <div style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: '#666',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '10px',
                fontWeight: 600,
                color: 'white',
                marginLeft: '-8px',
                border: '2px solid #252526'
              }}>
                +{users.length - 3}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Invite More People Button */}

          
            



          {/* Settings Button */}
          {isOwner && (
            <button
              onClick={() => {
                console.log('[DEBUG] Settings button clicked, opening permissions modal');
                console.log('[DEBUG] Current state:', {
                  showPermissions,
                  isOwner,
                  socket: !!socket,
                  socketConnected: socket?.connected,
                  user: user?.id
                });
                setShowPermissions(true);
              }}
              style={{
                background: '#666',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                padding: '6px 8px',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                height: '28px',
                display: 'flex',
                alignItems: 'center'
              }}
              title="Manage permissions"
            >
              <Settings size={12} />
            </button>
          )}

          {/* End Session Button */}
          <button
            onClick={handleEndCollab}
            style={{
              background: '#f14c4c',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              height: '28px'
            }}
          >
            End Session
          </button>
        </div>
      </div>

      {/* Main Content (explorer + editor) */}
      <div className="collab-content" style={{ flex: 1, display: 'flex', minHeight: 0, background: '#1e1e1e', height: 'calc(100vh - 60px - 200px)' }}>
        {/* File Explorer */}
        <div className="collab-file-explorer" style={{
          width: '240px',
          borderRight: '1px solid #3c3c3c',
          background: '#252526',
          display: 'flex',
          flexDirection: 'column',
          height: '100%'
        }}>
          <div style={{
            padding: '8px 12px',
            borderBottom: '1px solid #3c3c3c',
            background: '#2d2d30',
            fontSize: '11px',
            fontWeight: 500,
            color: '#cccccc',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            Explorer
          </div>
          <FileExplorer
            onFileOpen={handleFileOpen}
            onCreateFile={handleCreateFile}
            onCreateDirectory={handleCreateDirectory}
            onDeleteItem={handleDeleteItem}
            onRenameItem={handleRenameItem}
            tree={fileTree}
            collabId={collabId}
            senderId={senderId}
            ownerId={senderId}
            onRefresh={() => fetchTree(true)}
          />
        </div>

        {/* Editor + Tabs */}
        <div className="collab-editor-section" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#1e1e1e', height: '100%' }}>
          <FileTabs
            tabs={fileTabs}
            activeTab={activeTab}
            onTabSelect={handleTabSelect}
            onTabClose={handleTabClose}
          />
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#1e1e1e' }}>
            {activeTabPath && (
              <>
                {console.log('[CollabRoom][Render] activeTabPath:', activeTabPath, 'tabContents:', tabContents, 'fileLoadError:', fileLoadError)}
                <div style={{
                  display: 'flex',
                  gap: '6px',
                  alignItems: 'center',
                  background: '#252526',
                  padding: '6px 12px',
                  borderBottom: '1px solid #3c3c3c',
                  height: '32px'
                }}>
                  <button
                    onClick={handleRun}
                    style={{
                      background: tabContents[activeTabPath] !== undefined ? '#0e639c' : '#3c3c3c',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '3px',
                      padding: '4px 8px',
                      fontSize: '11px',
                      fontWeight: 500,
                      cursor: tabContents[activeTabPath] !== undefined ? 'pointer' : 'not-allowed',
                      height: '22px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    title="Run Code"
                    disabled={tabContents[activeTabPath] === undefined}
                  >
                    ▶ Run
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={tabContents[activeTabPath] === undefined}
                    style={{
                      background: tabContents[activeTabPath] !== undefined ? '#16825d' : '#3c3c3c',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '3px',
                      padding: '4px 8px',
                      fontSize: '11px',
                      fontWeight: 500,
                      cursor: tabContents[activeTabPath] !== undefined ? 'pointer' : 'not-allowed',
                      height: '22px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    title="Save File"
                  >
                    Save
                  </button>
                </div>
                {fileLoadError ? (
                  <div style={{
                    color: '#f14c4c',
                    textAlign: 'center',
                    marginTop: '40px',
                    fontSize: '13px',
                    fontWeight: 500
                  }}>
                    {fileLoadError}
                  </div>
                ) : tabContents[activeTabPath] === undefined ? (
                  <div style={{
                    color: '#cccccc',
                    textAlign: 'center',
                    marginTop: '40px',
                    fontSize: '13px'
                  }}>
                    Loading file...
                  </div>
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
              <div style={{
                color: '#cccccc',
                fontSize: '13px',
                textAlign: 'center',
                marginTop: '60px',
                fontWeight: 400
              }}>
                Select a file from the explorer to start collaborating
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Shared Terminal at the bottom */}
      <div className="collab-terminal" style={{
        width: '100%',
        height: '200px',
        minHeight: '200px',
        background: '#252526',
        borderTop: '1px solid #3c3c3c',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0
      }}>
        <div style={{
          padding: '8px 12px',
          borderBottom: '1px solid #3c3c3c',
          background: '#2d2d30',
          fontSize: '11px',
          fontWeight: 500,
          color: '#cccccc',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          height: '28px',
          display: 'flex',
          alignItems: 'center'
        }}>
          Shared Terminal
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <CollabBashTerminal
            ref={collabTerminalRef}
            collabId={collabId || ''}
            senderId={senderId || ''}
            token={token || ''}
          />
        </div>
      </div>

      {/* Participant Manager Modal */}
      {showPermissions && isOwner && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: '#2d2d2d',
            borderRadius: '8px',
            padding: '24px',
            width: '500px',
            maxHeight: '600px',
            overflow: 'auto',
            border: '1px solid #444'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px'
            }}>
              <h3 style={{ color: '#fff', margin: 0 }}>Manage Participants</h3>
              <button
                onClick={() => setShowPermissions(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#999',
                  cursor: 'pointer',
                  fontSize: '18px'
                }}
              >
                ×
              </button>
            </div>

            {/* Current Participants */}
            <div style={{ marginBottom: '24px' }}>
              <h4 style={{ color: '#fff', marginBottom: '12px' }}>Current Participants ({participants.length})</h4>
              <div style={{ maxHeight: '200px', overflow: 'auto' }}>
                {participants.map(participant => (
                  <div key={participant.userId} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    background: '#3d3d3d',
                    borderRadius: '4px',
                    marginBottom: '8px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: participant.role === 'owner' ? '#4CAF50' : '#2196F3'
                      }} />
                      <span style={{ color: '#fff' }}>
                        {participant.username}
                        {participant.role === 'owner' && ' (Owner)'}
                      </span>
                    </div>
                    {participant.role !== 'owner' && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log('[DEBUG] Remove button clicked for:', participant.username, participant.userId);
                          alert(`Trying to remove ${participant.username} from collaboration`);
                          handleRemoveParticipant(participant.userId, participant.username);
                        }}
                        style={{
                          background: '#f44336',
                          border: 'none',
                          color: 'white',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                        title="Remove participant"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Add New Participants */}
            <div>
              <h4 style={{ color: '#fff', marginBottom: '12px' }}>Add Friends</h4>
              {loadingFriends ? (
                <div style={{ color: '#999', textAlign: 'center', padding: '20px' }}>Loading friends...</div>
              ) : (
                <div style={{ maxHeight: '200px', overflow: 'auto' }}>
                  {friends.filter(friend =>
                    !participants.some(p => p.userId === friend._id)
                  ).map(friend => (
                    <div key={friend._id} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 12px',
                      background: '#3d3d3d',
                      borderRadius: '4px',
                      marginBottom: '8px'
                    }}>
                      <span style={{ color: '#fff' }}>{friend.username}</span>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log('[DEBUG] Add button clicked for:', friend.username, friend._id);
                          alert(`Trying to add ${friend.username} to collaboration`);
                          handleAddParticipant(friend._id, friend.username);
                        }}
                        style={{
                          background: '#4CAF50',
                          border: 'none',
                          color: 'white',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                        title="Add to collaboration"
                      >
                        Add
                      </button>
                    </div>
                  ))}
                  {friends.filter(friend =>
                    !participants.some(p => p.userId === friend._id)
                  ).length === 0 && (
                      <div style={{ color: '#999', textAlign: 'center', padding: '20px' }}>
                        {friends.length === 0 ? 'No friends available' : 'All friends are already participants'}
                      </div>
                    )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <MultiUserCollabInvite
          onClose={() => setShowInviteModal(false)}
          collabId={collabId}
          senderId={senderId}
        />
      )}
    </div>
  );
} 
