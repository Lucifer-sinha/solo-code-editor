const jwt = require('jsonwebtoken');
require('dotenv').config();

async function testJWTFix() {
  console.log('Testing JWT authentication fix...\n');
  
  console.log('JWT_SECRET from environment:', process.env.JWT_SECRET ? 'Present' : 'Missing');
  
  // Test login to get a fresh token
  console.log('\n1. Testing login...');
  try {
    const response = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'semen', password: 'password123' })
    });
    const data = await response.json();
    
    if (response.ok && data.token) {
      console.log('✅ Login successful');
      
      // Verify the token can be decoded
      try {
        const decoded = jwt.verify(data.token, process.env.JWT_SECRET);
        console.log('✅ Token verification successful');
        console.log('Token payload:', { userId: decoded.userId, username: decoded.username });
        
        // Test an authenticated endpoint
        console.log('\n2. Testing authenticated endpoint...');
        const authResponse = await fetch('http://localhost:5000/api/auth/me', {
          headers: { 'Authorization': `Bearer ${data.token}` }
        });
        
        if (authResponse.ok) {
          const userData = await authResponse.json();
          console.log('✅ Authenticated endpoint successful');
          console.log('User data:', userData);
        } else {
          console.error('❌ Authenticated endpoint failed:', authResponse.status);
        }
        
      } catch (verifyError) {
        console.error('❌ Token verification failed:', verifyError.message);
      }
      
    } else {
      console.error('❌ Login failed:', data.error);
    }
  } catch (error) {
    console.error('❌ Login request failed:', error.message);
  }
}

testJWTFix().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});