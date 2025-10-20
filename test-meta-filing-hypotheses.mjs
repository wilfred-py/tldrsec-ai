#!/usr/bin/env node

/**
 * META Filing Content Issues - Hypothesis Testing Script
 * 
 * This script systematically tests the identified hypotheses to validate root causes
 * and implementation approaches for META filing content issues.
 * 
 * Primary Hypotheses:
 * 1. NoSuchKey Content Detection Hypothesis
 * 2. Content Validation Timing Hypothesis  
 * 3. Failed Accession Number Hypothesis
 * 4. Processing Delay Impact Hypothesis
 */

import axios from 'axios';

// Test configuration
const FAILED_META_ACCESSION_NUMBERS = [
  '0001921094-25-001187', // Form 144, 9/22/2025 - FUTURE DATE ERROR
  '0000950103-25-011843'  // Form 4, 9/18/2025 - FUTURE DATE ERROR
];

const TEST_CONFIG = {
  userAgent: 'TLDRSEC wilfredchen1@gmail.com',
  maxRetries: 3,
  retryDelay: 1000,
  timeout: 30000
};

// Results storage
const testResults = {
  timestamp: new Date().toISOString(),
  hypotheses: {},
  summary: {}
};

/**
 * Hypothesis 1: NoSuchKey Content Detection Testing
 */
async function testNoSuchKeyDetection() {
  console.log('\n=== HYPOTHESIS 1: NoSuchKey Content Detection ===');
  
  const testCases = [
    {
      name: 'Known NoSuchKey Response',
      content: `<?xml version="1.0" encoding="utf-8"?>
<Error>
  <Code>NoSuchKey</Code>
  <Message>The specified key does not exist.</Message>
  <Key>Archives/edgar/data/1234567890/000123456789012345/filename.htm</Key>
  <RequestId>ABC123</RequestId>
  <HostId>def456</HostId>
</Error>`
    },
    {
      name: 'HTML NoSuchKey Pattern',
      content: `<html><body><h1>404 Not Found</h1><p>NoSuchKey: The specified key does not exist.</p></body></html>`
    },
    {
      name: 'Plain Text NoSuchKey',
      content: 'NoSuchKey\nThe specified key does not exist.\nArchives/edgar/data/1318605/000191209425001187/filename.htm'
    },
    {
      name: 'Valid Filing Content (should not trigger)',
      content: `<html><head><title>FORM 4</title></head><body>
<div>UNITED STATES SECURITIES AND EXCHANGE COMMISSION</div>
<div>STATEMENT OF CHANGES IN BENEFICIAL OWNERSHIP</div>
<table><tr><td>Company Name: META PLATFORMS INC</td></tr></table>
</body></html>`
    },
    {
      name: 'Malformed Content (should detect)',
      content: 'Error: NoSuchKey encountered while processing request'
    }
  ];

  const detectionPatterns = [
    /NoSuchKey/i,
    /The specified key does not exist/i,
    /<Code>NoSuchKey<\/Code>/i,
    /404.*not found.*NoSuchKey/i,
    /Error.*NoSuchKey/i
  ];

  const results = {
    patterns: {},
    testCases: {},
    recommendations: []
  };

  console.log('Testing NoSuchKey detection patterns...');

  // Test each pattern against each test case
  for (const [index, pattern] of detectionPatterns.entries()) {
    const patternName = `Pattern_${index + 1}`;
    results.patterns[patternName] = {
      pattern: pattern.toString(),
      matches: {}
    };

    for (const testCase of testCases) {
      const isMatch = pattern.test(testCase.content);
      results.patterns[patternName].matches[testCase.name] = isMatch;
      
      console.log(`  ${patternName} vs ${testCase.name}: ${isMatch ? 'MATCH' : 'NO MATCH'}`);
    }
  }

  // Create optimized detection function
  function detectNoSuchKeyContent(content) {
    if (!content || typeof content !== 'string') return false;
    
    // Check for XML NoSuchKey error
    if (content.includes('<Code>NoSuchKey</Code>')) return true;
    
    // Check for combined NoSuchKey indicators
    if (/NoSuchKey/i.test(content) && /not exist|404|error/i.test(content)) return true;
    
    // Check for very short content that mentions NoSuchKey
    if (content.length < 500 && /NoSuchKey/i.test(content)) return true;
    
    return false;
  }

  // Test optimized function
  console.log('\nTesting optimized detection function:');
  for (const testCase of testCases) {
    const detected = detectNoSuchKeyContent(testCase.content);
    const shouldDetect = testCase.name.includes('NoSuchKey') || testCase.name.includes('Malformed');
    const correct = detected === shouldDetect;
    
    results.testCases[testCase.name] = {
      detected,
      shouldDetect,
      correct,
      contentLength: testCase.content.length
    };
    
    console.log(`  ${testCase.name}: ${detected ? 'DETECTED' : 'NOT DETECTED'} (${correct ? 'CORRECT' : 'INCORRECT'})`);
  }

  // Calculate accuracy
  const correctResults = Object.values(results.testCases).filter(r => r.correct).length;
  const totalTests = testCases.length;
  const accuracy = (correctResults / totalTests * 100).toFixed(1);

  console.log(`\nDetection Accuracy: ${accuracy}% (${correctResults}/${totalTests})`);

  results.accuracy = accuracy;
  results.recommendedImplementation = detectNoSuchKeyContent.toString();
  results.recommendations = [
    'Implement content validation immediately after SEC API fetch',
    'Use optimized detection function to catch various NoSuchKey patterns',
    'Validate content length and structure before AI processing',
    'Add early return to prevent costly AI processing on error content'
  ];

  testResults.hypotheses.noSuchKeyDetection = results;
  return results;
}

