// Test script for Prisma client connection
const { PrismaClient } = require('../src/generated/prisma');

async function main() {
  console.log('Testing database connection...');
  
  // Create a new Prisma client instance
  const prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error'],
  });
  
  try {
    // Try to perform a simple query
    console.log('Attempting to connect to the database...');
    const userCount = await prisma.user.count();
    console.log(`Connection successful! Found ${userCount} users in the database.`);
    
    // If there are users, fetch detailed data 
    if (userCount > 0) {
      console.log('\n📊 Database Contents:');
      
      // Get users with their tickers
      const users = await prisma.user.findMany({
        include: {
          tickers: true,
          _count: {
            select: { tickers: true }
          }
        }
      });
      
      // Display user information
      console.log('\n👤 Users:');
      for (const user of users) {
        console.log(`  - ID: ${user.id}`);
        console.log(`    Email: ${user.email}`);
        console.log(`    Name: ${user.name}`);
        console.log(`    Auth Provider: ${user.authProvider}`);
        console.log(`    Tickers: ${user._count.tickers}`);
      }
      
      // Get all tickers with their summaries
      const tickers = await prisma.ticker.findMany({
        include: {
          summaries: true,
          user: {
            select: {
              email: true,
              name: true
            }
          }
        }
      });
      
      // Display ticker information
      console.log('\n📈 Tickers:');
      for (const ticker of tickers) {
        console.log(`  - Symbol: ${ticker.symbol}`);
        console.log(`    Company: ${ticker.companyName}`);
        console.log(`    Owner: ${ticker.user.name} (${ticker.user.email})`);
        console.log(`    Summaries: ${ticker.summaries.length}`);
        
        // Display summaries for this ticker
        if (ticker.summaries.length > 0) {
          console.log('\n📝 Summaries:');
          for (const summary of ticker.summaries) {
            console.log(`  - Filing Type: ${summary.filingType}`);
            console.log(`    Filing Date: ${summary.filingDate}`);
            console.log(`    Summary: ${summary.summaryText.substring(0, 50)}...`);
            if (summary.summaryJSON) {
              console.log(`    Highlights: ${summary.summaryJSON.highlights.length} items`);
              console.log(`    Risks: ${summary.summaryJSON.risks.length} items`);
            }
          }
        }
      }
    }
    
    return { success: true, message: 'Database connection test successful!' };
  } catch (error) {
    console.error('Error connecting to the database:', error);
    return { success: false, error: error.message };
  } finally {
    // Always disconnect the client
    await prisma.$disconnect();
  }
}

// Run the test
main()
  .then((result) => {
    console.log('\nTest result:', result);
    if (result.success) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  })
  .catch((e) => {
    console.error('Unexpected error:', e);
    process.exit(1);
  }); 