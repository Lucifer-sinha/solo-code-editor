# 🚀 Online Judge System - Full Stack Implementation

A production-ready online judge system similar to CodeChef/LeetCode with Docker isolation, multiple language support, and real-time code execution.

## ✨ Features

### 🎯 **Core Features**
- **Multi-language Support**: Python, JavaScript, TypeScript, Java, C++, C, C#, Go, Rust, PHP, Ruby, Swift, Kotlin, Scala, Bash
- **Docker Isolation**: Secure code execution in isolated containers
- **Real-time Execution**: Live output streaming and execution status
- **Test Case System**: Automated testing with custom test cases
- **Modern UI**: Beautiful, responsive interface with Monaco Editor
- **File Management**: Create, edit, save, and load code files
- **Security**: Rate limiting, input validation, and container isolation

### 🛠 **Technical Stack**
- **Backend**: Node.js + Express + Docker
- **Frontend**: React + TypeScript + Monaco Editor
- **Styling**: Tailwind CSS
- **Real-time**: WebSocket
- **Security**: Helmet, CORS, Rate Limiting
- **Deployment**: Docker Compose

## 🚀 Quick Start

### Prerequisites
- Docker and Docker Compose
- Node.js 18+ (for development)
- Git

### 1. Clone and Setup
```bash
git clone <repository-url>
cd code-ta
```

### 2. Start with Docker Compose (Recommended)
```bash
# Start the entire system
docker-compose up --build

# Access the application
# Frontend: http://localhost:3000
# Backend API: http://localhost:5000
# WebSocket: ws://localhost:5001
```

### 3. Development Setup (Alternative)
```bash
# Backend
cd server
npm install
npm run dev

# Frontend (in another terminal)
cd ..
npm install
npm run dev
```

## 📁 Project Structure

```
code-ta/
├── server/                 # Backend Node.js application
│   ├── index.js           # Main server file
│   ├── package.json       # Backend dependencies
│   ├── Dockerfile         # Backend container
│   ├── user_files/        # User uploaded files
│   ├── sandbox/           # Execution sandbox
│   └── problems/          # Problem definitions
├── src/                   # Frontend React application
│   ├── components/        # React components
│   │   └── OnlineJudge.tsx # Main judge component
│   ├── pages/             # Page components
│   ├── App.tsx           # Main app component
│   └── index.css         # Global styles
├── frontend/              # Frontend build files
│   ├── Dockerfile        # Frontend container
│   └── nginx.conf        # Nginx configuration
├── docker-compose.yml     # Full stack orchestration
├── package.json          # Frontend dependencies
├── tailwind.config.js    # Tailwind configuration
└── README.md             # This file
```

## 🎮 Usage

### 1. **Code Editor**
- Select your programming language from the dropdown
- Write your code in the Monaco Editor
- Use the input panel to provide program input
- Click "Run Code" to execute

### 2. **Test Cases**
- Switch to the "Test Cases" tab
- Add multiple test cases with input and expected output
- Click "Run Test Cases" for automated testing
- View detailed results and execution time

### 3. **File Operations**
- Save your code to local files
- Load existing code files
- Clear output and reset execution state

### 4. **Settings**
- Toggle between dark and light themes
- Adjust font size for better readability
- Configure editor preferences

## 🔧 Configuration

### Environment Variables

**Frontend (.env)**
```env
VITE_API_URL=http://localhost:5000
VITE_WS_URL=ws://localhost:5001
```

**Backend (server/.env)**
```env
PORT=5000
NODE_ENV=production
FRONTEND_URL=http://localhost:3000
```

### Docker Configuration

The system uses Docker for:
- **Backend Container**: Node.js with Docker CLI for code execution
- **Frontend Container**: Nginx serving React app
- **Execution Containers**: Isolated language-specific containers

### Language Support

| Language | Extension | Docker Image | Memory Limit |
|----------|-----------|--------------|--------------|
| Python | .py | python:3.11-slim | 512MB |
| JavaScript | .js | node:18-slim | 512MB |
| TypeScript | .ts | node:18-slim | 512MB |
| Java | .java | openjdk:17-slim | 1GB |
| C++ | .cpp | gcc:11 | 1GB |
| C | .c | gcc:11 | 1GB |
| C# | .cs | dotnet/sdk:7.0 | 1GB |
| Go | .go | golang:1.20 | 1GB |
| Rust | .rs | rust:1.70 | 1GB |
| PHP | .php | php:8.2-cli | 512MB |
| Ruby | .rb | ruby:3.2-slim | 512MB |
| Swift | .swift | swift:5.8 | 1GB |
| Kotlin | .kt | openjdk:17-slim | 1GB |
| Scala | .scala | openjdk:17-slim | 1GB |
| Bash | .sh | ubuntu:22.04 | 512MB |

## 🔒 Security Features

### Code Execution Security
- **Container Isolation**: Each execution runs in a separate Docker container
- **Resource Limits**: CPU and memory restrictions per execution
- **Network Isolation**: No network access for executed code
- **Read-only Mounts**: Code files mounted as read-only
- **Privilege Dropping**: Containers run without elevated privileges

### API Security
- **Rate Limiting**: 100 requests per minute per IP
- **Input Validation**: All inputs validated and sanitized
- **CORS Protection**: Configured for specific origins
- **Helmet Security**: Security headers and protections

## 🧪 Testing

### Manual Testing
```bash
# Test backend health
curl http://localhost:5000/api/health

# Test language support
curl http://localhost:5000/api/languages

# Test code execution
curl -X POST http://localhost:5000/api/execute \
  -H "Content-Type: application/json" \
  -d '{"code":"print(\"Hello World\")","language":"python"}'
```

### Automated Testing
```bash
# Backend tests
cd server
npm test

# Frontend tests
npm test
```

## 🚀 Deployment

### Production Deployment
```bash
# Build and deploy
docker-compose -f docker-compose.prod.yml up --build -d

# Scale backend for load balancing
docker-compose up --scale backend=3 -d
```

### Environment-Specific Configs
- **Development**: `docker-compose.yml`
- **Production**: `docker-compose.prod.yml`
- **Testing**: `docker-compose.test.yml`

## 📊 Monitoring

### Health Checks
- Backend health endpoint: `/api/health`
- Docker container health checks
- WebSocket connection monitoring

### Logging
- Structured logging with timestamps
- Error tracking and reporting
- Execution metrics collection

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📝 License

MIT License - see LICENSE file for details

## 🆘 Support

For issues and questions:
- Create an issue on GitHub
- Check the documentation
- Review the troubleshooting guide

---

**Built with ❤️ for the coding community** 

### Real-Time Collaboration (Yjs)

A Yjs WebSocket server is used for CRDT-based real-time collaborative editing. Start it with:

```bash
node server/yjs-server.js
```

The frontend connects to this server for Monaco CRDT sync. 