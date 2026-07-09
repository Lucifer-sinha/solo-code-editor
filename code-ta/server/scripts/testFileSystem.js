const fetch = require('node-fetch');

async function testFileSystem() {
  console.log('Testing file system API...\n');

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

  // Test file list endpoint
  console.log('\n2. Testing /api/fs/list...');
  try {
    const response = await fetch('http://localhost:5000/api/fs/list?path=%2Fuser_files%2F6872c00488de47269a7e5a3f', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();
    console.log('Status:', response.status);
    console.log('Response:', data);
  } catch (error) {
    console.error('❌ Failed to test /api/fs/list:', error.message);
  }

  // Test creating a file
  console.log('\n3. Testing file creation...');
  try {
    const response = await fetch('http://localhost:5000/api/fs/file', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        path: '/user_files/6872c00488de47269a7e5a3f/test.py',
        content: 'print("Hello, World!")'
      })
    });
    const data = await response.json();
    console.log('Status:', response.status);
    console.log('Response:', data);
  } catch (error) {
    console.error('❌ Failed to create file:', error.message);
  }

  // Test reading the file
  console.log('\n4. Testing file read...');
  try {
    const response = await fetch('http://localhost:5000/api/fs/file?path=%2Fuser_files%2F6872c00488de47269a7e5a3f%2Ftest.py', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();
    console.log('Status:', response.status);
    console.log('Response:', data);
  } catch (error) {
    console.error('❌ Failed to read file:', error.message);
  }
}

testFileSystem(); 