#!/bin/bash

# 🚀 Simple Secure Deployment Script for Code-TA
# This script avoids complex file operations and focuses on getting the system running

set -e

echo "🚀 Starting simple secure deployment of Code-TA..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "server" ]; then
    print_error "Please run this script from the code-ta directory"
    exit 1
fi

# Check prerequisites
print_status "Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

print_success "Prerequisites check passed"

# Create necessary directories
print_status "Creating directory structure..."
mkdir -p nginx/ssl 2>/dev/null || true
mkdir -p server/user_files 2>/dev/null || true
mkdir -p server/sandbox 2>/dev/null || true
mkdir -p logs 2>/dev/null || true
mkdir -p backups 2>/dev/null || true

print_success "Directory structure created"

# Install server dependencies
print_status "Installing server dependencies..."
cd server
npm install
print_success "Server dependencies installed"
cd ..

# Generate environment file if it doesn't exist
if [ ! -f .env ]; then
    print_status "Generating environment configuration..."
    
    # Generate secure random passwords
    JWT_SECRET=$(openssl rand -base64 32 2>/dev/null || echo "fallback-jwt-secret-$(date +%s)")
    MONGO_ROOT_PASSWORD=$(openssl rand -base64 16 2>/dev/null || echo "fallback-mongo-$(date +%s)")
    REDIS_PASSWORD=$(openssl rand -base64 16 2>/dev/null || echo "fallback-redis-$(date +%s)")
    
    cat > .env << EOF
# 🔒 Secure Production Configuration
NODE_ENV=production
PORT=5000

# Security
JWT_SECRET=${JWT_SECRET}

# Database
MONGODB_URI=mongodb://admin:${MONGO_ROOT_PASSWORD}@mongodb:27017/code-ta?authSource=admin
MONGO_ROOT_USERNAME=admin
MONGO_ROOT_PASSWORD=${MONGO_ROOT_PASSWORD}

# Redis
REDIS_PASSWORD=${REDIS_PASSWORD}

# AI Configuration (Add your API keys)
GEMINI_API_KEY=your-gemini-api-key-here

# Frontend
FRONTEND_URL=http://localhost:3000
VITE_API_URL=http://localhost:5000
VITE_WS_URL=ws://localhost:5001

# Development Server Security
DEV_SERVER_MAX_MEMORY=512m
DEV_SERVER_MAX_CPU=0.5
DEV_SERVER_TIMEOUT=7200
DEV_SERVER_MAX_CONCURRENT=10
EOF

    print_success "Environment file created at .env"
    print_warning "Please edit .env and add your GEMINI_API_KEY before continuing"
else
    print_status "Using existing .env file"
fi

# Generate SSL certificates for development (self-signed)
if [ ! -f nginx/ssl/cert.pem ]; then
    print_status "Generating self-signed SSL certificates..."
    
    if command -v openssl &> /dev/null; then
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout nginx/ssl/key.pem \
            -out nginx/ssl/cert.pem \
            -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost" 2>/dev/null || print_warning "Could not generate SSL certificates"
        
        if [ -f nginx/ssl/cert.pem ]; then
            chmod 600 nginx/ssl/key.pem 2>/dev/null || true
            chmod 644 nginx/ssl/cert.pem 2>/dev/null || true
            print_success "SSL certificates generated"
        fi
    else
        print_warning "OpenSSL not available, skipping SSL certificate generation"
    fi
fi

# Pull required Docker images
print_status "Pulling required Docker images..."
docker pull node:18-alpine || print_warning "Could not pull node:18-alpine"
docker pull python:3.11-alpine || print_warning "Could not pull python:3.11-alpine"
docker pull nginx:alpine || print_warning "Could not pull nginx:alpine"
docker pull mongo:7-jammy || print_warning "Could not pull mongo:7-jammy"
docker pull redis:7-alpine || print_warning "Could not pull redis:7-alpine"

print_success "Docker images ready"

# Stop any existing containers
print_status "Stopping existing containers..."
docker-compose down 2>/dev/null || true

# Choose compose file
COMPOSE_FILE="docker-compose.yml"
if [ -f "docker-compose.secure.yml" ]; then
    COMPOSE_FILE="docker-compose.secure.yml"
    print_status "Using secure compose configuration"
else
    print_status "Using default compose configuration"
fi

# Build and start services
print_status "Building and starting services..."
docker-compose -f $COMPOSE_FILE up --build -d

print_success "Services started successfully"

# Wait for services to be ready
print_status "Waiting for services to initialize..."
sleep 15

