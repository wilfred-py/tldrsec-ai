// Test script for seeding some data into the database
const { PrismaClient } = require('../src/generated/prisma');

async function main() {
  console.log('🌱 Seeding test data into the database...');
  
  // Create a new Prisma client instance
  const prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error'],
  });
  
  try {
    // Create a test user
    console.log('Creating test user...');
    const user = await prisma.user.create({
      data: {
        email: 'test@example.com',
        name: 'Test User',
        authProvider: 'test',
        authProviderId: 'test-id-123',
        notificationPreference: 'immediate',
        theme: 'light',
      },
    });
    console.log('Created user:', user.id);
    
    // Create a test ticker for the user
    console.log('Creating test ticker...');
    const ticker = await prisma.ticker.create({
      data: {
        symbol: 'AAPL',
        companyName: 'Apple Inc.',
        userId: user.id,
      },
    });
    console.log('Created ticker:', ticker.id);
    
    // Create a test summary for the ticker
    console.log('Creating test summary...');
    const summary = await prisma.summary.create({
      data: {
        tickerId: ticker.id,
        filingType: '10-Q',
        filingDate: new Date(),
        filingUrl: 'https://example.com/filing',
        summaryText: 'This is a test summary for Apple Inc.',
        summaryJSON: {
          highlights: [
            'Strong revenue growth',
            'Increased market share',
            'New product announcements'
          ],
          risks: [
            'Supply chain constraints',
            'Regulatory challenges'
          ]
        },
      },
    });
    console.log('Created summary:', summary.id);
    
    // Count records to verify
    const userCount = await prisma.user.count();
    const tickerCount = await prisma.ticker.count();
    const summaryCount = await prisma.summary.count();
    
    console.log('Database now has:');
    console.log(`- ${userCount} users`);
    console.log(`- ${tickerCount} tickers`);
    console.log(`- ${summaryCount} summaries`);
    
    return { success: true, message: 'Test data seeded successfully!' };
  } catch (error) {
    console.error('Error seeding test data:', error);
    return { success: false, error: error.message };
  } finally {
    // Always disconnect the client
    await prisma.$disconnect();
  }
}

// Run the seed function
main()
  .then((result) => {
    console.log('\nSeed result:', result);
    if (result.success) {
      console.log('✅ Database seeded successfully!');
      process.exit(0);
    } else {
      console.error('❌ Database seeding failed!');
      process.exit(1);
    }
  })
  .catch((e) => {
    console.error('Unexpected error:', e);
    process.exit(1);
  }); 