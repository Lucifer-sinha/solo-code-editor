const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://lucyfursinahag:An%4005102003@cluster0.labjaji.mongodb.net/code-ta?retryWrites=true&w=majority';

async function main() {
  await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const db = mongoose.connection.db;
  console.log('Connected to MongoDB Atlas');

  // Get all users
  const users = await db.collection('users').find({}).toArray();
  console.log('\n=== All Users in Database ===');
  users.forEach(user => {
    console.log(`Username: ${user.username}`);
    console.log(`Email: ${user.email}`);
    console.log(`ID: ${user._id}`);
    console.log(`Password Hash: ${user.passwordHash.substring(0, 20)}...`);
    console.log('---');
  });

  // Test password verification for each user
  console.log('\n=== Testing Password Verification ===');
  for (const user of users) {
    try {
      const isValid = await bcrypt.compare('password123', user.passwordHash);
      console.log(`${user.username}: password123 is ${isValid ? 'VALID' : 'INVALID'}`);
    } catch (error) {
      console.log(`${user.username}: Error checking password - ${error.message}`);
    }
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Error checking users:', err);
  process.exit(1);
}); 