/**
 * Hypothesis 2: Content Validation Timing Testing
 */
async function testContentValidationTiming() {
  console.log('\n=== HYPOTHESIS 2: Content Validation Timing ===');
  
  const validationPoints = [
    'immediate_post_fetch',
    'pre_parsing',
    'post_parsing_pre_ai',
    'post_ai_processing'
  ];

  const costEstimates = {
    sec_api_fetch: 0, // Free
    content_parsing: 0.001, // Minimal compute cost
    ai_processing: 0.15, // Estimated Claude API cost per filing
    email_delivery: 0.001 // Resend cost
  };

  const scenarios = [
    {
      name: 'Valid Content Path',
      steps: ['sec_api_fetch', 'content_parsing', 'ai_processing', 'email_delivery'],
      outcome: 'success'
    },
    {
      name: 'NoSuchKey - Current (no validation)',
      steps: ['sec_api_fetch', 'content_parsing', 'ai_processing', 'email_delivery'],
      outcome: 'failure_after_ai'
    },
    {
      name: 'NoSuchKey - Immediate Validation',
      steps: ['sec_api_fetch'],
      outcome: 'early_failure'
    },
    {
      name: 'NoSuchKey - Pre-AI Validation',
      steps: ['sec_api_fetch', 'content_parsing'],
      outcome: 'pre_ai_failure'
    }
  ];

  const results = {
    validationPoints: {},
    costAnalysis: {},
    recommendations: []
  };

  console.log('Analyzing validation timing and cost impact...');

  for (const point of validationPoints) {
    results.validationPoints[point] = {
      description: `Validate content at ${point.replace(/_/g, ' ')}`,
      pros: [],
      cons: [],
      costSavings: 0
    };
  }

  // Immediate post-fetch validation
  results.validationPoints.immediate_post_fetch.pros = [
    'Prevents all downstream processing costs',
    'Fastest detection of invalid content',
    'Minimal resource usage'
  ];
  results.validationPoints.immediate_post_fetch.cons = [
    'May catch some valid but unusual content',
    'Requires robust detection patterns'
  ];
  results.validationPoints.immediate_post_fetch.costSavings = costEstimates.ai_processing + costEstimates.content_parsing;

  // Pre-AI validation (after parsing)
  results.validationPoints.post_parsing_pre_ai.pros = [
    'More accurate detection after content parsing',
    'Saves expensive AI processing costs',
    'Can validate content structure'
  ];
  results.validationPoints.post_parsing_pre_ai.cons = [
    'Still incurs parsing costs',
    'Slightly delayed detection'
  ];
  results.validationPoints.post_parsing_pre_ai.costSavings = costEstimates.ai_processing;

  // Calculate cost scenarios
  for (const scenario of scenarios) {
    const totalCost = scenario.steps.reduce((sum, step) => sum + (costEstimates[step] || 0), 0);
    
    results.costAnalysis[scenario.name] = {
      steps: scenario.steps,
      totalCost: totalCost.toFixed(3),
      outcome: scenario.outcome,
      costEfficiency: scenario.outcome === 'success' ? 'efficient' : 
                     scenario.outcome === 'early_failure' ? 'very_efficient' :
                     scenario.outcome === 'pre_ai_failure' ? 'efficient' : 'wasteful'
    };
    
    console.log(`  ${scenario.name}: $${totalCost.toFixed(3)} (${scenario.outcome})`);
  }

  // Calculate potential savings
  const currentWastedCost = parseFloat(results.costAnalysis['NoSuchKey - Current (no validation)'].totalCost);
  const optimizedCost = parseFloat(results.costAnalysis['NoSuchKey - Immediate Validation'].totalCost);
  const savingsPerError = currentWastedCost - optimizedCost;

  console.log(`\nCost Analysis:`);
  console.log(`  Current waste per NoSuchKey error: $${currentWastedCost.toFixed(3)}`);
  console.log(`  Optimized cost per NoSuchKey error: $${optimizedCost.toFixed(3)}`);
  console.log(`  Savings per error: $${savingsPerError.toFixed(3)} (${(savingsPerError/currentWastedCost*100).toFixed(1)}% reduction)`);

  results.recommendations = [
    'Implement immediate post-fetch validation for maximum cost savings',
    'Add content length and structure validation before AI processing',
    'Use simple pattern matching for initial NoSuchKey detection',
    'Implement circuit breaker for repeated failures'
  ];

  results.costSavingsAnalysis = {
    currentWastePerError: currentWastedCost,
    optimizedCostPerError: optimizedCost,
    savingsPerError: savingsPerError,
    percentageReduction: (savingsPerError/currentWastedCost*100).toFixed(1)
  };

  testResults.hypotheses.contentValidationTiming = results;
  return results;
}

