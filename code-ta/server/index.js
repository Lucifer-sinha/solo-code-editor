require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const Docker = require('dockerode');
const compression = require('compression');
const helmet = require('helmet');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const WebSocket = require('ws');
const pty = require('node-pty');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const http = require('http');
const { Server: SocketIOServer } = require('socket.io');
const auth = require('./middleware/auth');
const collabTerminalWSS = require('./collab-terminal');
const terminalWSS = new WebSocket.Server({ noServer: true });
const codeExecutionWSS = new WebSocket.Server({ noServer: true });
// Add after your existing imports
const { GoogleGenerativeAI } = require('@google/generative-ai');
const httpProxy = require('http-proxy-middleware');
const tar = require('tar-stream');
const net = require('net');

// Centralized collaboration path utilities (server-side)
function getCollabFolderName(collabId) {
  return `collabroom_${collabId}`;
}

function normalizeCollabPath(filePath, userId, collabId) {
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

function getCollabRootPath(ownerId, collabId) {
  return path.join(USER_ROOT, ownerId, getCollabFolderName(collabId));
}

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Allow all localhost and 127.0.0.1 origins
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    
    // Allow common tunnel services
    const allowedDomains = [
      '.trycloudflare.com',
      '.ngrok.io', 
      '.loca.lt',
      '.serveo.net',
      '.replit.dev',
      '.gitpod.io',
      '.codespaces.github.com'
    ];
    
    const isAllowed = allowedDomains.some(domain => origin.includes(domain));
    if (isAllowed) {
      return callback(null, true);
    }
    
    // Allow specific environment variable
    if (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL) {
      return callback(null, true);
    }
    
    // For development, allow all origins
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    
    // Default: allow the origin (you can change this to be more restrictive)
    callback(null, true);
  },
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Rate limiting - More generous for collaboration
const rateLimiter = new RateLimiterMemory({
  keyGenerator: (req) => req.ip,
  points: 500, // Increased from 100 to 500 requests
  duration: 60, // Per 60 seconds
});

app.use(async (req, res, next) => {
  try {
    await rateLimiter.consume(req.ip);
    next();
  } catch (rejRes) {
    res.status(429).json({ error: 'Too many requests' });
  }
});

// Initialize Docker
const docker = new Docker();

// MongoDB Atlas connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("✅ MongoDB connected successfully"))
.catch(err => console.error("MongoDB connection error:", err));

// User schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  friendRequests: [{ from: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, date: { type: Date, default: Date.now } }],
});
const User = mongoose.model('User', userSchema);

// Auth endpoints
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: 'Missing fields' });
    const existing = await User.findOne({ $or: [{ username }, { email }] });
    if (existing) return res.status(400).json({ error: 'Username or email already exists' });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = new User({ username, email, passwordHash });
    await user.save();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: 'Invalid username or password' });
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(400).json({ error: 'Invalid username or password' });
    const token = jwt.sign({ userId: user._id, username: user.username }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, username: user.username, email: user.email } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get current user profile
app.get('/api/auth/me', auth, async (req, res) => {
  const user = await User.findById(req.user.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ id: user._id, username: user.username, email: user.email });
});

// Directories
const USER_ROOT = path.join(__dirname, 'user_files');
const SANDBOX_ROOT = path.join(__dirname, 'sandbox');
const PROBLEMS_ROOT = path.join(__dirname, 'problems');

// Ensure directories exist
fs.ensureDirSync(USER_ROOT);
fs.ensureDirSync(SANDBOX_ROOT);
fs.ensureDirSync(PROBLEMS_ROOT);

// Active execution sessions
const activeSessions = new Map();

// Active development servers
const activeDevServers = new Map(); // sessionId -> { port, containerId, userId, expiresAt, framework, language, createdAt }

// Language configurations
const COMMON_IMAGE = 'my-codeserver-polyglot'; // <-- Use your custom image name here

const LANGUAGES = {
  python: {
    extension: '.py',
    image: COMMON_IMAGE,
    command: ['/bin/bash', 'run', 'main.py'],
    timeout: 5000,
    memory: '512m',
    cpu: '1.0'
  },
  python2: {
    extension: '.py',
    image: COMMON_IMAGE,
    command: ['/bin/bash', 'run', 'main.py'],
    timeout: 5000,
    memory: '512m',
    cpu: '1.0'
  },
  javascript: {
    extension: '.js',
    image: COMMON_IMAGE,
    command: ['/bin/bash', 'run', 'main.js'],
    timeout: 5000,
    memory: '512m',
    cpu: '1.0'
  },
  typescript: {
    extension: '.ts',
    image: COMMON_IMAGE,
    command: ['/bin/bash', 'run', 'main.ts'],
    timeout: 8000,
    memory: '512m',
    cpu: '1.0'
  },
  java: {
    extension: '.java',
    image: COMMON_IMAGE,
    command: ['/bin/bash', 'run', 'Main.java'],
    timeout: 10000,
    memory: '1g',
    cpu: '1.0'
  },
  cpp: {
    extension: '.cpp',
    image: COMMON_IMAGE,
    command: ['/bin/bash', 'run', 'main.cpp'],
    timeout: 8000,
    memory: '1g',
    cpu: '1.0'
  },
  c: {
    extension: '.c',
    image: COMMON_IMAGE,
    command: ['/bin/bash', 'run', 'main.c'],
    timeout: 8000,
    memory: '1g',
    cpu: '1.0'
  },
  csharp: {
    extension: '.cs',
    image: COMMON_IMAGE,
    command: ['/bin/bash', 'run', 'main.cs'],
    timeout: 10000,
    memory: '1g',
    cpu: '1.0'
  },
  go: {
    extension: '.go',
    image: COMMON_IMAGE,
    command: ['/bin/bash', 'run', 'main.go'],
    timeout: 8000,
    memory: '1g',
    cpu: '1.0'
  },
  rust: {
    extension: '.rs',
    image: COMMON_IMAGE,
    command: ['/bin/bash', 'run', 'main.rs'],
    timeout: 15000,
    memory: '1g',
    cpu: '1.0'
  },
  php: {
    extension: '.php',
    image: COMMON_IMAGE,
    command: ['/bin/bash', 'run', 'main.php'],
    timeout: 5000,
    memory: '512m',
    cpu: '1.0'
  },
  ruby: {
    extension: '.rb',
    image: COMMON_IMAGE,
    command: ['/bin/bash', 'run', 'main.rb'],
    timeout: 5000,
    memory: '512m',
    cpu: '1.0'
  },
  swift: {
    extension: '.swift',
    image: COMMON_IMAGE,
    command: ['/bin/bash', 'run', 'main.swift'],
    timeout: 10000,
    memory: '1g',
    cpu: '1.0'
  },
  kotlin: {
    extension: '.kt',
    image: COMMON_IMAGE,
    command: ['/bin/bash', 'run', 'main.kt'],
    timeout: 15000,
    memory: '1g',
    cpu: '1.0'
  },
  scala: {
    extension: '.scala',
    image: COMMON_IMAGE,
    command: ['/bin/bash', 'run', 'main.scala'],
    timeout: 15000,
    memory: '1g',
    cpu: '1.0'
  },
  bash: {
    extension: '.sh',
    image: COMMON_IMAGE,
    command: ['/bin/bash', 'run', 'main.sh'],
    timeout: 5000,
    memory: '512m',
    cpu: '1.0'
  }
};

// Helper functions
function safePath(relPath, userId) {
  if (!userId) throw new Error('User ID required');
  const userDir = path.join(USER_ROOT, userId);
  const resolved = path.resolve(userDir, relPath || '.');
  if (!resolved.startsWith(userDir)) throw new Error('Invalid path');
  return resolved;
}

// Secure Development Server Helper Functions
async function createSecureDevServer(sessionId, code, language, framework, userId) {
  const containerPort = getPortForFramework(framework || language);
  const hostPort = await findAvailablePort();
  
  // Create secure container configuration
  const containerConfig = {
    Image: getSecureDevImage(language, framework),
    Cmd: getDevStartCommand(language, framework),
    ExposedPorts: {
      [`${containerPort}/tcp`]: {}
    },
    HostConfig: {
      PortBindings: {
        [`${containerPort}/tcp`]: [{ HostPort: hostPort.toString() }]
      },
      Memory: 512 * 1024 * 1024, // 512MB limit
      CpuShares: 512, // CPU limit
      NetworkMode: 'bridge',
      ReadonlyRootfs: false,
      SecurityOpt: ['no-new-privileges:true'],
      CapDrop: ['ALL'],
      CapAdd: ['CHOWN', 'SETGID', 'SETUID'], // Minimal required capabilities
      Tmpfs: {
        '/tmp': 'rw,noexec,nosuid,size=100m'
      }
    },
    WorkingDir: '/app',
    Env: [
      `NODE_ENV=development`,
      `PORT=${containerPort}`,
      `HOST=0.0.0.0`,
      `VITE_HOST=0.0.0.0`,
      `VITE_PORT=${containerPort}`
    ]
  };

  // Create and start container
  const container = await docker.createContainer(containerConfig);
  
  // Write code to container
  await writeCodeToDevContainer(container, code, language, framework);
  
  await container.start();
  
  // Wait for server to be ready
  await waitForDevServerReady(hostPort, 60000); // 60 second timeout for npm install
  
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
  const createdAt = new Date();
  
  // Store server info
  activeDevServers.set(sessionId, {
    port: hostPort,
    containerId: container.id,
    userId,
    expiresAt,
    createdAt,
    language,
    framework: framework || language
  });

  console.log(`[DEV-SERVER] Created secure dev server ${sessionId} on port ${hostPort}`);

  return {
    port: hostPort,
    containerId: container.id,
    expiresAt
  };
}

async function writeCodeToDevContainer(container, code, language, framework) {
  const files = generateDevProjectFiles(code, language, framework);
  
  for (const [filePath, content] of Object.entries(files)) {
    const tarStream = createTarStream(filePath, content);
    await container.putArchive(tarStream, { path: '/app' });
  }
}

function generateDevProjectFiles(code, language, framework) {
  const files = {};
  
  switch (framework) {
    case 'react':
      files['package.json'] = JSON.stringify({
        name: 'secure-dev-app',
        version: '1.0.0',
        private: true,
        dependencies: {
          'react': '^18.2.0',
          'react-dom': '^18.2.0',
          'vite': '^4.0.0',
          '@vitejs/plugin-react': '^3.0.0'
        },
        scripts: {
          'dev': 'vite --host 0.0.0.0 --port $PORT',
          'build': 'vite build'
        }
      }, null, 2);
      
      files['vite.config.js'] = `
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: process.env.PORT || 3000,
    strictPort: true
  }
})`;
      
      files['index.html'] = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Secure Dev App</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>`;
      
      files['src/main.jsx'] = `
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)`;
      
      files['src/App.jsx'] = code;
      break;
      
    case 'vue':
      files['package.json'] = JSON.stringify({
        name: 'secure-vue-app',
        version: '1.0.0',
        dependencies: {
          'vue': '^3.0.0',
          'vite': '^4.0.0',
          '@vitejs/plugin-vue': '^4.0.0'
        },
        scripts: {
          'dev': 'vite --host 0.0.0.0 --port $PORT'
        }
      }, null, 2);
      
      files['vite.config.js'] = `
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: process.env.PORT || 3000,
    strictPort: true
  }
})`;
      
      files['index.html'] = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Secure Vue App</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>`;
      
      files['src/main.js'] = `
import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')`;
      
      files['src/App.vue'] = code;
      break;
      
    case 'html':
      files['index.html'] = code;
      files['server.py'] = `
import http.server
import socketserver
import os

PORT = int(os.environ.get('PORT', 8000))

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('X-Frame-Options', 'SAMEORIGIN')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

with socketserver.TCPServer(("0.0.0.0", PORT), MyHTTPRequestHandler) as httpd:
    print(f"Server running on port {PORT}")
    httpd.serve_forever()
`;
      break;
      
    default:
      files['index.js'] = code;
      files['package.json'] = JSON.stringify({
        name: 'secure-node-app',
        version: '1.0.0',
        main: 'index.js',
        scripts: {
          'start': 'node index.js'
        }
      }, null, 2);
  }
  
  return files;
}

function createTarStream(filePath, content) {
  const tar = require('tar-stream');
  const pack = tar.pack();
  
  pack.entry({ name: filePath }, content);
  pack.finalize();
  
  return pack;
}

function getSecureDevImage(language, framework) {
  // Use secure, minimal base images
  const images = {
    'react': 'node:18-alpine',
    'vue': 'node:18-alpine',
    'html': 'python:3.11-alpine',
    'javascript': 'node:18-alpine',
    'typescript': 'node:18-alpine'
  };
  
  return images[framework] || images[language] || 'node:18-alpine';
}

function getDevStartCommand(language, framework) {
  const commands = {
    'react': ['sh', '-c', 'npm install && npm run dev'],
    'vue': ['sh', '-c', 'npm install && npm run dev'],
    'html': ['python3', 'server.py'],
    'javascript': ['sh', '-c', 'npm install && npm start'],
    'typescript': ['sh', '-c', 'npm install && npm start']
  };
  
  return commands[framework] || commands[language] || ['sh', '-c', 'npm start'];
}

function getPortForFramework(framework) {
  const ports = {
    'react': 3000,
    'vue': 3000,
    'html': 8000,
    'javascript': 3000,
    'typescript': 3000
  };
  
  return ports[framework] || 3000;
}

