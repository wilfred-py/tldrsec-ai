/**
 * Integration test setup - loads environment variables
 *
 * Usage: Add @jest-environment node and import this in integration tests,
 * or run with: node -r dotenv/config ./node_modules/.bin/jest
 */

const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from project root .env
const result = dotenv.config({ path: path.resolve(__dirname, '../.env') });

if (result.error) {
  console.error('Failed to load .env file:', result.error.message);
}

// Verify critical environment variables are available for integration tests
// (Warning suppressed for non-integration tests that don't need DB access)
