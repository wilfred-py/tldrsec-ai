import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testCronMonitoring() {
  console.log('🧪 Testing Cron Job Monitoring Integration...\n');
  
  try {
    // Test 1: Check if monitoring tables exist
    console.log('1️⃣ Testing database schema...');
    
    // Check if we can create a test execution record
    const testExecution = await prisma.cronJobExecution.create({
      data: {
        jobName: 'test-monitoring',
        executionId: 'test-' + Date.now(),
        status: 'STARTED',
        startedAt: new Date(),
        environment: 'test',
        tickersChecked: 0,
        newFilingsFound: 0,
        filingsProcessed: 0,
        emailsSent: 0,
        errorsCount: 0
      }
    });
    
    console.log('✅ CronJobExecution table working');
    
    // Test 2: Test FilingProcessingLog
    const testFiling = await prisma.filingProcessingLog.create({
      data: {
        cronJobExecutionId: testExecution.id,
        accessionNumber: 'test-123456789',
        ticker: 'TEST',
        companyName: 'Test Company Inc.',
        filingType: '10-K',
        filingDate: new Date(),
        filingUrl: 'https://example.com/test-filing',
        status: 'DISCOVERED',
        processedAt: new Date()
      }
    });
    
    console.log('✅ FilingProcessingLog table working');
    
    // Test 3: Test UserNotificationLog
    // First get a user to reference
    const testUser = await prisma.user.findFirst();
    if (testUser) {
      const testNotification = await prisma.userNotificationLog.create({
        data: {
          cronJobExecutionId: testExecution.id,
          filingProcessingLogId: testFiling.id,
          userId: testUser.id,
          userEmail: testUser.email,
          ticker: 'TEST',
          notificationType: 'FILING_SUMMARY',
          deliveryStatus: 'SENT',
          sentAt: new Date()
        }
      });
      console.log('✅ UserNotificationLog table working');
    } else {
      console.log('⚠️ No users found - skipping UserNotificationLog test');
    }
    
    // Test 4: Update execution to completed
    await prisma.cronJobExecution.update({
      where: { id: testExecution.id },
      data: {
        status: 'SUCCESS',
        completedAt: new Date(),
        durationMs: 5000,
        filingsProcessed: 1,
        emailsSent: 1
      }
    });
    
    console.log('✅ Execution update working');
    
    // Test 5: Test analytics queries
    console.log('\n2️⃣ Testing analytics queries...');
    
    const recentExecutions = await prisma.cronJobExecution.findMany({
      orderBy: { startedAt: 'desc' },
      take: 5,
      include: {
        filingProcessingLogs: true,
        userNotificationLogs: true
      }
    });
    
    console.log(`✅ Found ${recentExecutions.length} recent executions`);
    
    const healthStatus = await prisma.cronJobExecution.findFirst({
      where: {
        status: { in: ['SUCCESS', 'FAILED'] }
      },
      orderBy: { completedAt: 'desc' }
    });
    
    console.log(`✅ Latest job status: ${healthStatus?.status || 'NONE'}`);
    
    // Test 6: Cost tracking simulation
    console.log('\n3️⃣ Testing cost tracking...');
    
    await prisma.filingProcessingLog.update({
      where: { id: testFiling.id },
      data: {
        summaryGenerated: true,
        summaryTokens: 1500,
        summaryCostUSD: 0.023,
        aiModel: 'claude-sonnet-4-20250514'
      }
    });
    
    console.log('✅ Cost tracking fields working');
    
    // Cleanup
    console.log('\n4️⃣ Cleaning up test data...');
    
    await prisma.userNotificationLog.deleteMany({
      where: { cronJobExecutionId: testExecution.id }
    });
    
    await prisma.filingProcessingLog.deleteMany({
      where: { cronJobExecutionId: testExecution.id }
    });
    
    await prisma.cronJobExecution.delete({
      where: { id: testExecution.id }
    });
    
    console.log('✅ Test data cleaned up');
    
    console.log('\n🎉 All monitoring integration tests passed!');
    console.log('\n📊 Your cron job monitoring system is ready to use:');
    console.log('   - Database tables created and functional');
    console.log('   - Cost tracking and analytics working');
    console.log('   - Ready for production cron job integration');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('\nError details:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testCronMonitoring().catch(console.error);