async function findAvailablePort() {
  const net = require('net');
  
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

async function waitForDevServerReady(port, timeout = 60000) {
  const net = require('net');
  const startTime = Date.now();
  
  return new Promise((resolve, reject) => {
    const checkConnection = () => {
      if (Date.now() - startTime > timeout) {
        reject(new Error('Dev server startup timeout'));
        return;
      }
      
      const socket = new net.Socket();
      socket.setTimeout(2000);
      
      socket.on('connect', () => {
        socket.destroy();
        resolve();
      });
      
      socket.on('error', () => {
        setTimeout(checkConnection, 2000);
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        setTimeout(checkConnection, 2000);
      });
      
      socket.connect(port, 'localhost');
    };
    
    checkConnection();
  });
}

async function stopSecureDevServer(sessionId, userId) {
  const server = activeDevServers.get(sessionId);
  
  if (!server || server.userId !== userId) {
    throw new Error('Server not found or access denied');
  }
  
  try {
    const container = docker.getContainer(server.containerId);
    await container.stop({ t: 5 }); // 5 second grace period
    await container.remove();
    console.log(`[DEV-SERVER] Stopped container ${server.containerId}`);
  } catch (error) {
    console.error(`[DEV-SERVER] Error stopping container:`, error);
  }
  
  activeDevServers.delete(sessionId);
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    docker: docker.listContainers ? 'available' : 'unavailable'
  });
});

// Get supported languages
app.get('/api/languages', (req, res) => {
  const languages = Object.keys(LANGUAGES).map(key => ({
    id: key,
    name: key.charAt(0).toUpperCase() + key.slice(1),
    extension: LANGUAGES[key].extension,
    image: LANGUAGES[key].image
  }));
  res.json(languages);
});

// --- Secure Development Server Endpoints ---
// Create secure dev server for React/HTML/Vue apps
app.post('/api/dev-server/create', auth, async (req, res) => {
  try {
    const { code, language, framework } = req.body;
    const userId = req.user.userId;
    
    if (!code || !language) {
      return res.status(400).json({ error: 'Code and language are required' });
    }

    // Validate framework
    const supportedFrameworks = ['react', 'vue', 'html', 'javascript', 'typescript'];
    if (framework && !supportedFrameworks.includes(framework)) {
      return res.status(400).json({ error: 'Unsupported framework' });
    }

    const sessionId = uuidv4();
    const result = await createSecureDevServer(sessionId, code, language, framework, userId);
    
    res.json({
      success: true,
      sessionId,
      proxyUrl: `http://localhost:${PORT}/proxy/${sessionId}`,
      internalPort: result.port,
      containerId: result.containerId,
      expiresAt: result.expiresAt,
      message: 'Development server created successfully'
    });
  } catch (error) {
    console.error('[DEV-SERVER] Error creating dev server:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get dev server status
app.get('/api/dev-server/:sessionId/status', auth, (req, res) => {
  const { sessionId } = req.params;
  const userId = req.user.userId;
  const server = activeDevServers.get(sessionId);
  
  if (!server || server.userId !== userId) {
    return res.status(404).json({ error: 'Server not found' });
  }

  res.json({
    sessionId,
    status: 'running',
    proxyUrl: `http://localhost:${PORT}/proxy/${sessionId}`,
    expiresAt: server.expiresAt,
    framework: server.framework,
    language: server.language
  });
});

// Stop dev server
app.delete('/api/dev-server/:sessionId', auth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.userId;
    
    await stopSecureDevServer(sessionId, userId);
    res.json({ success: true, message: 'Development server stopped' });
  } catch (error) {
    console.error('[DEV-SERVER] Error stopping dev server:', error);
    res.status(500).json({ error: error.message });
  }
});

// List active dev servers for user
app.get('/api/dev-server/list', auth, (req, res) => {
  const userId = req.user.userId;
  const userServers = [];
  
  for (const [sessionId, server] of activeDevServers.entries()) {
    if (server.userId === userId) {
      userServers.push({
        sessionId,
        proxyUrl: `http://localhost:${PORT}/proxy/${sessionId}`,
        framework: server.framework,
        language: server.language,
        expiresAt: server.expiresAt,
        createdAt: server.createdAt
      });
    }
  }
  
  res.json({ servers: userServers });
});

// --- File System Endpoints ---
// List directory tree (authoritative handler)
app.get('/api/fs/list', auth, (req, res) => {
  let relPath = req.query.path || '';
  const userId = req.user.userId;
  const collab_id = req.query.collab_id;
  const senderId = req.query.senderId;
  const root = getScopedRoot(userId, collab_id, senderId);
  if (collab_id) {
    relPath = stripCollabroomPrefix(relPath, collab_id);
  }
  const dirPath = path.resolve(root, relPath || '.');
  try {
    function readDirTree(dir) {
      if (!fs.existsSync(dir)) {
        return { name: path.basename(dir), type: 'directory', children: [] };
      }
      const stats = fs.statSync(dir);
      if (stats.isDirectory()) {
        const children = fs.readdirSync(dir);
        return {
          name: path.basename(dir),
          type: 'directory',
          children: children.map(child => readDirTree(path.join(dir, child)))
        };
      } else {
        return { name: path.basename(dir), type: 'file' };
      }
    }
    if (collab_id) {
      if (!fs.existsSync(root)) {
        fs.mkdirSync(root, { recursive: true });
      }
    } else {
      const userDir = path.join(USER_ROOT, userId);
      if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir, { recursive: true });
      }
    }
    const tree = readDirTree(dirPath);
    return res.json(tree);
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Failed to list directory' });
  }
});

app.get('/api/fs/file', auth, (req, res) => {
  try {
    const userId = req.user.userId;
    let filePath = req.query.path;
    const collab_id = req.query.collab_id;
    const senderId = req.query.senderId;
    const root = getScopedRoot(userId, collab_id, senderId);

    // Collabroom access logic
    if (filePath && filePath.includes('collabroom_')) {
      const match = filePath.match(/^(.*?)\/collabroom_([\w\d_\-]+)/);
      if (match) {
        const senderId = match[1];
        if (userId !== senderId && !filePath.includes(userId)) {
          return res.status(403).json({ error: 'Forbidden: Not a collab participant' });
        }
      }
    }

    // Strip /user_files/ prefix if present
    if (filePath && filePath.startsWith('/user_files/')) {
      filePath = filePath.replace(/^\/user_files\/[^\/]+\/?/, '');
    }

    const resolvedPath = path.resolve(root, filePath);

    if (!fs.existsSync(resolvedPath) || fs.statSync(resolvedPath).isDirectory()) {
      return res.status(404).json({ error: 'File not found' });
    }

    const content = fs.readFileSync(resolvedPath, 'utf8');
    res.json({ content });
  } catch (e) {
    console.error('[FS] Error in /api/fs/file:', e);
    res.status(500).json({ error: e.message });
  }
});



app.put('/api/fs/file', auth, (req, res) => {
  try {
    const userId = req.user.userId;
    let filePath = req.body.path;
    const collab_id = req.body.collab_id;
    const senderId = req.body.senderId;
    
    // Strip /user_files/ prefix if present
    if (filePath && filePath.startsWith('/user_files/')) {
      filePath = filePath.replace(/^\/user_files\/[^\/]+\/?/, '');
    }
    
    const resolvedPath = path.resolve(getScopedRoot(userId, collab_id, senderId), filePath);
    
    console.log('[SAVE] Writing to:', resolvedPath, 'Content length:', (req.body.content || '').length);
    
    if (!fs.existsSync(resolvedPath) || fs.statSync(resolvedPath).isDirectory()) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    fs.writeFileSync(resolvedPath, req.body.content || '');
    res.json({ success: true });
    // Emit file-tree-update for real-time updates
    if (collab_id) {
      io.to('collabroom_' + collab_id).emit('file-tree-update');
    } else {
      io.to(userId).emit('file-tree-update');
    }
  } catch (e) {
    console.error('[FS] Error in /api/fs/file PUT:', e);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/fs', auth, (req, res) => {
  try {
    const userId = req.user.userId;
    let targetPath = req.body.path;
    const collab_id = req.body.collab_id;
    const senderId = req.body.senderId;
    
    // Strip /user_files/ prefix if present
    if (targetPath && targetPath.startsWith('/user_files/')) {
      targetPath = targetPath.replace(/^\/user_files\/[^\/]+\/?/, '');
    }
    
    const resolvedPath = path.resolve(getScopedRoot(userId, collab_id, senderId), targetPath);
    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: 'Not found' });
    }
    
    const stats = fs.statSync(resolvedPath);
    if (stats.isDirectory()) {
      fs.removeSync(resolvedPath);
    } else {
      fs.unlinkSync(resolvedPath);
    }
    res.json({ success: true });
    // Emit file-tree-update for real-time updates
    if (collab_id) {
      io.to('collabroom_' + collab_id).emit('file-tree-update');
    } else {
      io.to(userId).emit('file-tree-update');
    }
  } catch (e) {
    console.error('[FS] Error in /api/fs DELETE:', e);
    res.status(500).json({ error: e.message });
  }
});


app.put('/api/fs/rename', auth, (req, res) => {
  try {
    const userId = req.user.userId;
    let oldPath = req.body.oldPath;
    let newPath = req.body.newPath;
    const collab_id = req.body.collab_id;
    const senderId = req.body.senderId;
    // Normalize paths
    if (oldPath && oldPath.startsWith('/user_files/')) {
      oldPath = oldPath.replace(/^\/user_files\/[^\/]+\/?/, '');
    }
    if (newPath && newPath.startsWith('/user_files/')) {
      newPath = newPath.replace(/^\/user_files\/[^\/]+\/?/, '');
    }
    const resolvedOldPath = path.resolve(getScopedRoot(userId, collab_id, senderId), oldPath);
    const resolvedNewPath = path.resolve(getScopedRoot(userId, collab_id, senderId), newPath);
    if (!fs.existsSync(resolvedOldPath)) {
      return res.status(404).json({ error: 'Not found' });
    }
    fs.renameSync(resolvedOldPath, resolvedNewPath);
    res.json({ success: true });
    // Emit file-tree-update for real-time updates
    if (collab_id) {
      io.to('collabroom_' + collab_id).emit('file-tree-update');
    } else {
      io.to(userId).emit('file-tree-update');
    }
  } catch (e) {
    console.error('[FS] Error in /api/fs/rename:', e);
    res.status(500).json({ error: e.message });
  }
});

// Execute code with Docker isolation
app.post('/api/execute', async (req, res) => {
  const { code, language, input, testCases, files } = req.body;

  console.log(`[DEBUG] Received code for execution (language: ${language}):`);
  console.log(code ? code.substring(0, 200) + '...' : 'No code provided'); // Log first 200 chars
  
  if ((!code && !files) || !language) {
    return res.status(400).json({ error: 'Code or files and language are required' });
  }
  
  if (!LANGUAGES[language]) {
    return res.status(400).json({ error: 'Unsupported language' });
  }
  
  const executionId = uuidv4();
  const sandboxDir = path.join(SANDBOX_ROOT, executionId);
  
  try {
    // Create sandbox directory
    await fs.ensureDir(sandboxDir);
    
    const langConfig = LANGUAGES[language];
    let mainFilePath;
    
    // Multi-file support
    if (Array.isArray(files) && files.length > 0) {
      for (const file of files) {
        const absPath = path.join(sandboxDir, file.path);
        await fs.ensureDir(path.dirname(absPath));
        await fs.writeFile(absPath, file.content);
        console.log(`[DEBUG] Wrote file: ${absPath}`);
        if (file.path === `main${langConfig.extension}`) {
          mainFilePath = absPath;
        }
      }
    } else if (code) {
      // Fallback: single file mode
      const fileName = `main${langConfig.extension}`;
      mainFilePath = path.join(sandboxDir, fileName);
      await fs.writeFile(mainFilePath, code);
      console.log(`[DEBUG] Wrote main file: ${mainFilePath}`);
    }

    // Copy the run script into the sandbox and make it executable
    await fs.copyFile(path.join(__dirname, '..', 'run'), path.join(sandboxDir, 'run'));
    await fs.chmod(path.join(sandboxDir, 'run'), 0o755);

    // Log all files in sandbox
    const sandboxFiles = await fs.readdir(sandboxDir);
    console.log(`[DEBUG] Files in sandbox:`, sandboxFiles);

    // Prepare Docker command
    const image = langConfig.image;
    const command = langConfig.command;
    console.log(`[DEBUG] Docker image: ${image}`);
    console.log(`[DEBUG] Docker command: ${command}`);
    console.log(`[DEBUG] Sandbox dir: ${sandboxDir}`);

    // Run Docker container
      const dockerCmd = typeof command === 'string' ? ['/bin/sh', '-c', command] : command;
    const container = await docker.createContainer({
        Image: image,
        Cmd: dockerCmd,
        HostConfig: {
          Binds: [`${sandboxDir}:/sandbox`],
        },
        WorkingDir: '/sandbox',
      OpenStdin: true,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true, // Enable TTY for interactive input/output
      });

    // Attach to the container's stdio and start it
    const stream = await container.attach({ stream: true, stdin: true, stdout: true, stderr: true });
      await container.start();

    // Add a small delay to allow stream to fully attach and container to initialize
    await new Promise(resolve => setTimeout(resolve, 100)); 

    // Store session information with container and stream
      activeSessions.set(executionId, {
        language,
        sandboxDir,
        startTime: new Date(),
        status: 'running',
      container: container, // Store container object for later management (stop/remove)
      containerStream: stream, // Store stream for WebSocket piping
        testCases: testCases || []
      });

    // Pipe input if provided, and ensure stdin is closed
    if (input) {
      console.log(`[DEBUG] Writing input to container ${container.id}.`);
      stream.write(input);
    }
    // DO NOT end stdin here! Keep it open for real-time input.

    // Handle container exit and fetch final logs
    container.wait().then(async (result) => {
      const exitCode = result.StatusCode;
      console.log(`[WS-EXEC] Container ${container.id} exited with status code: ${exitCode}`);

      // Get full logs after container exit
      const logStream = await container.logs({ stdout: true, stderr: true, follow: false });
      let stdout = '';
      let stderr = '';

      // Process log stream to separate stdout and stderr (expecting 8-byte header with Tty: false)
      const logBuffer = Buffer.from(logStream);
      let offset = 0;
      while (offset < logBuffer.length) {
        const type = logBuffer.readUInt8(offset);
        const size = logBuffer.readUInt32BE(offset + 4);
        const data = logBuffer.toString('utf8', offset + 8, offset + 8 + size);
        
        if (type === 1) { // stdout
          stdout += data;
        } else if (type === 2) { // stderr
          stderr += data;
        }
        offset += 8 + size;
      }

      // Send final output to client
      const ws = activeExecutionSockets.get(executionId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        if (stdout) {
          ws.send(JSON.stringify({ type: 'stdout', data: stdout }));
          console.log('[EXEC OUTPUT]', stdout);
        }
        if (stderr) {
          ws.send(JSON.stringify({ type: 'stderr', data: stderr }));
          console.error('[EXEC ERROR]', stderr);
        }
        ws.send(JSON.stringify({ type: 'exit', code: exitCode }));
        ws.close();
      }

      // Clean up container
      try {
        await container.remove();
        console.log(`[EXEC] Container ${container.id} removed successfully after exit.`);
      } catch (removeErr) {
        console.warn(`[EXEC] Failed to remove container ${container.id} after exit: ${removeErr.message}`);
      }
      activeSessions.delete(executionId); // Remove session from map
    }).catch((err) => {
      console.error(`[EXEC] Error waiting for container ${container.id}:`, err);
      const ws = activeExecutionSockets.get(executionId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'error', message: err.message }));
        ws.close();
      }
      activeSessions.delete(executionId); // Clean up session on error
    });

    // Return session ID to frontend so it can connect via WebSocket
    res.json({
        sessionId: executionId,
      status: 'running'
    });

  } catch (error) {
    console.error('[ERROR] Docker execution setup error:', error);
    // Ensure sandbox is cleaned up on error
    try {
      await fs.remove(sandboxDir);
    } catch (cleanupErr) {
      console.error(`[ERROR] Failed to clean up sandbox ${sandboxDir} after error:`, cleanupErr);
    }
    res.status(500).json({ 
      error: error.message,
      sessionId: executionId,
      status: 'error'
    });
  }
});

