const io = require('socket.io-client');

// Test DM messaging functionality
async function testDMMessages() {
  console.log('Testing DM message functionality...\n');

  // First, login two users
  let semenToken, semenUserId, trexToken, trexUserId;

  // Login Semen
  console.log('1. Logging in Semen...');
  try {
    const response = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'semen', password: 'password123' })
    });
    const data = await response.json();
    semenToken = data.token;
    semenUserId = data.user.id;
    console.log('✅ Semen login successful, userId:', semenUserId);
  } catch (error) {
    console.error('❌ Semen login failed:', error.message);
    return;
  }

  // Login Trex
  console.log('\n2. Logging in Trex...');
  try {
    const response = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'trex', password: 'password123' })
    });
    const data = await response.json();
    trexToken = data.token;
    trexUserId = data.user.id;
    console.log('✅ Trex login successful, userId:', trexUserId);
  } catch (error) {
    console.error('❌ Trex login failed:', error.message);
    return;
  }

  // Create socket connections
  console.log('\n3. Creating socket connections...');
  const semenSocket = io('http://localhost:5000', { withCredentials: true });
  const trexSocket = io('http://localhost:5000', { withCredentials: true });

  // Wait for connections
  await new Promise((resolve) => {
    let connected = 0;
    semenSocket.on('connect', () => {
      console.log('✅ Semen socket connected');
      connected++;
      if (connected === 2) resolve();
    });
    trexSocket.on('connect', () => {
      console.log('✅ Trex socket connected');
      connected++;
      if (connected === 2) resolve();
    });
  });

  // Join DM room
  const roomId = [semenUserId, trexUserId].sort().join('_');
  console.log('\n4. Joining DM room:', roomId);
  
  semenSocket.emit('join-dm', { room: roomId });
  trexSocket.emit('join-dm', { room: roomId });
  
  // Set up message listeners
  trexSocket.on('dm-message', (msg) => {
    console.log('✅ Trex received DM message:', msg);
  });

  // Send a test message from Semen to Trex
  console.log('\n5. Sending test message...');
  setTimeout(() => {
    const msg = {
      from: semenUserId,
      to: trexUserId,
      content: 'Hello from Semen!',
      timestamp: Date.now(),
      room: roomId,
    };
    
    semenSocket.emit('dm-message', msg);
    console.log('✅ Semen sent DM message');
  }, 1000);

  // Wait a bit then test history
  setTimeout(async () => {
    console.log('\n6. Testing DM history...');
    try {
      const response = await fetch(`http://localhost:5000/api/dm/history?friendId=${trexUserId}`, {
        headers: { 'Authorization': `Bearer ${semenToken}` }
      });
      const data = await response.json();
      console.log('✅ DM history loaded:', data.messages?.length || 0, 'messages');
      if (data.messages?.length > 0) {
        console.log('Latest message:', data.messages[data.messages.length - 1]);
      }
    } catch (error) {
      console.error('❌ Failed to load DM history:', error.message);
    }

    // Close connections
    semenSocket.disconnect();
    trexSocket.disconnect();
    console.log('\n✅ Test completed');
    process.exit(0);
  }, 3000);
}

testDMMessages().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});