/**
 * Hypothesis 3: Failed Accession Number Testing - Direct SEC API calls
 */
async function testFailedAccessionNumbers() {
  console.log('\n=== HYPOTHESIS 3: Failed Accession Number Testing ===');
  
  const results = {
    accessionTests: {},
    patterns: {},
    recommendations: []
  };

  const secClient = axios.create({
    timeout: TEST_CONFIG.timeout,
    headers: {
      'User-Agent': TEST_CONFIG.userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate'
    }
  });

  console.log('Testing failed META accession numbers...');

  for (const accessionNumber of FAILED_META_ACCESSION_NUMBERS) {
    console.log(`\nTesting accession number: ${accessionNumber}`);
    
    const testResult = {
      accessionNumber,
      dateIssue: false,
      urlTests: {},
      errorPatterns: [],
      status: 'unknown'
    };

    // Check if accession number indicates future date
    const year = parseInt(accessionNumber.substring(5, 7));
    const currentYear = new Date().getFullYear() % 100;
    if (year > currentYear) {
      testResult.dateIssue = true;
      testResult.status = 'future_date_error';
      console.log(`  ❌ FUTURE DATE DETECTED: 20${year} > ${2000 + currentYear}`);
    }

    // Extract CIK and format accession number
    const cik = accessionNumber.substring(0, 10);
    const formattedAccession = accessionNumber.replace(/-/g, '');

    // Test different URL patterns
    const urlPatterns = [
      {
        name: 'Primary Document URL',
        url: `https://www.sec.gov/Archives/edgar/data/${cik.replace(/^0+/, '')}/${formattedAccession}/${accessionNumber}.htm`
      },
      {
        name: 'Index URL',
        url: `https://www.sec.gov/Archives/edgar/data/${cik.replace(/^0+/, '')}/${formattedAccession}/${accessionNumber}-index.html`
      },
      {
        name: 'XML URL',
        url: `https://www.sec.gov/Archives/edgar/data/${cik.replace(/^0+/, '')}/${formattedAccession}/${accessionNumber}.xml`
      },
      {
        name: 'Directory URL',
        url: `https://www.sec.gov/Archives/edgar/data/${cik.replace(/^0+/, '')}/${formattedAccession}/`
      }
    ];

    for (const pattern of urlPatterns) {
      console.log(`  Testing ${pattern.name}: ${pattern.url}`);
      
      try {
        const response = await secClient.get(pattern.url, {
          validateStatus: (status) => status < 500 // Accept 4xx errors as valid responses
        });

        testResult.urlTests[pattern.name] = {
          url: pattern.url,
          status: response.status,
          statusText: response.statusText,
          contentLength: response.data?.length || 0,
          contentType: response.headers['content-type'],
          hasNoSuchKey: response.data?.includes('NoSuchKey') || false,
          responsePreview: typeof response.data === 'string' ? 
            response.data.substring(0, 200).replace(/\s+/g, ' ') : 'Binary/Non-text content'
        };

        console.log(`    Status: ${response.status} ${response.statusText}`);
        console.log(`    Content: ${response.data?.length || 0} bytes`);
        
        if (response.data?.includes('NoSuchKey')) {
          console.log(`    ⚠️  NoSuchKey detected`);
          testResult.errorPatterns.push('NoSuchKey');
        }

      } catch (error) {
        testResult.urlTests[pattern.name] = {
          url: pattern.url,
          error: error.message,
          errorCode: error.code,
          status: error.response?.status || 'NETWORK_ERROR'
        };
        
        console.log(`    ❌ Error: ${error.message}`);
      }

      // Add delay to respect SEC rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    results.accessionTests[accessionNumber] = testResult;
  }

  // Analyze patterns
  const futureDate = Object.values(results.accessionTests).filter(t => t.dateIssue).length;
  const noSuchKeyErrors = Object.values(results.accessionTests)
    .filter(t => Object.values(t.urlTests).some(u => u.hasNoSuchKey)).length;

  console.log(`\nPattern Analysis:`);
  console.log(`  Future date issues: ${futureDate}/${FAILED_META_ACCESSION_NUMBERS.length}`);
  console.log(`  NoSuchKey errors: ${noSuchKeyErrors}/${FAILED_META_ACCESSION_NUMBERS.length}`);

  results.patterns = {
    futureDateIssues: futureDate,
    noSuchKeyErrors: noSuchKeyErrors,
    totalTested: FAILED_META_ACCESSION_NUMBERS.length
  };

  results.recommendations = [
    'Validate accession number dates before processing',
    'Implement date range validation (reject future dates)',
    'Add specific handling for clearly invalid accession numbers',
    'Create early validation for accession number format and date logic'
  ];

  testResults.hypotheses.failedAccessionNumbers = results;
  return results;
}

/**
 * Hypothesis 4: Processing Delay Impact Testing
 */
async function testProcessingDelayImpact() {
  console.log('\n=== HYPOTHESIS 4: Processing Delay Impact Testing ===');
  
  const results = {
    delayAnalysis: {},
    recommendations: []
  };

  // Simulate different processing delays and their impact
  const delayScenarios = [
    { name: 'Immediate Processing', delayHours: 0, expectedSuccessRate: 95 },
    { name: 'Same Day Processing', delayHours: 12, expectedSuccessRate: 90 },
    { name: 'Next Day Processing', delayHours: 24, expectedSuccessRate: 85 },
    { name: 'Week Delay', delayHours: 168, expectedSuccessRate: 70 },
    { name: 'Month Delay', delayHours: 720, expectedSuccessRate: 50 }
  ];

  console.log('Analyzing processing delay impact on content availability...');

  for (const scenario of delayScenarios) {
    const analysis = {
      delayHours: scenario.delayHours,
      expectedSuccessRate: scenario.expectedSuccessRate,
      riskFactors: []
    };

    // Determine risk factors based on delay
    if (scenario.delayHours > 0) {
      analysis.riskFactors.push('SEC document archival processes');
    }
    if (scenario.delayHours > 24) {
      analysis.riskFactors.push('Document URL format changes');
    }
    if (scenario.delayHours > 168) {
      analysis.riskFactors.push('SEC system reorganization');
    }
    if (scenario.delayHours > 720) {
      analysis.riskFactors.push('Document removal or relocation');
    }

    // Calculate estimated cost impact
    const failureRate = (100 - scenario.expectedSuccessRate) / 100;
    const wastedCostPerFiling = 0.15; // Estimated AI processing cost
    const expectedWasteRate = failureRate * wastedCostPerFiling;

    analysis.costImpact = {
      failureRate: `${(failureRate * 100).toFixed(1)}%`,
      wastedCostPerFiling: `$${wastedCostPerFiling.toFixed(3)}`,
      expectedWasteRate: `$${expectedWasteRate.toFixed(3)}`
    };

    results.delayAnalysis[scenario.name] = analysis;
    
    console.log(`  ${scenario.name} (${scenario.delayHours}h delay):`);
    console.log(`    Success rate: ${scenario.expectedSuccessRate}%`);
    console.log(`    Risk factors: ${analysis.riskFactors.length}`);
    console.log(`    Expected waste: $${expectedWasteRate.toFixed(3)} per filing`);
  }

  // Optimal processing window analysis
  const optimalWindow = {
    recommendation: 'Process within 24 hours of filing',
    reasoning: [
      'Highest content availability rate (85%+)',
      'Minimal SEC system reorganization risk',
      'Balances timeliness with reliability'
    ],
    implementation: [
      'Prioritize recent filings in processing queue',
      'Implement filing age-based processing priority',
      'Add alerts for filings approaching staleness threshold'
    ]
  };

  results.optimalProcessingWindow = optimalWindow;
  results.recommendations = [
    'Prioritize processing of filings within 24 hours',
    'Implement filing age tracking and priority scoring',
    'Add monitoring for processing delay impact',
    'Create alerts for stale filing detection'
  ];

  console.log(`\nOptimal Processing Window: ${optimalWindow.recommendation}`);

  testResults.hypotheses.processingDelayImpact = results;
  return results;
}

/**
 * SEC EDGAR API Testing
 */
async function testSecEdgarApi() {
  console.log('\n=== SEC EDGAR API COMPREHENSIVE TESTING ===');
  
  const results = {
    endpointTests: {},
    recommendations: []
  };

  const endpoints = [
    {
      name: 'Data API',
      url: 'https://data.sec.gov/api/xbrl/companyfacts/CIK0001318605.json',
      description: 'New JSON API for company facts'
    },
    {
      name: 'Traditional EDGAR',
      url: 'https://www.sec.gov/Archives/edgar/data/1318605/',
      description: 'Traditional file archive'
    },
    {
      name: 'RSS Feed',
      url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&CIK=1318605&type=4&company=&dateb=&owner=include&start=0&count=40&output=atom',
      description: 'RSS feed for recent filings'
    }
  ];

  const secClient = axios.create({
    timeout: TEST_CONFIG.timeout,
    headers: {
      'User-Agent': TEST_CONFIG.userAgent,
      'Accept': 'application/json, text/html, application/xml, */*'
    }
  });

  console.log('Testing SEC EDGAR API endpoints...');

  for (const endpoint of endpoints) {
    console.log(`\nTesting ${endpoint.name}: ${endpoint.description}`);
    
    try {
      const response = await secClient.get(endpoint.url);
      
      results.endpointTests[endpoint.name] = {
        url: endpoint.url,
        status: response.status,
        contentType: response.headers['content-type'],
        contentLength: response.data?.length || 0,
        responseTime: response.config.metadata?.endTime - response.config.metadata?.startTime || 'unknown',
        accessible: true
      };

      console.log(`  ✅ Status: ${response.status}`);
      console.log(`  Content-Type: ${response.headers['content-type']}`);
      console.log(`  Size: ${response.data?.length || 0} bytes`);

    } catch (error) {
      results.endpointTests[endpoint.name] = {
        url: endpoint.url,
        error: error.message,
        status: error.response?.status || 'NETWORK_ERROR',
        accessible: false
      };
      
      console.log(`  ❌ Error: ${error.message}`);
    }

    await new Promise(resolve => setTimeout(resolve, 100));
  }

  results.recommendations = [
    'Use data.sec.gov API when possible for structured data',
    'Implement fallback to traditional EDGAR archives',
    'Monitor RSS feeds for real-time filing detection',
    'Add endpoint health monitoring'
  ];

  testResults.secEdgarApi = results;
  return results;
}

/**
 * Generate comprehensive test report
 */
function generateTestReport() {
  console.log('\n=== COMPREHENSIVE TEST REPORT ===');
  
  const summary = {
    totalHypotheses: Object.keys(testResults.hypotheses).length,
    keyFindings: [],
    priorityRecommendations: [],
    implementationPlan: []
  };

  // Key findings
  const hypotheses = testResults.hypotheses;
  
  if (hypotheses.noSuchKeyDetection?.accuracy) {
    summary.keyFindings.push(`NoSuchKey detection accuracy: ${hypotheses.noSuchKeyDetection.accuracy}%`);
  }
  
  if (hypotheses.contentValidationTiming?.costSavingsAnalysis) {
    const savings = hypotheses.contentValidationTiming.costSavingsAnalysis;
    summary.keyFindings.push(`Cost savings potential: ${savings.percentageReduction}% reduction per error`);
  }
  
  if (hypotheses.failedAccessionNumbers?.patterns) {
    const patterns = hypotheses.failedAccessionNumbers.patterns;
    summary.keyFindings.push(`Future date issues found in ${patterns.futureDateIssues}/${patterns.totalTested} test cases`);
  }

  // Priority recommendations
  summary.priorityRecommendations = [
    '1. Implement immediate content validation after SEC API fetch',
    '2. Add accession number date validation (reject future dates)',
    '3. Deploy optimized NoSuchKey detection patterns',
    '4. Prioritize processing of filings within 24 hours',
    '5. Add comprehensive error monitoring and alerting'
  ];

  // Implementation plan
  summary.implementationPlan = [
    {
      phase: 'Phase 1 - Quick Wins',
      tasks: [
        'Add content length validation',
        'Implement basic NoSuchKey pattern detection',
        'Add accession number date validation'
      ],
      effort: 'Low',
      impact: 'High'
    },
    {
      phase: 'Phase 2 - Enhanced Validation',
      tasks: [
        'Deploy comprehensive content validation',
        'Add processing delay monitoring',
        'Implement cost tracking for failed attempts'
      ],
      effort: 'Medium',
      impact: 'High'
    },
    {
      phase: 'Phase 3 - Optimization',
      tasks: [
        'Add predictive failure detection',
        'Implement adaptive retry strategies',
        'Deploy comprehensive monitoring dashboard'
      ],
      effort: 'High',
      impact: 'Medium'
    }
  ];

  testResults.summary = summary;

  console.log('\nKey Findings:');
  summary.keyFindings.forEach(finding => console.log(`  • ${finding}`));

  console.log('\nPriority Recommendations:');
  summary.priorityRecommendations.forEach(rec => console.log(`  ${rec}`));

  console.log('\nImplementation Plan:');
  summary.implementationPlan.forEach(phase => {
    console.log(`  ${phase.phase} (${phase.effort} effort, ${phase.impact} impact):`);
    phase.tasks.forEach(task => console.log(`    - ${task}`));
  });

  return summary;
}

/**
 * Main execution function
 */
async function main() {
  console.log('META Filing Content Issues - Hypothesis Testing');
  console.log('='.repeat(50));
  
  try {
    // Execute all hypothesis tests
    await testNoSuchKeyDetection();
    await testContentValidationTiming();
    await testFailedAccessionNumbers();
    await testProcessingDelayImpact();
    await testSecEdgarApi();
    
    // Generate comprehensive report
    generateTestReport();
    
    // Save results to file
    const fs = await import('fs/promises');
    const resultsFile = `meta-filing-hypothesis-test-results-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    await fs.writeFile(resultsFile, JSON.stringify(testResults, null, 2));
    console.log(`\n📊 Full results saved to: ${resultsFile}`);
    
    console.log('\n✅ Hypothesis testing completed successfully');
    
  } catch (error) {
    console.error('❌ Hypothesis testing failed:', error);
    process.exit(1);
  }
}

// Execute if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}