// Execute with test cases (like LeetCode/CodeChef)
app.post('/api/execute/testcases', async (req, res) => {
  const { code, language, testCases } = req.body;
  
  if (!code || !language || !testCases || !Array.isArray(testCases)) {
    return res.status(400).json({ error: 'Code, language, and test cases array are required' });
  }
  
  const results = [];
  
  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    const { input, expectedOutput } = testCase;
    
    try {
      // Execute code with this test case
      const response = await fetch(`http://localhost:${PORT}/api/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language, input })
      });
      
      const result = await response.json();
      
      // Compare output
      const actualOutput = result.stdout.trim();
      const expected = expectedOutput.trim();
      const passed = actualOutput === expected;
      
      results.push({
        testCase: i + 1,
        input,
        expectedOutput: expected,
        actualOutput,
        passed,
        error: result.stderr || null,
        duration: result.duration
      });
      
    } catch (error) {
      results.push({
        testCase: i + 1,
        input,
        expectedOutput,
        actualOutput: null,
        passed: false,
        error: error.message,
        duration: 0
      });
    }
  }
  
  const allPassed = results.every(r => r.passed);
  
  res.json({
    results,
    summary: {
      total: testCases.length,
      passed: results.filter(r => r.passed).length,
      failed: results.filter(r => !r.passed).length,
      allPassed
    }
  });
});

// Get execution status
app.get('/api/execute/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = activeSessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  res.json({
    sessionId: session.sessionId,
    status: session.status,
    output: session.output,
    error: session.error,
    startTime: session.startTime,
    endTime: session.endTime,
    duration: session.duration,
    stdout: session.stdout,
    stderr: session.stderr
  });
});

// Stop execution
app.delete('/api/execute/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const session = activeSessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  try {
    if (session.container) {
      await session.container.stop({ t: 1 }); // Give 1 second to stop gracefully
      await session.container.remove();
      console.log(`[EXEC] Container ${session.container.id} stopped and removed.`);
    }
  } catch (err) {
    console.warn(`[EXEC] Failed to stop/remove container ${sessionId}: ${err.message}`);
  }

  // Clear any associated WebSocket connection for execution
  const ws = activeExecutionSockets.get(sessionId);
  if (ws) {
    ws.close(1000, 'Execution stopped by user');
    activeExecutionSockets.delete(sessionId);
  }

  activeSessions.delete(sessionId);
  res.json({ success: true, message: 'Execution stopped' });
});

// Test endpoint
app.get('/api/execute/test', (req, res) => {
  res.json({ status: 'ok', message: 'Backend /api/execute is present!' });
});

// WebSocket for real-time updates
const wss = new WebSocket.Server({ port: 5001 });

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('WebSocket message:', data);
    } catch (e) {
      console.error('Invalid WebSocket message:', e);
    }
  });
  
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

// --- Code Execution WebSocket Endpoint ---
const activeExecutionSockets = new Map(); // Map sessionId to WebSocket

codeExecutionWSS.on('connection', (ws, req) => {
  const urlParts = req.url.split('/');
  const sessionId = urlParts[urlParts.length - 1]; // Assuming URL is /ws/execute/<sessionId>
  console.log(`[WS-EXEC] Code execution client connected for session: ${sessionId}`);

  const session = activeSessions.get(sessionId);
  if (!session || !session.containerStream) {
    console.error(`[WS-EXEC] No active session or stream found for ${sessionId}. Closing socket.`);
    ws.close();
    return;
  }

  // Store the WebSocket connection
  activeExecutionSockets.set(sessionId, ws);

  // Accumulate all output for this session
  let accumulatedStdout = '';
  let accumulatedStderr = '';

  // Pipe container output (stdout/stderr) to client (plain stream for TTY)
  session.containerStream.on('data', (chunk) => {
    const ws = activeExecutionSockets.get(sessionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'stdout', data: chunk.toString() }));
    }
  });

  // Pipe client input to container (stdin)
  ws.on('message', (message) => {
    try {
      const parsed = JSON.parse(message);
      if (parsed.type === 'stdin') {
        try {
          let inputData = parsed.data;
          // Normalize line endings: replace \r\n or \r with \n
          if (typeof inputData === 'string') {
            inputData = inputData.replace(/\r\n$/, '\n').replace(/\r$/, '\n');
          }
          session.containerStream.write(inputData, (err) => {
            if (err) {
              if (err.code === 'EPIPE') {
                console.warn('[WARN] EPIPE on stdin write, container likely exited.');
              } else {
                console.error('[ERROR] Writing to stdin:', err);
              }
            } else {
              console.log('[DEBUG] Successfully wrote input to container stdin:', JSON.stringify(inputData));
            }
          });
        } catch (err) {
          if (err.code === 'EPIPE') {
            console.warn('[WARN] EPIPE on stdin write, container likely exited.');
          } else {
            console.error('[ERROR] Writing to stdin:', err);
          }
        }
      } else if (parsed.type === 'resize') {
        // Handle resize if container is TTY enabled. For code execution, it usually isn't.
        // If we want to support interactive programs like 'vi', this would be important.
        // For now, most code execution doesn't need resize.
      }
    } catch (e) {
      console.error('[WS-EXEC] Invalid WebSocket message:', e);
    }
  });

  // Handle container exit
  session.container.wait().then(async (result) => {
    const exitCode = result.StatusCode;
    console.log(`[WS-EXEC] Container ${session.container.id} exited with status code: ${exitCode}`);
    // Get full logs after container exit
    const logStream = await session.container.logs({ stdout: true, stderr: true, follow: false });
    let stdout = '';
    let stderr = '';
    // Process log stream to separate stdout and stderr (expecting 8-byte header with Tty: false)
    const logBuffer = Buffer.from(logStream);
    let offset = 0;
    while (offset < logBuffer.length) {
      const type = logBuffer.readUInt8(offset);
      const size = logBuffer.readUInt32BE(offset + 4);
      const data = logBuffer.toString('utf8', offset + 8, offset + 8 + size);
      if (type === 1) { stdout += data; }
      if (type === 2) { stderr += data; }
      offset += 8 + size;
    }
    // Send any missing output (not already sent in real time)
    const ws = activeExecutionSockets.get(sessionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      if (stdout && stdout !== accumulatedStdout) {
        const missingStdout = stdout.replace(accumulatedStdout, '');
        if (missingStdout) ws.send(JSON.stringify({ type: 'stdout', data: missingStdout }));
      }
      if (stderr && stderr !== accumulatedStderr) {
        const missingStderr = stderr.replace(accumulatedStderr, '');
        if (missingStderr) ws.send(JSON.stringify({ type: 'stderr', data: missingStderr }));
      }
    ws.send(JSON.stringify({ type: 'exit', code: exitCode }));
    ws.close();
    }
    // Clean up container
    try {
      await session.container.remove();
      console.log(`[EXEC] Container ${session.container.id} removed successfully after exit.`);
    } catch (removeErr) {
      console.warn(`[EXEC] Failed to remove container ${session.container.id} after exit: ${removeErr.message}`);
    }
    activeSessions.delete(sessionId); // Remove session from map
  }).catch((err) => {
    console.error(`[WS-EXEC] Error waiting for container ${session.container.id}:`, err);
    const ws = activeExecutionSockets.get(sessionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'error', message: err.message }));
    ws.close();
    }
    activeSessions.delete(sessionId); // Clean up session on error
  });

  // Handle client disconnect
  ws.on('close', () => {
    console.log(`[WS-EXEC] Code execution client disconnected for session: ${sessionId}`);
    // Clean up if the client disconnects before container exits
    if (session && session.container) {
      // Attempt to stop and remove the container if it's still running
      session.container.stop({ t: 1 }).then(() => {
        console.log(`[WS-EXEC] Container ${session.container.id} stopped due to client disconnect.`);
        return session.container.remove();
      }).then(() => {
        console.log(`[WS-EXEC] Container ${session.container.id} removed.`);
      }).catch((err) => {
        console.warn(`[WS-EXEC] Failed to stop/remove container ${session.container.id} on disconnect:`, err.message);
      });
    }
    activeExecutionSockets.delete(sessionId);
    activeSessions.delete(sessionId); // Remove session from map
    if (session && session.containerStream) {
      session.containerStream.end();
      console.log(`[DEBUG] Stdin stream ended for container ${session.container.id} on client disconnect.`);
    }
  });
});

// --- Interactive Terminal WebSocket Endpoint ---

const isWSL = process.platform === 'linux' && !!process.env.WSL_DISTRO_NAME;

terminalWSS.on('connection', (ws, req) => {
  // Extract token from query string
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');
  let userId = null;
  if (token) {
    try {
      const decoded = require('jsonwebtoken').verify(token, process.env.JWT_SECRET || 'secret');
      userId = decoded.userId;
      console.log(`[TERMINAL] User authenticated: ${userId}`);
    } catch (e) {
      console.error('[TERMINAL] Token verification failed:', e.message);
      ws.close();
      return;
    }
  }
  if (!userId) {
    console.error('[TERMINAL] No user ID found');
    ws.close();
    return;
  }
  const userDir = path.join(USER_ROOT, userId);
  console.log(`[TERMINAL] User directory: ${userDir}`);
  // Ensure user directory exists
  if (!fs.existsSync(userDir)) {
    console.log(`[TERMINAL] Creating user directory: ${userDir}`);
    fs.mkdirSync(userDir, { recursive: true });
  }
  // Always set cwd to userDir, do not allow changing
  const image = 'my-codeserver-polyglot:latest'; // Or your preferred image
  const args = [
    'run', '-it', '--rm',
    '-v', `${userDir}:/server/user_files`,
    '-w', '/server/user_files',
    image, 'bash'
  ];

  console.log(`[TERMINAL] Docker command: docker ${args.join(' ')}`);

  // Get the container id placeholder for prompt (will be replaced by bash)
  const prompt = '__MY_PROMPT__ ';
  const env = { ...process.env, PS1: prompt };
  const ptyProcess = pty.spawn('docker', args, {
    name: 'xterm-color',
    cols: 80,
    rows: 24,
    cwd: userDir,
    env,
  });

  console.log(`[TERMINAL] PTY process started for user ${userId}`);

  // Add error handler to PTY process
  ptyProcess.on('error', (err) => {
    if (err.code === 'EPIPE') {
      console.warn('[WARN] Suppressed EPIPE error from PTY:', err);
    } else {
      console.error('[PTY ERROR]', err);
    }
  });

  // Timeout: kill PTY after 10 minutes of inactivity
  let timeout = setTimeout(() => {
    ws.send(JSON.stringify({ type: 'output', data: '\r\n[Session timed out]\r\n' }));
    ptyProcess.kill();
    ws.close();
  }, 10 * 60 * 1000);

  // Reset timeout on activity
  const resetTimeout = () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      ws.send(JSON.stringify({ type: 'output', data: '\r\n[Session timed out]\r\n' }));
      ptyProcess.kill();
      ws.close();
    }, 10 * 60 * 1000);
  };

  // Send PTY output to client
  ptyProcess.on('data', (data) => {
    ws.send(JSON.stringify({ type: 'output', data }));
    resetTimeout();
  });

  // Log PTY exit and close WebSocket
  ptyProcess.on('exit', (code, signal) => {
    console.log(`[PTY] Process exited with code ${code} and signal ${signal}`);
    ws.send(JSON.stringify({ type: 'output', data: `\r\n[Terminal session ended. Exit code: ${code}]\r\n` }));
    ws.close();
  });

  // Receive input from client and write to PTY
  ws.on('message', (msg) => {
    try {
      const parsed = JSON.parse(msg);
      if (parsed.type === 'input') {
        ptyProcess.write(parsed.data);
        resetTimeout();
      } else if (parsed.type === 'run') {
        // Run command from Run button
        ptyProcess.write(parsed.data + '\n');
        resetTimeout();
      } else if (parsed.type === 'resize') {
        ptyProcess.resize(parsed.cols, parsed.rows);
      }
    } catch (e) {
      // Ignore malformed messages
    }
  });

  ws.on('close', () => {
    clearTimeout(timeout);
    ptyProcess.kill();
  });
});

// Upgrade HTTP server to handle /ws/terminal AND /ws/execute
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      
      // Allow all localhost and 127.0.0.1 origins
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        return callback(null, true);
      }
      
      // Allow common tunnel services
      const allowedDomains = [
        '.trycloudflare.com',
        '.ngrok.io', 
        '.loca.lt',
        '.serveo.net',
        '.replit.dev',
        '.gitpod.io',
        '.codespaces.github.com'
      ];
      
      const isAllowed = allowedDomains.some(domain => origin.includes(domain));
      if (isAllowed) {
        return callback(null, true);
      }
      
      // Allow specific environment variable
      if (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL) {
        return callback(null, true);
      }
      
      // For development, allow all origins
      if (process.env.NODE_ENV === 'development') {
        return callback(null, true);
      }
      
      // Default: allow the origin
      callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST']
  }
});

// --- Socket.IO Real-Time Collaboration ---
const userSockets = new Map();
const collabRoomTerminals = new Map(); // roomId -> { ptyProcess, users: Set<socket.id> }
// Enhanced multi-user collaboration tracking
// Map: collabId -> { 
//   collabFolder: string, 
//   fileOrDir: any, 
//   participants: Map<userId, { username, role, permissions, joinTimestamp, isOnline }>, 
//   ownerId: string,
//   createdAt: number,
//   roomMetadata: object,
//   pendingOperations: Map<operationId, operation>,
//   lastSyncTimestamp: number
// }
const activeCollabs = new Map();

// Enhanced collaboration room management
const enhancedCollabRooms = new Map(); // roomId -> enhanced room data

// Enhanced collaboration helper functions
async function executeCollabOperation(operation, collabId, senderId) {
  try {
    const { type, path, metadata } = operation;
    const collabFolder = path.join(USER_ROOT, senderId, 'collabroom_' + collabId);
    
    switch (type) {
      case 'create-file':
        const filePath = path.join(collabFolder, path);
        fs.ensureFileSync(filePath);
        if (metadata?.content) {
          fs.writeFileSync(filePath, metadata.content);
        }
        break;
        
      case 'create-directory':
        const dirPath = path.join(collabFolder, path);
        fs.ensureDirSync(dirPath);
        break;
        
      case 'delete':
        const deletePath = path.join(collabFolder, path);
        if (fs.existsSync(deletePath)) {
          fs.removeSync(deletePath);
        }
        break;
        
      case 'rename':
      case 'move-item':
        const oldPath = path.join(collabFolder, metadata.oldPath);
        const newPath = path.join(collabFolder, metadata.newPath);
        if (fs.existsSync(oldPath)) {
          fs.moveSync(oldPath, newPath);
        }
        break;
        
      case 'edit':
        const editPath = path.join(collabFolder, path);
        if (fs.existsSync(editPath) && metadata?.content !== undefined) {
          fs.writeFileSync(editPath, metadata.content);
        }
        break;
    }
    
    return { success: true, operation };
  } catch (error) {
    console.error('[Collab] Operation failed:', error);
    return { success: false, error: error.message, operation };
  }
}

// Enhanced room management functions
function createEnhancedCollabRoom(roomData) {
  const { collabId, ownerId, roomMetadata, participants } = roomData;
  const roomId = `collabroom_${collabId}`;
  
  const enhancedRoom = {
    roomId,
    collabId,
    ownerId,
    roomMetadata,
    participants: new Map(participants.map(p => [p.userId, p])),
    createdAt: Date.now(),
    lastSyncTimestamp: Date.now(),
    pendingOperations: new Map(),
    isActive: true
  };
  
  enhancedCollabRooms.set(roomId, enhancedRoom);
  return enhancedRoom;
}

function getEnhancedCollabRoom(roomId) {
  return enhancedCollabRooms.get(roomId);
}

function updateEnhancedCollabRoom(roomId, updates) {
  const room = enhancedCollabRooms.get(roomId);
  if (room) {
    Object.assign(room, updates);
    room.lastSyncTimestamp = Date.now();
  }
  return room;
}

function removeEnhancedCollabRoom(roomId) {
  return enhancedCollabRooms.delete(roomId);
}

async function checkOperationConflict(room, operation) {
  // Simplified conflict detection - in a real implementation, this would check
  // for concurrent modifications to the same file/path
  return false;
}

io.on('connection', (socket) => {
  console.log('Socket.IO client connected:', socket.id);

  // Enhanced Collaboration Room Management
  // Join collaboration room
  socket.on('join-collab-room', ({ room, userId, username, senderId, roomMetadata }) => {
    console.log(`[DEBUG] join-collab-room received:`, { room, userId, username, senderId, roomMetadata });
    socket.join(room);
    socket.data.collabRoom = room;
    socket.data.userId = userId;
    socket.data.username = username;
    socket.data.senderId = senderId;
    socket.data.roomMetadata = roomMetadata;
    console.log(`[COLLAB] ${username} joined room: ${room}`);
    console.log(`[DEBUG] Socket ${socket.id} joined room ${room}, total rooms: ${socket.rooms.size}`);
    

    
    // Notify other users
    socket.to(room).emit('user-joined-collab', {
      userId,
      username,
      timestamp: Date.now()
    });
  });

  // (Removed duplicate enhanced-join-collab-room handler to fix socket conflicts)

  // Leave collaboration room
  socket.on('leave-collab-room', ({ room, userId }) => {
    socket.leave(room);
    socket.to(room).emit('user-left-collab', {
      userId,
      timestamp: Date.now()
    });
    console.log(`[COLLAB] User ${userId} left room: ${room}`);
  });

  // Enhanced leave room with better cleanup
  socket.on('enhanced-leave-collab-room', ({ room, userId, collabId }) => {
    socket.leave(room);
    console.log(`[ENHANCED-COLLAB] ${userId} left room: ${room}`);
    
    // Notify other users
    socket.to(room).emit('enhanced-participant-left', {
      userId,
      timestamp: Date.now()
    });
    
    // Clean up socket data
    socket.data.collabRoom = null;
    socket.data.roomMetadata = null;
  });

  // Real-time tree updates
  socket.on('collab-tree-update', (data) => {
    console.log('[COLLAB] Tree update broadcast:', data.room);
    socket.to(data.room).emit('collab-tree-update', {
      tree: data.tree,
      updatedBy: data.updatedBy
    });
  });

  // Enhanced collaboration operations with conflict resolution
  socket.on('enhanced-collab-operation', async ({ room, operation, collabId }) => {
    console.log(`[ENHANCED-COLLAB] Operation received:`, operation);
    
    try {
      // Validate operation permissions
      const requesterSocket = io.sockets.sockets.get(socket.id);
      if (!requesterSocket || !requesterSocket.data.userId) {
        socket.emit('enhanced-operation-result', { operation, success: false, error: 'Unauthorized' });
        return;
      }
      
      // Execute the operation (simplified for now)
      const success = await executeCollabOperation(operation, collabId, requesterSocket.data.senderId);
      
      // Notify all participants
      io.to(room).emit('enhanced-operation-result', { operation, success });
      
      if (success) {
        // Emit tree update
        io.to(room).emit('enhanced-tree-update', {
          operation: operation.type,
          path: operation.path,
          updatedBy: operation.userId,
          timestamp: Date.now()
        });
      }
      
    } catch (error) {
      console.error('[ENHANCED-COLLAB] Operation error:', error);
      socket.emit('enhanced-operation-result', { operation, success: false, error: error.message });
    }
  });

  // Enhanced file editing with real-time sync
  socket.on('enhanced-collab-edit', ({ room, operation, collabId }) => {
    console.log(`[ENHANCED-COLLAB] Edit operation:`, operation);
    
    // Broadcast to all other participants
    socket.to(room).emit('enhanced-file-update', {
      content: operation.metadata.content,
      filePath: operation.metadata.filePath,
      userId: operation.userId,
      timestamp: operation.timestamp
    });
  });

  // Enhanced chat messaging
  socket.on('enhanced-collab-chat', ({ room, userId, username, message, timestamp, collabId }) => {
    console.log(`[ENHANCED-COLLAB] Chat message from ${username}:`, message);
    
    // Broadcast to all participants
    io.to(room).emit('enhanced-chat-message', {
      userId,
      username,
      message,
      timestamp
    });
  });

  // Enhanced session management
  socket.on('enhanced-end-collab-session', ({ room, endedBy, collabId, timestamp }) => {
    console.log(`[ENHANCED-COLLAB] Session ended by ${endedBy} in room ${room}`);
    
    // Notify all participants
    io.to(room).emit('enhanced-session-ended', {
      endedBy,
      timestamp
    });
    
    // Clean up room data
    activeCollabs.delete(collabId);
  });

  // Real-time file operations
  socket.on('collab-file-created', (data) => {
    console.log('[COLLAB] File created:', data.path);
    socket.to(data.room).emit('collab-file-operation', {
      operation: 'create',
      path: data.path,
      success: true,
      createdBy: data.createdBy
    });
  });

  socket.on('collab-directory-created', (data) => {
    console.log('[COLLAB] Directory created:', data.path);
    socket.to(data.room).emit('collab-file-operation', {
      operation: 'mkdir',
      path: data.path,
      success: true,
      createdBy: data.createdBy
    });
  });

  socket.on('collab-item-deleted', (data) => {
    console.log('[COLLAB] Item deleted:', data.path);
    socket.to(data.room).emit('collab-file-operation', {
      operation: 'delete',
      path: data.path,
      success: true,
      deletedBy: data.deletedBy
    });
  });

  socket.on('collab-item-renamed', (data) => {
    console.log('[COLLAB] Item renamed:', data.oldPath, '->', data.newPath);
    socket.to(data.room).emit('collab-file-operation', {
      operation: 'rename',
      oldPath: data.oldPath,
      newPath: data.newPath,
      success: true,
      renamedBy: data.renamedBy
    });
  });

  // Real-time file saving
  socket.on('collab-file-saved', (data) => {
    console.log('[COLLAB] File saved:', data.path);
    socket.to(data.room).emit('collab-file-saved', {
      path: data.path,
      content: data.content,
      savedBy: data.savedBy
    });
  });

  // Enhanced session end
  socket.on('collab-session-ended', (data) => {
    console.log('[COLLAB] Session ended by:', data.endedBy);
    socket.to(data.room).emit('collab-session-ended', {
      endedBy: data.endedBy,
      timestamp: Date.now()
    });
  });

  // Debug socket connection
  console.log(`[DEBUG] Socket connected: ${socket.id}, userId: ${socket.data?.userId}`);



  // Participant management events
  socket.on('collab-add-participant', ({ collabId, room, newParticipantId, newParticipantUsername, addedBy, timestamp }) => {
    console.log(`[DEBUG] collab-add-participant received:`, { collabId, room, newParticipantId, newParticipantUsername, addedBy, timestamp });
    console.log(`[COLLAB] Adding participant ${newParticipantUsername} to ${room}`);
    
    // Broadcast to all current participants
    console.log(`[DEBUG] Broadcasting collab-participant-added to room: ${room}`);
    io.to(room).emit('collab-participant-added', {
      collabId,
      newParticipantId,
      newParticipantUsername,
      addedBy,
      timestamp
    });
    
    // Send collaboration invitation to the new participant
    console.log(`[DEBUG] Sending collab-session-start to participant: ${newParticipantId}`);
    io.to(newParticipantId).emit('collab-session-start', {
      fileOrDir: {
        from: addedBy,
        to: newParticipantId,
        title: 'Collaboration Session',
        type: 'collaboration'
      },
      collabId,
      users: [addedBy, newParticipantId],
      ownerId: addedBy,
      timestamp
    });
    
    console.log(`[COLLAB] Participant ${newParticipantUsername} added and invited to ${room}`);
  });
  
  socket.on('collab-remove-participant', ({ collabId, room, participantId, participantUsername, removedBy, timestamp }) => {
    console.log(`[DEBUG] collab-remove-participant received:`, { collabId, room, participantId, participantUsername, removedBy, timestamp });
    console.log(`[COLLAB] Removing participant ${participantUsername} from ${room}`);
    
    // Check how many sockets are in the room
    const roomSockets = io.sockets.adapter.rooms.get(room);
    console.log(`[DEBUG] Room ${room} has ${roomSockets ? roomSockets.size : 0} sockets`);
    
    // Broadcast to all participants
    console.log(`[DEBUG] Broadcasting collab-participant-removed to room: ${room}`);
    io.to(room).emit('collab-participant-removed', {
      collabId,
      participantId,
      participantUsername,
      removedBy,
      timestamp
    });
    
    // Force the removed participant to leave the room
    const participantSocket = [...io.sockets.sockets.values()].find(s => s.data.userId === participantId);
    if (participantSocket) {
      participantSocket.leave(room);
      console.log(`[COLLAB] Forced ${participantUsername} to leave room ${room}`);
    } else {
      console.log(`[DEBUG] Could not find socket for participant ${participantId}`);
    }
    
    console.log(`[COLLAB] Participant ${participantUsername} removed from ${room}`);
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    const { collabRoom, userId, username } = socket.data;
    if (collabRoom && userId) {
      socket.to(collabRoom).emit('user-left-collab', {
        userId,
        username,
        timestamp: Date.now()
      });
      console.log(`[COLLAB] User ${username} disconnected from room: ${collabRoom}`);
    }
  });

  // User joins their own room for direct events
  socket.on('user-online', ({ username, userId }) => {
    if (userId) {
      socket.join(userId);
      userSockets.set(userId, socket);
      socket.data.userId = userId;
      console.log(`[SOCKET] ${username} (${userId}) joined their personal room. Socket ID: ${socket.id}`);
    }
  });

  socket.on('disconnect', () => {
    const userId = socket.data.userId;
    if (userId) {
      userSockets.delete(userId);
      console.log(`[SOCKET] User ${userId} disconnected and removed from userSockets.`);
    }
  });

  // --- Enhanced Collab Session Start Broadcast ---
  socket.on('collab-session-start', async (data) => {
    console.log('[COLLAB] Enhanced collab-session-start received:', data);
    if (data && data.users && data.fileOrDir) {
      const senderId = data.fileOrDir.from;
      const recipientId = data.fileOrDir.to;
      
      // Use the collabId from the frontend directly for consistency
      // The frontend now generates consistent collabIds using sorted user IDs
      const collabId = data.collabId;
      if (!collabId) {
        console.error('[COLLAB] No collabId provided in collab-session-start');
        return;
      }
      const uniqueUsers = Array.from(new Set(data.users));

      // Enhanced session management with room metadata
      let session = activeCollabs.get(collabId);
      if (!session) {
        if (uniqueUsers.length < 2) {
          console.log('[COLLAB] Waiting for at least two acceptances for collabId:', collabId);
          return;
        }
        
        // Determine the owner - use the original sender from roomMetadata for multi-user collab
        // For single-user collab, use the senderId
        const ownerId = data.roomMetadata?.ownerId || senderId || uniqueUsers[0];
        console.log(`[COLLAB] Using ownerId: ${ownerId} (from roomMetadata: ${data.roomMetadata?.ownerId}, senderId: ${senderId})`);
        
        // Use standardized path utilities
        const collabFolder = getCollabRootPath(ownerId, collabId);
        const senderRoot = path.join(USER_ROOT, ownerId);
        
        try {
          fs.ensureDirSync(collabFolder);
          
          // Normalize the file path consistently
          let relPath = normalizeCollabPath(data.fileOrDir.filePath, ownerId, collabId);
          const srcPath = path.join(senderRoot, relPath);
          const destPath = path.join(collabFolder, relPath);
          
          console.log(`[COLLAB] Path mapping: ${data.fileOrDir.filePath} -> ${relPath}`);
          console.log(`[COLLAB] Source: ${srcPath}, Destination: ${destPath}`);
          
          if (fs.existsSync(destPath)) {
            fs.removeSync(destPath);
          }
          
          if (fs.existsSync(srcPath)) {
            if (fs.statSync(srcPath).isDirectory()) {
              fs.copySync(srcPath, destPath, { overwrite: true, recursive: true });
              console.log(`[COLLAB] Copied directory: ${srcPath} -> ${destPath}`);
            } else {
              fs.copySync(srcPath, destPath, { overwrite: true });
              console.log(`[COLLAB] Copied file: ${srcPath} -> ${destPath}`);
            }
          } else {
            console.warn(`[COLLAB] Source path does not exist: ${srcPath}`);
          }
          
          console.log(`[COLLAB] Created enhanced collab folder: ${collabFolder}`);
        } catch (err) {
          console.error('[COLLAB] Error creating collab folder:', err);
        }
        
        // Enhanced session with metadata
        session = {
          collabFolder,
          fileOrDir: data.fileOrDir,
          participants: new Set(uniqueUsers),
          ownerId: ownerId,
          roomMetadata: data.roomMetadata || {
            collabId,
            ownerId,
            createdAt: Date.now(),
            maxParticipants: uniqueUsers.length,
            fileType: data.fileOrDir.fileType,
            filePath: data.fileOrDir.filePath
          },
          inviteType: data.inviteType || 'single'
        };
        activeCollabs.set(collabId, session);
        console.log(`[COLLAB] Created enhanced session for collabId=${collabId} with owner=${ownerId}`);
      } else {
        // Add new participants to existing session
        uniqueUsers.forEach(u => session.participants.add(u));
      }

      const participants = Array.from(session.participants);
      participants.forEach(userId => {
        io.to(userId).emit('collab-session-start', {
          fileOrDir: session.fileOrDir,
          users: participants,
          collabId,
          roomMetadata: session.roomMetadata,
          inviteType: session.inviteType,
          ownerId: session.ownerId
        });
        console.log(`[COLLAB] Emitted enhanced collab-session-start to userId: ${userId}`);
      });
      console.log(`[COLLAB] Enhanced session ready for collabId=${collabId}; users=`, participants);
    }
  });

  // Join a file room for collaborative editing
  socket.on('join-file', ({ filePath, userId, username }) => {
    socket.join(filePath);
    socket.data.filePath = filePath;
    socket.data.userId = userId;
    socket.data.username = username;
    io.to(filePath).emit('user-joined', { userId, username });
    console.log(`${username} joined file room: ${filePath}`);
  });

  // Collaborative editing: broadcast changes to all users in the same file room
  socket.on('edit-file', ({ filePath, content, userId }) => {
    socket.to(filePath).emit('file-update', { filePath, content, userId });
  });

  // Real-time chat: broadcast messages to all users in the same file room
  socket.on('chat-message', ({ filePath, userId, username, message }) => {
    io.to(filePath).emit('chat-message', { filePath, userId, username, message, timestamp: Date.now() });
  });

  // Leave file room
  socket.on('leave-file', ({ filePath, userId, username }) => {
    socket.leave(filePath);
    io.to(filePath).emit('user-left', { userId, username });
    console.log(`${username} left file room: ${filePath}`);
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    const { filePath, userId, username } = socket.data;
    if (filePath && userId && username) {
      io.to(filePath).emit('user-left', { userId, username });
      console.log(`${username} disconnected from file room: ${filePath}`);
    }
  });

  // --- Collab file sync events ---
  socket.on('collab-file-init', (data) => {
    io.to(data.room).emit('collab-file-init', { filePath: data.filePath, content: data.content });
  });
  socket.on('collab-file-edit', (data) => {
    socket.to(data.room).emit('collab-file-edit', { filePath: data.filePath, content: data.content });
  });

  // --- Direct Messages (DMs) ---
  socket.on('join-dm', ({ room }) => {
    socket.join(room);
    console.log(`[SOCKET] ${socket.id} joined DM room: ${room}`);
  });
  socket.on('leave-dm', ({ room }) => {
    socket.leave(room);
    console.log(`[SOCKET] ${socket.id} left DM room: ${room}`);
  });
  socket.on('dm-message', async (msg) => {
    try {
      if (msg.from && msg.to) {
        // Always sort user IDs for roomId
        const roomId = [msg.from, msg.to].sort().join('_');
        await DMMessage.create({
          roomType: 'dm',
          roomId,
          from: msg.from,
          to: msg.to,
          content: msg.content,
          timestamp: msg.timestamp,
        });
        io.to(roomId).emit('dm-message', { ...msg, room: roomId });
        console.log(`[DM] Message saved to room ${roomId}:`, msg.content);
      }
    } catch (err) {
      console.error('Failed to save DM message:', err);
    }
  });

  // --- Friend System Real-Time Events ---
  socket.on('send-friend-request', (req) => {
    // req: { toUserId, fromUser }
    io.to(req.toUserId).emit('friend-request', req);
  });
  socket.on('accept-friend-request', (data) => {
    // data: { toUserId, friend }
    io.to(data.toUserId).emit('friend-accepted', data.friend);
  });

  // --- Collab Shared Terminal ---
  socket.on('collab-terminal-input', ({ room, data }) => {
    const term = collabRoomTerminals.get(room);
    if (term && term.ptyProcess) {
      term.ptyProcess.write(data);
    }
  });

  socket.on('collab-terminal-open', ({ room, workingDirectory }) => {
    if (!collabRoomTerminals.has(room)) {
      // Start new pty for this room
      const pty = require('node-pty').spawn(process.platform === 'win32' ? 'cmd.exe' : 'bash', [], {
        name: 'xterm-color',
        cols: 80,
        rows: 24,
        cwd: workingDirectory && fs.existsSync(workingDirectory) ? workingDirectory : process.cwd(),
        env: process.env,
      });
      collabRoomTerminals.set(room, { ptyProcess: pty, users: new Set() });
      pty.on('data', (data) => {
        io.to(room).emit('collab-terminal-output', { room, data });
      });
      pty.on('exit', () => {
        collabRoomTerminals.delete(room);
      });
    }
    // Track user
    collabRoomTerminals.get(room).users.add(socket.id);
    socket.join(room);
  });

  socket.on('collab-terminal-resize', ({ room, cols, rows }) => {
    const term = collabRoomTerminals.get(room);
    if (term && term.ptyProcess) {
      term.ptyProcess.resize(cols, rows);
    }
  });

  socket.on('collab-terminal-close', ({ room }) => {
    const term = collabRoomTerminals.get(room);
    if (term) {
      term.users.delete(socket.id);
      if (term.users.size === 0) {
        term.ptyProcess.kill();
        collabRoomTerminals.delete(room);
      }
    }
    socket.leave(room);
  });

  // --- Enhanced Multi-User Collaboration Handlers ---
  // (Duplicate enhanced-join-collab-room handler removed to fix conflicts)

  // Enhanced room leave
  socket.on('enhanced-leave-collab-room', ({ collabId, leaveTimestamp }) => {
    const roomId = `collabroom_${collabId}`;
    socket.leave(roomId);
    
    const enhancedRoom = getEnhancedCollabRoom(roomId);
    if (enhancedRoom) {
      // Update participant status
      const participant = enhancedRoom.participants.get(socket.data.userId);
      if (participant) {
        participant.isOnline = false;
        participant.leaveTimestamp = leaveTimestamp || Date.now();
      }
      
      // Notify other participants
      socket.to(roomId).emit('enhanced-user-left-collab', {
        userId: socket.data.userId,
        timestamp: Date.now()
      });
      
      // Clean up room if no online participants
      const onlineParticipants = Array.from(enhancedRoom.participants.values()).filter(p => p.isOnline);
      if (onlineParticipants.length === 0) {
        removeEnhancedCollabRoom(roomId);
        console.log(`[ENHANCED-COLLAB] Room ${roomId} cleaned up - no online participants`);
      }
    }
    
    console.log(`[ENHANCED-COLLAB] ${socket.data.username} left enhanced room: ${roomId}`);
  });

  // Enhanced collaboration operations
  socket.on('enhanced-collab-operation', async ({ room, operation, timestamp }) => {
    const enhancedRoom = getEnhancedCollabRoom(room);
    if (!enhancedRoom) {
      console.warn(`[ENHANCED-COLLAB] Room ${room} not found for operation`);
      return;
    }
    
    // Check permissions
    const participant = enhancedRoom.participants.get(socket.data.userId);
    if (!participant) {
      console.warn(`[ENHANCED-COLLAB] User ${socket.data.userId} not in room ${room}`);
      return;
    }
    
    // Check operation permissions
    const canPerformOperation = checkOperationPermissions(operation.type, participant.permissions);
    if (!canPerformOperation) {
      socket.emit('collab-operation-denied', {
        operationId: operation.id,
        reason: 'Insufficient permissions',
        timestamp: Date.now()
      });
      return;
    }
    
    // Check for conflicts
    const conflict = checkOperationConflict(enhancedRoom, operation);
    if (conflict) {
      socket.emit('collab-operation-conflict', {
        operationId: operation.id,
        conflictingOperation: conflict,
        timestamp: Date.now()
      });
      return;
    }
    
    // Execute operation
    const result = await executeCollabOperation(operation, enhancedRoom.collabId, enhancedRoom.ownerId);
    
    if (result.success) {
      // Add to pending operations
      enhancedRoom.pendingOperations.set(operation.id, {
        ...operation,
        status: 'completed',
        completedAt: Date.now()
      });
      
      // Broadcast to all participants
      io.to(room).emit('enhanced-collab-operation', {
        operation: {
          ...operation,
          status: 'completed'
        },
        timestamp: Date.now()
      });
      
      // Update last sync timestamp
      enhancedRoom.lastSyncTimestamp = Date.now();
    } else {
      socket.emit('collab-operation-failed', {
        operationId: operation.id,
        error: result.error,
        timestamp: Date.now()
      });
    }
  });

  // Operation conflict resolution
  socket.on('collab-operation-resolved', ({ operationId, resolution, timestamp }) => {
    const roomId = socket.data.enhancedCollabRoom;
    if (!roomId) return;
    
    const enhancedRoom = getEnhancedCollabRoom(roomId);
    if (!enhancedRoom) return;
    
    const operation = enhancedRoom.pendingOperations.get(operationId);
    if (operation) {
      operation.status = resolution;
      operation.resolvedAt = timestamp;
      
      // Broadcast resolution to all participants
      io.to(roomId).emit('collab-operation-resolved', {
        operationId,
        resolution,
        timestamp
      });
    }
  });

  // Sync request handling
  socket.on('request-collab-sync', ({ room, requesterId, timestamp }) => {
    const enhancedRoom = getEnhancedCollabRoom(room);
    if (!enhancedRoom) return;
    
    // Send current state to requester
    socket.to(room).emit('enhanced-collab-sync-response', {
      roomMetadata: enhancedRoom.roomMetadata,
      participants: Array.from(enhancedRoom.participants.values()),
      lastSyncTimestamp: enhancedRoom.lastSyncTimestamp,
      requesterId,
      timestamp: Date.now()
    });
  });

  // Ownership transfer
  socket.on('transfer-collab-ownership', ({ room, newOwnerId, transferredBy, timestamp }) => {
    const enhancedRoom = getEnhancedCollabRoom(room);
    if (!enhancedRoom || enhancedRoom.ownerId !== transferredBy) {
      socket.emit('collab-ownership-transfer-failed', {
        reason: 'Not authorized to transfer ownership',
        timestamp: Date.now()
      });
      return;
    }
    
    // Update ownership
    enhancedRoom.ownerId = newOwnerId;
    
    // Update participant roles
    const newOwner = enhancedRoom.participants.get(newOwnerId);
    const oldOwner = enhancedRoom.participants.get(transferredBy);
    
    if (newOwner) {
      newOwner.role = 'owner';
      newOwner.permissions = { canEdit: true, canDelete: true, canInvite: true, canCreate: true };
    }
    
    if (oldOwner) {
      oldOwner.role = 'editor';
      oldOwner.permissions = { canEdit: true, canDelete: false, canInvite: false, canCreate: true };
    }
    
    // Broadcast ownership transfer
    io.to(room).emit('collab-ownership-transferred', {
      newOwnerId,
      transferredBy,
      timestamp
    });
  });

  // End collaboration session
  socket.on('end-collab-session', ({ room, endedBy, timestamp }) => {
    const enhancedRoom = getEnhancedCollabRoom(room);
    if (!enhancedRoom || enhancedRoom.ownerId !== endedBy) {
      socket.emit('collab-session-end-failed', {
        reason: 'Not authorized to end session',
        timestamp: Date.now()
      });
      return;
    }
    
    // Broadcast session end
    io.to(room).emit('enhanced-collab-session-ended', {
      endedBy,
      timestamp
    });
    
    // Clean up room
    removeEnhancedCollabRoom(room);
  });

  // Helper functions for enhanced collaboration
  function checkOperationPermissions(operationType, permissions) {
    switch (operationType) {
      case 'create-file':
      case 'create-directory':
        return permissions.canCreate;
      case 'delete':
        return permissions.canDelete;
      case 'edit':
      case 'rename':
      case 'move-item':
        return permissions.canEdit;
      default:
        return false;
    }
  }

  socket.on('disconnect', () => {
    // Remove user from all collab terminals
    for (const [room, term] of collabRoomTerminals.entries()) {
      term.users.delete(socket.id);
      if (term.users.size === 0) {
        term.ptyProcess.kill();
        collabRoomTerminals.delete(room);
      }
    }
  });

  // --- CollabRoom File Explorer and File Actions ---
  socket.on('collab-fs-list', async ({ room, path, requesterId }) => {
    console.log('[COLLAB][RECV] collab-fs-list', { socketId: socket.id, userId: socket.data.userId, room, path, requesterId });
    // Only the owner should perform the action
    // Find the owner from the room name (first part before '_')
    const ownerId = room.split('_')[0];
    if (socket.data.userId !== ownerId) return;
    try {
      // path is now relative to owner root (e.g. 'collabroom_<id>/...')
      const dirPath = safePath(path, ownerId);
      console.log('[COLLAB][FS] Resolved dirPath:', dirPath, 'Exists:', fs.existsSync(dirPath));
      function readDirTree(dir) {
        if (!fs.existsSync(dir)) {
          // Return an empty directory node if missing
          return { name: path.basename(dir), type: 'directory', children: [] };
        }
        const stats = fs.statSync(dir);
        if (stats.isDirectory()) {
          const children = fs.readdirSync(dir);
          console.log('[FS][LIST][DEBUG] readdirSync for', dir, ':', children);
          return {
            name: path.basename(dir),
            type: 'directory',
            children: children.map(child => readDirTree(path.join(dir, child)))
          };
        } else {
          return {
            name: path.basename(dir),
            type: 'file'
          };
        }
      }
      const tree = readDirTree(dirPath);
      io.to(room).emit('collab-fs-list-result', { path, tree, requesterId });
    } catch (e) {
      io.to(room).emit('collab-fs-list-result', { path, error: e.message, requesterId });
    }
  });
  socket.on('collab-fs-file', async ({ room, path, requesterId }) => {
    const ownerId = room.split('_')[0];
    if (socket.data.userId !== ownerId) return;
    try {
      // path is now relative to owner root (e.g. 'collabroom_<id>/...')
      const filePath = safePath(path, ownerId);
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        io.to(room).emit('collab-fs-file-result', { path, error: 'File not found', requesterId });
        return;
      }
      const content = fs.readFileSync(filePath, 'utf8');
      io.to(room).emit('collab-fs-file-result', { path, content, requesterId });
    } catch (e) {
      io.to(room).emit('collab-fs-file-result', { path, error: e.message, requesterId });
    }
  });
  socket.on('collab-fs-save', async ({ room, path, content, requesterId }) => {
    const ownerId = room.split('_')[0];
    if (socket.data.userId !== ownerId) return;
    try {
      // path is now relative to owner root (e.g. 'collabroom_<id>/...')
      const filePath = safePath(path, ownerId);
      fs.writeFileSync(filePath, content || '');
      io.to(room).emit('collab-fs-save-result', { path, success: true, requesterId });
    } catch (e) {
      io.to(room).emit('collab-fs-save-result', { path, error: e.message, requesterId });
    }
  });

  // Handle file creation requests from non-owners
  socket.on('collab-create-file-request', ({ room, path, requesterId }) => {
    const ownerId = room.split('_')[0];
    io.to(ownerId).emit('collab-create-file-request', { room, path, requesterId });
  });

  socket.on('collab-create-folder-request', ({ room, path, requesterId }) => {
    const ownerId = room.split('_')[0];
    io.to(ownerId).emit('collab-create-folder-request', { room, path, requesterId });
  });

  // Only the owner can perform these!
  socket.on('collab-fs-create-file', async ({ room, path, requesterId }) => {
    const ownerId = room.split('_')[0];
    if (socket.data.userId !== ownerId) return;
    try {
      fs.ensureFileSync(path); // create file
      // Emit updated file tree to all users
      const dirPath = path.dirname(path);
      io.to(room).emit('collab-fs-list-result', { path: dirPath, tree: readDirTree(dirPath), requesterId });
    } catch (e) {
      io.to(room).emit('collab-fs-list-result', { path, error: e.message, requesterId });
    }
  });

  socket.on('collab-fs-create-folder', async ({ room, path, requesterId }) => {
    const ownerId = room.split('_')[0];
    if (socket.data.userId !== ownerId) return;
    try {
      fs.ensureDirSync(path); // create folder
      io.to(room).emit('collab-fs-list-result', { path, tree: readDirTree(path), requesterId });
    } catch (e) {
      io.to(room).emit('collab-fs-list-result', { path, error: e.message, requesterId });
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`🚀 Online Judge Backend running on http://localhost:${PORT}`);
  console.log(`🐳 Docker integration: ${docker.listContainers ? 'Available' : 'Not available'}`);
  console.log(`🌐 Supported languages: ${Object.keys(LANGUAGES).join(', ')}`);
});

httpServer.on('upgrade', (request, socket, head) => {
  console.log(`[WS] Upgrade request URL: ${request.url}`);
  if (request.url.startsWith('/ws/collab-terminal')) {
    collabTerminalWSS.handleUpgrade(request, socket, head, (ws) => {
      console.log('[WS] Collabroom terminal client connected.');
      collabTerminalWSS.emit('connection', ws, request);
    });
  } else if (request.url.startsWith('/ws/terminal')) {
    terminalWSS.handleUpgrade(request, socket, head, (ws) => {
      console.log('[WS] Terminal client connected.');
      terminalWSS.emit('connection', ws, request);
    });
  } else if (request.url.startsWith('/ws/execute/')) { // New endpoint for code execution
    codeExecutionWSS.handleUpgrade(request, socket, head, (ws) => {
      console.log('[WS] Code execution client connected.');
      codeExecutionWSS.emit('connection', ws, request); // Pass req to get sessionId
    });
  } else {
    console.warn(`[WS] Unknown upgrade request URL: ${request.url}. Destroying socket.`);
    socket.destroy();
  }
});

// Serve static files from the public directory (for Monaco workers and other public assets)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Serve static files from the frontend build directory
app.use(express.static(path.join(__dirname, '..', 'dist')));

// --- Friend System Endpoints ---
// Send friend request
app.post('/api/friends/request', auth, async (req, res) => {
  const { toUsername } = req.body;
  const toUser = await User.findOne({ username: toUsername });
  if (!toUser) return res.status(404).json({ error: 'User not found' });
  if (toUser.friendRequests.some(r => r.from.equals(req.user.userId))) {
    return res.status(400).json({ error: 'Already requested' });
  }
  toUser.friendRequests.push({ from: req.user.userId, date: new Date() });
  await toUser.save();
  res.json({ success: true });
});

// Accept friend request
app.post('/api/friends/accept', auth, async (req, res) => {
  const { fromUserId } = req.body;
  const user = await User.findById(req.user.userId);
  const requestIdx = user.friendRequests.findIndex(r => r.from.equals(fromUserId));
  if (requestIdx === -1) return res.status(404).json({ error: 'Request not found' });
  user.friends.push(fromUserId);
  user.friendRequests.splice(requestIdx, 1);
  await user.save();
  // Add you as friend to the other user
  const fromUser = await User.findById(fromUserId);
  fromUser.friends.push(user._id);
  await fromUser.save();
  res.json({ success: true });
});

// Decline friend request
app.post('/api/friends/decline', auth, async (req, res) => {
  const { fromUserId } = req.body;
  const user = await User.findById(req.user.userId);
  user.friendRequests = user.friendRequests.filter(r => !r.from.equals(fromUserId));
  await user.save();
  res.json({ success: true });
});

// List friends
app.get('/api/friends/list', auth, async (req, res) => {
  const user = await User.findById(req.user.userId).populate('friends', 'username email');
  res.json({ friends: user.friends });
});

// GET /api/friends/requests
app.get('/api/friends/requests', auth, async (req, res) => {
  // Received: requests sent TO me
  const user = await User.findById(req.user.userId).populate('friendRequests.from', 'username email');
  const received = user.friendRequests.map(r => ({
    from: r.from,
    date: r.date
  }));

  // Sent: requests I have sent to others
  const sentUsers = await User.find({ 'friendRequests.from': req.user.userId });
  const sent = sentUsers.map(u => ({
    to: { _id: u._id, username: u.username, email: u.email },
    date: u.friendRequests.find(r => r.from.equals(req.user.userId)).date
  }));

  res.json({ received, sent });
});

// User search endpoint
app.get('/api/users/search', async (req, res) => {
  const q = req.query.q?.toString().toLowerCase() || '';
  let exclude = null;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    try {
      const token = req.headers.authorization.split(' ')[1];
      const decoded = require('jsonwebtoken').decode(token);
      exclude = decoded?.username;
    } catch {}
  }
  const users = await mongoose.connection.db.collection('users')
    .find({
      username: { $regex: q, $options: 'i', ...(exclude ? { $ne: exclude } : {}) }
    })
    .project({ username: 1, email: 1 })
    .limit(10)
    .toArray();
  res.json({ users });
});

// --- Add DMMessage model for persistent DMs ---
const dmMessageSchema = new mongoose.Schema({
  roomType: { type: String, default: 'dm' },
  roomId: String, // e.g. userA_userB
  from: String, // userId
  to: String,   // userId
  content: String,
  timestamp: Number,
}, { collection: 'messages' }); // Use the 'messages' collection
const DMMessage = mongoose.model('DMMessage', dmMessageSchema);

// --- Add endpoint to fetch DM history ---
app.get('/api/dm/history', auth, async (req, res) => {
  const { friendId } = req.query;
  const userId = req.user.userId;
  if (!friendId) {
    console.warn('[DM] /api/dm/history called with missing friendId');
    return res.status(400).json({ error: 'Missing friendId' });
  }
  // Always sort user IDs for roomId
  const roomId = [userId, friendId].sort().join('_');
  const messages = await mongoose.connection.db.collection('messages')
    .find({ roomType: 'dm', roomId })
    .sort({ timestamp: 1 })
    .toArray();
  console.log(`[DM] Loaded history for room ${roomId}: ${messages.length} messages`);
  res.json({ messages });
});

// 1. Collab Room Creation Endpoint
app.post('/api/collab/create', auth, async (req, res) => {
  const collab_id = 'collab_' + uuidv4();
  const collabFolder = path.join(USER_ROOT, 'collabroom_' + collab_id);
  try {
    fs.ensureDirSync(collabFolder);
    res.json({ collab_id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// 2. Collab Room Join Endpoint (for now, just returns collab_id)
app.post('/api/collab/join', auth, async (req, res) => {
  const { collab_id } = req.body;
  const collabFolder = path.join(USER_ROOT, 'collabroom_' + collab_id);
  if (!fs.existsSync(collabFolder)) {
    return res.status(404).json({ error: 'Collab room not found' });
  }
  res.json({ collab_id });
});
// 3. Patch all /api/fs/* endpoints to accept collab_id and scope to collab folder if present
function getScopedRoot(userId, collab_id, senderId) {
  if (collab_id) {
    if (!senderId) throw new Error('Missing senderId for collabroom operation');
    
    // For multi-user collaboration, all users should access the same folder in the owner's directory
    // The senderId parameter should be the ownerId (the user who created the collaboration)
    return path.join(USER_ROOT, senderId, 'collabroom_' + collab_id);
  }
  return path.join(USER_ROOT, userId);
}

app.get('/api/fs/file', auth, (req, res) => {
  try {
    const userId = req.user.userId;
    let filePath = req.query.path;
    const collab_id = req.query.collab_id;
    const senderId = req.query.senderId;
    const root = getScopedRoot(userId, collab_id, senderId);

    // Collabroom access logic
    if (filePath && filePath.includes('collabroom_')) {
      const match = filePath.match(/^(.*?)\/collabroom_([\w\d_\-]+)/);
      if (match) {
        const senderId = match[1];
        if (userId !== senderId && !filePath.includes(userId)) {
          return res.status(403).json({ error: 'Forbidden: Not a collab participant' });
        }
      }
    }

    // Strip /user_files/ prefix if present
    if (filePath && filePath.startsWith('/user_files/')) {
      filePath = filePath.replace(/^\/user_files\/[^\/]+\/?/, '');
    }

    const resolvedPath = path.resolve(root, filePath);

    if (!fs.existsSync(resolvedPath) || fs.statSync(resolvedPath).isDirectory()) {
      return res.status(404).json({ error: 'File not found' });
    }

    const content = fs.readFileSync(resolvedPath, 'utf8');
    res.json({ content });
  } catch (e) {
    console.error('[FS] Error in /api/fs/file:', e);
    res.status(500).json({ error: e.message });
  }
});



app.put('/api/fs/file', auth, (req, res) => {
  try {
    const userId = req.user.userId;
    let filePath = req.body.path;
    const collab_id = req.body.collab_id;
    const senderId = req.body.senderId;
    
    // Strip /user_files/ prefix if present
    if (filePath && filePath.startsWith('/user_files/')) {
      filePath = filePath.replace(/^\/user_files\/[^\/]+\/?/, '');
    }
    
    const resolvedPath = path.resolve(getScopedRoot(userId, collab_id, senderId), filePath);
    
    console.log('[SAVE] Writing to:', resolvedPath, 'Content length:', (req.body.content || '').length);
    
    if (!fs.existsSync(resolvedPath) || fs.statSync(resolvedPath).isDirectory()) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    fs.writeFileSync(resolvedPath, req.body.content || '');
    res.json({ success: true });
    // Emit file-tree-update for real-time updates
    if (collab_id) {
      io.to('collabroom_' + collab_id).emit('file-tree-update');
    } else {
      io.to(userId).emit('file-tree-update');
    }
  } catch (e) {
    console.error('[FS] Error in /api/fs/file PUT:', e);
    res.status(500).json({ error: e.message });
  }
});






// Add global error handlers to suppress EPIPE and similar errors
process.on('uncaughtException', (err) => {
  if (err.code === 'EPIPE') {
    console.warn('[WARN] Suppressed EPIPE error:', err);
  } else {
    console.error('[UNCAUGHT EXCEPTION]', err);
  }
});
process.on('unhandledRejection', (reason, promise) => {
  if (reason && reason.code === 'EPIPE') {
    console.warn('[WARN] Suppressed EPIPE error (unhandledRejection):', reason);
    } else {
    console.error('[UNHANDLED REJECTION]', reason);
  }
}); 

// Use the systematic normalizeCollabPath function defined at the top of the file

// PATCH: Use normalizeCollabPath in all file/folder endpoints
app.post('/api/fs/file', auth, (req, res) => {
  try {
    const userId = req.user.userId;
    let filePath = req.body.path;
    const collab_id = req.body.collab_id;
    const senderId = req.body.senderId;
    filePath = normalizeCollabPath(filePath, collab_id);
    
    // Strip /user_files/ prefix if present
    if (filePath && filePath.startsWith('/user_files/')) {
      filePath = filePath.replace(/^\/user_files\/[^\/]+\/?/, '');
    }
    
    const resolvedPath = path.resolve(getScopedRoot(userId, collab_id, senderId), filePath);
    
    if (fs.existsSync(resolvedPath)) {
      return res.status(400).json({ error: 'File already exists' });
    }
    // Ensure parent directory exists
    fs.ensureDirSync(path.dirname(resolvedPath));
    fs.writeFileSync(resolvedPath, req.body.content || '');
    res.json({ success: true });
    // Emit file-tree-update for real-time updates
    if (collab_id) {
      io.to('collabroom_' + collab_id).emit('file-tree-update');
    } else {
      io.to(userId).emit('file-tree-update');
    }
  } catch (e) {
    console.error('[FS] Error in /api/fs/file POST:', e);
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/fs/file', auth, (req, res) => {
  try {
    const userId = req.user.userId;
    let filePath = req.body.path;
    const collab_id = req.body.collab_id;
    const senderId = req.body.senderId;
    filePath = normalizeCollabPath(filePath, collab_id);
    
    // Strip /user_files/ prefix if present
    if (filePath && filePath.startsWith('/user_files/')) {
      filePath = filePath.replace(/^\/user_files\/[^\/]+\/?/, '');
    }
    
    const resolvedPath = path.resolve(getScopedRoot(userId, collab_id, senderId), filePath);
    
    if (!fs.existsSync(resolvedPath) || fs.statSync(resolvedPath).isDirectory()) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    fs.writeFileSync(resolvedPath, req.body.content || '');
    res.json({ success: true });
    // Emit file-tree-update for real-time updates
    if (collab_id) {
      io.to('collabroom_' + collab_id).emit('file-tree-update');
    } else {
      io.to(userId).emit('file-tree-update');
    }
  } catch (e) {
    console.error('[FS] Error in /api/fs/file PUT:', e);
    res.status(500).json({ error: e.message });
  }
});



app.post('/api/fs/dir', auth, (req, res) => {
  try {
    const userId = req.user.userId;
    let dirPath = req.body.path;
    const collab_id = req.body.collab_id;
    const senderId = req.body.senderId;
    dirPath = normalizeCollabPath(dirPath, collab_id);
    
    // Strip /user_files/ prefix if present
    if (dirPath && dirPath.startsWith('/user_files/')) {
      dirPath = dirPath.replace(/^\/user_files\/[^\/]+\/?/, '');
    }
    
    const resolvedPath = path.resolve(getScopedRoot(userId, collab_id, senderId), dirPath);
    if (fs.existsSync(resolvedPath)) {
      return res.status(400).json({ error: 'Directory already exists' });
    }
    fs.mkdirSync(resolvedPath, { recursive: true });
    res.json({ success: true });
    // Emit file-tree-update for real-time updates
    if (collab_id) {
      io.to('collabroom_' + collab_id).emit('file-tree-update');
    } else {
      io.to(userId).emit('file-tree-update');
    }
  } catch (e) {
    console.error('[FS] Error in /api/fs/dir:', e);
    res.status(500).json({ error: e.message });
  }
});


// Use the systematic normalizeCollabPath function instead of this patch
function stripCollabroomPrefix(relPath, collab_id) {
  return normalizeCollabPath(relPath, null, collab_id);
}




// Catch-all (must be last)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
}); 

// --- Collab End Handler ---
app.post('/api/collab/end', auth, async (req, res) => {
  const { collab_id, senderId, room } = req.body;
  
  if (!collab_id || !senderId) {
    return res.status(400).json({ error: 'Missing collab_id or senderId' });
  }

  const collabRoot = path.join(USER_ROOT, senderId, 'collabroom_' + collab_id);
  const senderRoot = path.join(USER_ROOT, senderId);

  try {
    console.log('[COLLAB][END] Starting cleanup for:', collab_id);
    
    // Check if collab folder exists
    if (!fs.existsSync(collabRoot)) {
      console.log('[COLLAB][END] Collab folder already deleted');
      return res.json({ success: true });
    }

    // Move all files/folders from collabroom to sender's root
    const items = fs.readdirSync(collabRoot);
    console.log('[COLLAB][END] Items to move:', items);
    
    for (const item of items) {
      const src = path.join(collabRoot, item);
      const dest = path.join(senderRoot, item);
      
      try {
        // If destination exists, remove it first
        if (fs.existsSync(dest)) {
          fs.removeSync(dest);
          console.log('[COLLAB][END] Removed existing:', dest);
        }
        
        // Move the item
        fs.moveSync(src, dest, { overwrite: true });
        console.log('[COLLAB][END] Moved:', src, '->', dest);
      } catch (moveError) {
        console.error('[COLLAB][END] Error moving item:', item, moveError);
      }
    }

    // Delete the collabroom folder
    fs.removeSync(collabRoot);
    console.log('[COLLAB][END] Deleted collabroom folder:', collabRoot);

    // Emit cleanup completion to all users in the room
    if (room) {
      io.to(room).emit('collab-cleanup-complete', {
        collabId: collab_id,
        senderId,
        timestamp: Date.now()
      });
    }

    res.json({ 
      success: true, 
      message: 'Collaboration ended and files moved successfully' 
    });
    
  } catch (error) {
    console.error('[COLLAB][END] Error during cleanup:', error);
    res.status(500).json({ 
      error: 'Failed to end collaboration properly: ' + error.message 
    });
  }
});

// --- Collabroom Terminal WebSocket Endpoint ---



// Add HTML server functionality to your backend

// HTML Server Route - Add this to your existing routes
app.post('/api/html/serve', auth, (req, res) => {
  const { fileName, userId } = req.body;
  const userDir = path.join(USER_ROOT, userId);
  const htmlPath = path.join(userDir, fileName);
  
  // Check if HTML file exists
  if (!fs.existsSync(htmlPath)) {
    return res.status(404).json({ error: 'HTML file not found' });
  }
  
  // Create a unique port for this user's HTML server
  const port = 3000 + parseInt(userId.slice(-3), 16) % 1000; // Generate port based on userId
  
  // Create Express server for serving HTML
  const htmlApp = express();
  const htmlServer = http.createServer(htmlApp);
  
  // Serve static files from user directory
  htmlApp.use(express.static(userDir));
  
  // Serve the main HTML file
  htmlApp.get('/', (req, res) => {
    res.sendFile(htmlPath);
  });
  
  // Handle CSS, JS, and other assets
  htmlApp.get('*', (req, res) => {
    const filePath = path.join(userDir, req.path);
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).send('File not found');
    }
  });
  
  // Start server
  htmlServer.listen(port, () => {
    console.log(`HTML server started on port ${port} for user ${userId}`);
    res.json({ 
      success: true, 
      port: port,
      url: `http://localhost:${port}`,
      message: `HTML server running on http://localhost:${port}`
    });
  });
  
  // Store server reference for cleanup
  if (!global.htmlServers) {
    global.htmlServers = {};
  }
  
  // Stop previous server if exists
  if (global.htmlServers[userId]) {
    global.htmlServers[userId].close();
  }
  
  global.htmlServers[userId] = htmlServer;
  
  // Auto-stop server after 10 minutes of inactivity
  setTimeout(() => {
    if (global.htmlServers[userId]) {
      global.htmlServers[userId].close();
      delete global.htmlServers[userId];
      console.log(`HTML server stopped for user ${userId} (timeout)`);
    }
  }, 10 * 60 * 1000); // 10 minutes
});

// Stop HTML server route
app.post('/api/html/stop', auth, (req, res) => {
  const { userId } = req.body;
  
  if (global.htmlServers && global.htmlServers[userId]) {
    global.htmlServers[userId].close();
    delete global.htmlServers[userId];
    res.json({ success: true, message: 'HTML server stopped' });
  } else {
    res.json({ success: false, message: 'No active HTML server found' });
  }
});




// Initialize Gemini AI - Add this to your .env file: GEMINI_API_KEY=your_key_here
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// AI Tools execution endpoint
app.post('/api/ai-tools/execute', auth, async (req, res) => {
  try {
    const { toolId, params, collab_id, senderId } = req.body;
    const userId = req.user.userId;
    
    console.log(`[AI-TOOLS] Executing ${toolId} for user ${userId}`);
    
    const root = collab_id && senderId 
      ? path.join(USER_ROOT, senderId, `collabroom_${collab_id}`)
      : path.join(USER_ROOT, userId);
    
    let result;
    
    switch (toolId) {
      case 'analyze-file':
        result = await analyzeFileWithGemini(params.filePath, params.content);
        break;
      case 'create-file':
        result = await createFileWithGemini(params.fileName, params.description, root);
        break;
      case 'optimize-code':
        result = await optimizeCodeWithGemini(params.filePath, params.content);
        break;
      case 'generate-docs':
        result = await generateDocsWithGemini(params.filePath, params.content, root);
        break;
      case 'smart-search':
        result = await smartSearchWithGemini(params.query, root);
        break;
      case 'find-bugs':
        result = await findBugsWithGemini(params.files);
        break;
      case 'generate-tests':
        result = await generateTestsWithGemini(params.filePath, params.content, root);
        break;
      case 'refactor-code':
        result = await refactorCodeWithGemini(params.filePath, params.content, params.refactorType);
        break;
      case 'explain-code':
        result = await explainCodeWithGemini(params.filePath, params.content);
        break;
      case 'code-review':
        result = await codeReviewWithGemini(params.filePath, params.content);
        break;
      default:
        throw new Error(`Unknown tool: ${toolId}`);
    }
    
    res.json({
      success: true,
      result: result.message,
      title: result.title,
      message: result.message,
      toolId,
      timestamp: new Date().toISOString(),
      refreshFileTree: result.refreshFileTree || false,
      newFile: result.newFile,
      fileUpdate: result.fileUpdate
    });
    
  } catch (error) {
    console.error('[AI-TOOLS] Error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      toolId: req.body.toolId
    });
  }
});

// AI Chat endpoint
app.post('/api/ai-tools/chat', auth, async (req, res) => {
  try {
    const { message, conversationId, currentFilePath, allOpenFiles, context } = req.body;
    const userId = req.user.userId;
    
    // Prepare context for AI
    const contextInfo = `Current context:
- Current file: ${currentFilePath || 'None'}
- Open files: ${Object.keys(allOpenFiles || {}).join(', ') || 'None'}
- Available tools: ${context?.availableTools?.join(', ') || 'file operations, code analysis'}

You are an AI coding assistant with access to powerful tools. When the user requests actions that can be performed by tools, use the following command format:

For tool execution, use: \`\`\`tool_code tool_name(parameters)\`\`\`

Available tools and their usage:
- create_file: Create new files with AI-generated content
- analyze_file: Analyze current file for bugs, performance, security
- optimize_code: Optimize the current file's code
- generate_docs: Generate documentation for the current file
- smart_search: Search for code patterns across the project
- find_bugs: Find potential bugs in the current file
- find_files: Search for files by name or pattern
- grep_search: Search for text patterns in files
- run_command: Execute terminal commands
- install_package: Install packages via terminal
- git_operations: Perform git operations
- system_info: Get system information
- generate_tests: Generate unit tests for the current file
- refactor_code: Refactor the current file's code
- explain_code: Explain the current file's code
- code_review: Review the current file's code quality

When you need to perform an action, use the tool command format. For example:
- If user asks to analyze a file: \`\`\`tool_code analyze_file()\`\`\`
- If user asks to create a file: \`\`\`tool_code create_file()\`\`\`
- If user asks to run a command: \`\`\`tool_code run_command()\`\`\`

Current files content:
${Object.entries(allOpenFiles || {}).slice(0, 3).map(([path, content]) => 
  `\n=== ${path} ===\n${typeof content === 'string' ? content.substring(0, 500) : 'No content'}...`
).join('\n')}`;

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const prompt = `${contextInfo}

User message: ${message}

Provide helpful, specific advice. If the user requests an action that can be performed by a tool, use the tool command format. Be concise but thorough.`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const aiResponse = response.text();
    
    res.json({
      success: true,
      response: aiResponse,
      conversationId
    });
    
  } catch (error) {
    console.error('[AI-CHAT] Error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// AI Tool Implementation Functions

async function analyzeFileWithGemini(filePath, content) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  const prompt = `Analyze this code for bugs, performance issues, security vulnerabilities, and improvements:

File: ${filePath}
Code:
${content}

Provide specific recommendations with line numbers where applicable.`;
  
  const result = await model.generateContent(prompt);
  const response = await result.response;
  const analysis = response.text();
  
  return {
    title: 'Code Analysis Complete',
    message: `Analysis completed for ${filePath}`,
    result: analysis
  };
}

async function createFileWithGemini(fileName, description, root) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  const language = getLanguageFromFileName(fileName);
  const prompt = `Create a ${language} file with the following requirements:
${description}

Return only the code without any markdown formatting or explanations.
Include proper imports, error handling, and comments.`;
  
  const result = await model.generateContent(prompt);
  const response = await result.response;
  
  // FIX: Properly escape the regex pattern
  const generatedCode = response.text().replace(/``````/g, '').trim();
  
  // Save file
  const filePath = path.join(root, fileName);
  await fs.ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, generatedCode);
  
  return {
    title: 'File Created',
    message: `Successfully created ${fileName}`,
    result: `Created ${fileName} with AI-generated content`,
    refreshFileTree: true,
    newFile: { path: fileName },
    fileUpdate: { path: fileName, content: generatedCode }
  };
}

async function optimizeCodeWithGemini(filePath, content) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  const prompt = `Optimize this code for performance, readability, and best practices:

${content}

Return only the optimized code without markdown formatting.`;
  
  const result = await model.generateContent(prompt);
  const response = await result.response;
  
  // FIX: Properly escape the regex pattern
  const optimizedCode = response.text().replace(/``````/g, '').trim();
  
  return {
    title: 'Code Optimized',
    message: `Code optimization completed for ${filePath}`,
    result: 'Code has been optimized for performance and readability',
    fileUpdate: { path: filePath, content: optimizedCode }
  };
}

async function generateDocsWithGemini(filePath, content, root) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  const prompt = `Generate comprehensive documentation for this code:

${content}

Include:
- Overview and purpose
- Function/method documentation
- Parameters and return values
- Usage examples
- Installation instructions if applicable

Format as markdown.`;
  
  const result = await model.generateContent(prompt);
  const response = await result.response;
  const docs = response.text();
  
  // Save documentation
  const fileExt = path.extname(filePath);
  const baseName = path.basename(filePath, fileExt);
  const docFileName = `${baseName}_README.md`;
  const docPath = path.join(root, docFileName);
  fs.writeFileSync(docPath, docs);
  
  return {
    title: 'Documentation Generated',
    message: `Documentation created: ${docFileName}`,
    result: `Generated comprehensive documentation for ${filePath}`,
    refreshFileTree: true,
    newFile: { path: docFileName }
  };
}

async function smartSearchWithGemini(query, root) {
  // Simple file search implementation
  const results = [];
  
  function searchFiles(dir) {
    if (!fs.existsSync(dir)) return;
    
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const itemPath = path.join(dir, item);
      const stats = fs.statSync(itemPath);
      
      if (stats.isDirectory() && !item.startsWith('.')) {
        searchFiles(itemPath);
      } else if (stats.isFile()) {
        const extensions = ['.js', '.ts', '.py', '.java', '.cpp', '.c', '.html', '.css', '.json', '.md'];
        if (extensions.some(ext => item.endsWith(ext))) {
          try {
            const content = fs.readFileSync(itemPath, 'utf8');
            if (content.toLowerCase().includes(query.toLowerCase())) {
              const lines = content.split('\n');
              const matches = [];
              
              lines.forEach((line, index) => {
                if (line.toLowerCase().includes(query.toLowerCase())) {
                  matches.push({
                    line: index + 1,
                    text: line.trim()
                  });
                }
              });
              
              results.push({
                file: path.relative(root, itemPath),
                matches: matches.slice(0, 3)
              });
            }
          } catch (e) {
            // Skip binary files
          }
        }
      }
    }
  }
  
  searchFiles(root);
  
  const formattedResults = results.map(result => 
    `📄 **${result.file}**\n${result.matches.map(m => `  Line ${m.line}: ${m.text}`).join('\n')}`
  ).join('\n\n');
  
  return {
    title: 'Search Complete',
    message: `Found ${results.length} files matching "${query}"`,
    result: formattedResults || 'No results found'
  };
}

