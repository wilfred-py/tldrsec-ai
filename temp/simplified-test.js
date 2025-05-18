
// Simplified Content Extraction Test
// This script manually extracts information from a sample file

const fs = require('fs');
const path = require('path');

// Check if sample files exist
const sampleFiles = [
  path.join(__dirname, '../assets/sample-10k.html'),
  path.join(__dirname, '../assets/sample-10q.html'),
  path.join(__dirname, '../assets/sample-8k.html'),
  path.join(__dirname, '../assets/sample-pdf-filing.pdf'),
  path.join(__dirname, '../assets/sample-sec-filing.xbrl'),
];

// Display which files exist
console.log('Sample files:');
sampleFiles.forEach(file => {
  console.log(`${path.basename(file)}: ${fs.existsSync(file) ? 'Exists' : 'Not found'}`);
});

// Find an existing sample file
const existingSample = sampleFiles.find(file => fs.existsSync(file));

if (existingSample) {
  console.log(`\nProcessing ${path.basename(existingSample)}...`);
  
  // Read file content
  const content = fs.readFileSync(existingSample);
  const contentSample = content.toString('utf8', 0, Math.min(content.length, 1000));
  
  console.log('\nFile content sample:');
  console.log('-------------------');
  console.log(contentSample.substring(0, 500) + '...');
  
  console.log('\nSimplified test complete!');
} else {
  console.log('\nNo sample files found to process');
}
