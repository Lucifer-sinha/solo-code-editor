# 🔒 Secure Development Server Solution

## Problem Solved

**Issue**: Docker containers running React/HTML/Vue development servers create local URLs (like `http://localhost:3000`) that aren't accessible from outside the container, preventing users from viewing their live applications.

**Solution**: A comprehensive secure proxy system that safely exposes development servers while maintaining strict security controls and preventing potential attacks.

## 🛡️ Security Architecture

### Multi-Layer Security Model

```
┌─────────────────────────────────────────────────────────────┐
│                    Internet/User                            │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                 Nginx Reverse Proxy                        │
│  • Rate Limiting (5 req/s for dev servers)                 │
│  • Security Headers (CSP, XSS Protection)                  │
│  • SSL Termination                                         │
│  • Request Filtering                                       │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                Main Application Server                      │
│  • JWT Authentication                                      │
│  • User Authorization                                      │
│  • Session Management                                      │
│  • Container Orchestration                                 │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│              Secure Proxy Middleware                       │
│  • Session Validation                                      │
│  • Container Health Checks                                 │
│  • Request Sanitization                                    │
│  • Response Header Filtering                               │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│            Isolated Docker Containers                      │
│  • No Network Access                                       │
│  • Resource Limits (512MB RAM, 50% CPU)                    │
│  • Read-only Root Filesystem                               │
│  • Dropped Capabilities                                    │
│  • Temporary File System                                   │
│  • Auto-cleanup (2 hour max lifetime)                      │
└─────────────────────────────────────────────────────────────┘
```

### Container Security Features

1. **Isolation**: Each dev server runs in a separate Docker container
2. **Resource Limits**: 512MB RAM, 50% CPU core maximum
3. **Network Isolation**: No external network access
4. **Privilege Dropping**: Containers run without elevated privileges
5. **Capability Restrictions**: Only essential capabilities (CHOWN, SETGID, SETUID)
6. **Read-only Security**: Root filesystem mounted read-only where possible
7. **Temporary Storage**: Only `/tmp` is writable with size limits

## 🚀 Implementation Components

### 1. Backend Server Integration (`server/index.js`)

```javascript
// Secure development server endpoints
app.post('/api/dev-server/create', auth, async (req, res) => {
  // Creates isolated container with user's code
  // Returns proxy URL for safe access
});

app.get('/api/dev-server/:sessionId/status', auth, (req, res) => {
  // Check server health and remaining time
});

app.delete('/api/dev-server/:sessionId', auth, async (req, res) => {
  // Safely stop and remove container
});

// Secure proxy middleware
app.use('/proxy/:sessionId', validateDevSession, createSecureProxyMiddleware);
```

### 2. React Component (`src/components/SecureDevServer.tsx`)

```typescript
<SecureDevServer 
  code={userCode}
  language="javascript"
  framework="react"
  onServerCreated={(server) => {
    // Server ready, auto-open in new tab
    window.open(server.proxyUrl, '_blank');
  }}
/>
```

### 3. Security Middleware

```javascript
function validateDevSession(req, res, next) {
  const server = activeDevServers.get(sessionId);
  
  // Check session exists and belongs to user
  if (!server || server.userId !== req.user.userId) {
    return res.status(404).json({ error: 'Server not found' });
  }
  
  // Check expiration
  if (new Date() > server.expiresAt) {
    stopSecureDevServer(sessionId, server.userId);
    return res.status(410).json({ error: 'Server expired' });
  }
  
  next();
}
```

## 🎯 Supported Frameworks

### React Applications
- **Auto-setup**: Creates `package.json`, `vite.config.js`, `index.html`
- **Hot Reload**: Vite dev server with HMR
- **Port**: 3000 (internal), proxied through secure endpoint

### Vue Applications  
- **Auto-setup**: Vue 3 with Vite build system
- **Hot Reload**: Full Vue development experience
- **Port**: 3000 (internal), proxied through secure endpoint

