// Script to check for any hardcoded database credentials in the generated files
const fs = require('fs');
const path = require('path');

// Define patterns to search for
const patterns = [
  // PostgreSQL connection strings
  /postgresql:\/\/[^@]+@[^\/]+/g,
  // Other potential credential patterns
  /"password":\s*"[^"]+"/g,
  /"apiKey":\s*"[^"]+"/g,
  /"token":\s*"[^"]+"/g,
  /apiKey:\s*['"][^'"]+['"]/g,
  /token:\s*['"][^'"]+['"]/g
];

// Define directories to check
const dirsToCheck = [
  path.join(__dirname, '..', 'src', 'generated'),
];

// Define files to exclude (already checked and known to contain credentials)
const excludeFiles = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.test',
  '.env.production',
  'check-security.js',
];

// Function to check a file for credentials
function checkFile(filePath) {
  // Skip excluded files
  if (excludeFiles.some(exclude => filePath.includes(exclude))) {
    return [];
  }

  // Skip non-text files by extension
  const extensions = ['.js', '.ts', '.jsx', '.tsx', '.json', '.md', '.txt', '.html', '.css', '.prisma'];
  if (!extensions.some(ext => filePath.endsWith(ext))) {
    return [];
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const findings = [];
    
    // Check each pattern
    for (const pattern of patterns) {
      const matches = content.match(pattern);
      if (matches) {
        for (const match of matches) {
          findings.push({
            file: filePath,
            pattern: pattern.toString(),
            match: match
          });
        }
      }
    }
    
    return findings;
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error.message);
    return [];
  }
}

// Function to recursively walk a directory
function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    const dirPath = path.join(dir, f);
    const isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

// Main function
function main() {
  console.log('🔍 Checking for hardcoded credentials in generated files...');
  console.log('Directories being checked:');
  dirsToCheck.forEach(dir => console.log(`- ${dir}`));
  
  let allFindings = [];
  
  // Process each directory
  dirsToCheck.forEach(dir => {
    if (fs.existsSync(dir)) {
      walkDir(dir, (filePath) => {
        const findings = checkFile(filePath);
        if (findings.length > 0) {
          allFindings = [...allFindings, ...findings];
        }
      });
    } else {
      console.warn(`Directory does not exist: ${dir}`);
    }
  });
  
  // Report findings
  if (allFindings.length === 0) {
    console.log('\n✅ No hardcoded credentials found in generated files!');
  } else {
    console.log(`\n⚠️ Found ${allFindings.length} potential credential(s) in generated files:`);
    allFindings.forEach(finding => {
      console.log(`\n🔴 File: ${finding.file}`);
      console.log(`   Pattern: ${finding.pattern}`);
      console.log(`   Match: ${finding.match.replace(/postgresql:\/\/([^:]+):([^@]+)@/, 'postgresql://$1:****@')}`);
    });
    console.log('\nThese files should be removed from git and regenerated!');
  }
  
  return allFindings.length === 0;
}

// Run the check
const isSecure = main();

// Exit with appropriate code
process.exit(isSecure ? 0 : 1); 