// Test script to verify the Prisma schema migration for Summary model fields
import { PrismaClient } from './lib/generated/prisma/index.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Prisma client
const prisma = new PrismaClient();

// Suppress Prisma query logs to reduce console clutter
prisma.$on('query', () => {
  // Do nothing with the query event
});

async function testPrismaSchema() {
  try {
    console.log('===== TESTING PRISMA SCHEMA FOR SUMMARY MODEL =====');
    
    // Step 1: Create a test user
    console.log('\nCreating test user...');
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
    console.log('\nCreating test ticker...');
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
    
    // Step 3: Create a test SEC filing
    console.log('\nCreating test SEC filing...');
    const testFiling = await prisma.secFiling.create({
      data: {
        tickerId: testTicker.id,
        formType: '10-K',
        filingDate: new Date(),
        accessionNumber: '0000000000-00-000000',
        secUrl: 'https://www.sec.gov/Archives/edgar/data/0000000/000000000000000000/test-filing.htm',
        companyName: 'Test Company, Inc.',
        cik: '0000000'
      }
    });
    console.log(`Test SEC filing created with ID: ${testFiling.id}`);
    
    // Step 4: Create a test summary with all processing fields
    console.log('\nCreating test summary with all processing fields...');
    const testSummary = await prisma.summary.create({
      data: {
        tickerId: testTicker.id,
        secFilingId: testFiling.id,  // Using secFilingId instead of filingId
        filingType: '10-K',
        filingDate: new Date(),
        filingUrl: 'https://example.com/filing',
        url: 'https://www.sec.gov/example-viewer-url',
        summaryText: 'This is a test summary to verify all the processing fields in the Summary model.',
        summaryJSON: {
          summary: 'Test summary',
          keyPoints: ['Test point 1', 'Test point 2']
        },
        // Processing fields
        processingStatus: 'COMPLETED',
        processingCompletedAt: new Date(),
        processingTimeMs: 5000,
        processingError: null,
        processingErrorCode: null,
        isPartialResult: false,
        tokensUsed: 1500,
        model: 'claude-3-haiku-20240307',
        cost: 0.015,
        attempts: 1,
        sentToUser: false
      }
    });
    console.log(`Test summary created with ID: ${testSummary.id}`);
    
    // Step 5: Retrieve the test summary to verify all fields
    console.log('\nRetrieving test summary to verify all fields...');
    const retrievedSummary = await prisma.summary.findUnique({
      where: {
        id: testSummary.id
      }
    });
    
    console.log('\n===== FIELD VERIFICATION RESULTS =====');
    
    // Verify basic fields
    console.log('\nBasic Fields:');
    console.log(`- URL: ${retrievedSummary.url === 'https://www.sec.gov/example-viewer-url' ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`- Filing URL: ${retrievedSummary.filingUrl === 'https://example.com/filing' ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`- Filing Type: ${retrievedSummary.filingType === '10-K' ? '✅ PASS' : '❌ FAIL'}`);
    
    // Verify processing fields
    console.log('\nProcessing Fields:');
    console.log(`- Processing Status: ${retrievedSummary.processingStatus === 'COMPLETED' ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`- Processing Completed At: ${retrievedSummary.processingCompletedAt ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`- Processing Time (ms): ${retrievedSummary.processingTimeMs === 5000 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`- Is Partial Result: ${retrievedSummary.isPartialResult === false ? '✅ PASS' : '❌ FAIL'}`);
    
    // Verify AI model fields
    console.log('\nAI Model Fields:');
    console.log(`- Tokens Used: ${retrievedSummary.tokensUsed === 1500 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`- Model: ${retrievedSummary.model === 'claude-3-haiku-20240307' ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`- Cost: ${retrievedSummary.cost === 0.015 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`- Attempts: ${retrievedSummary.attempts === 1 ? '✅ PASS' : '❌ FAIL'}`);
    
    // Verify email fields
    console.log('\nEmail Fields:');
    console.log(`- Sent To User: ${retrievedSummary.sentToUser === false ? '✅ PASS' : '❌ FAIL'}`);
    
    // Step 6: Update the summary to test processing status updates
    console.log('\nUpdating summary processing status...');
    const updatedSummary = await prisma.summary.update({
      where: {
        id: testSummary.id
      },
      data: {
        processingStatus: 'FAILED',
        processingError: 'Test error message',
        processingErrorCode: 'TEST_ERROR',
        sentToUser: true
      }
    });
    
    // Verify the update worked
    console.log('\nVerifying status update:');
    console.log(`- Processing Status: ${updatedSummary.processingStatus === 'FAILED' ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`- Processing Error: ${updatedSummary.processingError === 'Test error message' ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`- Processing Error Code: ${updatedSummary.processingErrorCode === 'TEST_ERROR' ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`- Sent To User: ${updatedSummary.sentToUser === true ? '✅ PASS' : '❌ FAIL'}`);
    
    // Overall test result
    const testPassed = 
      retrievedSummary.url === 'https://www.sec.gov/example-viewer-url' &&
      retrievedSummary.processingStatus === 'COMPLETED' &&
      retrievedSummary.tokensUsed === 1500 &&
      retrievedSummary.model === 'claude-3-haiku-20240307' &&
      updatedSummary.processingStatus === 'FAILED' &&
      updatedSummary.sentToUser === true;
    
    console.log('\n===== TEST RESULT =====');
    console.log(testPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED');
    
    // Step 7: Clean up test data
    console.log('\n===== CLEANING UP TEST DATA =====');
    try {
      // Delete summary first (child record)
      console.log('Deleting test summary...');
      await prisma.summary.delete({
        where: {
          id: testSummary.id
        }
      });
      console.log('Test summary deleted');
      
      // Delete SEC filing
      console.log('Deleting test SEC filing...');
      await prisma.secFiling.delete({
        where: {
          id: testFiling.id
        }
      });
      console.log('Test SEC filing deleted');
      
      // Delete ticker
      console.log('Deleting test ticker...');
      await prisma.ticker.delete({
        where: {
          id: testTicker.id
        }
      });
      console.log('Test ticker deleted');
      
      // Delete user
      console.log('Deleting test user...');
      await prisma.user.delete({
        where: {
          id: testUser.id
        }
      });
      console.log('Test user deleted');
      
      console.log('\n✅ All test data cleaned up successfully');
    } catch (cleanupError) {
      console.error('\n⚠️ Error during cleanup:', cleanupError);
      console.error('Some test data may not have been deleted properly');
      // Continue with the test result despite cleanup errors
    }
    
    return testPassed;
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