async function findBugsWithGemini(files) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  
  let allContent = '';
  Object.entries(files).slice(0, 5).forEach(([filePath, content]) => {
    allContent += `\n\n=== ${filePath} ===\n${content}`;
  });
  
  const prompt = `Analyze this code for bugs, security issues, and potential problems:

${allContent}

Focus on:
- Runtime errors and exceptions
- Logic errors
- Security vulnerabilities
- Memory leaks
- Performance issues

Provide specific file names and line numbers (estimate) where possible.`;
  
  const result = await model.generateContent(prompt);
  const response = await result.response;
  const issues = response.text();
  
  return {
    title: 'Bug Analysis Complete',
    message: `Analyzed ${Object.keys(files).length} files for potential issues`,
    result: issues
  };
}

async function generateTestsWithGemini(filePath, content, root) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  const prompt = `Generate comprehensive unit tests for this code:

${content}

Include:
- Happy path tests
- Edge case tests
- Error handling tests
- Mock dependencies where needed

Return only the test code without markdown formatting.`;
  
  const result = await model.generateContent(prompt);
  const response = await result.response;
  
  // FIX: Properly escape the regex pattern
  const tests = response.text().replace(/``````/g, '').trim();
  
  // Save tests
  const fileExt = path.extname(filePath);
  const testFileName = filePath.replace(fileExt, '') + '.test' + fileExt;
  const testPath = path.join(root, testFileName);
  fs.writeFileSync(testPath, tests);
  
  return {
    title: 'Tests Generated',
    message: `Unit tests created: ${testFileName}`,
    result: `Generated comprehensive unit tests for ${filePath}`,
    refreshFileTree: true,
    newFile: { path: testFileName }
  };
}

