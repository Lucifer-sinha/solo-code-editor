const fetch = require('node-fetch');

async function testAuthMe() {
  console.log('Testing /api/auth/me endpoint...\n');

  // First, get a fresh token
  console.log('1. Getting fresh token...');
  let token;
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
    token = data.token;
    console.log('✅ Got fresh token');
  } catch (error) {
    console.error('❌ Failed to get token:', error.message);
    return;
  }

  // Test /api/auth/me with the fresh token
  console.log('\n2. Testing /api/auth/me...');
  try {
    const response = await fetch('http://localhost:5000/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();
    console.log('Status:', response.status);
    console.log('Response:', data);
  } catch (error) {
    console.error('❌ Failed to test /api/auth/me:', error.message);
  }
}

testAuthMe(); 