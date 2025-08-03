import { config } from 'dotenv';
import path from 'path';

// Load environment variables for testing
config({ path: path.resolve(process.cwd(), '.env.local') });

// Set test-specific environment variables
process.env.NODE_ENV = 'test';
process.env.NEXTAUTH_URL = 'http://localhost:3000';

// Increase timeout for build tests
jest.setTimeout(120000);

// Global test setup
beforeAll(() => {
  console.log('🧪 Starting build validation tests...');
});

afterAll(() => {
  console.log('✅ Build validation tests completed');
});