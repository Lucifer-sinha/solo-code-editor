import { spawn } from 'child_process';
import http from 'http';

console.log('🚀 Starting public tunnel for your project...\n');

// Function to get ngrok URL
function getNgrokUrl() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:4040/api/tunnels', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const tunnels = JSON.parse(data).tunnels;
          const httpsTunnel = tunnels.find(t => t.proto === 'https');
          if (httpsTunnel) {
            resolve(httpsTunnel.public_url);
          } else {
            resolve(null);
          }
        } catch (e) {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(2000, () => resolve(null));
  });
}

// Try to get ngrok URL first
getNgrokUrl().then(url => {
  if (url) {
    console.log('✅ Ngrok tunnel found!');
    console.log(`🌐 Public URL: ${url}`);
    console.log('\n📋 Your project is now accessible at:');
    console.log(`   Frontend: ${url}`);
    console.log(`   Backend API: ${url.replace('https://', 'https://').replace('3000', '5000')}`);
  } else {
    console.log('❌ Ngrok not responding. Trying alternative...');
    console.log('\n🔧 Manual setup:');
    console.log('1. Open a new terminal');
    console.log('2. Run: npx localtunnel --port 3000');
    console.log('3. Copy the provided URL');
    console.log('\n📋 Local URLs:');
    console.log('   Frontend: http://localhost:3000');
    console.log('   Backend: http://localhost:5000');
  }
});
