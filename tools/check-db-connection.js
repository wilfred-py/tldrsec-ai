#!/usr/bin/env node

/**
 * Database Connection Check
 * 
 * This script verifies the database connection and checks if the secFetchAttempt table exists
 * Uses the same Prisma client initialization pattern as the main application
 */

// Import Prisma client directly from the generated path
import { PrismaClient } from '../lib/generated/prisma/index.js';
import { logger } from '../lib/logging.js';

// Initialize Prisma client
let prismaInstance = null;

function getPrismaClient() {
  if (!prismaInstance) {
    try {
      prismaInstance = new PrismaClient();
      console.log('✅ Prisma client initialized successfully');
    } catch (error) {
      console.error(`❌ Failed to initialize Prisma client: ${error.message}`);
      throw error;
    }
  }
  return prismaInstance;
}

// Function to log Prisma client initialization status
async function checkPrismaClient() {
  try {
    const prisma = getPrismaClient();
    console.log('✅ Prisma client initialized successfully');
    return prisma;
  } catch (error) {
    console.error(`❌ Failed to initialize Prisma client: ${error.message}`);
    throw error;
  }
}

async function checkDatabaseConnection() {
  console.log('=== Database Connection Check ===');
  
  try {
    // Get Prisma client
    const prisma = await checkPrismaClient();
    
    // Test database connection
    console.log('Testing database connection...');
    await prisma.$connect();
    console.log('✅ Successfully connected to database');
    
    // Check if secFetchAttempt table exists by querying it
    console.log('\nChecking secFetchAttempt table...');
    try {
      const count = await prisma.secFetchAttempt.count();
      console.log(`✅ secFetchAttempt table exists with ${count} records`);
    } catch (tableError) {
      console.error(`❌ Error accessing secFetchAttempt table: ${tableError.message}`);
      console.log('\nChecking if table exists in database schema...');
      
      // Try to query the information schema to check if the table exists
      try {
        const tables = await prisma.$queryRaw`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'`;
        
        console.log('Available tables in database:');
        console.log(tables);
        
        // Check specifically for secFetchAttempt table (case insensitive)
        const secFetchTable = tables.find(t => 
          t.table_name.toLowerCase() === 'secfetchattempt' || 
          t.table_name.toLowerCase() === 'sec_fetch_attempt');
        
        if (secFetchTable) {
          console.log(`✅ Table found in database schema as ${secFetchTable.table_name}`);
        } else {
          console.log('❌ SecFetchAttempt table not found in database schema');
          console.log('Run Prisma migration to create the table:');
          console.log('npx prisma migrate dev --name add_sec_fetch_attempt');
        }
      } catch (schemaError) {
        console.error(`❌ Error querying database schema: ${schemaError.message}`);
      }
    }
    
    // Disconnect from database
    await prisma.$disconnect();
    
  } catch (error) {
    console.error(`❌ Database connection check failed: ${error.message}`);
  }
}

// Run the check
checkDatabaseConnection().catch(console.error);