### HTML Applications
- **Static Server**: Python HTTP server for static files
- **Security**: Custom headers, no external access
- **Port**: 8000 (internal), proxied through secure endpoint

### JavaScript/TypeScript
- **Node.js**: Express server or static file serving
- **Development**: Full debugging and hot reload support
- **Port**: 3000 (internal), proxied through secure endpoint

## 🔧 Configuration & Deployment

### Environment Variables
```bash
# Security
JWT_SECRET=your-secure-secret
DEV_SERVER_MAX_MEMORY=512m
DEV_SERVER_MAX_CPU=0.5
DEV_SERVER_TIMEOUT=7200
DEV_SERVER_MAX_CONCURRENT=10

# Database
MONGODB_URI=mongodb://localhost:27017/code-ta

# AI Features
GEMINI_API_KEY=your-gemini-api-key
```

### Docker Compose Setup
```yaml
services:
  backend:
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock  # For container management
    networks:
      - app-network
      - dev-server-network
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    cap_add:
      - CHOWN
      - SETGID
      - SETUID

networks:
  dev-server-network:
    driver: bridge
    internal: true  # No external access
```

### Nginx Security Configuration
```nginx
# Rate limiting for dev server proxy
location /proxy/ {
    limit_req zone=proxy burst=10 nodelay;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    proxy_pass http://backend;
    # WebSocket support for hot reload
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

## 🛠️ Usage Examples

### 1. React Counter App
```javascript
const reactCode = `
import React, { useState } from 'react';

export default function App() {
  const [count, setCount] = useState(0);
  
  return (
    <div style={{ padding: '20px', fontFamily: 'Arial' }}>
      <h1>Secure React App</h1>
      <p>Count: {count}</p>
      <button onClick={() => setCount(count + 1)}>
        Increment
      </button>
      <p>🔒 Running in isolated container</p>
    </div>
  );
}
`;

// Create secure dev server
const response = await fetch('/api/dev-server/create', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    code: reactCode,
    language: 'javascript',
    framework: 'react'
  })
});

const { proxyUrl } = await response.json();
// Access at: http://localhost:5000/proxy/{sessionId}
```

### 2. Interactive HTML Page
```javascript
const htmlCode = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Secure HTML App</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; }
        button { padding: 10px 20px; font-size: 16px; margin: 5px; }
        .secure-badge { 
            background: #4CAF50; 
            color: white; 
            padding: 5px 10px; 
            border-radius: 15px; 
            font-size: 12px; 
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔒 Secure HTML Application</h1>
        <span class="secure-badge">Container Isolated</span>
        
        <p>This HTML page is running in a secure Docker container!</p>
        
        <button onclick="showAlert()">Test JavaScript</button>
        <button onclick="changeColor()">Change Color</button>
        
        <div id="output"></div>
    </div>
    
    <script>
        function showAlert() {
            alert('JavaScript works in secure container!');
        }
        
        function changeColor() {
            document.body.style.backgroundColor = 
                '#' + Math.floor(Math.random()*16777215).toString(16);
        }
        
        // Show container info
        document.getElementById('output').innerHTML = 
            '<p><strong>Security Features:</strong></p>' +
            '<ul>' +
            '<li>🔒 Container isolation</li>' +
            '<li>🛡️ No network access</li>' +
            '<li>⏱️ Auto-cleanup after 2 hours</li>' +
            '<li>🚫 No persistent storage</li>' +
            '</ul>';
    </script>
</body>
</html>
`;
```

## 🔍 Security Monitoring

### Real-time Monitoring
```javascript
// Monitor active containers
setInterval(async () => {
  for (const [sessionId, server] of activeDevServers.entries()) {
    try {
      // Check container health
      const container = docker.getContainer(server.containerId);
      const stats = await container.stats({ stream: false });
      
      // Monitor resource usage
      const memoryUsage = stats.memory_stats.usage / stats.memory_stats.limit;
      if (memoryUsage > 0.9) {
        console.warn(`High memory usage in ${sessionId}: ${memoryUsage * 100}%`);
      }
      
      // Check if server is responsive
      const response = await fetch(`http://localhost:${server.port}/`, { timeout: 5000 });
      if (!response.ok) {
        console.warn(`Server ${sessionId} not responding`);
      }
    } catch (error) {
      console.error(`Error monitoring ${sessionId}:`, error);
    }
  }
}, 30000); // Check every 30 seconds
```

### Security Logging
```javascript
// Log all security events
function logSecurityEvent(event, details) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    event,
    details,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  };
  
  console.log('[SECURITY]', JSON.stringify(logEntry));
  
  // Store in database for analysis
  SecurityLog.create(logEntry);
}

