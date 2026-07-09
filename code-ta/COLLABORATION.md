# Collaboration Features

## Overview
The application includes real-time collaboration features that allow multiple users to work together on code files and projects.

## How to Use Collaboration

### Starting a Collaboration Session

1. **Select a File or Folder**: In the file explorer, click on any file or folder you want to share
2. **Click the Collaboration Button**: Look for the 👥 icon in the file explorer toolbar
3. **Choose a Friend**: Select a friend from your friends list in the dialog
4. **Start Collaboration**: Click "Start" to send the invitation

### Accepting Collaboration Invitations

1. **Receive Notification**: When someone invites you to collaborate, you'll see a notification in the top-right corner
2. **Accept or Decline**: Click "Accept" to join the collaboration or "Decline" to reject it
3. **Start Collaborating**: Once accepted, you'll enter the collaboration room

### Collaboration Features

- **Real-time Code Editing**: See changes from other users instantly
- **Cursor Tracking**: See where other users are typing
- **Shared File System**: Create, edit, and delete files together
- **Shared Terminal**: Run commands together in a shared environment
- **Live Chat**: Communicate with other collaborators (available in the right panel)

### Collaboration Room Interface

- **Clean Design**: Simple, distraction-free interface
- **File Explorer**: Browse and manage shared files
- **Code Editor**: Real-time collaborative editing with conflict resolution
- **Shared Terminal**: Execute code and commands together
- **Status Indicator**: Blue "Collaborating" badge shows when session is active

### Ending Collaboration

- Click the "End Session" button in the collaboration room header
- This will close the collaboration for all participants

## Technical Features

- **Conflict-free Editing**: Uses Yjs CRDT for seamless real-time collaboration
- **Isolated Workspaces**: Each collaboration session has its own secure workspace
- **Real-time Synchronization**: All changes are synchronized instantly across participants
- **Docker Integration**: Shared terminal runs in isolated Docker containers

## Requirements

- Users must be friends to collaborate
- Both users must be online
- Stable internet connection recommended for best experience