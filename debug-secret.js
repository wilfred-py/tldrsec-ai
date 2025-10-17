#!/usr/bin/env node

// Load environment variables
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const cronSecret = process.env.CRON_SECRET;
console.log('CRON_SECRET length:', cronSecret?.length);
console.log('CRON_SECRET hex:', Buffer.from(cronSecret || '', 'utf8').toString('hex'));
console.log('CRON_SECRET has newline:', cronSecret?.includes('\n'));

// Test token (what we're sending)
const testToken = "mgL5bgG9vJQu448gHpjsVZcBCLBdupW0bD9YWw11TC9ix2mhC0zE4LxG64M5LqEuUCRJfAnd05i9LD0r";
console.log('Test token length:', testToken.length);
console.log('Test token hex:', Buffer.from(testToken, 'utf8').toString('hex'));

// Clean the secret (remove newlines)
const cleanSecret = cronSecret?.replace(/\n/g, '');
console.log('Clean secret length:', cleanSecret?.length);
console.log('Secrets match:', testToken === cleanSecret);

// Show the timing-safe comparison result
function timingSafeEqual(a, b) {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  
  let isValid = aBytes.length === bBytes.length;
  const maxLength = Math.max(aBytes.length, bBytes.length);
  
  for (let i = 0; i < maxLength; i++) {
    const aByte = i < aBytes.length ? aBytes[i] : 0;
    const bByte = i < bBytes.length ? bBytes[i] : 0;
    if (aByte !== bByte) {
      isValid = false;
    }
  }
  
  return isValid;
}

console.log('Timing safe comparison (with newline):', timingSafeEqual(testToken, cronSecret || ''));
console.log('Timing safe comparison (clean):', timingSafeEqual(testToken, cleanSecret || ''));