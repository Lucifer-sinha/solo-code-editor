# API Endpoint Migration - Dynamic Host Support

## Overview
This migration makes the application work with any host (localhost, public URLs, tunnel services) instead of being hardcoded to specific endpoints.

## Changes Made

### 1. Dynamic API Configuration (`src/config/api.ts`)
- Created `getApiUrl()` and `getWebSocketUrl()` utility functions
- Added support for environment variables (`VITE_API_URL`, `VITE_WS_URL`)
- Automatic detection of development vs production mode
- Support for relative URLs in development (handled by Vite proxy)
- Smart fallback for different hosting scenarios

### 2. Updated Components
- ✅ `useBackendRunner.ts` - WebSocket and API calls
- ✅ `Terminal.tsx` - WebSocket connections
- ✅ `DMPanel.tsx` - API calls
- ✅ `CollabBashTerminal.tsx` - WebSocket connections
- ✅ `AuthContext.tsx` - Authentication API calls
- ✅ `usePyodideRunner.ts` - File system API calls
- ✅ `Playground.tsx` - File operations API calls

### 3. Server Configuration (`server/index.js`)
- Updated CORS to accept any origin in development
- Added support for common tunnel services (.ngrok.io, .trycloudflare.com, etc.)
- Maintained security for production environments

### 4. Vite Configuration (`vite.config.ts`)
- Enhanced proxy configuration with error handling
- Support for environment variable overrides
- Better WebSocket proxy handling

### 5. Environment Configuration
- Created `.env.example` with configuration examples
- Support for different deployment scenarios

## Remaining Files to Update

The following files still need their fetch calls updated to use `getApiUrl()`:

- `src/components/SecureDevServer.tsx`
- `src/components/MultiUserCollabInvite.tsx`
- `src/components/FriendsPanel.tsx`
- `src/components/FileExplorer.tsx`
- `src/components/CollabRoom.tsx`
- `src/components/AdvancedAIToolsPanel.tsx`

## Usage

### For Development
No configuration needed - the app will automatically use relative URLs handled by Vite proxy.

### For Production with Same Domain
Set in `.env`:
```
VITE_API_URL=https://yourdomain.com
VITE_WS_URL=wss://yourdomain.com
```

### For Production with Different Port
Set in `.env`:
```
VITE_API_URL=https://yourdomain.com:5000
VITE_WS_URL=wss://yourdomain.com:5000
```

### For Tunnel Services
Set in `.env`:
```
VITE_API_URL=https://your-tunnel-url.ngrok.io
VITE_WS_URL=wss://your-tunnel-url.ngrok.io
```

## Benefits
- ✅ Works with localhost development
- ✅ Works with public domains
- ✅ Works with tunnel services (ngrok, cloudflare, etc.)
- ✅ No hardcoded endpoints
- ✅ Easy configuration via environment variables
- ✅ Automatic fallbacks for different scenarios
- ✅ Maintains security in production