#!/usr/bin/env node

/**
 * Database Connection Optimizer CLI
 * 
 * This script provides a command-line interface to check and optimize database connections.
 * It can be used to troubleshoot connection pool timeout issues.
 * 
 * Usage:
 *   node optimize-connections.js
 */

import { runConnectionHealthCheck } from './check-connections.js';

async function main() {
  console.log('========================================');
  console.log('Database Connection Optimizer');
  console.log('========================================');
  
  try {
    console.log('\nRunning database connection health check...\n');
    const result = await runConnectionHealthCheck();
    
    console.log('\n========================================');
    console.log('Health Check Summary');
    console.log('========================================');
    console.log(`Connection Status: ${result.connectionStatus ? '✅ Connected' : '❌ Failed'}`);
    
    if (result.poolStats && !result.poolStats.error) {
      console.log('\nConnection Pool Statistics:');
      console.log(`- Active Connections: ${result.poolStats.active || 'N/A'}`);
      console.log(`- Idle Connections: ${result.poolStats.idle || 'N/A'}`);
      console.log(`- Total Connections: ${result.poolStats.total || 'N/A'}`);
      console.log(`- Max Connections: ${result.poolStats.max || 'N/A'}`);
      console.log(`- Connection Limit: ${result.poolStats.connectionLimit || 'N/A'}`);
    } else {
      console.log('\nCould not retrieve connection pool statistics.');
    }
    
    console.log('\nRecommendation:');
    console.log(result.recommendation);
    
    console.log('\n========================================');
    console.log('Next Steps');
    console.log('========================================');
    console.log('1. Update your DATABASE_URL in .env with the recommended connection parameters');
    console.log('2. Restart your application to apply the changes');
    console.log('3. Monitor for any further connection pool timeout errors');
    console.log('========================================\n');
    
  } catch (error) {
    console.error('\nError running connection optimizer:', error);
    process.exit(1);
  }
}

// Run the main function
main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
