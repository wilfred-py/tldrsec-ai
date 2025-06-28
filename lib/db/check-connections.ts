/**
 * Database Connection Health Check Utility
 * 
 * This script provides functions to check database connection health and optimize connections.
 * It can be used to troubleshoot connection pool timeout issues.
 */

import { prisma } from './prisma';
import { checkDatabaseConnection, optimizeConnections, getConnectionPoolStats, getConnectionRecommendation } from './connection-manager';

/**
 * Run a complete database connection health check
 */
export async function runConnectionHealthCheck(): Promise<{
  connectionStatus: boolean;
  poolStats: any;
  recommendation: string;
}> {
  console.log('Starting database connection health check...');
  
  // Check if we can connect to the database
  const connectionStatus = await checkDatabaseConnection()
    .catch(err => {
      console.error('Database connection check failed:', err);
      return false;
    });
  
  console.log(`Database connection status: ${connectionStatus ? 'OK' : 'FAILED'}`);
  
  // Get connection pool statistics
  const poolStats = await getConnectionPoolStats()
    .catch(err => {
      console.error('Failed to get connection pool stats:', err);
      return { error: err.message };
    });
  
  console.log('Connection pool statistics:', poolStats);
  
  // Get connection string recommendation
  const recommendation = getConnectionRecommendation();
  console.log('Connection recommendation:', recommendation);
  
  // Optimize connections
  console.log('Optimizing database connections...');
  await optimizeConnections()
    .catch(err => {
      console.error('Failed to optimize connections:', err);
    });
  
  console.log('Database connection health check completed.');
  
  return {
    connectionStatus,
    poolStats,
    recommendation
  };
}

/**
 * Main function to run the health check if this file is executed directly
 */
async function main() {
  try {
    const result = await runConnectionHealthCheck();
    console.log('Health check result:', result);
  } catch (error) {
    console.error('Error running health check:', error);
  } finally {
    // Disconnect from the database
    await prisma.$disconnect();
  }
}

// Run the main function if this file is executed directly
// Using ES Module detection pattern
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}