async function refactorCodeWithGemini(filePath, content, refactorType) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  const prompt = `Refactor this code for ${refactorType}:

${content}

Focus on:
- Code structure and organization
- Performance improvements
- Readability enhancements
- Best practices
- Maintainability

Return only the refactored code without markdown formatting.`;
  
  const result = await model.generateContent(prompt);
  const response = await result.response;
  
  // FIX: Properly escape the regex pattern
  const refactoredCode = response.text().replace(/``````/g, '').trim();
  
  return {
    title: 'Code Refactored',
    message: `Code refactored for ${refactorType}`,
    result: 'Code has been refactored with improvements',
    fileUpdate: { path: filePath, content: refactoredCode }
  };
}

async function explainCodeWithGemini(filePath, content) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  const prompt = `Explain this code in detail:

${content}

Provide:
- Overall purpose and functionality
- Line-by-line explanation of complex parts
- Algorithm explanation if applicable
- Dependencies and imports explanation
- Best practices used
- Potential improvements`;
  
  const result = await model.generateContent(prompt);
  const response = await result.response;
  const explanation = response.text();
  
  return {
    title: 'Code Explanation',
    message: `Generated explanation for ${filePath}`,
    result: explanation
  };
}

async function codeReviewWithGemini(filePath, content) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  const prompt = `Perform a comprehensive code review:

${content}

Evaluate:
- Code quality and standards
- Security vulnerabilities
- Performance bottlenecks
- Architecture and design patterns
- Testing coverage gaps
- Documentation quality
- Maintainability concerns

Provide specific recommendations with priority levels.`;
  
  const result = await model.generateContent(prompt);
  const response = await result.response;
  const review = response.text();
  
  return {
    title: 'Code Review Complete',
    message: `Code review completed for ${filePath}`,
    result: review
  };
}

