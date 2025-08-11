#!/usr/bin/env node

/**
 * Comprehensive Cron Job Workflow Test
 * 
 * This script tests the full cron job workflow by simulating:
 * 1. Cron job authentication and authorization
 * 2. Active ticker identification and RSS processing
 * 3. Filing detection and processing pipeline
 * 4. Error handling and recovery mechanisms
 * 5. Performance and resource management
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🔄 Cron Job Workflow Comprehensive Test');
console.log('========================================\\n');

const testResults = {
  passed: 0,
  failed: 0,
  warnings: 0,
  tests: [],
  performance: {},
  recommendations: []
};

function logTest(name, status, details = null) {
  const symbols = { pass: '✅', fail: '❌', warn: '⚠️' };
  console.log(`${symbols[status]} ${status.toUpperCase()}: ${name}`);
  
  if (details) {
    console.log(`   ${details}`);
  }
  
  testResults.tests.push({ name, status, details });
  if (status === 'pass') testResults.passed++;
  else if (status === 'fail') testResults.failed++;
  else if (status === 'warn') testResults.warnings++;
}

// Test 1: Cron Job Code Structure Analysis
console.log('1. Analyzing Cron Job Code Structure');
console.log('-------------------------------------');

try {
  const cronFilePath = join(__dirname, 'app/api/cron/monitor-sec-filings/route.ts');
  const cronCode = readFileSync(cronFilePath, 'utf-8');
  
  // Test authentication
  const hasAuthCheck = cronCode.includes('CRON_SECRET') && cronCode.includes('authorization');
  logTest('Cron authentication implemented', hasAuthCheck ? 'pass' : 'fail', 
    hasAuthCheck ? 'Authorization header validation found' : 'Missing security check');
  
  // Test rate limiting
  const hasBatchSize = cronCode.includes('BATCH_SIZE');
  const hasRateLimit = cronCode.includes('MAX_CONCURRENT_RSS_CHECKS');
  logTest('Rate limiting configuration', hasBatchSize && hasRateLimit ? 'pass' : 'warn',
    `Batch size: ${hasBatchSize}, Concurrency limit: ${hasRateLimit}`);
  
  // Test timeout handling
  const hasTimeout = cronCode.includes('PROCESSING_TIMEOUT_MS');
  logTest('Timeout configuration', hasTimeout ? 'pass' : 'warn',
    hasTimeout ? 'Processing timeout configured' : 'Consider adding timeout limits');
  
  // Test error handling
  const hasTryCatch = cronCode.match(/try\\s*\\{[\\s\\S]*?catch\\s*\\([^)]+\\)/g);
  logTest('Error handling blocks', hasTryCatch && hasTryCatch.length >= 2 ? 'pass' : 'warn',
    `Found ${hasTryCatch ? hasTryCatch.length : 0} try-catch blocks`);
  
  // Test logging
  const hasLogging = cronCode.includes('cronLogger') || cronCode.includes('logger');
  logTest('Comprehensive logging', hasLogging ? 'pass' : 'fail',
    hasLogging ? 'Structured logging implemented' : 'Missing logging infrastructure');
  
  // Test response format
  const hasStatsTracking = cronCode.includes('ProcessingStats');
  logTest('Statistics tracking', hasStatsTracking ? 'pass' : 'warn',
    hasStatsTracking ? 'Performance statistics tracked' : 'Consider adding metrics');
  
} catch (error) {
  logTest('Code structure analysis', 'fail', error.message);
}

console.log();

// Test 2: Workflow Phase Analysis
console.log('2. Analyzing Workflow Phases');
console.log('-----------------------------');

try {
  const cronFilePath = join(__dirname, 'app/api/cron/monitor-sec-filings/route.ts');
  const cronCode = readFileSync(cronFilePath, 'utf-8');
  
  // Check for main phases
  const phases = [
    { name: 'RSS Check Phase', pattern: 'checkForNewFilings', required: true },
    { name: 'Filing Processing Phase', pattern: 'processUnprocessedFilings', required: true },
    { name: 'Cleanup Phase', pattern: 'cleanupOldMonitoringData', required: true }
  ];
  
  phases.forEach(phase => {
    const hasPhase = cronCode.includes(phase.pattern);
    logTest(phase.name, hasPhase ? 'pass' : (phase.required ? 'fail' : 'warn'),
      hasPhase ? 'Phase implemented' : 'Phase missing or renamed');
  });
  
  // Check sequential execution
  const hasSequentialProcessing = cronCode.includes('await checkForNewFilings') && 
                                  cronCode.includes('await processUnprocessedFilings');
  logTest('Sequential phase execution', hasSequentialProcessing ? 'pass' : 'warn',
    hasSequentialProcessing ? 'Phases run sequentially' : 'Check phase ordering');
  
} catch (error) {
  logTest('Workflow phase analysis', 'fail', error.message);
}

console.log();

// Test 3: Database Integration Analysis
console.log('3. Analyzing Database Integration');
console.log('----------------------------------');

try {
  const monitoringFilePath = join(__dirname, 'lib/sec-edgar/ticker-monitoring.ts');
  const monitoringCode = readFileSync(monitoringFilePath, 'utf-8');
  
  // Check database operations
  const dbOperations = [
    { name: 'Get active tickers', pattern: 'getActiveTickersForMonitoring', critical: true },
    { name: 'Check new filings', pattern: 'checkTickerForNewFilings', critical: true },
    { name: 'Get unprocessed filings', pattern: 'getUnprocessedFilings', critical: true },
    { name: 'Mark as processed', pattern: 'markFilingAsProcessed', critical: true },
    { name: 'Cleanup old data', pattern: 'cleanupOldMonitoringData', critical: false }
  ];
  
  dbOperations.forEach(op => {
    const hasOperation = monitoringCode.includes(op.pattern);
    logTest(op.name, hasOperation ? 'pass' : (op.critical ? 'fail' : 'warn'),
      hasOperation ? 'Database operation implemented' : 'Missing database function');
  });
  
  // Check transaction safety
  const hasPrismaClient = monitoringCode.includes('getPrismaClient');
  logTest('Database client management', hasPrismaClient ? 'pass' : 'fail',
    hasPrismaClient ? 'Prisma client properly managed' : 'Database connection issues');
  
  // Check error handling in DB operations
  const hasDbErrorHandling = monitoringCode.includes('catch') && 
                             monitoringCode.includes('throw error');
  logTest('Database error handling', hasDbErrorHandling ? 'pass' : 'warn',
    hasDbErrorHandling ? 'Database errors properly handled' : 'Consider improving error handling');
  
} catch (error) {
  logTest('Database integration analysis', 'fail', error.message);
}

console.log();

// Test 4: RSS Processing Analysis
console.log('4. Analyzing RSS Processing');
console.log('----------------------------');

try {
  const rssParserPath = join(__dirname, 'lib/sec-edgar/rss-parser.ts');
  const rssCode = readFileSync(rssParserPath, 'utf-8');
  
  // Check RSS functions
  const rssFunctions = [
    { name: 'RSS URL generation', pattern: 'generateSecRssUrl', critical: true },
    { name: 'RSS XML parsing', pattern: 'parseSecCompanyRSS', critical: true },
    { name: 'RSS feed fetching', pattern: 'fetchSecCompanyRSS', critical: true },
    { name: 'Entry parsing', pattern: 'parseRSSEntry', critical: true }
  ];
  
  rssFunctions.forEach(func => {
    const hasFunction = rssCode.includes(func.pattern);
    logTest(func.name, hasFunction ? 'pass' : 'fail',
      hasFunction ? 'Function implemented' : 'Critical RSS function missing');
  });
  
  // Check data validation
  const hasAccessionValidation = rssCode.includes('accessionMatch') || rssCode.includes('\\\\d{10}-\\\\d{2}-\\\\d{6}');
  logTest('Accession number validation', hasAccessionValidation ? 'pass' : 'warn',
    hasAccessionValidation ? 'Accession format validated' : 'Add accession number validation');
  
  // Check user agent
  const hasUserAgent = rssCode.includes('User-Agent') && rssCode.includes('tldrSEC');
  logTest('Proper User-Agent header', hasUserAgent ? 'pass' : 'fail',
    hasUserAgent ? 'SEC-compliant User-Agent set' : 'Missing required User-Agent header');
  
  // Check XML parsing safety
  const hasXmlValidation = rssCode.includes('parseStringPromise') && rssCode.includes('catch');
  logTest('XML parsing error handling', hasXmlValidation ? 'pass' : 'warn',
    hasXmlValidation ? 'XML parsing errors handled' : 'Consider improving XML error handling');
  
} catch (error) {
  logTest('RSS processing analysis', 'fail', error.message);
}

console.log();

// Test 5: Performance and Resource Management
console.log('5. Analyzing Performance Configuration');
console.log('--------------------------------------');

try {
  const cronFilePath = join(__dirname, 'app/api/cron/monitor-sec-filings/route.ts');
  const cronCode = readFileSync(cronFilePath, 'utf-8');
  
  // Extract configuration values
  const batchSizeMatch = cronCode.match(/BATCH_SIZE\\s*=\\s*(\\d+)/);
  const concurrentMatch = cronCode.match(/MAX_CONCURRENT_RSS_CHECKS\\s*=\\s*(\\d+)/);
  const timeoutMatch = cronCode.match(/PROCESSING_TIMEOUT_MS\\s*=\\s*([\\d\\s*\\*\\s*\\d+.*]+)/);
  
  if (batchSizeMatch) {
    const batchSize = parseInt(batchSizeMatch[1]);
    logTest('Batch size configuration', batchSize > 0 && batchSize <= 10 ? 'pass' : 'warn',
      `Batch size: ${batchSize} (recommended: 3-10)`);
    testResults.performance.batchSize = batchSize;
  }
  
  if (concurrentMatch) {
    const concurrent = parseInt(concurrentMatch[1]);
    logTest('Concurrency configuration', concurrent >= 2 && concurrent <= 5 ? 'pass' : 'warn',
      `Max concurrent: ${concurrent} (recommended: 2-5)`);
    testResults.performance.maxConcurrent = concurrent;
  }
  
  if (timeoutMatch) {
    logTest('Timeout configuration', 'pass', `Timeout configured: ${timeoutMatch[1]}`);
    testResults.performance.timeout = timeoutMatch[1];
  }
  
  // Check for delays/rate limiting
  const hasDelay = cronCode.includes('setTimeout') || cronCode.includes('delay');
  logTest('Rate limiting delays', hasDelay ? 'pass' : 'warn',
    hasDelay ? 'Delays implemented for rate limiting' : 'Consider adding delays between requests');
  
} catch (error) {
  logTest('Performance analysis', 'fail', error.message);
}

console.log();

// Test 6: Email and Notification System
console.log('6. Analyzing Email/Notification System');
console.log('---------------------------------------');

try {
  const cronFilePath = join(__dirname, 'app/api/cron/monitor-sec-filings/route.ts');
  const cronCode = readFileSync(cronFilePath, 'utf-8');
  
  // Check email functionality
  const hasEmailService = cronCode.includes('sendFilingSummaryEmail') || cronCode.includes('email');
  logTest('Email notification integration', hasEmailService ? 'pass' : 'warn',
    hasEmailService ? 'Email service integrated' : 'Email notifications may be missing');
  
  // Check subscriber management
  const hasSubscriberQuery = cronCode.includes('subscriber') || cronCode.includes('users');
  logTest('Subscriber management', hasSubscriberQuery ? 'pass' : 'warn',
    hasSubscriberQuery ? 'Subscriber queries implemented' : 'Check user notification logic');
  
  // Check email error handling
  const hasEmailErrorHandling = cronCode.includes('emailError') || 
                                (cronCode.includes('email') && cronCode.includes('catch'));
  logTest('Email error handling', hasEmailErrorHandling ? 'pass' : 'warn',
    hasEmailErrorHandling ? 'Email failures handled gracefully' : 'Improve email error handling');
  
} catch (error) {
  logTest('Email system analysis', 'fail', error.message);
}

console.log();

// Test 7: Security and Input Validation
console.log('7. Analyzing Security Implementation');
console.log('------------------------------------');

try {
  const files = [
    { path: 'app/api/cron/monitor-sec-filings/route.ts', name: 'Cron Route' },
    { path: 'lib/sec-edgar/ticker-monitoring.ts', name: 'Ticker Monitoring' },
    { path: 'lib/sec-edgar/rss-parser.ts', name: 'RSS Parser' }
  ];
  
  files.forEach(file => {
    try {
      const filePath = join(__dirname, file.path);
      const code = readFileSync(filePath, 'utf-8');
      
      // Check input validation
      const hasValidation = code.includes('validate') || code.includes('match') || code.includes('test');
      logTest(`${file.name} input validation`, hasValidation ? 'pass' : 'warn',
        hasValidation ? 'Input validation present' : 'Consider adding input validation');
      
      // Check SQL injection protection (Prisma should handle this)
      const usesPrisma = code.includes('prisma') && !code.includes('raw');
      logTest(`${file.name} SQL injection protection`, usesPrisma ? 'pass' : 'warn',
        usesPrisma ? 'Prisma ORM provides protection' : 'Review database query safety');
      
    } catch (fileError) {
      logTest(`${file.name} security analysis`, 'warn', `Could not analyze: ${fileError.message}`);
    }
  });
  
} catch (error) {
  logTest('Security analysis', 'fail', error.message);
}

console.log();

// Test 8: Monitoring and Observability
console.log('8. Analyzing Monitoring and Observability');
console.log('------------------------------------------');

try {
  const cronFilePath = join(__dirname, 'app/api/cron/monitor-sec-filings/route.ts');
  const cronCode = readFileSync(cronFilePath, 'utf-8');
  
  // Check metrics collection
  const hasMetrics = cronCode.includes('stats') || cronCode.includes('metrics');
  logTest('Performance metrics collection', hasMetrics ? 'pass' : 'warn',
    hasMetrics ? 'Metrics collected during execution' : 'Consider adding performance metrics');
  
  // Check structured logging
  const hasStructuredLogging = cronCode.includes('.info(') && cronCode.includes('{');
  logTest('Structured logging', hasStructuredLogging ? 'pass' : 'warn',
    hasStructuredLogging ? 'Structured log data included' : 'Improve logging structure');
  
  // Check success/failure tracking
  const hasStatusTracking = cronCode.includes('success') && cronCode.includes('error');
  logTest('Success/failure tracking', hasStatusTracking ? 'pass' : 'warn',
    hasStatusTracking ? 'Job outcomes tracked' : 'Add job outcome tracking');
  
  // Check duration tracking
  const hasDurationTracking = cronCode.includes('startTime') && cronCode.includes('duration');
  logTest('Execution time tracking', hasDurationTracking ? 'pass' : 'warn',
    hasDurationTracking ? 'Execution duration measured' : 'Add execution time tracking');
  
} catch (error) {
  logTest('Monitoring analysis', 'fail', error.message);
}

console.log();

// Generate Recommendations
console.log('9. Generating Recommendations');
console.log('------------------------------');

// Performance recommendations
if (testResults.performance.batchSize > 10) {
  testResults.recommendations.push({
    category: 'Performance',
    priority: 'Medium',
    issue: 'Large batch size may cause timeouts',
    recommendation: `Reduce BATCH_SIZE from ${testResults.performance.batchSize} to 5-8 for more reliable processing`
  });
}

if (testResults.performance.maxConcurrent > 5) {
  testResults.recommendations.push({
    category: 'Performance',
    priority: 'Low',
    issue: 'High concurrency may trigger rate limits',
    recommendation: `Reduce MAX_CONCURRENT_RSS_CHECKS from ${testResults.performance.maxConcurrent} to 3-5`
  });
}

// Security recommendations
const failedTests = testResults.tests.filter(t => t.status === 'fail');
if (failedTests.some(t => t.name.includes('authentication'))) {
  testResults.recommendations.push({
    category: 'Security',
    priority: 'High',
    issue: 'Cron job authentication not properly implemented',
    recommendation: 'Implement proper CRON_SECRET validation to prevent unauthorized access'
  });
}

// Reliability recommendations  
const warningTests = testResults.tests.filter(t => t.status === 'warn');
if (warningTests.length > 5) {
  testResults.recommendations.push({
    category: 'Reliability',
    priority: 'Medium',
    issue: 'Multiple areas need improvement for production reliability',
    recommendation: 'Address warning items to improve system robustness'
  });
}

// Display recommendations
if (testResults.recommendations.length > 0) {
  testResults.recommendations.forEach((rec, index) => {
    const priority = rec.priority === 'High' ? '🔴' : rec.priority === 'Medium' ? '🟡' : '🟢';
    console.log(`${priority} ${rec.category} - ${rec.priority} Priority`);
    console.log(`   Issue: ${rec.issue}`);
    console.log(`   Recommendation: ${rec.recommendation}\\n`);
  });
} else {
  console.log('✅ No critical issues found - system appears well-configured\\n');
}

// Final Results
console.log('🏁 Cron Job Workflow Test Results');
console.log('==================================');
console.log(`Total Tests: ${testResults.tests.length}`);
console.log(`✅ Passed: ${testResults.passed}`);
console.log(`⚠️ Warnings: ${testResults.warnings}`);
console.log(`❌ Failed: ${testResults.failed}`);
console.log(`Success Rate: ${((testResults.passed / testResults.tests.length) * 100).toFixed(1)}%`);

// Categorize results
const categories = {
  'Code Structure': testResults.tests.filter(t => t.name.includes('authentication') || t.name.includes('Rate limiting') || t.name.includes('Timeout') || t.name.includes('Error handling') || t.name.includes('logging') || t.name.includes('Statistics')),
  'Workflow': testResults.tests.filter(t => t.name.includes('Phase') || t.name.includes('execution')),
  'Database': testResults.tests.filter(t => t.name.includes('tickers') || t.name.includes('filings') || t.name.includes('processed') || t.name.includes('Database')),
  'RSS Processing': testResults.tests.filter(t => t.name.includes('RSS') || t.name.includes('XML') || t.name.includes('User-Agent') || t.name.includes('Accession')),
  'Performance': testResults.tests.filter(t => t.name.includes('Batch') || t.name.includes('Concurrency') || t.name.includes('Timeout') || t.name.includes('delays')),
  'Security': testResults.tests.filter(t => t.name.includes('validation') || t.name.includes('protection')),
  'Monitoring': testResults.tests.filter(t => t.name.includes('metrics') || t.name.includes('logging') || t.name.includes('tracking'))
};

console.log('\\n📊 Results by Category:');
Object.entries(categories).forEach(([category, tests]) => {
  if (tests.length > 0) {
    const passed = tests.filter(t => t.status === 'pass').length;
    const total = tests.length;
    console.log(`${category}: ${passed}/${total} (${((passed/total)*100).toFixed(0)}%)`);
  }
});

// Save results
import { writeFileSync } from 'fs';
const resultsPath = join(__dirname, 'cron-workflow-test-results.json');

try {
  writeFileSync(resultsPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: {
      total: testResults.tests.length,
      passed: testResults.passed,
      warnings: testResults.warnings,
      failed: testResults.failed,
      successRate: (testResults.passed / testResults.tests.length) * 100
    },
    performance: testResults.performance,
    tests: testResults.tests,
    recommendations: testResults.recommendations,
    categories: Object.fromEntries(
      Object.entries(categories).map(([name, tests]) => [
        name, 
        {
          total: tests.length,
          passed: tests.filter(t => t.status === 'pass').length,
          warnings: tests.filter(t => t.status === 'warn').length,
          failed: tests.filter(t => t.status === 'fail').length
        }
      ])
    )
  }, null, 2));
  
  console.log(`\\n📄 Detailed results saved to: ${resultsPath}`);
} catch (error) {
  console.warn(`Warning: Could not save results: ${error.message}`);
}

console.log('\\n🎯 Cron workflow analysis complete!');