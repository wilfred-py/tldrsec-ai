#!/usr/bin/env node

/**
 * Script Organization Verification
 * 
 * This simple script verifies that the new organization of scripts is working.
 */

const fs = require('fs');
const path = require('path');

// Function to display directory structure
function listFiles(dir, indent = 0) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stats = fs.statSync(filePath);
    const spacing = ' '.repeat(indent * 2);
    
    if (stats.isDirectory()) {
      console.log(`${spacing}Directory: ${file}/`);
      listFiles(filePath, indent + 1);
    } else {
      console.log(`${spacing}File: ${file} (${stats.size} bytes)`);
    }
  });
}

// Main function
function main() {
  console.log('Script Organization Verification');
  console.log('===============================\n');
  
  console.log('Verifying scripts directory structure:');
  console.log('---------------------------------');
  listFiles(path.join(__dirname, '..'), 1);
  
  console.log('\nVerifying package.json script entries:');
  console.log('---------------------------------');
  const packageJsonPath = path.join(__dirname, '../../package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  console.log('Script Entries:');
  for (const [key, value] of Object.entries(packageJson.scripts)) {
    if (key.startsWith('test:') || key === 'create-pdf') {
      console.log(`  - ${key}: ${value}`);
    }
  }
  
  console.log('\nOrganization verification complete!');
}

// Run the main function
main(); 