function getLanguageFromFileName(fileName) {
  const extension = fileName.split('.').pop()?.toLowerCase();
  const languageMap = {
    'py': 'python',
    'js': 'javascript',
    'ts': 'typescript',
    'java': 'java',
    'cpp': 'cpp',
    'c': 'c',
    'html': 'html',
    'css': 'css',
    'json': 'json',
    'md': 'markdown'
  };
  return languageMap[extension] || 'plaintext';
}

// --- Secure Proxy Middleware ---
// Validate dev server session
function validateDevSession(req, res, next) {
  const { sessionId } = req.params;
  const server = activeDevServers.get(sessionId);
  
  if (!server) {
    return res.status(404).json({ error: 'Development server not found' });
  }
  
  if (new Date() > server.expiresAt) {
    stopSecureDevServer(sessionId, server.userId).catch(console.error);
    return res.status(410).json({ error: 'Development server expired' });
  }
  
  req.serverInfo = server;
  next();
}

// Create secure proxy middleware
function createSecureProxyMiddleware(req, res, next) {
  const { sessionId } = req.params;
  const server = req.serverInfo;
  
  const proxy = httpProxy.createProxyMiddleware({
    target: `http://localhost:${server.port}`,
    changeOrigin: true,
    pathRewrite: {
      [`^/proxy/${sessionId}`]: ''
    },
    onError: (err, req, res) => {
      console.error('[PROXY] Error:', err);
      if (!res.headersSent) {
        res.status(502).json({ error: 'Development server unavailable' });
      }
    },
    onProxyReq: (proxyReq, req, res) => {
      // Add security headers
      proxyReq.setHeader('X-Forwarded-For', req.ip);
      proxyReq.setHeader('X-Real-IP', req.ip);
    },
    onProxyRes: (proxyRes, req, res) => {
      // Remove potentially dangerous headers
      delete proxyRes.headers['x-powered-by'];
      delete proxyRes.headers['server'];
      
      // Add security headers
      proxyRes.headers['X-Frame-Options'] = 'SAMEORIGIN';
      proxyRes.headers['X-Content-Type-Options'] = 'nosniff';
      proxyRes.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin';
      proxyRes.headers['X-XSS-Protection'] = '1; mode=block';
    }
  });
  
  proxy(req, res, next);
}

