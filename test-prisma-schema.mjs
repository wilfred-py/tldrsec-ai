// Test script to verify the Prisma schema migration for the url field in the Summary model
import { PrismaClient } from './lib/generated/prisma/index.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Prisma client
const prisma = new PrismaClient();

async function testPrismaSchema() {
  try {
    console.log('Testing Prisma schema migration for url field in Summary model...');
    
    // Step 1: Create a test user
    console.log('Creating test user...');
    const testUser = await prisma.user.upsert({
      where: {
        email: 'test@example.com'
      },
      update: {
        name: 'Test User'
      },
      create: {
        id: 'test-user-id',
        email: 'test@example.com',
        name: 'Test User',
        authProvider: 'test',
        authProviderId: 'test-provider-id',
        onboardingCompleted: true
      }
    });
    console.log(`Test user created with ID: ${testUser.id}`);
    
    // Step 2: Create a test ticker
    console.log('Creating test ticker...');
    const testTicker = await prisma.ticker.upsert({
      where: {
        userId_symbol: {
          userId: testUser.id,
          symbol: 'TEST'
        }
      },
      update: {
        companyName: 'Test Company, Inc.'
      },
      create: {
        symbol: 'TEST',
        companyName: 'Test Company, Inc.',
        userId: testUser.id
      }
    });
    console.log(`Test ticker created with ID: ${testTicker.id}`);
    
    // Step 2: Create a test summary with the url field
    console.log('Creating test summary with url field...');
    const testSummary = await prisma.summary.create({
      data: {
        tickerId: testTicker.id,
        filingType: 'TEST-FORM',
        filingDate: new Date(),
        filingUrl: 'https://example.com/filing',
        url: 'https://www.sec.gov/example-viewer-url',
        summaryText: 'This is a test summary to verify the url field in the Summary model.',
        summaryJSON: {
          summary: 'Test summary',
          keyPoints: ['Test point 1', 'Test point 2']
        }
      }
    });
    console.log(`Test summary created with ID: ${testSummary.id}`);
    console.log('Summary data:', JSON.stringify(testSummary, null, 2));
    
    // Step 3: Retrieve the test summary to verify the url field
    console.log('Retrieving test summary to verify url field...');
    const retrievedSummary = await prisma.summary.findUnique({
      where: {
        id: testSummary.id
      }
    });
    
    // Step 4: Verify the url field
    if (retrievedSummary.url === 'https://www.sec.gov/example-viewer-url') {
      console.log('SUCCESS: url field is correctly stored and retrieved from the database');
    } else {
      console.error('ERROR: url field is not correctly stored or retrieved from the database');
      console.error('Retrieved url:', retrievedSummary.url);
    }
    
    // Step 5: Clean up test data
    console.log('Cleaning up test data...');
    await prisma.summary.delete({
      where: {
        id: testSummary.id
      }
    });
    console.log('Test summary deleted');
    
    await prisma.ticker.delete({
      where: {
        id: testTicker.id
      }
    });
    console.log('Test ticker deleted');
    
    await prisma.user.delete({
      where: {
        id: testUser.id
      }
    });
    console.log('Test user deleted')
    
    console.log('Test completed successfully');
    return true;
  } catch (error) {
    console.error('Error testing Prisma schema:', error);
    return false;
  } finally {
    // Disconnect Prisma client
    await prisma.$disconnect();
  }
}

// Run the test
testPrismaSchema()
  .then(success => {
    if (success) {
      console.log('Prisma schema migration verification successful');
      process.exit(0);
    } else {
      console.error('Prisma schema migration verification failed');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('Unhandled error during test:', error);
    process.exit(1);
  });
