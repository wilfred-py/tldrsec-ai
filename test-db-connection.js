#!/usr/bin/env node
import { getPrismaClient } from './lib/db/prisma.js';

async function testConnection() {
  console.log('Testing database connection...');
  const prisma = getPrismaClient();
  
  try {
    await prisma.$connect();
    console.log('✅ Database connected successfully');
    
    const count = await prisma.cikMapping.count();
    console.log(`Current CIK mappings: ${count}`);
    
    await prisma.$disconnect();
    console.log('✅ Database disconnected');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
  }
}

testConnection();