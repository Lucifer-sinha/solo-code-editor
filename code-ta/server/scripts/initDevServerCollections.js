const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://lucyfursinahag:An%4005102003@cluster0.labjaji.mongodb.net/code-ta?retryWrites=true&w=majority';

async function initDevServerCollections() {
  try {
    await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    const db = mongoose.connection.db;
    console.log('Connected to MongoDB for dev server collections setup');

    // DEV_SESSIONS (for secure development servers)
    try {
      await db.createCollection('dev_sessions');
      await db.collection('dev_sessions').createIndex({ sessionId: 1 }, { unique: true });
      await db.collection('dev_sessions').createIndex({ userId: 1 });
      await db.collection('dev_sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      await db.collection('dev_sessions').createIndex({ createdAt: 1 });
      console.log('✅ Created dev_sessions collection and indexes');
    } catch (e) {
      console.log('ℹ️  Dev_sessions collection already exists');
    }

    // EXEC_SESSIONS (for code execution tracking)
    try {
      await db.createCollection('exec_sessions');
      await db.collection('exec_sessions').createIndex({ sessionId: 1 }, { unique: true });
      await db.collection('exec_sessions').createIndex({ userId: 1 });
      await db.collection('exec_sessions').createIndex({ createdAt: 1 }, { expireAfterSeconds: 1800 }); // 30 minutes
      await db.collection('exec_sessions').createIndex({ language: 1 });
      console.log('✅ Created exec_sessions collection and indexes');
    } catch (e) {
      console.log('ℹ️  Exec_sessions collection already exists');
    }

    // AI_CHAT_SESSIONS (for AI conversation history)
    try {
      await db.createCollection('ai_chat_sessions');
      await db.collection('ai_chat_sessions').createIndex({ conversationId: 1 }, { unique: true });
      await db.collection('ai_chat_sessions').createIndex({ userId: 1 });
      await db.collection('ai_chat_sessions').createIndex({ createdAt: 1 }, { expireAfterSeconds: 86400 }); // 24 hours
      console.log('✅ Created ai_chat_sessions collection and indexes');
    } catch (e) {
      console.log('ℹ️  Ai_chat_sessions collection already exists');
    }

    // SECURITY_LOGS (for security event tracking)
    try {
      await db.createCollection('security_logs');
      await db.collection('security_logs').createIndex({ timestamp: 1 });
      await db.collection('security_logs').createIndex({ event: 1 });
      await db.collection('security_logs').createIndex({ userId: 1 });
      await db.collection('security_logs').createIndex({ ip: 1 });
      await db.collection('security_logs').createIndex({ createdAt: 1 }, { expireAfterSeconds: 2592000 }); // 30 days
      console.log('✅ Created security_logs collection and indexes');
    } catch (e) {
      console.log('ℹ️  Security_logs collection already exists');
    }

    // Insert sample dev server session (for testing)
    try {
      const sampleSession = {
        sessionId: 'sample-dev-session-123',
        userId: 'alice',
        containerId: 'sample-container-id',
        port: 3000,
        framework: 'react',
        language: 'javascript',
        proxyUrl: 'http://localhost:5000/proxy/sample-dev-session-123',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
        status: 'running'
      };

      await db.collection('dev_sessions').insertOne(sampleSession);
      console.log('✅ Inserted sample dev session for testing');
    } catch (e) {
      console.log('ℹ️  Sample dev session already exists or insertion failed');
    }

    console.log('🎉 Dev server collections setup completed successfully');
    
  } catch (error) {
    console.error('❌ Error setting up dev server collections:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('📡 Disconnected from MongoDB');
  }
}

// Run if called directly
if (require.main === module) {
  initDevServerCollections()
    .then(() => {
      console.log('✅ Script completed successfully');
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Script failed:', err);
      process.exit(1);
    });
}

module.exports = { initDevServerCollections };