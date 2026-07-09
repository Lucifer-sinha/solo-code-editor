import { useState, useEffect, useRef, useCallback } from 'react'
import { getWebSocketUrl, getApiUrl } from '../config/api'

interface ExecutionSession {
  sessionId: string
  status: 'idle' | 'running' | 'completed' | 'error' | 'stopped' | 'connecting'
  output: string[] // This might become less relevant for real-time streaming
  error?: string
  startTime?: Date
  endTime?: Date
  duration?: number
  stdout?: string
  stderr?: string
  // Removed: webSocket?: WebSocket // Store the WebSocket connection for the session
}

export const useBackendRunner = () => {
  const [sessions, setSessions] = useState<Map<string, ExecutionSession>>(new Map())
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const pollingRefs = useRef<Map<string, NodeJS.Timeout>>(new Map())

  // New state to hold real-time output (if we decide to accumulate it here)
  const [currentOutput, setCurrentOutput] = useState<string>('')
  const activeWebSocketRef = useRef<WebSocket | null>(null); // New: Directly hold the active WebSocket

  const runCode = async (code: string, language: string = 'python', files?: Record<string, string>) => {
    setIsLoading(true)
    
    try {
      // 1. Send code and files to backend for execution
      const response = await fetch(getApiUrl('execute'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          code,
          language,
          ...(files ? { files } : {})
        })
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to start execution')
      }
      
      const result = await response.json() // Expects { sessionId: '...', status: 'running' }
      console.log('Execution initiated:', result)
      const sessionId = result.sessionId
      setCurrentSessionId(sessionId)

      // 2. Establish WebSocket connection for real-time I/O
      const ws = new WebSocket(getWebSocketUrl(`execute/${sessionId}`));
      activeWebSocketRef.current = ws; // Set the active WebSocket immediately

      // Immediately add the new session to the map, status as connecting
      setSessions(prev => {
        const newSessions = new Map(prev);
        newSessions.set(sessionId, {
          sessionId,
          status: 'connecting',
          output: [],
          startTime: new Date(),
          // webSocket: ws // WebSocket instance is now in activeWebSocketRef
        });
        return newSessions;
      });

      ws.onopen = () => {
        console.log(`[Frontend WS] Connected to execution session ${sessionId}`);
      setSessions(prev => {
          const newSessions = new Map(prev);
        newSessions.set(sessionId, {
          sessionId,
            status: 'running',
            output: [], // Output will be streamed, not polled
          startTime: new Date(),
            // webSocket: ws // WebSocket instance is now in activeWebSocketRef
          });
          return newSessions;
        });
      };

      ws.onmessage = (event) => {
        console.log('[Frontend WS] Raw message received:', event.data); // Log raw message
        const msg = JSON.parse(event.data);
        console.log('[Frontend WS] Parsed message:', msg.type, msg.data); // Log parsed type and data

        setCurrentOutput(prev => {
          let newOutput = prev;
          if (msg.type === 'stdout') {
            newOutput += msg.data;
          } else if (msg.type === 'stderr') {
            newOutput += msg.data;
          } else if (msg.type === 'exit') {
            newOutput += `\n[Execution exited with code: ${msg.code}]\n`;
            setSessions(prevSess => {
              const updatedSess = new Map(prevSess);
              const current = updatedSess.get(sessionId);
              if (current) {
                updatedSess.set(sessionId, { ...current, status: 'completed', endTime: new Date() });
              }
              return updatedSess;
            });
          } else if (msg.type === 'error') {
            newOutput += `\n[Execution error: ${msg.message}]\n`;
            setSessions(prevSess => {
              const updatedSess = new Map(prevSess);
              const current = updatedSess.get(sessionId);
              if (current) {
                updatedSess.set(sessionId, { ...current, status: 'error', error: msg.message, endTime: new Date() });
              }
              return updatedSess;
            });
          }
          console.log('[Frontend WS] New currentOutput state:', newOutput); // Log new state
          return newOutput;
        });
      };

      ws.onclose = () => {
        console.log(`[Frontend WS] Disconnected from execution session ${sessionId}`);
        setSessions(prevSess => {
            const updatedSess = new Map(prevSess);
            const current = updatedSess.get(sessionId);
            if (current && current.status === 'running') { // If it was running and closed unexpectedly
                updatedSess.set(sessionId, { ...current, status: 'stopped', endTime: new Date(), error: 'Connection closed unexpectedly' });
            }
            return updatedSess;
        });
        activeWebSocketRef.current = null; // Clear the active WebSocket on close
      };

      ws.onerror = (err) => {
        console.error(`[Frontend WS] WebSocket error for session ${sessionId}:`, err);
        setSessions(prevSess => {
          const updatedSess = new Map(prevSess);
          const current = updatedSess.get(sessionId);
          if (current) {
            updatedSess.set(sessionId, { ...current, status: 'error', error: 'WebSocket error', endTime: new Date() });
          }
          return updatedSess;
        });
        activeWebSocketRef.current = null; // Clear the active WebSocket on error
      };
      
    } catch (error) {
      console.error('Execution error:', error)
      setSessions(prev => {
        const newSessions = new Map(prev)
        if (currentSessionId) {
          const session = newSessions.get(currentSessionId)
          if (session) {
            newSessions.set(currentSessionId, {
              ...session,
              status: 'error',
              error: error instanceof Error ? error.message : 'Unknown error'
            })
          }
        }
        return newSessions
      })
    } finally {
      setIsLoading(false)
    }
  }

  const sendInput = useCallback((input: string) => {
    console.log('[useBackendRunner] sendInput called.', { input }); // DEBUG: Log input being sent
    console.log('[useBackendRunner] sendInput - WebSocket Check:', { wsExists: !!activeWebSocketRef.current, wsReadyState: activeWebSocketRef.current?.readyState }); // DEBUG: Using activeWebSocketRef

    if (activeWebSocketRef.current && activeWebSocketRef.current.readyState === WebSocket.OPEN) {
      activeWebSocketRef.current.send(JSON.stringify({ type: 'stdin', data: input }));
      console.log('[useBackendRunner] sendInput - Input sent successfully.'); // DEBUG
    } else {
      console.warn('Attempted to send input to a non-existent or closed WebSocket.', { wsExists: !!activeWebSocketRef.current, wsReadyState: activeWebSocketRef.current?.readyState }); // DEBUG: More context for warning
    }
  }, [activeWebSocketRef]); // Depend only on the ref itself

  // Remove old polling logic
  useEffect(() => {
    // Cleanup all polling intervals on unmount
    return () => {
      pollingRefs.current.forEach(clearInterval);
    };
  }, []);

  // Stop existing polling if session changes or component unmounts
  useEffect(() => {
    if (currentSessionId) {
      pollingRefs.current.forEach((intervalId, sid) => {
        if (sid !== currentSessionId) {
          clearInterval(intervalId);
          pollingRefs.current.delete(sid);
        }
      });
    }
  }, [currentSessionId]);

  // Stop all polling on component unmount (redundant with above, but good for safety)
  useEffect(() => {
    return () => {
      pollingRefs.current.forEach(clearInterval);
    };
  }, []);

  const getCurrentSession = () => {
    return currentSessionId ? sessions.get(currentSessionId) : null
  }

  const getAllSessions = () => {
    return Array.from(sessions.values())
  }

  const stopExecution = useCallback(() => {
    if (currentSessionId) {
      if (activeWebSocketRef.current) {
        activeWebSocketRef.current.close();
        activeWebSocketRef.current = null; // Clear the ref after closing
      }
      setCurrentSessionId(null);
      setCurrentOutput('');
    }
  }, [currentSessionId, sessions, activeWebSocketRef]); // `sessions` is here for completeness, though not directly used for WS close

  const clearSession = useCallback(() => {
    // Ensure WebSocket is closed if a session is active and being cleared manually
    if (activeWebSocketRef.current) {
      activeWebSocketRef.current.close();
      activeWebSocketRef.current = null;
    }
    setCurrentSessionId(null);
    setCurrentOutput('');
  }, [activeWebSocketRef]);

  return {
    runCode,
    stopExecution,
    clearSession,
    sendInput,
    getCurrentSession,
    getAllSessions,
    currentSessionId,
    setCurrentSessionId,
    isLoading,
    currentOutput,
    sessions
  }
}