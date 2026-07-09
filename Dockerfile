FROM node:18-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production
ENV PYTHON=/usr/bin/python3

RUN apt-get update && apt-get install -y \
    python3 make g++ build-essential libsqlite3-dev curl \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3 /usr/bin/python

WORKDIR /usr/src/app

COPY code-ta/server/package*.json ./
RUN npm ci --omit=dev

COPY code-ta/server/ .

RUN mkdir -p user_files sandbox problems

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:5000/api/health || exit 1

CMD ["node", "index.js"]
