/**
 * Database Connection Manager
 * 
 * This utility helps manage database connections and provides functions
 * to optimize connection pool settings.
 */

import { prisma } from './prisma';

/**
 * Check database connection health
 * 
 * @returns {Promise<boolean>} True if connection is healthy
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    // Execute a simple query to check connection
    await prisma.$queryRaw`SELECT 1`;
    console.log('Database connection is healthy');
    return true;
  } catch (error) {
    console.error('Database connection error:', error);
    return false;
  }
}

/**
 * Get the current database connection pool statistics
 * 
 * @returns {Promise<object>} Connection pool statistics
 */
export async function getConnectionPoolStats(): Promise<Record<string, unknown>> {
  try {
    // Query PostgreSQL's pg_stat_activity to get connection information
    const stats = await prisma.$queryRaw`
      SELECT 
        count(*) as total_connections,
        count(*) FILTER (WHERE state = 'active') as active_connections,
        count(*) FILTER (WHERE state = 'idle') as idle_connections,
        count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction
      FROM pg_stat_activity 
      WHERE datname = current_database()
    `;
    
    return stats[0];
  } catch (error) {
    console.error('Failed to get connection pool stats:', error);
    return { error: 'Failed to get connection statistics' };
  }
}

/**
 * Optimize database connections by releasing idle connections
 * 
 * @returns {Promise<void>}
 */
export async function optimizeConnections(): Promise<void> {
  try {
    // Disconnect and reconnect to reset the connection pool
    await prisma.$disconnect();
    
    // Small delay to ensure connections are fully released
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Reconnect by executing a simple query
    await prisma.$queryRaw`SELECT 1`;
    
    console.log('Database connections optimized');
  } catch (error) {
    console.error('Failed to optimize connections:', error);
  }
}

/**
 * Helper function to parse the DATABASE_URL and extract/update connection parameters
 * 
 * @param {string} url The database connection URL
 * @returns {object} Parsed connection parameters
 */
export function parseConnectionUrl(url: string): Record<string, unknown> {
  try {
    // Basic URL parsing
    const parsedUrl = new URL(url);
    
    // Extract query parameters
    const params = Object.fromEntries(parsedUrl.searchParams.entries());
    
    return {
      host: parsedUrl.hostname,
      port: parsedUrl.port,
      database: parsedUrl.pathname.replace(/^\//, ''),
      username: parsedUrl.username,
      password: parsedUrl.password,
      params: params,
      
      // Connection pool parameters
      poolSize: params.connection_limit || '21', // Default is 21
      poolTimeout: params.pool_timeout || '10',  // Default is 10 seconds
      connectionTimeout: params.connection_timeout || '10000' // Default is 10000ms
    };
  } catch (error) {
    console.error('Failed to parse connection URL:', error);
    return null;
  }
}

/**
 * Build an optimized connection URL with improved pool settings
 * 
 * @param {string} baseUrl The base database connection URL
 * @returns {string} Optimized connection URL
 */
export function buildOptimizedConnectionUrl(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    
    // Set optimized connection pool parameters
    url.searchParams.set('connection_limit', '30');  // Increase from default 21
    url.searchParams.set('pool_timeout', '30');      // Increase from default 10
    url.searchParams.set('connection_timeout', '20000'); // Increase from default 10000
    
    return url.toString();
  } catch (error) {
    console.error('Failed to build optimized connection URL:', error);
    return baseUrl; // Return original if there's an error
  }
}

/**
 * Get recommended DATABASE_URL with optimized connection pool settings
 * 
 * @returns {string} Recommendation message
 */
export function getConnectionRecommendation(): string {
  return `
To fix database connection pool timeout errors, update your DATABASE_URL in .env with these parameters:

1. Add ?connection_limit=30 to increase max connections (default is 21)
2. Add &pool_timeout=30 to increase timeout (default is 10 seconds)
3. Add &connection_timeout=20000 to increase connection timeout (default is 10000ms)

Example:
DATABASE_URL=postgresql://user:password@host:port/database?connection_limit=30&pool_timeout=30&connection_timeout=20000

These settings will help prevent "Timed out fetching a new connection from the connection pool" errors.
`;
}
