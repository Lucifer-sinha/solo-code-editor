# 🔒 Secure Development Server Guide

## Overview

The Secure Development Server provides a safe, isolated environment for running React, Vue, HTML, JavaScript, and TypeScript applications with live preview capabilities. Each server runs in a Docker container with strict security controls.

## 🛡️ Security Features

### Container Isolation
- **Sandboxed Execution**: Each dev server runs in an isolated Docker container
- **Resource Limits**: 512MB RAM and CPU restrictions prevent resource abuse
- **Network Isolation**: No external network access for executed code
- **Read-only Security**: Containers run with minimal privileges

### Access Control
- **Authentication Required**: JWT token validation for all operations
- **User Isolation**: Users can only access their own servers
- **Session Management**: Automatic cleanup after 2 hours
- **Rate Limiting**: Prevents abuse and DoS attacks

### Security Headers
- **CSP Protection**: Content Security Policy headers
- **XSS Prevention**: X-XSS-Protection headers
- **Frame Protection**: X-Frame-Options to prevent clickjacking
- **Content Type Protection**: X-Content-Type-Options headers

## 🚀 Usage

### 1. Basic Integration

```typescript
import SecureDevServer from './components/SecureDevServer';

function CodeEditor() {
  const [code, setCode] = useState(`
import React from 'react';

export default function App() {
  return (
    <div>
      <h1>Hello, Secure World!</h1>
      <p>This app is running in a secure container!</p>
    </div>
  );
}
`);

  return (
    <div>
      <textarea 
        value={code} 
        onChange={(e) => setCode(e.target.value)}
        rows={20}
        cols={80}
      />
      
      <SecureDevServer 
        code={code}
        language="javascript"
        framework="react"
        onServerCreated={(server) => {
          console.log('Server created:', server.proxyUrl);
        }}
      />
    </div>
  );
}
```

### 2. API Usage

#### Create Development Server
```javascript
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

const { sessionId, proxyUrl } = await response.json();
```

#### Check Server Status
```javascript
const response = await fetch(`/api/dev-server/${sessionId}/status`, {
  headers: { 'Authorization': `Bearer ${token}` }
});

const status = await response.json();
```

#### Stop Server
```javascript
await fetch(`/api/dev-server/${sessionId}`, {
  method: 'DELETE',
  headers: { 'Authorization': `Bearer ${token}` }
});
```

## 🎯 Supported Frameworks

### React Applications
```javascript
// Automatically creates:
// - package.json with React dependencies
// - vite.config.js for development server
// - index.html with root div
// - src/main.jsx with React setup
// - src/App.jsx with your code

const reactCode = `
import React, { useState } from 'react';

export default function App() {
  const [count, setCount] = useState(0);
  
  return (
    <div style={{ padding: '20px', fontFamily: 'Arial' }}>
      <h1>React Counter App</h1>
      <p>Count: {count}</p>
      <button onClick={() => setCount(count + 1)}>
        Increment
      </button>
    </div>
  );
}
`;
```

### Vue Applications
```javascript
// Automatically creates:
// - package.json with Vue dependencies
// - vite.config.js for development server
// - index.html with app div
// - src/main.js with Vue setup
// - src/App.vue with your code

const vueCode = `
<template>
  <div style="padding: 20px; font-family: Arial;">
    <h1>Vue Counter App</h1>
    <p>Count: {{ count }}</p>
    <button @click="increment">Increment</button>
  </div>
</template>

<script>
import { ref } from 'vue'

export default {
  setup() {
    const count = ref(0)
    
    const increment = () => {
      count.value++
    }
    
    return { count, increment }
  }
}
</script>
`;
```

### HTML Applications
```javascript
// Serves static HTML with Python HTTP server
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
        button { padding: 10px 20px; font-size: 16px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>HTML Application</h1>
        <p>This is running in a secure container!</p>
        <button onclick="alert('Hello from secure container!')">
            Click Me
        </button>
    </div>
</body>
</html>
`;
```

## 🔧 Configuration

### Environment Variables
```bash
# Server Configuration
PORT=5000
PROXY_PORT=8080
JWT_SECRET=your-secret-key

# AI Configuration
GEMINI_API_KEY=your-gemini-api-key

# Database
MONGODB_URI=your-mongodb-connection-string
```

### Docker Requirements
```bash
# Ensure Docker is running
docker --version

# Required base images will be pulled automatically:
# - node:18-alpine (for React/Vue/JS/TS)
# - python:3.11-alpine (for HTML)
```

## 🛠️ Advanced Features

### Custom Server Configuration
```javascript
// The system automatically configures servers based on framework:

