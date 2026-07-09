// API Configuration - Dynamic endpoint detection
const getApiBaseUrl = () => {
  // First check for environment variable override
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // For development mode, always use relative URLs when possible
  if (import.meta.env.DEV) {
    return ''; // Use relative URLs in dev mode (handled by Vite proxy)
  }

  // For production, construct URL based on current location
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;

  // Check if we're on localhost or 127.0.0.1
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${protocol}//${hostname}:5000`;
  }

  // For public domains, try same host first (assuming proxy setup)
  // If that fails, fallback to port 5000
  return `${protocol}//${hostname}`;
};

const getWebSocketBaseUrl = () => {
  // First check for environment variable override
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const hostname = window.location.hostname;

  // For development, use relative WebSocket URLs when possible
  if (import.meta.env.DEV) {
    return `${protocol}//${hostname}:${window.location.port || (protocol === 'wss:' ? '443' : '80')}`;
  }

  // Check if we're on localhost or 127.0.0.1
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${protocol}//${hostname}:5000`;
  }

  // For public domains, use same host
  return `${protocol}//${hostname}`;
};

export const API_BASE_URL = getApiBaseUrl();
export const WS_BASE_URL = getWebSocketBaseUrl();

// Utility functions for constructing URLs
export const getApiUrl = (endpoint: string) => {
  if (endpoint.startsWith('/')) {
    endpoint = endpoint.slice(1);
  }

  if (API_BASE_URL === '') {
    return `/api/${endpoint}`;
  }

  return `${API_BASE_URL}/api/${endpoint}`;
};

export const getWebSocketUrl = (endpoint: string) => {
  if (endpoint.startsWith('/')) {
    endpoint = endpoint.slice(1);
  }

  if (import.meta.env.DEV) {
    return `${WS_BASE_URL}/ws/${endpoint}`;
  }

  return `${WS_BASE_URL}/ws/${endpoint}`;
};





console.log('API Base URL:', API_BASE_URL);
console.log('WebSocket Base URL:', WS_BASE_URL);
console.log('Current hostname:', window.location.hostname);
console.log('Development mode:', import.meta.env.DEV);

