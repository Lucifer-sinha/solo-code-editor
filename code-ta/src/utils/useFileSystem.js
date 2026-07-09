import { useState, useEffect } from 'react';

// Type definitions
interface FileSystemNode {
  name: string;
  type: 'file' | 'directory';
  content?: string;
  children?: FileSystemNode[];
  createdAt?: string;
  updatedAt?: string;
}

interface FileItem {
  path: string;
  name: string;
  content: string;
}

// Default file system structure
const defaultFileSystem = {
  name: 'workspace',
  type: 'directory',
  children: [
    {
      name: 'main.py',
      type: 'file',
      content: '# Start coding here\nprint("Hello, World!")',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      name: 'examples',
      type: 'directory',
      children: [
        {
          name: 'hello.py',
          type: 'file',
          content: 'def greet(name):\n    return f"Hello, {name}!"\n\nprint(greet("User"))',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ]
    }
  ]
};

// Helper to get full path
const getFullPath = (path) => {
  if (!path || path === '/') return 'workspace';
  return path.startsWith('/') ? `workspace${path}` : `workspace/${path}`;
};

// Helper to find a node by path
const findNodeByPath = (fileSystem, path) => {
  const parts = path.split('/').filter(Boolean);
  let currentNode = fileSystem;

  for (const part of parts) {
    if (currentNode.type === 'directory' && currentNode.children) {
      const foundChild = currentNode.children.find(child => child.name === part);
      if (foundChild) {
        currentNode = foundChild;
      } else {
        return null;
      }
    } else {
      return null;
    }
  }

  return currentNode;
};

// Generate a random ID for files
const generateId = () => {
  return Math.random().toString(36).substring(2, 15);
};

export const useFileSystem = () => {
  const [fileSystem, setFileSystem] = useState(null);
  const [currentFile, setCurrentFile] = useState(null);
  const [openFiles, setOpenFiles] = useState([]);
  const [error, setError] = useState(null);

  // Initialize file system from localStorage or use default
  useEffect(() => {
    try {
      const savedFileSystem = localStorage.getItem('fileSystem');
      if (savedFileSystem) {
        setFileSystem(JSON.parse(savedFileSystem));
      } else {
        setFileSystem(defaultFileSystem);
      }
    } catch (err) {
      setError('Failed to load file system');
      setFileSystem(defaultFileSystem);
    }
  }, []);

  // Save file system to localStorage whenever it changes
  useEffect(() => {
    if (fileSystem) {
      try {
        localStorage.setItem('fileSystem', JSON.stringify(fileSystem));
      } catch (err) {
        setError('Failed to save file system');
      }
    }
  }, [fileSystem]);

  // Get file content by path
  const getFileContent = (path) => {
    const fullPath = getFullPath(path);
    const node = findNodeByPath(fileSystem, fullPath);

    if (!node || node.type !== 'file') {
      setError(`File not found: ${path}`);
      return null;
    }

    return node.content;
  };

  // Save file content
  const saveFile = (path, content) => {
    const fullPath = getFullPath(path);
    const pathParts = fullPath.split('/').filter(Boolean);
    const fileName = pathParts.pop();
    const dirPath = pathParts.join('/');

    // Clone the file system to make immutable updates
    const newFileSystem = JSON.parse(JSON.stringify(fileSystem));
    const dirNode = findNodeByPath(newFileSystem, dirPath);

    if (!dirNode || dirNode.type !== 'directory') {
      setError(`Directory not found: ${dirPath}`);
      return false;
    }

    const fileIndex = dirNode.children.findIndex(child => child.name === fileName);
    if (fileIndex >= 0) {
      // Update existing file
      dirNode.children[fileIndex].content = content;
      dirNode.children[fileIndex].updatedAt = new Date().toISOString();
    } else {
      // Create new file
      dirNode.children.push({
        name: fileName,
        type: 'file',
        content,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    setFileSystem(newFileSystem);
    return true;
  };

  // Create a new file
  const createFile = (path, content = '') => {
    const fullPath = getFullPath(path);
    const pathParts = fullPath.split('/').filter(Boolean);
    const fileName = pathParts.pop();
    const dirPath = pathParts.join('/');

    const newFileSystem = JSON.parse(JSON.stringify(fileSystem));
    const dirNode = findNodeByPath(newFileSystem, dirPath);

    if (!dirNode || dirNode.type !== 'directory') {
      setError(`Directory not found: ${dirPath}`);
      return false;
    }

    // Check if file already exists
    if (dirNode.children.some(child => child.name === fileName)) {
      setError(`File already exists: ${path}`);
      return false;
    }

    // Create new file
    dirNode.children.push({
      name: fileName,
      type: 'file',
      content,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    setFileSystem(newFileSystem);
    return true;
  };

  // Create a new directory
  const createDirectory = (path) => {
    const fullPath = getFullPath(path);
    const pathParts = fullPath.split('/').filter(Boolean);
    const dirName = pathParts.pop();
    const parentPath = pathParts.join('/');

    const newFileSystem = JSON.parse(JSON.stringify(fileSystem));
    const parentNode = findNodeByPath(newFileSystem, parentPath);

    if (!parentNode || parentNode.type !== 'directory') {
      setError(`Parent directory not found: ${parentPath}`);
      return false;
    }

    // Check if directory already exists
    if (parentNode.children.some(child => child.name === dirName)) {
      setError(`Directory already exists: ${path}`);
      return false;
    }

    // Create new directory
    parentNode.children.push({
      name: dirName,
      type: 'directory',
      children: []
    });

    setFileSystem(newFileSystem);
    return true;
  };

  // Delete a file or directory
  const deleteItem = (path) => {
    const fullPath = getFullPath(path);
    const pathParts = fullPath.split('/').filter(Boolean);
    const itemName = pathParts.pop();
    const parentPath = pathParts.join('/');

    const newFileSystem = JSON.parse(JSON.stringify(fileSystem));
    const parentNode = findNodeByPath(newFileSystem, parentPath);

    if (!parentNode || parentNode.type !== 'directory') {
      setError(`Parent directory not found: ${parentPath}`);
      return false;
    }

    const itemIndex = parentNode.children.findIndex(child => child.name === itemName);
    if (itemIndex === -1) {
      setError(`Item not found: ${path}`);
      return false;
    }

    // Remove from openFiles if it's a file that's being deleted
    if (parentNode.children[itemIndex].type === 'file') {
      setOpenFiles(prev => prev.filter(f => f.path !== path));
      if (currentFile && currentFile.path === path) {
        setCurrentFile(null);
      }
    }

    // Remove the item
    parentNode.children.splice(itemIndex, 1);
    setFileSystem(newFileSystem);
    return true;
  };

  // Rename a file or directory
  const renameItem = (path, newName) => {
    const fullPath = getFullPath(path);
    const pathParts = fullPath.split('/').filter(Boolean);
    const itemName = pathParts.pop();
    const parentPath = pathParts.join('/');

    const newFileSystem = JSON.parse(JSON.stringify(fileSystem));
    const parentNode = findNodeByPath(newFileSystem, parentPath);

    if (!parentNode || parentNode.type !== 'directory') {
      setError(`Parent directory not found: ${parentPath}`);
      return false;
    }

    const itemIndex = parentNode.children.findIndex(child => child.name === itemName);
    if (itemIndex === -1) {
      setError(`Item not found: ${path}`);
      return false;
    }

    // Check if an item with the new name already exists
    if (parentNode.children.some(child => child.name === newName)) {
      setError(`An item with name "${newName}" already exists`);
      return false;
    }

    // Update open files and current file references if needed
    if (parentNode.children[itemIndex].type === 'file') {
      const oldPath = path;
      const newPath = path.replace(itemName, newName);
      
      setOpenFiles(prev => prev.map(f => 
        f.path === oldPath ? { ...f, name: newName, path: newPath } : f
      ));
      
      if (currentFile && currentFile.path === oldPath) {
        setCurrentFile({ ...currentFile, name: newName, path: newPath });
      }
    }

    // Rename the item
    parentNode.children[itemIndex].name = newName;
    setFileSystem(newFileSystem);
    return true;
  };

  // Open a file
  const openFile = (path) => {
    const content = getFileContent(path);
    if (content === null) return false;

    const name = path.split('/').pop();
    const newFile = { path, name, content };

    // Check if file is already open
    if (!openFiles.some(f => f.path === path)) {
      setOpenFiles(prev => [...prev, newFile]);
    }

    setCurrentFile(newFile);
    return true;
  };

  // Close a file
  const closeFile = (path) => {
    setOpenFiles(prev => prev.filter(f => f.path !== path));
    
    // If we're closing the current file, select another one if available
    if (currentFile && currentFile.path === path) {
      const remainingFiles = openFiles.filter(f => f.path !== path);
      setCurrentFile(remainingFiles.length > 0 ? remainingFiles[0] : null);
    }
  };

  // Export the file system as a zip file
  const exportAsZip = async () => {
    try {
      // We'd normally use JSZip here, but we'll mock this for now
      alert('Exporting as ZIP is not implemented in this demo');
      return true;
    } catch (err) {
      setError('Failed to export as ZIP');
      return false;
    }
  };

  return {
    fileSystem,
    currentFile,
    openFiles,
    error,
    getFileContent,
    saveFile,
    createFile,
    createDirectory,
    deleteItem,
    renameItem,
    openFile,
    closeFile,
    exportAsZip,
    setCurrentFile
  };
};
