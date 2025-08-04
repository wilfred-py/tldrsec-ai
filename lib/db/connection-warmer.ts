/**
 * Database Connection Warmer
 * 
 * Pre-warms database connections to prevent cold start issues
 */

import { prisma } from './prisma';
import { dbRetry } from './retry-wrapper';
import { databaseMonitoring } from './monitoring';

/**
 * Warm up the database connection pool
 * This helps prevent cold start issues by establishing connections early
 */
export async function warmupDatabaseConnection(): Promise<boolean> {
  const startTime = Date.now();
  
  try {
    // Execute a simple query to establish connection
    await dbRetry.healthCheck(async () => {
      await prisma.$queryRaw`SELECT 1 as warmup`;
    });
    
    const responseTime = Date.now() - startTime;
    databaseMonitoring.trackWarmupOperation(true, responseTime);
    
    console.log('✅ Database connection warmed up successfully');
    return true;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    databaseMonitoring.trackWarmupOperation(false, responseTime);
    
    console.error('⚠️ Database warmup failed:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Background connection warmer that runs periodically
 * Keeps the connection pool active to prevent hibernation
 */
export class ConnectionWarmer {
  private intervalId: NodeJS.Timeout | null = null;
  private isWarming = false;
  
  /**
   * Start periodic connection warming
   * @param intervalMinutes - How often to warm connections (default: 5 minutes)
   */
  start(intervalMinutes = 5) {
    if (this.intervalId) {
      console.log('Connection warmer already running');
      return;
    }
    
    const intervalMs = intervalMinutes * 60 * 1000;
    
    this.intervalId = setInterval(async () => {
      if (this.isWarming) {
        console.log('Connection warming already in progress, skipping...');
        return;
      }
      
      this.isWarming = true;
      try {
        await warmupDatabaseConnection();
      } finally {
        this.isWarming = false;
      }
    }, intervalMs);
    
    console.log(`Connection warmer started (interval: ${intervalMinutes} minutes)`);
    
    // Warm up immediately
    warmupDatabaseConnection();
  }
  
  /**
   * Stop periodic connection warming
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('Connection warmer stopped');
    }
  }
}

// Export a singleton instance
export const connectionWarmer = new ConnectionWarmer();