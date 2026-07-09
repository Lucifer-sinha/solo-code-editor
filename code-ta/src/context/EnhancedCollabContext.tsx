import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { getSocket } from '../utils/socket';

interface CollabParticipant {
  userId: string;
  username: string;
  role: 'owner' | 'editor' | 'viewer';
  permissions: {
    canEdit: boolean;
    canDelete: boolean;
    canInvite: boolean;
    canCreate: boolean;
  };
  joinTimestamp: number;
  isOnline: boolean;
}

interface CollabRoomMetadata {
  collabId: string;
  ownerId: string;
  createdAt: number;
  maxParticipants: number;
  fileType: 'file' | 'directory';
  filePath: string;
  roomName: string;
}

interface CollabOperation {
  id: string;
  type: 'create' | 'delete' | 'rename' | 'move' | 'edit';
  path: string;
  userId: string;
  username: string;
  timestamp: number;
  metadata?: any;
  status: 'pending' | 'completed' | 'failed';
}

interface EnhancedCollabContextType {
  // Room state
  isInCollab: boolean;
  collabId: string | null;
  roomMetadata: CollabRoomMetadata | null;
  participants: CollabParticipant[];
  currentUser: CollabParticipant | null;
  
  // Operations and sync
  pendingOperations: CollabOperation[];
  lastSyncTimestamp: number;
  isSyncing: boolean;
  
  // Real-time events
  socket: ReturnType<typeof getSocket>;
  
  // Actions
  joinRoom: (roomData: {
    collabId: string;
    roomMetadata: CollabRoomMetadata;
    participants: CollabParticipant[];
  }) => void;
  leaveRoom: () => void;
  addParticipant: (participant: CollabParticipant) => void;
  removeParticipant: (userId: string) => void;
  updateParticipant: (userId: string, updates: Partial<CollabParticipant>) => void;
  
  // File operations with conflict resolution
  performFileOperation: (operation: Omit<CollabOperation, 'id' | 'timestamp' | 'status'>) => Promise<boolean>;
  resolveConflict: (operationId: string, resolution: 'accept' | 'reject') => void;
  
  // Real-time sync
  emitOperation: (operation: CollabOperation) => void;
  requestSync: () => void;
  
  // Room management
  endCollabSession: () => void;
  transferOwnership: (newOwnerId: string) => void;
}

const EnhancedCollabContext = createContext<EnhancedCollabContextType | undefined>(undefined);

