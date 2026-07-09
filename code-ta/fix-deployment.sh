#!/bin/bash

# 🔧 Quick Fix for Deployment Issues
# This script fixes common deployment issues and continues the setup

set -e

echo "🔧 Fixing deployment issues..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
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

# Initialize dev server database collections
print_status "Setting up dev server database collections..."
cd server
if [ -f "scripts/initDevServerCollections.js" ]; then
    node scripts/initDevServerCollections.js
    print_success "Dev server collections initialized"
else
    print_warning "Dev server collections script not found, skipping..."
fi
cd ..

# Install missing dependencies
print_status "Installing missing server dependencies..."
cd server
npm install http-proxy-middleware tar-stream express-rate-limit
print_success "Dependencies installed"
cd ..

# Pull required Docker images
print_status "Pulling required Docker images..."
docker pull node:18-alpine
docker pull python:3.11-alpine
docker pull nginx:alpine

print_success "Docker images ready"

# Start services
print_status "Starting services..."
if [ -f "docker-compose.secure.yml" ]; then
    docker-compose -f docker-compose.secure.yml up -d
else
    print_warning "Using default docker-compose.yml"
    docker-compose up -d
fi

print_success "Services started"

# Wait for services
print_status "Waiting for services to be ready..."
sleep 15

# Health checks
print_status "Checking service health..."

# Check backend
if curl -f http://localhost:5000/api/health >/dev/null 2>&1; then
    print_success "✅ Backend service is healthy"
else
    print_warning "⚠️  Backend service not responding (may still be starting)"
fi

# Check frontend
if curl -f http://localhost:3000 >/dev/null 2>&1; then
    print_success "✅ Frontend service is healthy"
else
    print_warning "⚠️  Frontend service not responding (may still be starting)"
fi

echo
print_success "🎉 Deployment fix completed!"
echo
echo "🌐 Access Points:"
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:5000"
echo "   Health:   http://localhost:5000/api/health"
echo
echo "🔧 Management Commands:"
echo "   View logs:     docker-compose logs -f"
echo "   Stop services: docker-compose down"
echo "   Restart:       docker-compose restart"
echo
echo "📊 Monitor system:"
echo "   ./monitor.sh"