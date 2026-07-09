const express = require('express');
const httpProxy = require('http-proxy-middleware');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const Docker = require('dockerode');

class SecureDevServerProxy {
  constructor() {
    this.app = express();
    this.docker = new Docker();
    this.activeServers = new Map(); // sessionId -> { port, containerId, userId, expiresAt }
    this.setupMiddleware();
    this.setupRoutes();
    this.startCleanupTimer();
  }

  setupMiddleware() {
    // Security headers
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "blob:"],
          connectSrc: ["'self'", "ws:", "wss:"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false
    }));

    // CORS with strict origin checking
    this.app.use(cors({
      origin: (origin, callback) => {
        const allowedOrigins = [
          'http://localhost:3000',
          'http://localhost:3001',
          process.env.FRONTEND_URL
        ].filter(Boolean);
        
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true
    }));

    // Rate limiting for proxy requests
    const proxyLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 1000, // limit each IP to 1000 requests per windowMs
      message: 'Too many proxy requests from this IP',
      standardHeaders: true,
      legacyHeaders: false,
    });

    this.app.use('/proxy', proxyLimiter);

    // Body parsing
    this.app.use(express.json({ limit: '1mb' }));
  }

  setupRoutes() {
    // Create secure dev server
    this.app.post('/api/dev-server/create', this.authenticateUser.bind(this), async (req, res) => {
      try {
        const { code, language, framework } = req.body;
        const userId = req.user.userId;
        
        if (!code || !language) {
          return res.status(400).json({ error: 'Code and language are required' });
        }

        const sessionId = uuidv4();
        const result = await this.createSecureDevServer(sessionId, code, language, framework, userId);
        
        res.json({
          success: true,
          sessionId,
          proxyUrl: `http://localhost:${process.env.PROXY_PORT || 8080}/proxy/${sessionId}`,
          internalPort: result.port,
          containerId: result.containerId,
          expiresAt: result.expiresAt
        });
      } catch (error) {
        console.error('[SECURE-PROXY] Error creating dev server:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get server status
    this.app.get('/api/dev-server/:sessionId/status', this.authenticateUser.bind(this), (req, res) => {
      const { sessionId } = req.params;
      const userId = req.user.userId;
      const server = this.activeServers.get(sessionId);
      
      if (!server || server.userId !== userId) {
        return res.status(404).json({ error: 'Server not found' });
      }

      res.json({
        sessionId,
        status: 'running',
        proxyUrl: `http://localhost:${process.env.PROXY_PORT || 8080}/proxy/${sessionId}`,
        expiresAt: server.expiresAt
      });
    });

    // Stop dev server
    this.app.delete('/api/dev-server/:sessionId', this.authenticateUser.bind(this), async (req, res) => {
      try {
        const { sessionId } = req.params;
        const userId = req.user.userId;
        
        await this.stopDevServer(sessionId, userId);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Secure proxy endpoint
    this.app.use('/proxy/:sessionId', this.validateSession.bind(this), this.createProxyMiddleware.bind(this));

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        activeServers: this.activeServers.size,
        timestamp: new Date().toISOString()
      });
    });
  }

  async createSecureDevServer(sessionId, code, language, framework, userId) {
    const containerPort = this.getPortForFramework(framework || language);
    const hostPort = await this.findAvailablePort();
    
    // Create secure container configuration
    const containerConfig = {
      Image: this.getSecureImage(language, framework),
      Cmd: this.getStartCommand(language, framework),
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
      ],
      NetworkingConfig: {
        EndpointsConfig: {
          bridge: {
            Aliases: [`dev-${sessionId}`]
          }
        }
      }
    };

    // Create and start container
    const container = await this.docker.createContainer(containerConfig);
    
    // Write code to container
    await this.writeCodeToContainer(container, code, language, framework);
    
    await container.start();
    
    // Wait for server to be ready
    await this.waitForServerReady(hostPort, 30000); // 30 second timeout
    
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
    
    // Store server info
    this.activeServers.set(sessionId, {
      port: hostPort,
      containerId: container.id,
      userId,
      expiresAt,
      language,
      framework
    });

    return {
      port: hostPort,
      containerId: container.id,
      expiresAt
    };
  }

  async writeCodeToContainer(container, code, language, framework) {
    const files = this.generateProjectFiles(code, language, framework);
    
    for (const [filePath, content] of Object.entries(files)) {
      const tarStream = this.createTarStream(filePath, content);
      await container.putArchive(tarStream, { path: '/app' });
    }
  }

  generateProjectFiles(code, language, framework) {
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
        
      case 'html':
        files['index.html'] = code;
        files['package.json'] = JSON.stringify({
          name: 'secure-html-app',
          version: '1.0.0',
          scripts: {
            'dev': 'python3 -m http.server $PORT --bind 0.0.0.0'
          }
        }, null, 2);
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
        
      default:
        files['index.js'] = code;
        files['package.json'] = JSON.stringify({
          name: 'secure-node-app',
          version: '1.0.0',
          scripts: {
            'start': 'node index.js'
          }
        }, null, 2);
    }
    
    return files;
  }

  createTarStream(filePath, content) {
    const tar = require('tar-stream');
    const pack = tar.pack();
    
    pack.entry({ name: filePath }, content);
    pack.finalize();
    
    return pack;
  }

  getSecureImage(language, framework) {
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

  getStartCommand(language, framework) {
    const commands = {
      'react': ['sh', '-c', 'npm install && npm run dev'],
      'vue': ['sh', '-c', 'npm install && npm run dev'],
      'html': ['sh', '-c', 'npm run dev'],
      'javascript': ['sh', '-c', 'npm install && npm start'],
      'typescript': ['sh', '-c', 'npm install && npm start']
    };
    
    return commands[framework] || commands[language] || ['sh', '-c', 'npm start'];
  }

  getPortForFramework(framework) {
    const ports = {
      'react': 3000,
      'vue': 3000,
      'html': 8000,
      'javascript': 3000,
      'typescript': 3000
    };
    
    return ports[framework] || 3000;
  }

  async findAvailablePort() {
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

  async waitForServerReady(port, timeout = 30000) {
    const net = require('net');
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
      const checkConnection = () => {
        if (Date.now() - startTime > timeout) {
          reject(new Error('Server startup timeout'));
          return;
        }
        
        const socket = new net.Socket();
        socket.setTimeout(1000);
        
        socket.on('connect', () => {
          socket.destroy();
          resolve();
        });
        
        socket.on('error', () => {
          setTimeout(checkConnection, 1000);
        });
        
        socket.on('timeout', () => {
          socket.destroy();
          setTimeout(checkConnection, 1000);
        });
        
        socket.connect(port, 'localhost');
      };
      
      checkConnection();
    });
  }

  validateSession(req, res, next) {
    const { sessionId } = req.params;
    const server = this.activeServers.get(sessionId);
    
    if (!server) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    if (new Date() > server.expiresAt) {
      this.stopDevServer(sessionId, server.userId);
      return res.status(410).json({ error: 'Session expired' });
    }
    
    req.serverInfo = server;
    next();
  }

  createProxyMiddleware(req, res, next) {
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
        res.status(502).json({ error: 'Proxy error' });
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
      }
    });
    
    proxy(req, res, next);
  }

  async stopDevServer(sessionId, userId) {
    const server = this.activeServers.get(sessionId);
    
    if (!server || server.userId !== userId) {
      throw new Error('Server not found or access denied');
    }
    
    try {
      const container = this.docker.getContainer(server.containerId);
      await container.stop({ t: 5 }); // 5 second grace period
      await container.remove();
      console.log(`[SECURE-PROXY] Stopped container ${server.containerId}`);
    } catch (error) {
      console.error(`[SECURE-PROXY] Error stopping container:`, error);
    }
    
    this.activeServers.delete(sessionId);
  }

  authenticateUser(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
      req.user = decoded;
      next();
    } catch (error) {
      res.status(401).json({ error: 'Invalid token' });
    }
  }

  startCleanupTimer() {
    // Clean up expired servers every 5 minutes
    setInterval(() => {
      const now = new Date();
      for (const [sessionId, server] of this.activeServers.entries()) {
        if (now > server.expiresAt) {
          console.log(`[SECURE-PROXY] Cleaning up expired server ${sessionId}`);
          this.stopDevServer(sessionId, server.userId).catch(console.error);
        }
      }
    }, 5 * 60 * 1000);
  }

  start(port = 8080) {
    this.app.listen(port, () => {
      console.log(`🔒 Secure Dev Server Proxy running on port ${port}`);
    });
  }
}

module.exports = SecureDevServerProxy;