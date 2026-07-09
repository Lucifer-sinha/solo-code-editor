FROM node:18-slim

# Install Docker CLI
RUN apt-get update && apt-get install -y \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    && curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null \
    && apt-get update \
    && apt-get install -y docker-ce-cli \
    && rm -rf /var/lib/apt/lists/*

# Install native build toolchain and headers for Node modules (e.g., bcrypt, sqlite3, node-pty)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-dev \
    make \
    g++ \
    build-essential \
    pkg-config \
    libsqlite3-dev \
    libssl-dev \
    git \
    python-is-python3 \
    && rm -rf /var/lib/apt/lists/*

# Ensure node-gyp uses Python 3
ENV PYTHON=/usr/bin/python3
ENV npm_config_python=/usr/bin/python3

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies (ensure npm knows python path for node-gyp)
RUN npm config set python /usr/bin/python3 \
    && npm ci --only=production

# Copy app source
COPY . .

# Create necessary directories
RUN mkdir -p user_files sandbox problems

# Expose ports
EXPOSE 5000 5001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:5000/api/health || exit 1

# Start the application
CMD ["node", "index.js"]