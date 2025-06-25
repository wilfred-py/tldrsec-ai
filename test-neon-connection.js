// Test connection to Neon PostgreSQL database for tldrsec-prod
import { PrismaClient } from './lib/generated/prisma/index.js';

async function testConnection() {
  const prisma = new PrismaClient();
  
  try {
    console.log('Attempting to connect to Neon database via Prisma...');
    
    // Test the connection
    const result = await prisma.$queryRaw`SELECT NOW() as current_time`;
    console.log('✅ Successfully connected to the database!');
    console.log('Current database time:', result[0].current_time);
    
    // Count records in main tables
    const userCount = await prisma.user.count();
    const tickerCount = await prisma.ticker.count();
    const summaryCount = await prisma.summary.count();
    
    console.log('\nDatabase statistics:');
    console.log(`- Users: ${userCount}`);
    console.log(`- Tickers: ${tickerCount}`);
    console.log(`- Summaries: ${summaryCount}`);
    
    // List all tables in the database
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `;
    
    console.log('\nTables in the database:');
    if (tables.length === 0) {
      console.log('No tables found in the public schema.');
    } else {
      tables.forEach(table => {
        console.log(`- ${table.table_name}`);
      });
    }
  } catch (err) {
    console.error('❌ Error connecting to the database:', err.message);
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testConnection()
  .then(() => console.log('Test completed.'))
  .catch(err => {
    console.error('Test failed with error:', err);
    process.exit(1);
  });