// Examples:
logSecurityEvent('DEV_SERVER_CREATED', { sessionId, userId, framework });
logSecurityEvent('UNAUTHORIZED_ACCESS_ATTEMPT', { sessionId, userId });
logSecurityEvent('CONTAINER_RESOURCE_LIMIT_EXCEEDED', { sessionId, resource: 'memory' });
```

## 🚨 Threat Mitigation

### 1. Container Escape Prevention
- **Read-only root filesystem** prevents file system modifications
- **Dropped capabilities** remove dangerous system calls
- **AppArmor/SELinux profiles** provide additional isolation
- **User namespaces** map container root to unprivileged host user

### 2. Resource Exhaustion Protection
- **Memory limits** prevent memory bombs
- **CPU limits** prevent CPU exhaustion
- **Disk quotas** prevent disk space attacks
- **Process limits** prevent fork bombs

### 3. Network Security
- **Internal networks** isolate dev servers from internet
- **No external DNS** prevents data exfiltration
- **Firewall rules** block unauthorized connections
- **Proxy validation** ensures only authorized access

### 4. Data Protection
- **No persistent storage** prevents data persistence
- **Temporary filesystems** are wiped on container stop
- **Input validation** prevents code injection
- **Output sanitization** prevents XSS attacks

## 📊 Performance Optimization

### Container Startup Optimization
```javascript
// Pre-pull base images for faster startup
const baseImages = ['node:18-alpine', 'python:3.11-alpine'];
await Promise.all(baseImages.map(image => docker.pull(image)));

// Use image layers caching
const imageCache = new Map();
function getCachedImage(framework) {
  if (!imageCache.has(framework)) {
    imageCache.set(framework, getSecureDevImage(framework));
  }
  return imageCache.get(framework);
}
```

### Resource Management
```javascript
// Intelligent cleanup based on usage
function scheduleCleanup(sessionId, server) {
  const cleanupTime = server.lastAccess + (30 * 60 * 1000); // 30 min after last access
  const maxTime = server.createdAt + (2 * 60 * 60 * 1000); // 2 hours max
  
  const cleanupAt = Math.min(cleanupTime, maxTime);
  
  setTimeout(() => {
    stopSecureDevServer(sessionId, server.userId);
  }, cleanupAt - Date.now());
}
```

## 🎉 Benefits Achieved

### ✅ Security Benefits
- **Zero Trust Architecture**: Every request is validated
- **Container Isolation**: Complete separation between users
- **Resource Protection**: System resources are protected
- **Attack Surface Reduction**: Minimal exposed functionality
- **Audit Trail**: Complete logging of all activities

### ✅ User Experience Benefits
- **Instant Preview**: Live development servers in seconds
- **Hot Reload**: Real-time code changes
- **Framework Support**: React, Vue, HTML, JS, TS
- **No Setup Required**: Automatic environment configuration
- **Secure Sharing**: Safe URLs for collaboration

### ✅ Operational Benefits
- **Auto-scaling**: Containers start/stop on demand
- **Resource Efficiency**: Automatic cleanup prevents waste
- **Monitoring**: Real-time health and usage tracking
- **Backup/Recovery**: Stateless design enables easy recovery
- **Compliance**: Security controls meet enterprise requirements

This solution provides a production-ready, secure development server system that safely exposes containerized applications while maintaining strict security controls and preventing potential attacks on your system.