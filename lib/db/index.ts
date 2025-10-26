/**
 * Database client exports
 * 
 * This file centralizes database client exports to prevent circular dependencies
 * and ensure consistent client initialization across the application.
 */

export { prisma, getPrismaClient } from './prisma';