// React/Vue: Vite dev server on port 3000
// HTML: Python HTTP server on port 8000
// JavaScript/TypeScript: Node.js server on port 3000

// All servers are configured to:
// - Bind to 0.0.0.0 (accessible from host)
// - Use environment PORT variable
// - Enable hot reloading where applicable
```

### Security Monitoring
```javascript
// Server logs all security events:
// - Container creation/destruction
// - Failed authentication attempts
// - Resource limit violations
// - Expired session cleanup

// Monitor active servers:
const response = await fetch('/api/dev-server/list', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const { servers } = await response.json();
```

### Resource Management
```javascript
// Automatic cleanup:
// - Servers expire after 2 hours
// - Cleanup runs every 10 minutes
// - Containers are forcefully stopped and removed
// - Memory and CPU limits prevent resource exhaustion

// Manual cleanup:
process.on('SIGTERM', async () => {
  // All containers are stopped gracefully
  // Resources are freed immediately
});
```

## 🚨 Security Best Practices

### 1. Input Validation
```javascript
// Always validate user code before creating servers
function validateCode(code, framework) {
  if (!code || code.length > 50000) {
    throw new Error('Code is required and must be under 50KB');
  }
  
  // Check for potentially dangerous patterns
  const dangerousPatterns = [
    /require\s*\(\s*['"]child_process['"]/,
    /import.*child_process/,
    /process\.exit/,
    /fs\.writeFile/
  ];
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(code)) {
      throw new Error('Code contains potentially dangerous operations');
    }
  }
}
```

### 2. Rate Limiting
```javascript
// Implement additional rate limiting for dev server creation
const createServerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 servers per user per 15 minutes
  message: 'Too many development servers created'
});

app.use('/api/dev-server/create', createServerLimiter);
```

### 3. Resource Monitoring
```javascript
// Monitor container resource usage
async function monitorContainerResources(containerId) {
  const container = docker.getContainer(containerId);
  const stats = await container.stats({ stream: false });
  
  const memoryUsage = stats.memory_stats.usage / stats.memory_stats.limit;
  const cpuUsage = calculateCPUPercent(stats);
  
  if (memoryUsage > 0.9 || cpuUsage > 90) {
    console.warn(`High resource usage in container ${containerId}`);
    // Consider stopping the container
  }
}
```

## 🔍 Troubleshooting

### Common Issues

#### 1. Server Creation Timeout
```javascript
// If server creation takes too long:
// - Check Docker daemon status
// - Verify base images are available
// - Check network connectivity for npm install
// - Increase timeout in waitForDevServerReady()
```

#### 2. Proxy Connection Failed
```javascript
// If proxy returns 502 errors:
// - Verify container is running: docker ps
// - Check container logs: docker logs <container-id>
// - Ensure port binding is correct
// - Verify firewall settings
```

#### 3. Authentication Errors
```javascript
// If getting 401 errors:
// - Verify JWT token is valid
// - Check token expiration
// - Ensure Authorization header format: "Bearer <token>"
```

### Debug Mode
```javascript
// Enable debug logging
process.env.DEBUG = 'dev-server:*';

// Check container status
const containers = await docker.listContainers();
console.log('Active containers:', containers.length);

// Monitor server health
setInterval(async () => {
  for (const [sessionId, server] of activeDevServers.entries()) {
    try {
      const response = await fetch(`http://localhost:${server.port}/`);
      console.log(`Server ${sessionId}: ${response.status}`);
    } catch (error) {
      console.error(`Server ${sessionId} unreachable:`, error.message);
    }
  }
}, 30000);
```

## 📊 Performance Considerations

### Resource Limits
- **Memory**: 512MB per container (configurable)
- **CPU**: 50% of one core per container
- **Disk**: Temporary filesystem only
- **Network**: No external access
- **Time**: 2-hour maximum lifetime

### Scaling
- **Horizontal**: Run multiple server instances
- **Load Balancing**: Use nginx or similar
- **Container Orchestration**: Consider Kubernetes for production
- **Database**: Use Redis for session storage in clusters

### Optimization
```javascript
// Pre-pull base images for faster startup
const images = ['node:18-alpine', 'python:3.11-alpine'];
for (const image of images) {
  await docker.pull(image);
}

// Use image caching
const imageCache = new Map();
function getCachedImage(framework) {
  return imageCache.get(framework) || getSecureDevImage('', framework);
}
```

This secure development server provides a robust, isolated environment for running web applications while maintaining strict security controls and preventing potential attacks on your system.