const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Function to check if a string contains potential credentials
function containsCredentials(content) {
  // Check for potential database URLs
  const dbUrlRegex = /postgres(ql)?:\/\/[^:]+:[^@]+@.+/gi;
  
  // Check for potential API keys
  const apiKeyRegex = /(api[_-]?key|secret[_-]?key|password|credential)[=:]\s*['"]([^'"]+)['"]/gi;
  
  return dbUrlRegex.test(content) || apiKeyRegex.test(content);
}

// Function to recursively scan directories
function scanDirectory(directory) {
  let hasCredentials = false;
  
  // Skip node_modules and other non-essential directories
  if (path.basename(directory) === 'node_modules') {
    return false;
  }
  
  try {
    const items = fs.readdirSync(directory);
    
    for (const item of items) {
      const itemPath = path.join(directory, item);
      const stats = fs.statSync(itemPath);
      
      if (stats.isDirectory()) {
        // Recursively scan subdirectories
        if (scanDirectory(itemPath)) {
          hasCredentials = true;
        }
      } else if (stats.isFile() && item.endsWith('.js')) {
        // Check JavaScript files for credentials
        const content = fs.readFileSync(itemPath, 'utf8');
        
        if (containsCredentials(content)) {
          console.error(`⚠️ Potential credentials found in: ${itemPath}`);
          hasCredentials = true;
        }
      }
    }
  } catch (error) {
    console.error(`Error scanning directory ${directory}:`, error);
  }
  
  return hasCredentials;
}

// Main script execution
try {
  console.log('Checking for hardcoded credentials in generated files...');
  
  // Check the generated directories
  const generatedDir = path.join(__dirname, '..', 'src', 'generated');
  
  if (fs.existsSync(generatedDir)) {
    const hasIssues = scanDirectory(generatedDir);
    
    if (hasIssues) {
      console.error('\n❌ Security check failed: Hardcoded credentials found in generated files.');
      console.error('Please remove these files from git and regenerate them without credentials.');
      process.exit(1);
    } else {
      console.log('✅ No hardcoded credentials found in generated files.');
      process.exit(0);
    }
  } else {
    console.log('No generated directory found. Skipping check.');
    process.exit(0);
  }
} catch (error) {
  console.error('Error running security check:', error);
  process.exit(1);
} 