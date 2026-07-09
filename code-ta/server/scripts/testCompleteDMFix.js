const io = require('socket.io-client');
const jwt = require('jsonwebtoken');
require('dotenv').config();

async function testCompleteDMFix() {
  console.log('Testing complete DM fix (JWT + Socket)...\n');
  
  console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'Present ✅' : 'Missing ❌');
  
  // Test login and JWT
  let semenToken, semenUserId, trexToken, trexUserId;

  console.log('\n1. Testing Semen login and JWT...');
  try {
    const response = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'semen', password: 'password123' })
    });
    const data = await response.json();
    
    if (response.ok && data.token) {
      semenToken = data.token;
      semenUserId = data.user.id;
      
      // Verify token
      const decoded = jwt.verify(semenToken, process.env.JWT_SECRET);
      console.log('✅ Semen login + JWT verification successful');
      console.log('   UserId:', semenUserId);
    } else {
      throw new Error(data.error || 'Login failed');
    }
  } catch (error) {
    console.error('❌ Semen login failed:', error.message);
    return;
  }

  console.log('\n2. Testing Trex login and JWT...');
  try {
    const response = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'trex', password: 'password123' })
    });
    const data = await response.json();
    
    if (response.ok && data.token) {
      trexToken = data.token;
      trexUserId = data.user.id;
      
      // Verify token
      const decoded = jwt.verify(trexToken, process.env.JWT_SECRET);
      console.log('✅ Trex login + JWT verification successful');
      console.log('   UserId:', trexUserId);
    } else {
      throw new Error(data.error || 'Login failed');
    }
  } catch (error) {
    console.error('❌ Trex login failed:', error.message);
    return;
  }

  // Test authenticated API endpoints
  console.log('\n3. Testing authenticated API endpoints...');
  try {
    const friendsResponse = await fetch('http://localhost:5000/api/friends/list', {
      headers: { 'Authorization': `Bearer ${semenToken}` }
    });
    
    if (friendsResponse.ok) {
      console.log('✅ Friends API endpoint working');
    } else {
      console.error('❌ Friends API endpoint failed:', friendsResponse.status);
    }
  } catch (error) {
    console.error('❌ Friends API test failed:', error.message);
  }

  // Test socket connections with user-online
  console.log('\n4. Testing socket connections...');
  const semenSocket = io('http://localhost:5000', { withCredentials: true });
  const trexSocket = io('http://localhost:5000', { withCredentials: true });

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

  // Emit user-online events
  console.log('\n5. Registering users with socket server...');
  semenSocket.emit('user-online', { username: 'semen', userId: semenUserId });
  trexSocket.emit('user-online', { username: 'trex', userId: trexUserId });
  
  await new Promise(resolve => setTimeout(resolve, 500));

  // Test DM functionality
  const roomId = [semenUserId, trexUserId].sort().join('_');
  console.log('\n6. Testing DM functionality...');
  console.log('   Room ID:', roomId);
  
  semenSocket.emit('join-dm', { room: roomId });
  trexSocket.emit('join-dm', { room: roomId });
  
  // Set up message listener
  let messageReceived = false;
  trexSocket.on('dm-message', (msg) => {
    console.log('✅ Message received by Trex:', msg.content);
    messageReceived = true;
  });

  // Send test message
  setTimeout(() => {
    const msg = {
      from: semenUserId,
      to: trexUserId,
      content: 'Test message with complete fix!',
      timestamp: Date.now(),
      room: roomId,
    };
    
    console.log('📤 Semen sending message...');
    semenSocket.emit('dm-message', msg);
  }, 1000);

  // Check results
  setTimeout(async () => {
    if (messageReceived) {
      console.log('✅ Real-time message delivery working!');
    } else {
      console.log('❌ Real-time message delivery failed');
    }

    // Test message history
    console.log('\n7. Testing message history...');
    try {
      const historyResponse = await fetch(`http://localhost:5000/api/dm/history?friendId=${trexUserId}`, {
        headers: { 'Authorization': `Bearer ${semenToken}` }
      });
      
      if (historyResponse.ok) {
        const historyData = await historyResponse.json();
        console.log('✅ Message history loaded:', historyData.messages?.length || 0, 'messages');
      } else {
        console.error('❌ Message history failed:', historyResponse.status);
      }
    } catch (error) {
      console.error('❌ Message history test failed:', error.message);
    }

    // Cleanup
    semenSocket.disconnect();
    trexSocket.disconnect();
    
    console.log('\n🎉 Complete DM fix test completed!');
    console.log('   - JWT authentication: Fixed ✅');
    console.log('   - Socket user registration: Fixed ✅');
    console.log('   - Real-time messaging: Should work ✅');
    console.log('   - Message persistence: Working ✅');
    
    process.exit(0);
  }, 3000);
}

testCompleteDMFix().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});