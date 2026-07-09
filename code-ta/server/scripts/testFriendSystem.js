const fetch = require('node-fetch');

async function testFriendSystem() {
  console.log('Testing friend system and DM functionality...\n');

  // Test login for semen
  console.log('1. Logging in as semen...');
  let semenToken;
  let semenUserId;
  try {
    const response = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'semen',
        password: 'password123'
      })
    });
    const data = await response.json();
    semenToken = data.token;
    semenUserId = data.user.id;
    console.log('✅ Semen login successful, userId:', semenUserId);
  } catch (error) {
    console.error('❌ Semen login failed:', error.message);
    return;
  }

  // Test login for trex
  console.log('\n2. Logging in as trex...');
  let trexToken;
  let trexUserId;
  try {
    const response = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'trex',
        password: 'password123'
      })
    });
    const data = await response.json();
    trexToken = data.token;
    trexUserId = data.user.id;
    console.log('✅ Trex login successful, userId:', trexUserId);
  } catch (error) {
    console.error('❌ Trex login failed:', error.message);
    return;
  }

  // Test sending friend request from semen to trex
  console.log('\n3. Sending friend request from semen to trex...');
  try {
    const response = await fetch('http://localhost:5000/api/friends/request', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${semenToken}`
      },
      body: JSON.stringify({
        toUsername: 'trex',
        message: 'Hey, let\'s collaborate!'
      })
    });
    const data = await response.json();
    console.log('✅ Friend request sent:', data);
  } catch (error) {
    console.error('❌ Failed to send friend request:', error.message);
  }

  // Test getting pending requests for trex (using correct endpoint)
  console.log('\n4. Getting pending requests for trex...');
  try {
    const response = await fetch('http://localhost:5000/api/friends/requests', {
      headers: { 'Authorization': `Bearer ${trexToken}` }
    });
    const data = await response.json();
    console.log('✅ Pending requests:', data);
  } catch (error) {
    console.error('❌ Failed to get pending requests:', error.message);
  }

  // Test accepting friend request (using correct parameter)
  console.log('\n5. Accepting friend request...');
  try {
    const response = await fetch('http://localhost:5000/api/friends/accept', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${trexToken}`
      },
      body: JSON.stringify({
        fromUserId: semenUserId
      })
    });
    const data = await response.json();
    console.log('✅ Friend request accepted:', data);
  } catch (error) {
    console.error('❌ Failed to accept friend request:', error.message);
  }

  // Test getting friends list for both users
  console.log('\n6. Getting friends list for semen...');
  try {
    const response = await fetch('http://localhost:5000/api/friends/list', {
      headers: { 'Authorization': `Bearer ${semenToken}` }
    });
    const data = await response.json();
    console.log('✅ Semen friends list:', data);
  } catch (error) {
    console.error('❌ Failed to get friends list:', error.message);
  }

  console.log('\n7. Getting friends list for trex...');
  try {
    const response = await fetch('http://localhost:5000/api/friends/list', {
      headers: { 'Authorization': `Bearer ${trexToken}` }
    });
    const data = await response.json();
    console.log('✅ Trex friends list:', data);
  } catch (error) {
    console.error('❌ Failed to get friends list:', error.message);
  }

  // Test DM history endpoint
  console.log('\n8. Testing DM history endpoint...');
  try {
    const response = await fetch(`http://localhost:5000/api/dm/history?friendId=${trexUserId}`, {
      headers: { 'Authorization': `Bearer ${semenToken}` }
    });
    const data = await response.json();
    console.log('✅ DM history:', data);
  } catch (error) {
    console.error('❌ Failed to get DM history:', error.message);
  }

  console.log('\n🎉 Friend system test completed!');
}

testFriendSystem(); 