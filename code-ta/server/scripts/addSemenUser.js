const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://lucyfursinahag:An%4005102003@cluster0.labjaji.mongodb.net/code-ta?retryWrites=true&w=majority';

async function main() {
  await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const db = mongoose.connection.db;
  console.log('Connected to MongoDB Atlas');

  // Users to create
  const users = [
    { username: 'semen', email: 'semen@gmail.com', password: 'password123' },
    { username: 'trex', email: 'trex@gmail.com', password: 'password123' },
    { username: 'sid', email: 'sid@gmail.com', password: 'password123' }
  ];

  for (const userData of users) {
    // Check if user already exists
    const existingUser = await db.collection('users').findOne({ username: userData.username });
    
    if (existingUser) {
      console.log(`User ${userData.username} already exists with ID:`, existingUser._id);
      console.log(`User directory should be: user_files/${existingUser._id}`);
    } else {
      // Create user
      const passwordHash = await bcrypt.hash(userData.password, 10);
      const result = await db.collection('users').insertOne({
        username: userData.username,
        email: userData.email,
        passwordHash: passwordHash,
        displayName: userData.username.charAt(0).toUpperCase() + userData.username.slice(1),
        avatar: '',
        createdAt: new Date(),
        status: 'offline',
        bio: `Test user ${userData.username}`,
      });
      
      console.log(`Created user ${userData.username} with ID:`, result.insertedId);
      console.log(`User directory should be: user_files/${result.insertedId}`);
    }
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Error adding users:', err);
  process.exit(1);
}); 