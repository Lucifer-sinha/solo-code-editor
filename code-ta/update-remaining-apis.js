#!/usr/bin/env node

// Script to help update remaining API calls
// Run this to see what still needs to be updated

const fs = require('fs');
const path = require('path');

const filesToUpdate = [
  'src/components/SecureDevServer.tsx',
  'src/components/FriendsPanel.tsx', 
  'src/components/FileExplorer.tsx',
  'src/components/CollabRoom.tsx',
  'src/components/AdvancedAIToolsPanel.tsx'
];

console.log('Files that still need API endpoint updates:');
console.log('='.repeat(50));

filesToUpdate.forEach(file => {
  const fullPath = path.join(__dirname, file);
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf8');
    const matches = content.match(/fetch\s*\(\s*['"]\/api/g);
    if (matches) {
      console.log(`\n${file}: ${matches.length} fetch calls to update`);
      console.log('  Add import: import { getApiUrl } from "../config/api"');
      console.log('  Replace: fetch("/api/... with: fetch(getApiUrl("...');
    }
  }
});

console.log('\n' + '='.repeat(50));
console.log('Manual steps needed:');
console.log('1. Add import { getApiUrl } from "../config/api" to each file');
console.log('2. Replace fetch("/api/endpoint") with fetch(getApiUrl("endpoint"))');
console.log('3. Remove the leading "/api/" from the endpoint string');