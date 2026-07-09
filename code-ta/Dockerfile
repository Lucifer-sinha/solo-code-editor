FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Etc/UTC

ENV DEBIAN_FRONTEND=noninteractive

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PLAYWRIGHT_BROWSERS_PATH=0
ENV NPM_CONFIG_UNSAFE_PERM=true

# Install basic tools
RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    software-properties-common \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release \
    git \
    vim \
    unzip \
    wget

    # Services ko disable karne ka fix
RUN printf '#!/bin/sh\nexit 0\n' > /usr/sbin/policy-rc.d && \
chmod +x /usr/sbin/policy-rc.d

# Non-interactive mode

# Install Python, Java, Go, PHP, Ruby, Mono, Scala (Node.js and npm removed from here)
RUN apt-get update && apt-get install -y \
    python3 python3-pip \
        openjdk-17-jdk \
        golang \
        php \
        ruby-full \
        mono-complete \
    scala \
    && rm -rf /var/lib/apt/lists/*\
    && echo exit 0 > /usr/sbin/policy-rc.d


# Remove any existing nodejs/npm/libnode-dev to avoid conflicts
RUN apt-get remove -y nodejs npm libnode-dev || true

# Symlink node if needed
RUN ln -sf /usr/bin/node /usr/local/bin/node

# Install Rust
RUN curl https://sh.rustup.rs -sSf | bash -s -- -y

# Install matplotlib and Pillow for Python plotting
RUN python3 -m pip install --no-cache-dir matplotlib Pillow

# (Optional) Install Kotlin, Swift, R, Perl, etc.
# RUN curl -s https://get.sdkman.io | bash && bash -c 'source "$HOME/.sdkman/bin/sdkman-init.sh" && sdk install kotlin'
# RUN apt-get update && apt-get install -y --no-install-recommends swiftlang && rm -rf /var/lib/apt/lists/*
# RUN apt-get update && apt-get install -y --no-install-recommends r-base perl && rm -rf /var/lib/apt/lists/*

# Install system dependencies for advanced web development
RUN apt-get update && apt-get install -y \
    build-essential git curl wget unzip zip \
    nginx apache2 \
    python3 python3-pip python3-venv \
    ruby-full \
    php php-cli composer \
    sqlite3 postgresql-client mysql-client redis-tools \
    imagemagick ffmpeg \
    chromium-browser firefox xvfb \
    nano vim less man \
    && apt-get clean


RUN apt-get update && apt-get install -y apt-utils
 
# Node.js (LTS) and global npm tools
RUN curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g npm@latest yarn pnpm typescript ts-node && \
    npm install -g http-server live-server serve && \
    npm install -g sass less postcss-cli autoprefixer && \
    npm install -g webpack webpack-cli rollup parcel && \
    npm install -g eslint prettier stylelint && \
    npm install -g create-react-app vite && \
    npm install -g puppeteer playwright

# 👇 this block
RUN apt-get update && apt-get install -y python3 python3-pip make g++ \
    && ln -sf /usr/bin/python3 /usr/bin/python \
    && npm config set python /usr/bin/python3 \
    && npm rebuild node-pty --build-from-source



# Jekyll (static site generator)
RUN gem install jekyll bundler

# Hugo (static site generator)
RUN wget -O /tmp/hugo.deb https://github.com/gohugoio/hugo/releases/download/v0.124.1/hugo_extended_0.124.1_linux-amd64.deb && \
    dpkg -i /tmp/hugo.deb && rm /tmp/hugo.deb

# Clean up

# Add the run script
COPY run /usr/local/bin/run
RUN chmod +x /usr/local/bin/run

CMD ["/bin/bash"] 