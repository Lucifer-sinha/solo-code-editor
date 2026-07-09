import React, { useState, useEffect, useRef } from 'react';
import RcTree from 'rc-tree';
import type { EventDataNode } from 'rc-tree/lib/interface';
type DataNode = import('rc-tree/lib/interface').DataNode; import 'rc-tree/assets/index.css';
import '../styles/file-explorer.css';
import { VscFileCode, VscFileBinary, VscFileMedia, VscFilePdf, VscFileZip, VscFile, VscFolder, VscFolderOpened, VscSearch } from 'react-icons/vsc';
import { useAuth } from '../context/AuthContext';
import { getSocket } from '../utils/socket';
import { getApiUrl } from '../config/api';
import { 
  getCollabFolderName, 
  normalizeCollabPath, 
  getCollabRelativePath,
  getFullCollabPath 
} from '../utils/collabPaths';

// File/Directory item type
interface FileSystemNode {
  title: string;
  type: 'file' | 'directory';
  children?: FileSystemNode[];
  path: string;
  isExpanded?: boolean;
  isActive?: boolean;
}

// Update FileExplorerProps interface
type FileType = 'file' | 'directory';
interface FileExplorerProps {
  onFileOpen: (path: string, type: FileType) => void;
  onCreateFile: (path: string) => void;
  onCreateDirectory: (path: string) => void;
  onDeleteItem: (path: string) => void;
  onRenameItem: (path: string, newName: string) => void;
  root?: string; // NEW: base path for all actions
  tree?: any; // NEW: controlled file tree (for collab mode)
  collabId?: string; // NEW: ID for collaborative editing
  senderId?: string; // NEW: senderId for collabroom
  ownerId?: string; // NEW: owner ID for collaboration path handling
  onRefresh?: () => void; // NEW: allow parent to control refresh
}

// Helper to convert backend tree to rc-tree format
function convertTreeToRcTree(node: any, parentPath = '', collabId?: string, ownerId?: string): DataNode {
  // Always build the full path from the root (no leading slash)
  let path = parentPath ? `${parentPath}/${node.name}` : node.name;
  
  // Use systematic path normalization for collaboration
  if (collabId && ownerId) {
    path = normalizeCollabPath(path, ownerId, collabId);
  }
  
  return {
    key: path,
    title: node.name,
    isLeaf: node.type === 'file',
    children: node.children ? node.children.map((child: any) => convertTreeToRcTree(child, path, collabId, ownerId)) : undefined,
    data: { ...node, path },
  };
}

// Replace getFileIcon with VS Code icon logic
const getFileIcon = (name: string, type: string, isOpen = false) => {
  if (type === 'directory') return isOpen ? <VscFolderOpened /> : <VscFolder />;
  if (name.endsWith('.js')) return <VscFileCode color="#f1e05a" />;
  if (name.endsWith('.py')) return <VscFileCode color="#3572A5" />;
  if (name.endsWith('.cpp') || name.endsWith('.c')) return <VscFileCode color="#f34b7d" />;
  if (name.endsWith('.java')) return <VscFileCode color="#b07219" />;
  if (name.endsWith('.md')) return <VscFile />;
  if (name.endsWith('.zip') || name.endsWith('.tar') || name.endsWith('.gz')) return <VscFileZip />;
  if (name.endsWith('.pdf')) return <VscFilePdf />;
  return <VscFile />;
};

// Add a helper to get the parent path for new files/folders
function getParentPath(node: EventDataNode<DataNode> | null): string {
  if (!node) return '';
  if (node.data.type === 'directory') return node.key as string; // full path from root
  // For files, use their parent directory
  return (node.key as string).split('/').slice(0, -1).join('/') || '';
}

// Helper to update treeData after drag-and-drop
function moveNodeInTree(tree: DataNode[], dragKey: string, dropKey: string, dropToGap: boolean): DataNode[] {
  let dragObj: DataNode | null = null;
  // Remove dragObj from tree
  function loop(data: DataNode[], key: string, callback: (item: DataNode, idx: number, arr: DataNode[]) => void) {
    for (let i = 0; i < data.length; i++) {
      if (data[i].key === key) {
        callback(data[i], i, data);
        return;
      }
      if (data[i].children) {
        loop(data[i].children as DataNode[], key, callback);
      }
    }
  }
  const data = [...tree];
  loop(data, dragKey, (item, idx, arr) => {
    dragObj = item;
    arr.splice(idx, 1);
  });
  if (!dragObj) return tree;
  if (!dropToGap) {
    // Drop on folder
    loop(data, dropKey, (item) => {
      item.children = item.children || [];
      (item.children as DataNode[]).push(dragObj!);
    });
  } else {
    // Drop between nodes
    loop(data, dropKey, (item, idx, arr) => {
      arr.splice(idx + 1, 0, dragObj!);
    });
  }
  return data;
}

