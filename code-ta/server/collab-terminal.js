const WebSocket = require('ws');
const pty = require('node-pty');
const path = require('path');
const fs = require('fs-extra');
const jwt = require('jsonwebtoken');

const USER_ROOT = path.join(__dirname, 'user_files');
const wss = new WebSocket.Server({ noServer: true });

// Map collab_id -> { ptyProcess, clients: Set<ws> }
const collabTerminals = new Map();

function getCollabDir(senderId, collab_id) {
  return path.join(USER_ROOT, senderId, 'collabroom_' + collab_id);
}

wss.on('connection', (ws, req) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    const collab_id = url.searchParams.get('collab_id');
    const senderId = url.searchParams.get('senderId');
    if (!token || !collab_id || !senderId) {
      ws.close();
      return;
    }
    let userId;
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
      userId = decoded.userId;
    } catch (e) {
      ws.close();
      return;
    }
    const collabDir = getCollabDir(senderId, collab_id);
    fs.ensureDirSync(collabDir);

    // Create or join terminal session for this collab_id
    let session = collabTerminals.get(collab_id);
    if (!session) {
      // Start Docker PTY in collabDir
      const dockerImage = 'my-codeserver-polyglot:latest';
      const args = [
        'run', '-it', '--rm',
        '-v', `${collabDir}:/server/collabroom`,
        '-w', '/server/collabroom',
        dockerImage, 'bash'
      ];
      const ptyProcess = pty.spawn('docker', args, {
        name: 'xterm-color',
        cols: 80,
        rows: 24,
        cwd: collabDir,
        env: process.env,
      });
      session = { ptyProcess, clients: new Set() };
      collabTerminals.set(collab_id, session);
      // Broadcast PTY output to all clients
      ptyProcess.on('data', (data) => {
        for (const client of session.clients) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'output', data }));
          }
        }
      });
      ptyProcess.on('exit', () => {
        for (const client of session.clients) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'exit' }));
            client.close();
          }
        }
        collabTerminals.delete(collab_id);
      });
    }
    session.clients.add(ws);

    ws.on('message', (msg) => {
      // Forward input to PTY
      session.ptyProcess.write(msg);
    });
    ws.on('close', () => {
      session.clients.delete(ws);
      if (session.clients.size === 0) {
        session.ptyProcess.kill();
        collabTerminals.delete(collab_id);
      }
    });
    ws.on('error', () => {
      session.clients.delete(ws);
      if (session.clients.size === 0) {
        session.ptyProcess.kill();
        collabTerminals.delete(collab_id);
      }
    });
  } catch (err) {
    ws.close();
  }
});

module.exports = wss; 