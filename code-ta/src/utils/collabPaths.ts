// Centralized collaboration path utilities
// This ensures consistent folder naming and path handling across all collaboration features

export interface CollabPathInfo {
  collabId: string;
  ownerId: string;
  originalPath: string;
  fileName: string;
  fileType: 'file' | 'directory';
}

/**
 * Generate a standardized collaboration folder name
 */
export function getCollabFolderName(collabId: string): string {
  return `collabroom_${collabId}`;
}

/**
 * Generate a standardized collaboration ID
 */
export function generateCollabId(): string {
  return `collab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get the collaboration root path for a given owner and collabId
 */
export function getCollabRootPath(ownerId: string, collabId: string): string {
  return `${ownerId}/${getCollabFolderName(collabId)}`;
}

/**
 * Clean and normalize a file path for collaboration
 * Removes user ID prefix and collab folder prefix if present
 */
export function normalizeCollabPath(filePath: string, userId?: string, collabId?: string): string {
  let cleanPath = filePath;
  
  // Remove user ID prefix if present
  if (userId && cleanPath.startsWith(`${userId}/`)) {
    cleanPath = cleanPath.slice(userId.length + 1);
  }
  
  // Remove collab folder prefix if present
  if (collabId) {
    const collabFolderName = getCollabFolderName(collabId);
    if (cleanPath.startsWith(`${collabFolderName}/`)) {
      cleanPath = cleanPath.slice(collabFolderName.length + 1);
    }
  }
  
  return cleanPath;
}

/**
 * Get the relative path within a collaboration folder
 */
export function getCollabRelativePath(filePath: string, ownerId: string, collabId: string): string {
  const collabRoot = getCollabRootPath(ownerId, collabId);
  
  // If the path already includes the collab root, extract the relative part
  if (filePath.startsWith(collabRoot + '/')) {
    return filePath.slice(collabRoot.length + 1);
  }
  
  // Otherwise, normalize the path
  return normalizeCollabPath(filePath, ownerId, collabId);
}

/**
 * Get the full collaboration path for a file/directory
 */
export function getFullCollabPath(relativePath: string, ownerId: string, collabId: string): string {
  const collabRoot = getCollabRootPath(ownerId, collabId);
  return `${collabRoot}/${relativePath}`;
}

/**
 * Extract file/directory name from a path
 */
export function getFileNameFromPath(filePath: string): string {
  return filePath.split('/').pop() || filePath;
}

/**
 * Determine if a path represents a directory based on common patterns
 */
export function isDirectoryPath(filePath: string, hasChildren?: boolean): boolean {
  // If we have explicit children info, use it
  if (hasChildren !== undefined) {
    return hasChildren;
  }
  
  // Check if path ends with common directory indicators
  if (filePath.endsWith('/')) {
    return true;
  }
  
  // Check if path has no file extension (heuristic)
  const fileName = getFileNameFromPath(filePath);
  return !fileName.includes('.');
}

/**
 * Create a standardized collaboration invite message
 */
export function createCollabInviteData(
  fileOrDir: any,
  fromUserId: string,
  toUserId: string,
  collabId?: string
) {
  const generatedCollabId = collabId || generateCollabId();
  const fileName = fileOrDir.title || fileOrDir.name || getFileNameFromPath(fileOrDir.path);
  const fileType = isDirectoryPath(fileOrDir.path, fileOrDir.children) ? 'directory' : 'file';
  const cleanPath = normalizeCollabPath(fileOrDir.path, fromUserId);
  
  return {
    collabId: generatedCollabId,
    fileId: fileOrDir.id || fileOrDir._id || fileOrDir.path,
    fileName: fileName,
    fileType: fileType,
    filePath: cleanPath, // Clean path without user prefix
    originalPath: fileOrDir.path, // Original path for reference
    from: fromUserId,
    to: toUserId,
    room: generatedCollabId, // Use the systematic collabId as the room identifier
    timestamp: Date.now(),
    status: 'pending'
  };
}

/**
 * Create collaboration session data for starting a session
 */
export function createCollabSessionData(
  inviteData: any,
  users: string[],
  ownerId: string
) {
  const collabRoot = getCollabRootPath(ownerId, inviteData.collabId);
  
  return {
    collabId: inviteData.collabId,
    collabRoot: collabRoot,
    fileName: inviteData.fileName,
    fileType: inviteData.fileType,
    filePath: inviteData.filePath, // Relative path within collab folder
    originalPath: inviteData.originalPath,
    users: users,
    ownerId: ownerId,
    room: inviteData.collabId // Use collabId as room identifier
  };
}