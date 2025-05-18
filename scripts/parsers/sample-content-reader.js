#!/usr/bin/env node

/**
 * Sample Content Reader
 * 
 * This script reads and displays content from the sample SEC filing files
 * to demonstrate they exist and can be accessed.
 */

const fs = require('fs');
const path = require('path');

// Configure paths to sample SEC filings
const SAMPLE_FILES = {
  '10K': path.join(__dirname, '../../assets/sample-10k.html'),
  '10Q': path.join(__dirname, '../../assets/sample-10q.html'),
  '8K': path.join(__dirname, '../../assets/sample-8k.html'),
  'PDF': path.join(__dirname, '../../assets/sample-pdf-filing.pdf'),
  'XBRL': path.join(__dirname, '../../assets/sample-sec-filing.xbrl'),
};

// Main function
function main() {
  console.log('Sample Content Reader');
  console.log('====================\n');
  
  console.log('Checking for sample files:');
  console.log('------------------------');
  
  let foundFiles = 0;
  
  // Check each sample file
  for (const [fileType, filePath] of Object.entries(SAMPLE_FILES)) {
    const exists = fs.existsSync(filePath);
    console.log(`${fileType}: ${exists ? 'EXISTS' : 'NOT FOUND'} - ${path.basename(filePath)}`);
    
    if (exists) {
      foundFiles++;
      
      // Read and display a snippet of the file
      const stats = fs.statSync(filePath);
      const buffer = fs.readFileSync(filePath);
      
      console.log(`\nFile: ${path.basename(filePath)}`);
      console.log(`Size: ${stats.size} bytes`);
      console.log(`Type: ${fileType}`);
      
      // Display first 500 characters for text files, or info for binary files
      if (fileType === 'PDF') {
        console.log(`Content: [Binary PDF data - ${buffer.length} bytes]`);
      } else {
        const content = buffer.toString('utf8', 0, Math.min(buffer.length, 1000));
        console.log('\nContent Sample:');
        console.log('---------------');
        console.log(content.substring(0, 500) + '...');
      }
      
      console.log('\n' + '-'.repeat(80) + '\n');
    }
  }
  
  if (foundFiles === 0) {
    console.log('\nNo sample files were found. Please create sample files in the assets directory.');
  } else {
    console.log(`\nFound ${foundFiles} sample files.`);
  }
}

// Run the main function
main(); 