const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://lucyfursinahag:An%4005102003@cluster0.labjaji.mongodb.net/code-ta?retryWrites=true&w=majority';

async function checkDMMessages() {
  await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const db = mongoose.connection.db;
  console.log('Connected to MongoDB Atlas');

  // Check messages collection
  console.log('\n=== DM Messages in Database ===');
  const messages = await db.collection('messages').find({}).toArray();
  console.log(`Total messages: ${messages.length}`);
  
  messages.forEach((msg, index) => {
    console.log(`\nMessage ${index + 1}:`);
    console.log(`  Room Type: ${msg.roomType}`);
    console.log(`  Room ID: ${msg.roomId}`);
    console.log(`  From: ${msg.from}`);
    console.log(`  To: ${msg.to}`);
    console.log(`  Content: ${msg.content}`);
    console.log(`  Timestamp: ${new Date(msg.timestamp).toLocaleString()}`);
  });

  // Check specific room
  const roomId = '6872c00488de47269a7e5a3f_6872c02b34b6f4ed7db236c3';
  console.log(`\n=== Messages for Room: ${roomId} ===`);
  const roomMessages = await db.collection('messages').find({ roomId }).toArray();
  console.log(`Messages in room: ${roomMessages.length}`);
  
  roomMessages.forEach((msg, index) => {
    console.log(`\nRoom Message ${index + 1}:`);
    console.log(`  From: ${msg.from}`);
    console.log(`  Content: ${msg.content}`);
    console.log(`  Time: ${new Date(msg.timestamp).toLocaleString()}`);
  });

  await mongoose.disconnect();
}

checkDMMessages().catch(err => {
  console.error('Error checking DM messages:', err);
  process.exit(1);
}); 