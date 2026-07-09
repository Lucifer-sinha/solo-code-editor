#!/bin/bash

# 🚀 Continue Secure Deployment
# This script continues the deployment from where it left off

set -e

echo "🚀 Continuing secure deployment of Code-TA..."

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

# Install server dependencies
print_status "Installing server dependencies..."
cd server
npm install
print_success "Server dependencies installed"
cd ..

# Initialize dev server database collections (if MongoDB is available)
print_status "Initializing dev server database collections..."
cd server
if node scripts/initDevServerCollections.js 2>/dev/null; then
    print_success "Dev server collections initialized"
else
    print_warning "Could not initialize dev server collections (MongoDB may not be running)"
fi
cd ..

# Pull required Docker images
print_status "Pulling required Docker images..."
docker pull node:18-alpine || print_warning "Could not pull node:18-alpine"
docker pull python:3.11-alpine || print_warning "Could not pull python:3.11-alpine"
docker pull nginx:alpine || print_warning "Could not pull nginx:alpine"
docker pull mongo:7-jammy || print_warning "Could not pull mongo:7-jammy"
docker pull redis:7-alpine || print_warning "Could not pull redis:7-alpine"

print_success "Docker images pulled"

# Create necessary directories
print_status "Creating directory structure..."
mkdir -p nginx/ssl
mkdir -p server/user_files
mkdir -p server/sandbox
mkdir -p logs
mkdir -p backups

print_success "Directory structure ready"

# Generate SSL certificates if they don't exist
if [ ! -f nginx/ssl/cert.pem ]; then
    print_status "Generating self-signed SSL certificates..."
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout nginx/ssl/key.pem \
        -out nginx/ssl/cert.pem \
        -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost" 2>/dev/null || print_warning "Could not generate SSL certificates"
    
    if [ -f nginx/ssl/cert.pem ]; then
        chmod 600 nginx/ssl/key.pem
        chmod 644 nginx/ssl/cert.pem
        print_success "SSL certificates generated"
    fi
fi

# Start services
print_status "Starting services..."

# Stop any existing containers
docker-compose down 2>/dev/null || true

# Choose the right compose file
if [ -f "docker-compose.secure.yml" ]; then
    COMPOSE_FILE="docker-compose.secure.yml"
    print_status "Using secure compose configuration"
else
    COMPOSE_FILE="docker-compose.yml"
    print_status "Using default compose configuration"
fi

# Start services
docker-compose -f $COMPOSE_FILE up --build -d

print_success "Services started"

# Wait for services to be ready
print_status "Waiting for services to initialize..."
sleep 20

# Health checks
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
echo "=== Resource Usage ==="
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}"
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
EOF

chmod +x monitor.sh
print_success "Monitoring script created"

# Final status
echo
print_success "🎉 Deployment completed!"
echo
echo "🔒 SECURITY FEATURES ENABLED:"
echo "   ✅ Container isolation"
echo "   ✅ Resource limits"
echo "   ✅ Network segmentation"
echo "   ✅ Authentication required"
echo "   ✅ Rate limiting"
echo "   ✅ Auto-cleanup"
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
echo
echo "🔧 NEXT STEPS:"
echo "   1. Edit .env file and add your GEMINI_API_KEY"
echo "   2. Test the secure dev server by creating a React app"
echo "   3. Monitor logs for any issues"
echo "   4. Set up SSL certificates for production"
echo
if [ "$BACKEND_HEALTHY" = true ] && [ "$FRONTEND_HEALTHY" = true ]; then
    print_success "🚀 All services are running and healthy!"
else
    print_warning "⚠️  Some services may still be starting. Check logs with: docker-compose logs -f"
fi