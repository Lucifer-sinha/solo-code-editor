const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://lucyfursinahag:An%4005102003@cluster0.labjaji.mongodb.net/code-ta?retryWrites=true&w=majority';

async function main() {
  await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const db = mongoose.connection.db;
  console.log('Connected to MongoDB Atlas');

  // Drop collections if they exist
  const collections = await db.listCollections().toArray();
  const names = collections.map(c => c.name);
  for (const name of ['users', 'user_connections', 'files_store', 'messages', 'friend_requests']) {
    if (names.includes(name)) {
      await db.dropCollection(name);
      console.log(`Dropped collection: ${name}`);
    }
  }

  // USERS
  await db.createCollection('users');
  await db.collection('users').createIndex({ username: 1 }, { unique: true });
  await db.collection('users').createIndex({ email: 1 }, { unique: true });
  await db.collection('users').insertMany([
    {
      username: 'alice',
      email: 'alice@example.com',
      passwordHash: 'dummyhash1',
      displayName: 'Alice',
      avatar: '',
      createdAt: new Date(),
      status: 'offline',
      bio: 'Test user Alice',
    },
    {
      username: 'bob',
      email: 'bob@example.com',
      passwordHash: 'dummyhash2',
      displayName: 'Bob',
      avatar: '',
      createdAt: new Date(),
      status: 'offline',
      bio: 'Test user Bob',
    }
  ]);

  // USER_CONNECTIONS (friendships, requests)
  await db.createCollection('user_connections');
  await db.collection('user_connections').createIndex({ userId: 1, friendId: 1 }, { unique: true });
  await db.collection('user_connections').insertMany([
    {
      userId: 'alice',
      friendId: 'bob',
      status: 'pending', // 'pending', 'accepted', 'blocked'
      requestedAt: new Date(),
      acceptedAt: null
    },
    {
      userId: 'bob',
      friendId: 'alice',
      status: 'pending',
      requestedAt: new Date(),
      acceptedAt: null
    }
  ]);

  // FRIEND_REQUESTS (new collection for friend request flow)
  await db.createCollection('friend_requests');
  await db.collection('friend_requests').createIndex({ from: 1, to: 1 }, { unique: true });
  await db.collection('friend_requests').createIndex({ to: 1, status: 1, createdAt: -1 });
  await db.collection('friend_requests').createIndex({ from: 1, status: 1, createdAt: -1 });
  await db.collection('friend_requests').insertMany([
    {
      from: 'alice',
      to: 'bob',
      message: 'Hey Bob, let\'s code together!',
      status: 'pending', // 'pending', 'accepted', 'declined'
      createdAt: new Date(Date.now() - 1000 * 60 * 60), // 1 hour ago
    },
    {
      from: 'bob',
      to: 'alice',
      message: 'Hi Alice, add me back!',
      status: 'pending',
      createdAt: new Date(Date.now() - 1000 * 60 * 30), // 30 min ago
    }
  ]);

  // FILES_STORE
  await db.createCollection('files_store');
  await db.collection('files_store').createIndex({ path: 1, owner: 1 }, { unique: true });
  await db.collection('files_store').insertMany([
    {
      path: '/main.py',
      owner: 'alice',
      content: 'print("Hello from Alice!")',
      createdAt: new Date(),
      updatedAt: new Date(),
      sharedWith: ['bob'],
      language: 'python',
      isPublic: false
    },
    {
      path: '/main.js',
      owner: 'bob',
      content: 'console.log("Hello from Bob!")',
      createdAt: new Date(),
      updatedAt: new Date(),
      sharedWith: ['alice'],
      language: 'javascript',
      isPublic: false
    }
  ]);

  // MESSAGES (for chat, DMs, file/project chat)
  await db.createCollection('messages');
  await db.collection('messages').createIndex({ roomType: 1, roomId: 1 });
  await db.collection('messages').insertMany([
    {
      roomType: 'dm',
      roomId: ['alice', 'bob'].sort().join('_'), // 'alice_bob'
      from: 'alice',
      to: 'bob',
      content: 'Hi Bob! This is Alice.',
      timestamp: new Date()
    },
    {
      roomType: 'file',
      roomId: '/main.py',
      from: 'bob',
      to: null,
      content: 'Nice code, Alice!',
      timestamp: new Date()
    }
  ]);

  console.log('Collections, indexes, and dummy data created.');
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Error initializing MongoDB collections:', err);
  process.exit(1);
}); 