import { prisma } from './db';

async function main() {
  try {
    // Test database connection
    const result = await prisma.$queryRaw`SELECT NOW()`;
    console.log('Successfully connected to the database!');
    console.log('Current server time:', result);

    // Count each model
    const userCount = await prisma.user.count();
    const tickerCount = await prisma.ticker.count();
    const summaryCount = await prisma.summary.count();

    console.log('Database statistics:');
    console.log(`- Users: ${userCount}`);
    console.log(`- Tickers: ${tickerCount}`);
    console.log(`- Summaries: ${summaryCount}`);

    console.log('Database connection test completed successfully!');
  } catch (error) {
    console.error('Failed to connect to the database:');
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export default main; 