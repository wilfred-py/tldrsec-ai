/**
 * Prisma Client Initialization
 * 
 * This module provides a lazy-loading pattern for Prisma client initialization
 * to prevent build-time errors when the client hasn't been generated yet.
 */

import { PrismaClient } from '@prisma/client';
import { logger } from './logging.js';

// Initialize Prisma client with lazy loading pattern
let prismaInstance = null;

/**
 * Get the Prisma client instance
 * Uses lazy initialization to prevent build-time errors
 * @returns {PrismaClient} The Prisma client instance
 */
export function getPrismaClient() {
  if (!prismaInstance) {
    try {
      prismaInstance = new PrismaClient();
      logger.debug('Prisma client initialized');
    } catch (error) {
      logger.error(`Failed to initialize Prisma client: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  return prismaInstance;
}

/**
 * Disconnect the Prisma client
 * Useful for cleanup during application shutdown
 */
export async function disconnectPrisma() {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    prismaInstance = null;
    logger.debug('Prisma client disconnected');
  }
}