export const EnhancedCollabProvider: React.FC<{ 
  children: React.ReactNode;
  collabId?: string;
}> = ({ children, collabId }) => {
  const socket = getSocket();
  
  // State management
  const [isInCollab, setIsInCollab] = useState(false);
  const [roomMetadata, setRoomMetadata] = useState<CollabRoomMetadata | null>(null);
  const [participants, setParticipants] = useState<CollabParticipant[]>([]);
  const [currentUser, setCurrentUser] = useState<CollabParticipant | null>(null);
  const [pendingOperations, setPendingOperations] = useState<CollabOperation[]>([]);
  const [lastSyncTimestamp, setLastSyncTimestamp] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Refs for operation tracking
  const operationCounter = useRef(0);
  const operationTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Generate unique operation ID
  const generateOperationId = useCallback(() => {
    return `op_${Date.now()}_${++operationCounter.current}`;
  }, []);

  // Join room with enhanced metadata
  const joinRoom = useCallback((roomData: {
    collabId: string;
    roomMetadata: CollabRoomMetadata;
    participants: CollabParticipant[];
  }) => {
    setIsInCollab(true);
    setRoomMetadata(roomData.roomMetadata);
    setParticipants(roomData.participants);
    setLastSyncTimestamp(Date.now());
    
    // Emit join event with enhanced metadata
    socket.emit('enhanced-join-collab-room', {
      ...roomData,
      joinTimestamp: Date.now()
    });
  }, [socket]);

  // Leave room
  const leaveRoom = useCallback(() => {
    if (roomMetadata) {
      socket.emit('enhanced-leave-collab-room', {
        collabId: roomMetadata.collabId,
        leaveTimestamp: Date.now()
      });
    }
    
    setIsInCollab(false);
    setRoomMetadata(null);
    setParticipants([]);
    setCurrentUser(null);
    setPendingOperations([]);
    setLastSyncTimestamp(0);
  }, [socket, roomMetadata]);

  // Add participant
  const addParticipant = useCallback((participant: CollabParticipant) => {
    setParticipants(prev => {
      const exists = prev.find(p => p.userId === participant.userId);
      if (exists) {
        return prev.map(p => p.userId === participant.userId ? participant : p);
      }
      return [...prev, participant];
    });
  }, []);

  // Remove participant
  const removeParticipant = useCallback((userId: string) => {
    setParticipants(prev => prev.filter(p => p.userId !== userId));
  }, []);

  // Update participant
  const updateParticipant = useCallback((userId: string, updates: Partial<CollabParticipant>) => {
    setParticipants(prev => prev.map(p => 
      p.userId === userId ? { ...p, ...updates } : p
    ));
  }, []);

  // Perform file operation with conflict resolution
  const performFileOperation = useCallback(async (operation: Omit<CollabOperation, 'id' | 'timestamp' | 'status'>): Promise<boolean> => {
    if (!isInCollab || !roomMetadata) return false;

    const fullOperation: CollabOperation = {
      ...operation,
      id: generateOperationId(),
      timestamp: Date.now(),
      status: 'pending'
    };

    // Add to pending operations
    setPendingOperations(prev => [...prev, fullOperation]);

    // Set timeout for operation
    const timeout = setTimeout(() => {
      setPendingOperations(prev => prev.map(op => 
        op.id === fullOperation.id ? { ...op, status: 'failed' } : op
      ));
    }, 10000); // 10 second timeout

    operationTimeouts.current.set(fullOperation.id, timeout);

    // Emit operation to other participants
    emitOperation(fullOperation);

    return true;
  }, [isInCollab, roomMetadata, generateOperationId]);

  // Resolve conflict
  const resolveConflict = useCallback((operationId: string, resolution: 'accept' | 'reject') => {
    setPendingOperations(prev => prev.map(op => 
      op.id === operationId ? { ...op, status: resolution === 'accept' ? 'completed' : 'failed' } : op
    ));

    // Clear timeout
    const timeout = operationTimeouts.current.get(operationId);
    if (timeout) {
      clearTimeout(timeout);
      operationTimeouts.current.delete(operationId);
    }

    // Emit resolution
    socket.emit('collab-operation-resolved', {
      operationId,
      resolution,
      timestamp: Date.now()
    });
  }, [socket]);

  // Emit operation
  const emitOperation = useCallback((operation: CollabOperation) => {
    if (!roomMetadata) return;

    socket.emit('enhanced-collab-operation', {
      room: `collabroom_${roomMetadata.collabId}`,
      operation,
      timestamp: Date.now()
    });
  }, [socket, roomMetadata]);

  // Request sync
  const requestSync = useCallback(() => {
    if (!roomMetadata) return;

    setIsSyncing(true);
    socket.emit('request-collab-sync', {
      room: `collabroom_${roomMetadata.collabId}`,
      requesterId: currentUser?.userId,
      timestamp: Date.now()
    });

    // Set sync timeout
    setTimeout(() => {
      setIsSyncing(false);
    }, 5000);
  }, [socket, roomMetadata, currentUser]);

  // End collaboration session
  const endCollabSession = useCallback(() => {
    if (!roomMetadata) return;

    socket.emit('end-collab-session', {
      room: `collabroom_${roomMetadata.collabId}`,
      endedBy: currentUser?.userId,
      timestamp: Date.now()
    });

    leaveRoom();
  }, [socket, roomMetadata, currentUser, leaveRoom]);

  // Transfer ownership
  const transferOwnership = useCallback((newOwnerId: string) => {
    if (!roomMetadata || currentUser?.role !== 'owner') return;

    socket.emit('transfer-collab-ownership', {
      room: `collabroom_${roomMetadata.collabId}`,
      newOwnerId,
      transferredBy: currentUser.userId,
      timestamp: Date.now()
    });
  }, [socket, roomMetadata, currentUser]);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    // Enhanced room events
    const handleUserJoined = (data: { participant: CollabParticipant; timestamp: number }) => {
      console.log('[EnhancedCollab] User joined:', data);
      addParticipant(data.participant);
    };

    const handleUserLeft = (data: { userId: string; timestamp: number }) => {
      console.log('[EnhancedCollab] User left:', data);
      removeParticipant(data.userId);
    };

    const handleOperationReceived = (data: { operation: CollabOperation; timestamp: number }) => {
      console.log('[EnhancedCollab] Operation received:', data);
      
      // Check for conflicts
      const conflictingOps = pendingOperations.filter(op => 
        op.path === data.operation.path && 
        op.type === data.operation.type && 
        op.status === 'pending'
      );

      if (conflictingOps.length > 0) {
        // Handle conflict resolution
        console.log('[EnhancedCollab] Conflict detected:', conflictingOps);
        // For now, accept the operation (could be enhanced with user prompts)
        setPendingOperations(prev => prev.map(op => 
          op.id === data.operation.id ? { ...op, status: 'completed' } : op
        ));
      } else {
        // No conflict, add to pending operations
        setPendingOperations(prev => [...prev, data.operation]);
      }
    };

    const handleOperationResolved = (data: { operationId: string; resolution: string; timestamp: number }) => {
      console.log('[EnhancedCollab] Operation resolved:', data);
      setPendingOperations(prev => prev.map(op => 
        op.id === data.operationId ? { ...op, status: data.resolution as any } : op
      ));
    };

    const handleSyncRequest = (data: { requesterId: string; timestamp: number }) => {
      console.log('[EnhancedCollab] Sync requested:', data);
      // Trigger sync for the requester
      requestSync();
    };

    const handleOwnershipTransferred = (data: { newOwnerId: string; transferredBy: string; timestamp: number }) => {
      console.log('[EnhancedCollab] Ownership transferred:', data);
      updateParticipant(data.newOwnerId, { role: 'owner', permissions: { canEdit: true, canDelete: true, canInvite: true, canCreate: true } });
      updateParticipant(data.transferredBy, { role: 'editor', permissions: { canEdit: true, canDelete: false, canInvite: false, canCreate: true } });
    };

    const handleSessionEnded = (data: { endedBy: string; timestamp: number }) => {
      console.log('[EnhancedCollab] Session ended:', data);
      leaveRoom();
    };

    // Register event listeners
    socket.on('enhanced-user-joined-collab', handleUserJoined);
    socket.on('enhanced-user-left-collab', handleUserLeft);
    socket.on('enhanced-collab-operation', handleOperationReceived);
    socket.on('collab-operation-resolved', handleOperationResolved);
    socket.on('request-collab-sync', handleSyncRequest);
    socket.on('collab-ownership-transferred', handleOwnershipTransferred);
    socket.on('enhanced-collab-session-ended', handleSessionEnded);

    return () => {
      socket.off('enhanced-user-joined-collab', handleUserJoined);
      socket.off('enhanced-user-left-collab', handleUserLeft);
      socket.off('enhanced-collab-operation', handleOperationReceived);
      socket.off('collab-operation-resolved', handleOperationResolved);
      socket.off('request-collab-sync', handleSyncRequest);
      socket.off('collab-ownership-transferred', handleOwnershipTransferred);
      socket.off('enhanced-collab-session-ended', handleSessionEnded);
    };
  }, [socket, addParticipant, removeParticipant, updateParticipant, pendingOperations, requestSync, leaveRoom]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clear all timeouts
      operationTimeouts.current.forEach(timeout => clearTimeout(timeout));
      operationTimeouts.current.clear();
    };
  }, []);

  const value: EnhancedCollabContextType = {
    isInCollab,
    collabId: roomMetadata?.collabId || null,
    roomMetadata,
    participants,
    currentUser,
    pendingOperations,
    lastSyncTimestamp,
    isSyncing,
    socket,
    joinRoom,
    leaveRoom,
    addParticipant,
    removeParticipant,
    updateParticipant,
    performFileOperation,
    resolveConflict,
    emitOperation,
    requestSync,
    endCollabSession,
    transferOwnership
  };

  return (
    <EnhancedCollabContext.Provider value={value}>
      {children}
    </EnhancedCollabContext.Provider>
  );
};

export function useEnhancedCollab() {
  const context = useContext(EnhancedCollabContext);
  if (!context) {
    throw new Error('useEnhancedCollab must be used within an EnhancedCollabProvider');
  }
  return context;
}




