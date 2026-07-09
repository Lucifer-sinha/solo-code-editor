const io = require('socket.io-client');

async function testSocketIO() {
  console.log('Testing Socket.IO real-time functionality...\n');

  // Connect as semen
  console.log('1. Connecting as semen...');
  const semenSocket = io('http://localhost:5000', {
    auth: {
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2ODcyYzAwNDg4ZGU0NzI2OWE3ZTVhM2YiLCJ1c2VybmFtZSI6InNlbWVuIiwiaWF0IjoxNzUyMzUxODM3LCJleHAiOjE3NTI5NTY2Mzd9.2IcERtens4VKEkF52IEoaWcC73QeuFiHiAXw-ZOIfkE'
    }
  });

  semenSocket.on('connect', () => {
    console.log('✅ Semen connected to Socket.IO');
  });

  semenSocket.on('connect_error', (error) => {
    console.error('❌ Semen connection error:', error);
  });

  // Connect as trex
  console.log('\n2. Connecting as trex...');
  const trexSocket = io('http://localhost:5000', {
    auth: {
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2ODcyYzAyYjM0YjZmNGVkN2RiMjM2YzMiLCJ1c2VybmFtZSI6InRyZXgiLCJpYXQiOjE3NTIzNTE4MzgsImV4cCI6MTc1Mjk1NjYzOH0.d8351AGn1MZ5umHjbcH3XFWKRmOpbNuLaMYQxDNuhAE'
    }
  });

  trexSocket.on('connect', () => {
    console.log('✅ Trex connected to Socket.IO');
  });

  trexSocket.on('connect_error', (error) => {
    console.error('❌ Trex connection error:', error);
  });

  // Test DM room joining
  setTimeout(() => {
    console.log('\n3. Testing DM room joining...');
    const roomId = ['6872c00488de47269a7e5a3f', '6872c02b34b6f4ed7db236c3'].sort().join('_');
    console.log('Joining room:', roomId);
    
    semenSocket.emit('join-dm', { room: roomId });
    trexSocket.emit('join-dm', { room: roomId });
    
    console.log('✅ Both users joined DM room');
  }, 1000);

  // Test sending a DM message
  setTimeout(() => {
    console.log('\n4. Testing DM message sending...');
    const roomId = ['6872c00488de47269a7e5a3f', '6872c02b34b6f4ed7db236c3'].sort().join('_');
    
    // Set up message listener for trex
    trexSocket.on('dm-message', (msg) => {
      console.log('✅ Trex received DM message:', msg);
    });
    
    // Send message from semen
    const msg = {
      from: '6872c00488de47269a7e5a3f',
      to: '6872c02b34b6f4ed7db236c3',
      content: 'Hello from Socket.IO test!',
      timestamp: Date.now(),
      room: roomId,
    };
    
    semenSocket.emit('dm-message', msg);
    console.log('✅ Semen sent DM message');
  }, 2000);

  // Cleanup after 5 seconds
  setTimeout(() => {
    console.log('\n5. Cleaning up connections...');
    semenSocket.disconnect();
    trexSocket.disconnect();
    console.log('✅ Test completed');
    process.exit(0);
  }, 5000);
}

testSocketIO(); 