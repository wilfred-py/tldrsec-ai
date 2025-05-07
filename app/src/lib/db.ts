import { PrismaClient } from '../generated/prisma';

// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit.
// Learn more: https://pris.ly/d/help/next-js-best-practices

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// Log database connection info (only in development)
if (process.env.NODE_ENV !== 'production') {
  // Only show database name for security
  const dbUrl = process.env.DATABASE_URL || '';
  const dbRegex = /postgresql:\/\/.*@.*\/(.*)\?/;
  const matches = dbUrl.match(dbRegex);
  const dbName = matches ? matches[1] : 'unknown';
  console.log(`Connecting to database: ${dbName}`);
}

// Create Prisma Client with error handling
export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

// Verify database connection
async function verifyConnection() {
  try {
    // Test query to check connection
    await prisma.$queryRaw`SELECT 1`;
    console.log('Database connection verified successfully');
    return true;
  } catch (error) {
    console.error('Database connection error:', error);
    return false;
  }
}

// Execute connection verification on startup
if (process.env.NODE_ENV !== 'production') {
  verifyConnection()
    .then(connected => {
      if (!connected) {
        console.warn('WARNING: Database connection failed. App may not function correctly.');
      }
    })
    .catch(error => {
      console.error('Error verifying database connection:', error);
    });
  
  globalForPrisma.prisma = prisma;
} 