// Secure proxy endpoint
app.use('/proxy/:sessionId', validateDevSession, createSecureProxyMiddleware);

// --- Cleanup and Maintenance ---
// Clean up expired dev servers every 10 minutes
setInterval(() => {
  const now = new Date();
  for (const [sessionId, server] of activeDevServers.entries()) {
    if (now > server.expiresAt) {
      console.log(`[DEV-SERVER] Cleaning up expired server ${sessionId}`);
      stopSecureDevServer(sessionId, server.userId).catch(console.error);
    }
  }
}, 10 * 60 * 1000);

// Clean up expired execution sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of activeSessions.entries()) {
    const sessionAge = now - session.startTime.getTime();
    if (sessionAge > 30 * 60 * 1000) { // 30 minutes
      console.log(`[EXEC] Cleaning up old session ${sessionId}`);
      if (session.container) {
        session.container.stop({ t: 1 }).catch(() => {});
        session.container.remove().catch(() => {});
      }
      activeSessions.delete(sessionId);
    }
  }
}, 5 * 60 * 1000);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down server...');
  
  // Stop all active dev servers
  for (const [sessionId, server] of activeDevServers.entries()) {
    try {
      await stopSecureDevServer(sessionId, server.userId);
    } catch (error) {
      console.error(`Error stopping dev server ${sessionId}:`, error);
    }
  }
  
  // Stop all active execution sessions
  for (const [sessionId, session] of activeSessions.entries()) {
    try {
      if (session.container) {
        await session.container.stop({ t: 1 });
        await session.container.remove();
      }
    } catch (error) {
      console.error(`Error stopping execution session ${sessionId}:`, error);
    }
  }
  
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 Shutting down server...');
  
  // Stop all active dev servers
  for (const [sessionId, server] of activeDevServers.entries()) {
    try {
      await stopSecureDevServer(sessionId, server.userId);
    } catch (error) {
      console.error(`Error stopping dev server ${sessionId}:`, error);
    }
  }
  
  process.exit(0);
});

console.log(`🚀 Server running on port ${PORT}`);
console.log(`🔒 Secure development server proxy enabled`);
console.log(`📡 Proxy endpoint: http://localhost:${PORT}/proxy/{sessionId}`);
console.log(`🛡️  Security features: Container isolation, resource limits, auto-cleanup`);