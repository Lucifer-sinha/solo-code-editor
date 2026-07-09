const fetch = require('node-fetch');

async function testRename() {
  try {
    console.log('Testing rename endpoint...');
    
    // Test renaming main.py to hello.py
    const response = await fetch('http://localhost:5000/api/fs/rename', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        oldPath: 'main.py', 
        newPath: 'hello.py' 
      })
    });
    
    console.log('Response status:', response.status);
    const data = await response.json();
    console.log('Response data:', data);
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testRename(); 