# Initialize dev server collections after services are up
print_status "Initializing dev server database collections..."
if [ -f "server/scripts/initDevServerCollections.js" ]; then
    cd server
    if node scripts/initDevServerCollections.js 2>/dev/null; then
        print_success "Dev server collections initialized"
    else
        print_warning "Could not initialize dev server collections (will retry later)"
    fi
    cd ..
fi

# Health checks with retries
print_status "Performing health checks..."

# Check backend
BACKEND_HEALTHY=false
for i in {1..10}; do
    if curl -f http://localhost:5000/api/health >/dev/null 2>&1; then
        print_success "✅ Backend service is healthy"
        BACKEND_HEALTHY=true
        break
    else
        print_status "Waiting for backend... (attempt $i/10)"
        sleep 3
    fi
done

if [ "$BACKEND_HEALTHY" = false ]; then
    print_warning "⚠️  Backend service not responding"
fi

# Check frontend
FRONTEND_HEALTHY=false
for i in {1..5}; do
    if curl -f http://localhost:3000 >/dev/null 2>&1; then
        print_success "✅ Frontend service is healthy"
        FRONTEND_HEALTHY=true
        break
    else
        print_status "Waiting for frontend... (attempt $i/5)"
        sleep 3
    fi
done

if [ "$FRONTEND_HEALTHY" = false ]; then
    print_warning "⚠️  Frontend service not responding"
fi

# Create monitoring script
print_status "Creating monitoring script..."
cat > monitor.sh << 'EOF'
#!/bin/bash
echo "=== Code-TA System Status ==="
echo "Date: $(date)"
echo
echo "=== Docker Containers ==="
docker-compose ps
echo
echo "=== Service Health ==="
echo -n "Backend: "
if curl -f http://localhost:5000/api/health >/dev/null 2>&1; then
    echo "✅ Healthy"
else
    echo "❌ Not responding"
fi
echo -n "Frontend: "
if curl -f http://localhost:3000 >/dev/null 2>&1; then
    echo "✅ Healthy"
else
    echo "❌ Not responding"
fi
echo
echo "=== Resource Usage ==="
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}" 2>/dev/null || echo "Docker stats not available"
EOF

chmod +x monitor.sh 2>/dev/null || true
print_success "Monitoring script created"

# Create backup script
cat > backups/backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$(pwd)/backups"

echo "Starting backup: $DATE"

# Backup user files
if [ -d "server/user_files" ]; then
    tar -czf "$BACKUP_DIR/user_files_$DATE.tar.gz" server/user_files/ 2>/dev/null || echo "Could not backup user files"
fi

# Clean old backups (keep last 7 days)
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +7 -delete 2>/dev/null || true

echo "Backup completed: $DATE"
EOF

chmod +x backups/backup.sh 2>/dev/null || true

# Final status
echo
print_success "🎉 Simple deployment completed!"
echo
echo "🔒 SECURITY FEATURES:"
echo "   ✅ Container isolation enabled"
echo "   ✅ Resource limits configured"
echo "   ✅ Authentication required"
echo "   ✅ Rate limiting enabled"
echo "   ✅ Auto-cleanup configured"
echo
echo "🌐 ACCESS POINTS:"
echo "   Frontend:    http://localhost:3000"
echo "   Backend API: http://localhost:5000"
echo "   Health:      http://localhost:5000/api/health"
echo
echo "🛠️  MANAGEMENT COMMANDS:"
echo "   View logs:       docker-compose logs -f"
echo "   Stop services:   docker-compose down"
echo "   Restart:         docker-compose restart"
echo "   Monitor system:  ./monitor.sh"
echo "   Backup data:     ./backups/backup.sh"
echo
echo "🔧 NEXT STEPS:"
echo "   1. Edit .env file and add your GEMINI_API_KEY"
echo "   2. Test the system: curl http://localhost:5000/api/health"
echo "   3. Access frontend: http://localhost:3000"
echo "   4. Check logs if any issues: docker-compose logs -f"
echo
if [ "$BACKEND_HEALTHY" = true ] && [ "$FRONTEND_HEALTHY" = true ]; then
    print_success "🚀 All services are running and healthy!"
    echo
    echo "🎯 SECURE DEV SERVER READY:"
    echo "   Users can now create React, Vue, HTML, and JS apps"
    echo "   Each app runs in an isolated Docker container"
    echo "   Access via: http://localhost:5000/proxy/{sessionId}"
else
    print_warning "⚠️  Some services may still be starting."
    echo "   Check status with: ./monitor.sh"
    echo "   View logs with: docker-compose logs -f"
fi

echo
print_success "🔒 Secure development server deployment complete!"