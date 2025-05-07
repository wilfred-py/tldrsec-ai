#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

function log(message, color = 'white') {
  console.log(colors[color] + message + colors.reset);
}

function verify(check, message) {
  try {
    log(`\n✓ Checking ${message}...`, 'blue');
    const result = execSync(check, { stdio: 'pipe' }).toString();
    log(`✓ Success: ${message}`, 'green');
    return { success: true, output: result };
  } catch (error) {
    log(`✗ Failed: ${message}`, 'red');
    log(`  Error: ${error.message}`, 'red');
    return { success: false, error };
  }
}

function execute(command, message) {
  try {
    log(`\n▶ ${message}...`, 'blue');
    execSync(command, { stdio: 'inherit' });
    log(`✓ Success: ${message}`, 'green');
    return { success: true };
  } catch (error) {
    log(`✗ Failed: ${message}`, 'red');
    log(`  Error: ${error.message}`, 'red');
    return { success: false, error };
  }
}

async function promptToContinue(message) {
  return new Promise((resolve) => {
    rl.question(`${colors.yellow}${message} (y/n) ${colors.reset}`, (answer) => {
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

async function promptForInput(message, defaultValue = "") {
  return new Promise((resolve) => {
    rl.question(`${colors.cyan}${message} ${defaultValue ? `(${defaultValue})` : ''} ${colors.reset}`, (answer) => {
      resolve(answer || defaultValue);
    });
  });
}

async function setupDatabase() {
  log('\n📦 SECInsightAI Database Setup', 'magenta');
  log('=================================', 'magenta');

  // Check if .env file exists
  const envPath = path.join(__dirname, '..', '.env');
  const envExists = fs.existsSync(envPath);

  if (!envExists) {
    log('\n⚠️ No .env file found. Creating one...', 'yellow');
    
    const dbUrl = await promptForInput('Enter your PostgreSQL database URL:');
    
    if (!dbUrl) {
      log('❌ Database URL is required. Setup aborted.', 'red');
      return;
    }
    
    fs.writeFileSync(envPath, `DATABASE_URL="${dbUrl}"\n`);
    log('✓ Created .env file with database URL', 'green');
  } else {
    log('✓ Found .env file', 'green');
    
    const content = fs.readFileSync(envPath, 'utf8');
    if (!content.includes('DATABASE_URL=')) {
      const dbUrl = await promptForInput('No DATABASE_URL found in .env. Enter your PostgreSQL database URL:');
      
      if (!dbUrl) {
        log('❌ Database URL is required. Setup aborted.', 'red');
        return;
      }
      
      fs.appendFileSync(envPath, `\nDATABASE_URL="${dbUrl}"\n`);
      log('✓ Added database URL to .env file', 'green');
    }
  }

  // 1. Verify dependencies
  log('\n📋 Step 1: Verifying dependencies...', 'magenta');
  
  const nodeResult = verify('node --version', 'Node.js is installed');
  if (!nodeResult.success) {
    log('❌ Please install Node.js version 18 or newer.', 'red');
    return;
  }
  
  const npmResult = verify('npm --version', 'npm is installed');
  if (!npmResult.success) {
    log('❌ Please install npm.', 'red');
    return;
  }

  // 2. Generate Prisma client
  log('\n📋 Step 2: Setting up Prisma...', 'magenta');
  
  const generateResult = execute('npm run prisma:generate', 'Generating Prisma client');
  if (!generateResult.success) {
    const shouldContinue = await promptToContinue('Failed to generate Prisma client. Continue anyway?');
    if (!shouldContinue) return;
  }

  // 3. Push database schema
  log('\n📋 Step 3: Creating database tables...', 'magenta');
  
  const pushResult = execute('npm run prisma:push', 'Creating database tables');
  if (!pushResult.success) {
    log('\n❗ Database push failed. Common reasons:', 'yellow');
    log('  1. Database URL is incorrect in .env', 'yellow');
    log('  2. Database server is not running', 'yellow');
    log('  3. Insufficient permissions', 'yellow');
    
    const fixEnv = await promptToContinue('Would you like to update your DATABASE_URL?');
    if (fixEnv) {
      const newDbUrl = await promptForInput('Enter your PostgreSQL database URL:');
      if (newDbUrl) {
        const content = fs.readFileSync(envPath, 'utf8');
        const updated = content.replace(/DATABASE_URL=.*(\r?\n|$)/g, `DATABASE_URL="${newDbUrl}"\n`);
        fs.writeFileSync(envPath, updated);
        log('✓ Updated DATABASE_URL in .env file', 'green');
        
        const retryPush = await promptToContinue('Retry database push?');
        if (retryPush) {
          execute('npm run prisma:push', 'Retrying database push');
        }
      }
    }
  }

  // 4. Optionally seed the database
  log('\n📋 Step 4: Database seeding', 'magenta');
  
  const shouldSeed = await promptToContinue('Would you like to seed the database with initial data?');
  if (shouldSeed) {
    execute('npm run db:seed', 'Seeding the database');
  }

  // Final verification
  log('\n📋 Final verification...', 'magenta');
  
  // Verify database connection and tables
  const verifyDb = verify('npx prisma db pull --schema=./prisma/schema.prisma', 'Database connection and schema');
  
  log('\n🏁 Setup Complete!', 'green');
  if (verifyDb.success) {
    log('✓ Your database is properly configured and ready to use.', 'green');
  } else {
    log('⚠️ There might still be issues with your database setup.', 'yellow');
    log('  Run `npm run dev` to start the application and check for any errors.', 'yellow');
  }
  
  log('\n📚 Next steps:', 'cyan');
  log('  1. Run `npm run dev` to start the development server', 'cyan');
  log('  2. Visit http://localhost:3000 in your browser', 'cyan');
  log('  3. For database management, run `npm run prisma:studio`', 'cyan');
  
  rl.close();
}

setupDatabase().catch(error => {
  console.error('Setup failed:', error);
  rl.close();
}); 