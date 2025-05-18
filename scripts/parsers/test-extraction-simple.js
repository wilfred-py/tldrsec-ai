#!/usr/bin/env node

/**
 * Simplified Content Extraction Test
 * 
 * This is a simplified version of the content extraction test that focuses on the core functionality.
 */

const fs = require('fs');
const path = require('path');

// Check if a module exists using require.resolve
function moduleExists(modulePath) {
  try {
    require.resolve(modulePath);
    return true;
  } catch (error) {
    return false;
  }
}

// Test different module paths
const modulePaths = [
  '../../lib/parsers/filing-parser-factory',
  '@/lib/parsers/filing-parser-factory',
  '../lib/parsers/filing-parser-factory',
  '/Users/wilf/Software/tldrsec-ai/tldrsec-ai/lib/parsers/filing-parser-factory'
];

// Try to load the modules
console.log('Testing module paths:');
console.log('=====================\n');

modulePaths.forEach(modulePath => {
  console.log(`Testing path: ${modulePath}`);
  const exists = moduleExists(modulePath);
  console.log(`  - Module ${exists ? 'EXISTS' : 'NOT FOUND'}\n`);
});

// Check for the existence of the actual files
console.log('Checking for file existence:');
console.log('==========================\n');

const filePaths = [
  path.join(__dirname, '../../lib/parsers/filing-parser-factory.js'),
  path.join(__dirname, '../../lib/parsers/filing-parser-factory.ts'),
  path.join(__dirname, '../../lib/parsers/content-extraction-strategy.js'),
  path.join(__dirname, '../../lib/parsers/content-extraction-strategy.ts')
];

filePaths.forEach(filePath => {
  const exists = fs.existsSync(filePath);
  console.log(`File: ${filePath}`);
  console.log(`  - ${exists ? 'EXISTS' : 'NOT FOUND'}\n`);
});

// Check if Next.js aliases are defined
console.log('Checking for Next.js configuration:');
console.log('================================\n');

const nextConfigPath = path.join(__dirname, '../../next.config.js');
if (fs.existsSync(nextConfigPath)) {
  console.log(`Next.js config file exists: ${nextConfigPath}`);
  try {
    const nextConfigContent = fs.readFileSync(nextConfigPath, 'utf8');
    console.log('Next.js config content:');
    console.log(nextConfigContent);
  } catch (error) {
    console.error('Error reading Next.js config:', error);
  }
} else {
  console.log('Next.js config file NOT FOUND');
}

// List the assets directory to see if sample files exist
console.log('\nChecking assets directory:');
console.log('========================\n');

const assetsDir = path.join(__dirname, '../../assets');
if (fs.existsSync(assetsDir)) {
  console.log(`Assets directory exists: ${assetsDir}`);
  try {
    const assetFiles = fs.readdirSync(assetsDir);
    console.log('Asset files:');
    assetFiles.forEach(file => {
      console.log(`  - ${file}`);
    });
  } catch (error) {
    console.error('Error reading assets directory:', error);
  }
} else {
  console.log('Assets directory NOT FOUND');
} 