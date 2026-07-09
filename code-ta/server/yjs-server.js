const { setupWSConnection } = require('y-websocket/bin/utils.js');
const http = require('http');
const WebSocket = require('ws');

const port = 1234;
const server = http.createServer();
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  setupWSConnection(ws, req);
});

server.listen(port, () => {
  console.log(`[Yjs] y-websocket server running on ws://localhost:${port}`);
});