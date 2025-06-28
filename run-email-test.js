// Load environment variables from .env file
import 'dotenv/config';
import { spawn } from 'child_process';

console.log('Loading environment variables from .env file...');
console.log(`RESEND_API_KEY is ${process.env.RESEND_API_KEY ? 'set' : 'not set'}`);
console.log(`TEST_EMAIL is ${process.env.TEST_EMAIL ? 'set' : 'not set'}`);

// Run the test script
console.log('Running email test script...');
const child = spawn('npx', ['tsx', 'direct-sec-email-test-fixed.ts'], {
  stdio: 'inherit',
  env: process.env
});

child.on('close', (code) => {
  console.log(`Email test script exited with code ${code}`);
  process.exit(code);
});
