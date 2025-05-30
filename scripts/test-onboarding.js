#!/usr/bin/env node

/**
 * Test Onboarding Workflow
 * 
 * This script simulates a user going through the onboarding process
 * by directly calling the server actions. It can be used to test the
 * flow without having to manually click through the UI.
 * 
 * Usage:
 * npm run test:onboarding
 * 
 * To run with a specific email:
 * npm run test:onboarding -- --email=your-test-email@example.com
 */

import { PrismaClient } from '../lib/generated/prisma/index.js';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

// Load environment variables
dotenv.config();

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .option('email', {
    type: 'string',
    description: 'Email to use for testing',
    default: `test-user-${Date.now()}@example.com`
  })
  .option('cleanup', {
    type: 'boolean',
    description: 'Remove test user after testing',
    default: false
  })
  .option('skip-clerk', {
    alias: 'skipClerk',
    type: 'boolean',
    description: 'Skip Clerk user creation (use if you have a test user already)',
    default: false
  })
  .help()
  .parseSync(); // Use parseSync instead of argv to avoid Promise type

// Initialize Prisma
const prisma = new PrismaClient();

// Main function to run tests
async function main() {
  console.log('🚀 Starting onboarding flow test...');
  
  const email = argv.email;
  const skipClerk = argv.skipClerk || argv['skip-clerk'];
  const cleanup = argv.cleanup;
  
  console.log(`📧 Using email: ${email}`);
  
  let clerkUserId = null;
  let dbUserId = null;

  try {
    // Step 1: Create a test user in Clerk (if not skipped)
    if (!skipClerk) {
      console.log('👤 Creating test user in Clerk...');
      clerkUserId = await createClerkUser(email);
      console.log(`✅ Created Clerk user with ID: ${clerkUserId}`);
    } else {
      console.log('⏭️ Skipping Clerk user creation...');
    }
    
    // Step 2: Save user preferences (normally done in the onboarding UI)
    console.log('⚙️ Saving user preferences...');
    await saveUserPreferences(email);
    
    // Step 3: Add some ticker subscriptions
    console.log('📈 Adding ticker subscriptions...');
    const tickers = [
      { symbol: 'AAPL', companyName: 'Apple Inc.' },
      { symbol: 'MSFT', companyName: 'Microsoft Corporation' },
      { symbol: 'GOOGL', companyName: 'Alphabet Inc.' }
    ];
    
    for (const ticker of tickers) {
      await addTickerSubscription(email, ticker.symbol, ticker.companyName);
    }
    
    // Step 4: Complete the onboarding
    console.log('🏁 Completing onboarding...');
    await completeOnboarding(email);
    
    // Step 5: Verify the results
    console.log('🔍 Verifying results...');
    const user = await prisma.user.findUnique({
      where: { email },
      include: { tickers: true }
    });
    
    if (!user) {
      throw new Error(`User with email ${email} not found in database`);
    }
    
    dbUserId = user.id;
    
    console.log('✅ User found in database:');
    console.log(`   - ID: ${user.id}`);
    console.log(`   - Name: ${user.name}`);
    console.log(`   - Onboarding completed: ${user.onboardingCompleted}`);
    console.log(`   - Tickers: ${user.tickers.length}`);
    console.log('   - Ticker symbols: ' + user.tickers.map(t => t.symbol).join(', '));
    
    console.log('🎉 Onboarding flow test completed successfully!');
    
  } catch (error) {
    console.error('❌ Error during onboarding test:', error);
  } finally {
    // Cleanup if requested
    if (cleanup) {
      console.log('🧹 Cleaning up test data...');
      
      if (dbUserId) {
        await prisma.ticker.deleteMany({
          where: { userId: dbUserId }
        });
        
        await prisma.user.delete({
          where: { id: dbUserId }
        });
        
        console.log(`✅ Removed user from database: ${dbUserId}`);
      }
      
      if (clerkUserId && !skipClerk) {
        await deleteClerkUser(clerkUserId);
        console.log(`✅ Removed user from Clerk: ${clerkUserId}`);
      }
    }
    
    await prisma.$disconnect();
  }
}

// Helper function to create a Clerk user
async function createClerkUser(email) {
  const CLERK_API_KEY = process.env.CLERK_SECRET_KEY;
  if (!CLERK_API_KEY) {
    throw new Error('CLERK_SECRET_KEY is not set in environment variables');
  }
  
  const response = await fetch('https://api.clerk.com/v1/users', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CLERK_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email_addresses: [{ email_address: email }],
      password: 'TestPassword123!',
      first_name: 'Test',
      last_name: 'User'
    })
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create Clerk user: ${error}`);
  }
  
  const data = await response.json();
  return data.id;
}

// Helper function to delete a Clerk user
async function deleteClerkUser(userId) {
  const CLERK_API_KEY = process.env.CLERK_SECRET_KEY;
  if (!CLERK_API_KEY) {
    throw new Error('CLERK_SECRET_KEY is not set in environment variables');
  }
  
  const response = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${CLERK_API_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to delete Clerk user: ${error}`);
  }
}

// Simulates the saveUserPreferences server action
async function saveUserPreferences(email) {
  const user = await prisma.user.findUnique({
    where: { email }
  });
  
  // Create user if it doesn't exist yet
  if (!user) {
    await prisma.user.create({
      data: {
        email,
        name: 'Test User',
        authProvider: 'clerk',
        authProviderId: 'test',
        preferences: {
          notifications: {
            emailFrequency: 'daily',
            filingTypes: {
              tenK: true,
              tenQ: true,
              eightK: true,
              form4: false,
              other: false
            },
            contentPreferences: {
              financialHighlights: true,
              riskFactors: true,
              executiveSummary: true,
              forwardLooking: true
            }
          },
          ui: {
            theme: 'system',
            compactView: false,
            showVolumeInCharts: true
          }
        }
      }
    });
  } else {
    // Update existing user
    await prisma.user.update({
      where: { id: user.id },
      data: {
        preferences: {
          notifications: {
            emailFrequency: 'daily',
            filingTypes: {
              tenK: true,
              tenQ: true,
              eightK: true,
              form4: false,
              other: false
            },
            contentPreferences: {
              financialHighlights: true,
              riskFactors: true,
              executiveSummary: true,
              forwardLooking: true
            }
          },
          ui: {
            theme: 'system',
            compactView: false,
            showVolumeInCharts: true
          }
        }
      }
    });
  }
}

// Simulates the addTickerSubscription server action
async function addTickerSubscription(email, symbol, companyName) {
  const user = await prisma.user.findUnique({
    where: { email }
  });
  
  if (!user) {
    throw new Error(`User with email ${email} not found`);
  }
  
  // Check if ticker already exists
  const existingTicker = await prisma.ticker.findFirst({
    where: {
      userId: user.id,
      symbol
    }
  });
  
  if (!existingTicker) {
    await prisma.ticker.create({
      data: {
        symbol,
        companyName,
        userId: user.id
      }
    });
    console.log(`   Added ticker: ${symbol} (${companyName})`);
  } else {
    console.log(`   Ticker already exists: ${symbol}`);
  }
}

// Simulates the completeOnboarding server action
async function completeOnboarding(email) {
  const user = await prisma.user.findUnique({
    where: { email }
  });
  
  if (!user) {
    throw new Error(`User with email ${email} not found`);
  }
  
  await prisma.user.update({
    where: { id: user.id },
    data: {
      onboardingCompleted: true
    }
  });
}

// Run the main function
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
}); 