const SecureDevServerProxy = require('./secure-proxy');

// Initialize and start the secure proxy server
const proxy = new SecureDevServerProxy();

// Start the proxy server on port 8080
const PROXY_PORT = process.env.PROXY_PORT || 8080;
proxy.start(PROXY_PORT);

console.log(`🚀 Secure Development Server Proxy started on port ${PROXY_PORT}`);
console.log(`📡 Proxy endpoint: http://localhost:${PROXY_PORT}/proxy/{sessionId}`);
console.log(`🔧 Management API: http://localhost:${PROXY_PORT}/api/dev-server/`);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down proxy server...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Shutting down proxy server...');
  process.exit(0);
});