const FileExplorer: React.FC<FileExplorerProps> = ({
  onFileOpen,
  onCreateFile,
  onCreateDirectory,
  onDeleteItem,
  onRenameItem,
  root = '', // default to user root
  tree,
  collabId,
  senderId,
  ownerId,
  onRefresh,
}) => {
  const { token, user } = useAuth() || {};
  const [treeData, setTreeData] = useState<DataNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState<null | 'file' | 'folder'>(null);
  const [createName, setCreateName] = useState('');
  const [createError, setCreateError] = useState('');
  const [renamePath, setRenamePath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState('');
  const [search, setSearch] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, node: EventDataNode<DataNode> | null } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  // Add state for context menu target path/type
  const [contextTarget, setContextTarget] = useState<{ node: EventDataNode<DataNode> | null } | null>(null);
  // Add state for tab selection
  const [activeTab, setActiveTab] = useState<'files' | 'search'>('files');
  // Add image preview modal state
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  // Add collaboration dialog state
  const [showCollabDialog, setShowCollabDialog] = useState(false);
  const [friends, setFriends] = useState<any[]>([]);
  const [selectedFriend, setSelectedFriend] = useState<string>('');

  // Helper to prefix root to any path
  const withRoot = (p: string) => root ? (root + (p ? '/' + p : '')) : p;

  const normalizePath = (p: string) => p.replace(/^\/+/, '');

  // Helper to always return a relative path using systematic collaboration path handling
  const toRelativePath = (p: string) => {
    if (collabId && ownerId) {
      return getCollabRelativePath(p, ownerId, collabId);
    }
    return p.replace(/^\/+/, '').replace(/^user_files\//, '').replace(/^\w+\//, '');
  };

  // Enhanced drag and drop for collaboration with better conflict resolution
  const handleDropRealtime = async (info: any) => {
    if (!token || !user?.id) return;

    const dragNode = info.dragNode;
    const dropNode = info.node;
    const dropToGap = info.dropToGap;

    const draggedItemPath = dragNode.key as string;
    const draggedItemName = dragNode.title as string;
    const dropTargetPath = dropNode.key as string;
    const dropTargetType = dropNode.data.type;

    // Enhanced path validation for collaboration using systematic path handling
    if (collabId && ownerId) {
      // In collaboration mode, validate paths properly
      const isValidCollabPath = (path: string) => {
        // Ensure path is within collaboration scope and properly normalized
        const normalizedPath = normalizeCollabPath(path, ownerId, collabId);
        return !normalizedPath.includes('..') && !normalizedPath.startsWith('/');
      };

      if (!isValidCollabPath(draggedItemPath) || !isValidCollabPath(dropTargetPath)) {
        setError('Invalid path for collaboration - paths must be within collaboration scope');
        return;
      }
    }

    // Prevent moving a folder into itself or its descendants
    if (draggedItemPath === dropTargetPath || dropTargetPath.startsWith(draggedItemPath + '/')) {
      setError('Cannot move a folder into itself or its subfolder');
      return;
    }

    // Compute new path
    let newParentPath = '';
    if (!dropToGap && dropTargetType === 'directory') {
      newParentPath = dropTargetPath;
    } else {
      newParentPath = dropTargetPath.split('/').slice(0, -1).join('/');
    }

    const newPath = newParentPath ? `${newParentPath}/${draggedItemName}` : draggedItemName;

    // Check if it's actually a move
    const oldParent = draggedItemPath.split('/').slice(0, -1).join('/');
    if (oldParent === newParentPath) {
      console.log('[FileExplorer] No move needed - same location');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const body: any = {
        oldPath: toRelativePath(draggedItemPath),
        newPath: toRelativePath(newPath)
      };

      if (collabId) {
        body.collab_id = collabId;
        if (senderId) body.senderId = senderId;
      }

      const res = await fetch(getApiUrl('fs/rename'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }

      // Enhanced real-time update for collaboration using systematic room naming
      if (collabId) {
        const socket = getSocket();
        const roomName = getCollabFolderName(collabId);
        
        socket.emit('collab-item-renamed', {
          room: roomName,
          oldPath: draggedItemPath,
          newPath: newPath,
          renamedBy: user?.id,
          operation: 'move-item',
          timestamp: Date.now(),
          metadata: {
            itemName: draggedItemName,
            itemType: dragNode.data.type,
            collabId: collabId
          }
        });

        // Also emit tree update
        socket.emit('collab-tree-update', {
          room: roomName,
          operation: 'move-item',
          path: newPath,
          updatedBy: user?.id,
          timestamp: Date.now()
        });
      }

      // Refresh tree
      if (onRefresh) {
        onRefresh();
      } else if (!tree) {
        await fetchTree(true); // Immediate fetch for drag operations
      }

    } catch (e: any) {
      console.error('[FileExplorer] Drag and drop error:', e);
      setError(`Failed to move: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Debounced fetch tree to prevent API call cascades
  const [fetchTreeTimeout, setFetchTreeTimeout] = useState<NodeJS.Timeout | null>(null);

  const fetchTree = async (immediate = false) => {
    if (!token || !user?.id) return;

    // Clear existing timeout if not immediate
    if (!immediate && fetchTreeTimeout) {
      clearTimeout(fetchTreeTimeout);
    }

    const doFetch = async () => {
      setLoading(true);
      setError(null);
      try {
        let url = getApiUrl(`fs/list?path=${encodeURIComponent(root)}`);
        if (collabId) {
          url += `&collab_id=${collabId}`;
          if (senderId) url += `&senderId=${senderId}`;
        }
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        const rcTree = [convertTreeToRcTree(data, '', collabId, ownerId)];
        setTreeData(rcTree);
        // Expand root by default
        setExpandedKeys([rcTree[0].key as string]);
      } catch (e: any) {
        setError(`Failed to load file tree: ${e.message}`);
      } finally {
        setLoading(false);
      }
    };

    if (immediate) {
      await doFetch();
    } else {
      // Debounce by 300ms to prevent rapid successive calls
      const timeout = setTimeout(doFetch, 300);
      setFetchTreeTimeout(timeout);
    }
  };

  // If tree prop is provided, use it as the file tree and do not fetch from backend
  useEffect(() => {
    if (tree) {
      console.log('[FileExplorer] Using provided tree:', tree);
      console.log('[FileExplorer] Tree name:', tree.name);
      console.log('[FileExplorer] Tree children:', tree.children?.length || 0);
      if (tree.children && tree.children.length > 0) {
        const rcTree = [convertTreeToRcTree(tree, '', collabId, ownerId)];
        setTreeData(rcTree);
        setExpandedKeys([tree.name]);
      } else {
        // Even if no children, still show the root folder
        const rcTree = [convertTreeToRcTree(tree, '', collabId, ownerId)];
        setTreeData(rcTree);
        setExpandedKeys([tree.name]);
        console.warn('[FileExplorer] Tree has no children, showing empty directory');
      }
      setLoading(false);
      setError(null);
      return;
    }
    fetchTree(true); // Immediate fetch on initial load
  }, [token, user?.id, root, tree]);

  // Listen for 'file-tree-update' socket event
  useEffect(() => {
    const socket = getSocket();
    socket.on('file-tree-update', () => fetchTree(false)); // Debounced for socket events
    return () => {
      socket.off('file-tree-update', () => fetchTree(false));
    };
  }, [token, user?.id, root]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (fetchTreeTimeout) {
        clearTimeout(fetchTreeTimeout);
      }
    };
  }, [fetchTreeTimeout]);

  // Context menu outside click handler
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (contextMenu && contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    if (contextMenu) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [contextMenu]);

  // Fetch friends for collaboration
  useEffect(() => {
    const fetchFriends = async () => {
      if (!token || !user?.id) return;
      try {
        const res = await fetch(getApiUrl('friends/list'), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setFriends(data.friends || []);
        }
      } catch (e) {
        console.error('Failed to fetch friends:', e);
      }
    };

    if (showCollabDialog) {
      fetchFriends();
    }
  }, [showCollabDialog, token, user?.id]);

  // Update all file/folder actions to use withRoot(path) instead of just path
  // For example, in handleCreateFile, handleCreateDirectory, handleDeleteItem, handleRenameItem, handleFileOpen, etc.

  // Update handleFileOpen to accept type
  const handleFileOpen = (node: FileSystemNode) => {
    onFileOpen(withRoot(node.path), node.type);
  };

  const handleCreateFile = async (path: string) => {
    if (!token || !user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const body = { path: toRelativePath(path), content: '' };
      if (collabId) {
        body.collab_id = collabId;
        if (senderId) body.senderId = senderId;
      }
      const res = await fetch(getApiUrl('fs/file'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to create file');
      await fetchTree(false); // Debounced for file operations
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDirectory = async (path: string) => {
    if (!token || !user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const body = { path: toRelativePath(path) };
      if (collabId) {
        body.collab_id = collabId;
        if (senderId) body.senderId = senderId;
      }
      const res = await fetch(getApiUrl('fs/dir'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to create directory');
      await fetchTree(false); // Debounced for file operations
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteItem = async (path: string) => {
    if (!token || !user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const body = { path: toRelativePath(path) };
      if (collabId) {
        body.collab_id = collabId;
        if (senderId) body.senderId = senderId;
      }
      const res = await fetch(getApiUrl('fs'), {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to delete item');
      await fetchTree(false); // Debounced for file operations
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRenameItem = async (oldPath: string, newPath: string) => {
    if (!token || !user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const body = { oldPath: toRelativePath(oldPath), newPath: toRelativePath(newPath) };
      if (collabId) {
        body.collab_id = collabId;
        if (senderId) body.senderId = senderId;
      }
      const res = await fetch(getApiUrl('fs/rename'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to rename item');
      await fetchTree(false); // Debounced for file operations
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // New: handle create dialog submit
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim()) {
      setCreateError('Name required');
      return;
    }
    if (showCreateDialog === 'file' && !/\.[a-zA-Z0-9]+$/.test(createName)) {
      setCreateError('Include a file extension, e.g. myfile.py');
      return;
    }
    try {
      // Use the selected node as parent
      let parentPath = getParentPath(contextTarget?.node || null);
      // Always build the full path relative to the root
      const fullPath = parentPath ? `${parentPath}/${createName}` : createName;
      console.log('[FileExplorer][DEBUG] Creating', showCreateDialog, 'at:', fullPath);
      if (showCreateDialog === 'file') {
        await handleCreateFile(fullPath);
      } else {
        await handleCreateDirectory(fullPath);
      }
      setShowCreateDialog(null);
      setCreateName('');
      setCreateError('');
      setContextTarget(null);
      await fetchTree(false); // Debounced for file operations
    } catch (e: any) {
      setCreateError(e.message || 'Failed to create');
    }
  };

  // New: handle rename
  const handleRename = (path: string, currentName: string) => {
    setRenamePath(path);
    setRenameValue(currentName);
    setRenameError('');
  };
  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameValue.trim()) {
      setRenameError('Name required');
      return;
    }
    try {
      // Get the current file/folder name from the path
      const currentName = renamePath!.split('/').pop() || '';
      // If it's the same name, do nothing
      if (currentName === renameValue) {
        setRenamePath(null);
        setRenameValue('');
        return;
      }
      // Compute new path by replacing the last segment
      const pathParts = renamePath!.split('/');
      pathParts[pathParts.length - 1] = renameValue;
      const newPath = pathParts.join('/');
      // Call backend to rename with full paths
      await handleRenameItem(renamePath!, newPath);
      // Call the callback to update tabs
      onRenameItem(renamePath!, newPath);
      setRenamePath(null);
      setRenameValue('');
      setRenameError('');
      // Refresh the file tree to show renamed items
      await fetchTree(false); // Debounced for file operations
    } catch (e: any) {
      console.error('Rename error:', e);
      setRenameError(e.message || 'Failed to rename');
    }
  };

  // Start collaboration
  const handleStartCollab = async () => {
    if (!selectedFriend || selectedKeys.length === 0) return;

    const selectedNode = treeData.find(n => n.key === selectedKeys[0]);
    if (!selectedNode) return;

    try {
      const socket = getSocket();
      const fileOrDir = {
        filePath: withRoot(selectedNode.key as string),
        fileName: selectedNode.title as string,
        fileType: selectedNode.data.type,
        from: user?.id,
        to: selectedFriend
      };

      socket.emit('collab-session-start', {
        users: [user?.id, selectedFriend],
        fileOrDir
      });

      setShowCollabDialog(false);
      setSelectedFriend('');
    } catch (e) {
      console.error('Failed to start collaboration:', e);
    }
  };

  // Search/filter logic
  const filterTree = (nodes: DataNode[]): DataNode[] => {
    if (!search.trim()) return nodes;
    const match = (title: string) => title.toLowerCase().includes(search.toLowerCase());
    const filter = (node: DataNode): DataNode | null => {
      if (match(node.title as string)) return node;
      if (node.children) {
        const filtered = (node.children as DataNode[]).map(filter).filter(Boolean) as DataNode[];
        if (filtered.length) return { ...node, children: filtered };
      }
      return null;
    };
    return nodes.map(filter).filter(Boolean) as DataNode[];
  };

  // Context menu actions
  const handleContextMenu = (e: React.MouseEvent, node: EventDataNode<DataNode>) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
    setContextTarget({ node });
  };

  // Helper to check if a node is a descendant of another
  function isDescendant(parentKey: string, childKey: string): boolean {
    return childKey.startsWith(parentKey + '/');
  }

  // Handle drag-and-drop move (VS Code-like)
  const handleDrop = async (info: any) => {
    if (!token || !user?.id) return;
    const dragNode = info.dragNode;
    const dropNode = info.node;
    const dropToGap = info.dropToGap;

    const draggedItemPath = dragNode.key as string;
    const draggedItemName = dragNode.title as string;
    const dropTargetPath = dropNode.key as string;
    const dropTargetType = dropNode.data.type;

    // Prevent moving a folder into itself or its descendants
    function isDescendant(parent: string, child: string) {
      return child.startsWith(parent + '/');
    }
    if (isDescendant(draggedItemPath, dropTargetPath) || draggedItemPath === dropTargetPath) {
      setError('Cannot move a folder into itself or its subfolder.');
      return;
    }

    // Compute new parent path
    let newParentPath = '';
    if (!dropToGap && dropTargetType === 'directory') {
      // Dropped ON a folder: move into that folder
      newParentPath = dropTargetPath;
    } else {
      // Dropped BETWEEN nodes: move to same folder as drop target
      newParentPath = dropTargetPath.split('/').slice(0, -1).join('/');
    }
    if (newParentPath === '') newParentPath = '';

    // Compute new path
    const newPath = newParentPath ? `${newParentPath}/${draggedItemName}` : draggedItemName;

    // If the new path is the same as the old path (same parent and same name), do nothing
    const oldParent = draggedItemPath.split('/').slice(0, -1).join('/');
    const newParent = newParentPath;
    const sameParent = oldParent === newParent;
    const sameName = draggedItemName === draggedItemPath.split('/').pop();
    if (sameParent && sameName) {
      console.log('  Dragged to same location, no move needed.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(getApiUrl('fs/rename'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ oldPath: draggedItemPath, newPath, ...(collabId ? { collab_id: collabId } : {}) }),
      });
      const backendResponse = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(backendResponse.error || `HTTP ${res.status}`);
      await fetchTree(false); // Debounced for file operations
    } catch (e: any) {
      setError(`Failed to move: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Disable file/folder actions if tree is provided (collab mode)
  const isReadOnly = !!tree;

  // Add a Preview button for .png files
  const renderFileNode = (node: FileSystemNode) => {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span onClick={() => handleFileOpen(node)} style={{ cursor: 'pointer' }}>{getFileIcon(node.title, node.type)} {node.title}</span>
        {node.type === 'file' && node.title.endsWith('.png') && (
          <button style={{ marginLeft: 8 }} onClick={e => { e.stopPropagation(); setPreviewImage(withRoot(node.path)); }}>Preview</button>
        )}
      </div>
    );
  };

  return (
    <div className="file-explorer" style={{ position: 'relative' }}>
      <div className="file-explorer-header">
        {/* Tab toggle for Files/Search */}
        <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #3c3c3c', background: '#23272e' }}>
          <button
            onClick={() => setActiveTab('files')}
            style={{
              background: activeTab === 'files' ? '#1e1e1e' : 'none',
              color: activeTab === 'files' ? '#9cdcfe' : '#d4d4d4',
              border: 'none',
              borderBottom: activeTab === 'files' ? '2px solid #3794ff' : 'none',
              padding: '8px 16px',
              cursor: 'pointer',
              fontWeight: activeTab === 'files' ? 'bold' : 'normal',
              fontSize: 14,
              outline: 'none',
            }}
          >
            🗐
          </button>
          <button
            onClick={() => setActiveTab('search')}
            style={{
              background: activeTab === 'search' ? '#1e1e1e' : 'none',
              color: activeTab === 'search' ? '#9cdcfe' : '#d4d4d4',
              border: 'none',
              borderBottom: activeTab === 'search' ? '2px solid #3794ff' : 'none',
              padding: '8px 16px',
              cursor: 'pointer',
              fontWeight: activeTab === 'search' ? 'bold' : 'normal',
              fontSize: 14,
              outline: 'none',
            }}
          >
            ⌕
          </button>
          {/* Show New File/New Folder only in Files tab */}
          {activeTab === 'files' && (
            <>
              <button
                title="New File"
                onClick={() => {
                  setShowCreateDialog('file');
                  // Use selected node as parent if any
                  let selectedNode = null;
                  if (selectedKeys.length > 0) {
                    const node = treeData.find(n => n.key === selectedKeys[0]);
                    if (node && node.data.type === 'file') {
                      // If a file is selected, use its parent directory
                      const parentKey = node.key.split('/').slice(0, -1).join('/');
                      selectedNode = treeData.find(n => n.key === parentKey) || null;
                    } else {
                      selectedNode = node;
                    }
                  }
                  setContextTarget({ node: selectedNode });
                }}
                disabled={loading || isReadOnly}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: loading || isReadOnly ? '#666' : '#9cdcfe', padding: '4px 8px', cursor: loading || isReadOnly ? 'not-allowed' : 'pointer', borderRadius: '4px', fontSize: '16px' }}
              >
                🗎
              </button>
              <button
                title="New Folder"
                onClick={() => {
                  setShowCreateDialog('folder');
                  // Use selected node as parent if any
                  let selectedNode = null;
                  if (selectedKeys.length > 0) {
                    const node = treeData.find(n => n.key === selectedKeys[0]);
                    if (node && node.data.type === 'file') {
                      // If a file is selected, use its parent directory
                      const parentKey = node.key.split('/').slice(0, -1).join('/');
                      selectedNode = treeData.find(n => n.key === parentKey) || null;
                    } else {
                      selectedNode = node;
                    }
                  }
                  setContextTarget({ node: selectedNode });
                }}
                disabled={loading || isReadOnly}
                style={{ background: 'none', border: 'none', color: loading || isReadOnly ? '#666' : '#9cdcfe', padding: '3px 4px', cursor: loading || isReadOnly ? 'not-allowed' : 'pointer', borderRadius: '4px', fontSize: '16px' }}
              >
                🗀
              </button>
              {!collabId && (
                <button
                  title="Start Collaboration"
                  onClick={() => setShowCollabDialog(true)}
                  disabled={loading || selectedKeys.length === 0}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: loading || selectedKeys.length === 0 ? '#666' : '#00d4aa',
                    padding: '3px 4px',
                    cursor: loading || selectedKeys.length === 0 ? 'not-allowed' : 'pointer',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }}
                >
                  👥
                </button>
              )}
            </>
          )}
        </div>
        {/* Show search bar only in Search tab */}
        {activeTab === 'search' && (
          <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #3c3c3c', background: '#23272e' }}>
            <VscSearch style={{ color: '#d4d4d4', marginRight: 8 }} />
            <input
              type="text"
              placeholder="Search files..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ flex: 1, background: 'none', border: 'none', color: '#d4d4d4', fontSize: 14, outline: 'none' }}
            />
          </div>
        )}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '4px 1px',
          borderBottom: '1px solid #3c3c3c'
        }}>
          <h2 style={{ color: '#d4d4d4', margin: 0, fontSize: '9px' }}>FE</h2>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              onClick={onRefresh ? onRefresh : fetchTree}
              disabled={loading}
              style={{ background: 'none', border: 'none', color: loading ? '#666' : '#9cdcfe', padding: '4px 8px', cursor: loading ? 'not-allowed' : 'pointer', borderRadius: '4px', fontSize: '12px' }}
            >
              {loading ? 'Loading...' : '↻'}
            </button>
          </div>
        </div>
        {error && (
          <div style={{ padding: '8px 12px', backgroundColor: '#ff4444', color: 'white', fontSize: '12px', borderBottom: '1px solid #3c3c3c' }}>
            {error}
            <button onClick={() => setError(null)} style={{ float: 'right', background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}>×</button>
          </div>
        )}
      </div>
      <div className="file-tree" style={{ height: 'calc(100vh - 40px)', overflowY: 'auto', backgroundColor: '#1e1e1e', padding: '8px' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100px', color: '#d4d4d4' }}>Loading file tree...</div>
        ) : activeTab === 'files' ? (
          <RcTree
            treeData={filterTree(treeData)}
            expandedKeys={expandedKeys}
            selectedKeys={selectedKeys}
            onExpand={setExpandedKeys}
            onSelect={(keys, { node }) => {
              setSelectedKeys(keys as string[]);
              setContextTarget({ node });
              if (node && node.data) {
                console.log('[FileExplorer][onSelect] Node selected:', node.data.path, 'Type:', node.data.type);

                // If it's a directory, toggle expansion
                if (node.data.type === 'directory') {
                  const nodeKey = node.key as string;
                  const isExpanded = expandedKeys.includes(nodeKey);
                  if (isExpanded) {
                    // Collapse the directory
                    setExpandedKeys(expandedKeys.filter(key => key !== nodeKey));
                  } else {
                    // Expand the directory
                    setExpandedKeys([...expandedKeys, nodeKey]);
                  }
                }

                // Always call onFileOpen for both files and directories
                onFileOpen(node.data.path, node.data.type);
              }
            }}
            icon={({ data, expanded }) => getFileIcon(data.title, data.type, expanded)}
            onRightClick={({ event, node }) => handleContextMenu(event as React.MouseEvent, node)}
            height={600}
            showIcon
            showLine={{ showLeafIcon: false }}
            draggable
            onDrop={handleDropRealtime}
            style={{
              // Highlight selected node
              '--rc-tree-node-selected-bg': '#264f78',
              '--rc-tree-node-selected-color': '#fff',
            } as React.CSSProperties}
          />
        ) : (
          // Search results tree (filtered)
          <RcTree
            treeData={filterTree(treeData)}
            expandedKeys={expandedKeys}
            selectedKeys={selectedKeys}
            onExpand={setExpandedKeys}
            onSelect={(keys, { node }) => {
              setSelectedKeys(keys as string[]);
              setContextTarget({ node });
              if (node && node.data) {
                // If it's a directory, toggle expansion
                if (node.data.type === 'directory') {
                  const nodeKey = node.key as string;
                  const isExpanded = expandedKeys.includes(nodeKey);
                  if (isExpanded) {
                    // Collapse the directory
                    setExpandedKeys(expandedKeys.filter(key => key !== nodeKey));
                  } else {
                    // Expand the directory
                    setExpandedKeys([...expandedKeys, nodeKey]);
                  }
                }

                // Call onFileOpen for files, and optionally for directories too
                if (node.data.type === 'file') {
                  onFileOpen(node.data.path, node.data.type);
                }
              }
            }}
            icon={({ data, expanded }) => getFileIcon(data.title, data.type, expanded)}
            height={600}
            showIcon
            showLine={{ showLeafIcon: false }}
            style={{
              '--rc-tree-node-selected-bg': '#264f78',
              '--rc-tree-node-selected-color': '#fff',
            } as React.CSSProperties}
          />
        )}
        {/* Context Menu */}
        {contextMenu && contextMenu.node && (
          <div
            ref={contextMenuRef}
            style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, background: '#222', color: '#fff', borderRadius: 4, boxShadow: '0 2px 8px rgba(0,0,0,0.2)', zIndex: 2000, minWidth: 160 }}
          >
            {contextMenu.node.data.type === 'directory' && (
              <>
                <div style={{ padding: 8, cursor: 'pointer' }} onClick={() => { setShowCreateDialog('file'); setContextTarget({ node: contextMenu.node }); setContextMenu(null); }}>New File</div>
                <div style={{ padding: 8, cursor: 'pointer' }} onClick={() => { setShowCreateDialog('folder'); setContextTarget({ node: contextMenu.node }); setContextMenu(null); }}>New Folder</div>
              </>
            )}
            <div style={{ padding: 8, cursor: 'pointer' }} onClick={() => { setRenamePath(contextMenu.node.key as string); setRenameValue(contextMenu.node.title as string); setContextMenu(null); }}>Rename</div>
            <div style={{ padding: 8, cursor: 'pointer', color: 'red' }} onClick={() => { handleDeleteItem(contextMenu.node.key as string); setContextMenu(null); }}>Delete</div>
          </div>
        )}
      </div>
      {/* Create File/Folder Dialog */}
      {showCreateDialog && (
        <div className="modal" style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <form onSubmit={handleCreateSubmit} style={{ background: '#222', padding: 24, borderRadius: 8, minWidth: 320 }}>
            <h3 style={{ color: '#fff' }}>{showCreateDialog === 'file' ? 'Create New File' : 'Create New Folder'}</h3>
            <input
              autoFocus
              value={createName}
              onChange={e => setCreateName(e.target.value)}
              placeholder={showCreateDialog === 'file' ? 'e.g. myfile.py' : 'e.g. myfolder'}
              style={{ width: '100%', padding: 8, fontSize: 16, marginBottom: 8 }}
            />
            {createError && <div style={{ color: 'red', marginBottom: 8 }}>{createError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" style={{ padding: '8px 16px' }}>Create</button>
              <button type="button" style={{ padding: '8px 16px' }} onClick={() => setShowCreateDialog(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
      {/* Rename Dialog */}
      {renamePath && (
        <div className="modal" style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <form onSubmit={handleRenameSubmit} style={{ background: '#222', padding: 24, borderRadius: 8, minWidth: 320 }}>
            <h3 style={{ color: '#fff' }}>Rename</h3>
            <input
              autoFocus
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              style={{ width: '100%', padding: 8, fontSize: 16, marginBottom: 8 }}
            />
            {renameError && <div style={{ color: 'red', marginBottom: 8 }}>{renameError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" style={{ padding: '8px 16px' }}>Rename</button>
              <button type="button" style={{ padding: '8px 16px' }} onClick={() => setRenamePath(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
      {previewImage && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={() => setPreviewImage(null)}>
          <img src={getApiUrl(`fs/file?path=${encodeURIComponent(previewImage)}`)} alt="Preview" style={{ maxWidth: '90vw', maxHeight: '90vh', background: '#fff', borderRadius: 8, boxShadow: '0 2px 16px #0008' }} />
        </div>
      )}

      {/* Collaboration Dialog */}
      {showCollabDialog && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: '#252526',
            border: '1px solid #3c3c3c',
            borderRadius: '6px',
            padding: '20px',
            minWidth: '320px',
            maxWidth: '400px'
          }}>
            <h3 style={{
              color: '#ffffff',
              margin: '0 0 16px 0',
              fontSize: '14px',
              fontWeight: 500
            }}>
              Start Collaboration
            </h3>

            {selectedKeys.length > 0 && (
              <div style={{
                background: '#2d2d30',
                padding: '8px 12px',
                borderRadius: '4px',
                marginBottom: '16px',
                fontSize: '12px',
                color: '#cccccc'
              }}>
                Sharing: {treeData.find(n => n.key === selectedKeys[0])?.title}
              </div>
            )}

            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                color: '#cccccc',
                fontSize: '12px',
                marginBottom: '6px',
                fontWeight: 500
              }}>
                Select Friend
              </label>
              <select
                value={selectedFriend}
                onChange={e => setSelectedFriend(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: '#3c3c3c',
                  border: '1px solid #464647',
                  borderRadius: '4px',
                  color: '#ffffff',
                  fontSize: '13px'
                }}
              >
                <option value="">Choose a friend...</option>
                {friends.map(friend => (
                  <option key={friend.id} value={friend.id}>
                    {friend.username}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowCollabDialog(false)}
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
                Cancel
              </button>
              <button
                onClick={handleStartCollab}
                disabled={!selectedFriend}
                style={{
                  padding: '6px 12px',
                  background: selectedFriend ? '#0e639c' : '#3c3c3c',
                  border: 'none',
                  borderRadius: '4px',
                  color: '#ffffff',
                  fontSize: '12px',
                  cursor: selectedFriend ? 'pointer' : 'not-allowed'
                }}
              >
                Start
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileExplorer;
