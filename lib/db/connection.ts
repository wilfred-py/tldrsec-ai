/**
 * Database connection compatibility layer
 * 
 * This file provides backward compatibility for imports expecting
 * the connection module. All exports are re-exported from the 
 * main prisma module to maintain consistency.
 */

export { prisma, getPrismaClient } from './prisma';