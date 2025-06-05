/**
 * Simple Check for Claude AI Integration Components
 * 
 * This script checks for the existence of all necessary files and components
 * required for the Claude AI summarization integration to work properly.
 * 
 * Run with: node check-claude-integration.js
 */

import { promises as fs } from 'fs';
import * as path from 'path';

// Define paths to key files that should exist
const keyPaths = [
  // Core AI integration files
  './lib/ai/claude-client.js',
  './lib/ai/sec-prompts.js',
  './lib/ai/summarize.ts',
  './lib/ai/config.js',
  
  // Content extraction
  './lib/parsers/filing-extractor.ts',
  
  // Services
  './services/filingService.ts',
  './services/secService.ts',
  
  // Database
  './lib/db/prisma.ts',
  './prisma/schema.prisma'
];

// Check for existence of .env file with Claude API key
async function checkEnvFile() {
  console.log('\nChecking .env configuration:');
  
  try {
    const envContent = await fs.readFile('.env', 'utf8');
    const hasAnthropicKey = envContent.includes('ANTHROPIC_API_KEY');
    
    if (hasAnthropicKey) {
      console.log('✅ ANTHROPIC_API_KEY found in .env file');
    } else {
      console.log('❌ ANTHROPIC_API_KEY not found in .env file');
    }
  } catch (err) {
    console.log('❌ .env file not found or not readable');
  }
}

// Check for existence of essential files
async function checkFiles() {
  console.log('\nChecking essential files:');
  
  let allFilesExist = true;
  
  for (const filePath of keyPaths) {
    try {
      await fs.access(filePath);
      console.log(`✅ ${filePath} exists`);
    } catch (err) {
      console.log(`❌ ${filePath} not found`);
      allFilesExist = false;
    }
  }
  
  return allFilesExist;
}

// Check the implementation of filing-extractor.ts for placeholder code
async function checkFilingExtractor() {
  console.log('\nChecking filing extractor implementation:');
  
  try {
    const extractorPath = './lib/parsers/filing-extractor.ts';
    const content = await fs.readFile(extractorPath, 'utf8');
    
    // Check if the file contains key implementation aspects
    const hasRealExtraction = 
      content.includes('extractFilingContent') && 
      !content.includes('return "This is a placeholder"') &&
      content.includes('secService');
    
    if (hasRealExtraction) {
      console.log('✅ filing-extractor.ts has real content extraction (not placeholder)');
    } else {
      console.log('❌ filing-extractor.ts may still have placeholder implementation');
    }
    
  } catch (err) {
    console.log('❌ Could not read filing-extractor.ts');
  }
}

// Check filingService.ts for Claude integration
async function checkFilingService() {
  console.log('\nChecking filing service implementation:');
  
  try {
    const servicePath = './services/filingService.ts';
    const content = await fs.readFile(servicePath, 'utf8');
    
    // Check if the file contains key implementation aspects
    const hasSummarization = 
      content.includes('summarizeFiling') && 
      content.includes('getFilingSummary');
    
    const hasCaching =
      content.includes('findUnique') &&
      content.includes('create') &&
      content.includes('update');
    
    if (hasSummarization) {
      console.log('✅ filingService.ts has summarization integration');
    } else {
      console.log('❌ filingService.ts may be missing summarization integration');
    }
    
    if (hasCaching) {
      console.log('✅ filingService.ts has database caching logic');
    } else {
      console.log('❌ filingService.ts may be missing database caching');
    }
    
  } catch (err) {
    console.log('❌ Could not read filingService.ts');
  }
}

// Main function
async function main() {
  console.log('===== CHECKING CLAUDE AI INTEGRATION COMPONENTS =====');
  
  // Check all required files
  const filesExist = await checkFiles();
  
  // Check environment configuration
  await checkEnvFile();
  
  // Check implementation details
  await checkFilingExtractor();
  await checkFilingService();
  
  console.log('\n===== CHECK COMPLETE =====');
  
  if (filesExist) {
    console.log('\n✅ All required files for Claude AI integration exist');
    console.log('\nNext steps:');
    console.log('1. Ensure .env file has ANTHROPIC_API_KEY set');
    console.log('2. Run a test using the Next.js development environment:');
    console.log('   npm run dev');
    console.log('3. Test the API endpoint for filing summaries:');
    console.log('   curl http://localhost:3000/api/filings/summary?ticker=AAPL&formType=10-K');
  } else {
    console.log('\n❌ Some required files are missing. Please check the output above.');
  }
}

// Run the check
main().catch(console.error);
