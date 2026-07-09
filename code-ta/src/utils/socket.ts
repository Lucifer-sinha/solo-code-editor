import { io, Socket } from "socket.io-client";

// Universal socket URL that works with any deployment scenario
const getSocketUrl = () => {
  // Priority 1: Explicit environment variable (highest priority)
  if (import.meta.env.VITE_SOCKET_URL) {
    return import.meta.env.VITE_SOCKET_URL;
  }
  
  // Priority 2: Backend URL environment variable
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  const { protocol, hostname, port } = window.location;
  
  // Local development scenarios
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    if (port === '3000') {
      return 'http://localhost:5000';
    }
    return `${protocol}//${hostname}:${port || '5000'}`;
  }
  
  // For tunnel services (Serveo, Ngrok, etc.) in development:
  // Frontend is on public URL but backend is still local
  // This is the most common development scenario
  const tunnelDomains = ['.serveo.net', '.ngrok.io', '.loca.lt', '.trycloudflare.com'];
  const isTunnelService = tunnelDomains.some(domain => hostname.includes(domain));
  
  if (isTunnelService) {
    console.log('[Socket] Tunnel service detected, connecting to local backend');
    return 'http://localhost:5000';
  }
  
  // True production deployments (same origin)
  return window.location.origin;
};

const SOCKET_URL = getSocketUrl();
let socket: Socket | null = null;

export function getSocket() {
  if (!socket) {
    console.log('[Socket] Environment Detection:');
    console.log('  - Current URL:', window.location.href);
    console.log('  - Protocol:', window.location.protocol);
    console.log('  - Hostname:', window.location.hostname);
    console.log('  - Port:', window.location.port);
    console.log('  - Socket URL:', SOCKET_URL);
    
    // Universal socket configuration
    const socketOptions: any = { 
      withCredentials: true,
      timeout: 20000,
      forceNew: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      maxReconnectionAttempts: 5
    };
    
    // Environment-specific configuration
    const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isViteDevServer = window.location.port === '3000';
    const isHTTPS = window.location.protocol === 'https:';
    const isLocalBackend = SOCKET_URL.includes('localhost');
    
    // Path configuration - only use proxy path for same-origin connections
    if (isViteDevServer && isLocalBackend) {
      socketOptions.path = '/socket.io/';
      console.log('[Socket] Using Vite proxy path: /socket.io/');
    } else {
      console.log('[Socket] Using default path');
    }
    
    // Transport strategy
    if (isHTTPS && !isLocalBackend) {
      socketOptions.transports = ['websocket', 'polling'];
      socketOptions.upgrade = true;
      console.log('[Socket] HTTPS mode: WebSocket preferred');
    } else {
      socketOptions.transports = ['polling', 'websocket'];
      console.log('[Socket] HTTP/Local mode: Polling preferred');
    }
    
    // CORS handling for cross-origin connections (public frontend -> local backend)
    if (!isLocalDev && isLocalBackend) {
      socketOptions.withCredentials = false; // Disable credentials for cross-origin
      console.log('[Socket] Cross-origin mode: Public frontend -> Local backend');
    }
    
    console.log('[Socket] Final options:', socketOptions);
    
    socket = io(SOCKET_URL, socketOptions);
    
    // Enhanced event logging
    socket.on('connect', () => {
      console.log('✅ [Socket] Connected successfully!');
      console.log('  - Socket ID:', socket?.id);
      console.log('  - Transport:', socket?.io?.engine?.transport?.name);
      console.log('  - URL:', SOCKET_URL);
    });
    
    socket.on('connect_error', (error) => {
      console.error('❌ [Socket] Connection failed:', error.message);
      console.error('  - Error type:', error.type);
      console.error('  - Error description:', error.description);
      console.error('  - Socket URL:', SOCKET_URL);
    });
    
    socket.on('disconnect', (reason) => {
      console.log('⚠️ [Socket] Disconnected:', reason);
    });
    
    socket.on('reconnect', (attemptNumber) => {
      console.log('🔄 [Socket] Reconnected after', attemptNumber, 'attempts');
    });
    
    socket.on('reconnect_error', (error) => {
      console.error('🔄❌ [Socket] Reconnection failed:', error.message);
    });
    
    socket.on('reconnect_failed', () => {
      console.error('💀 [Socket] All reconnection attempts failed');
    });
  }
  return socket;
} 