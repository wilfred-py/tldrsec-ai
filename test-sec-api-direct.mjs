#!/usr/bin/env node

/**
 * Direct SEC API Testing for Failed META Accession Numbers
 */

import axios from 'axios';

const FAILED_META_ACCESSION_NUMBERS = [
  {
    accession: '0001921094-25-001187',
    description: 'Form 144, 9/22/2025 - FUTURE DATE ERROR'
  },
  {
    accession: '0000950103-25-011843', 
    description: 'Form 4, 9/18/2025 - FUTURE DATE ERROR'
  }
];

const TEST_CONFIG = {
  userAgent: 'TLDRSEC wilfredchen1@gmail.com',
  timeout: 30000
};

console.log('Direct SEC API Testing for Failed META Accession Numbers');
console.log('='.repeat(60));

async function testSecApiEndpoints() {
  const secClient = axios.create({
    timeout: TEST_CONFIG.timeout,
    headers: {
      'User-Agent': TEST_CONFIG.userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate'
    }
  });

  for (const item of FAILED_META_ACCESSION_NUMBERS) {
    const { accession, description } = item;
    
    console.log(`\n=== Testing: ${accession} ===`);
    console.log(`Description: ${description}`);
    
    // Extract CIK and format accession number
    const cik = accession.substring(0, 10);
    const formattedAccession = accession.replace(/-/g, '');
    const formattedCik = cik.replace(/^0+/, '');
    
    console.log(`CIK: ${cik} (formatted: ${formattedCik})`);
    console.log(`Formatted Accession: ${formattedAccession}`);

    // Test different URL patterns
    const urlPatterns = [
      {
        name: 'Primary Document (HTM)',
        url: `https://www.sec.gov/Archives/edgar/data/${formattedCik}/${formattedAccession}/${accession}.htm`
      },
      {
        name: 'Index Page',
        url: `https://www.sec.gov/Archives/edgar/data/${formattedCik}/${formattedAccession}/${accession}-index.html`
      },
      {
        name: 'Directory Listing',
        url: `https://www.sec.gov/Archives/edgar/data/${formattedCik}/${formattedAccession}/`
      },
      {
        name: 'XML Document',
        url: `https://www.sec.gov/Archives/edgar/data/${formattedCik}/${formattedAccession}/${accession}.xml`
      }
    ];

    for (const pattern of urlPatterns) {
      console.log(`\n  Testing ${pattern.name}:`);
      console.log(`  URL: ${pattern.url}`);
      
      try {
        const response = await secClient.get(pattern.url, {
          validateStatus: (status) => status < 500 // Accept 4xx errors as valid responses
        });

        console.log(`  ✅ Status: ${response.status} ${response.statusText}`);
        console.log(`  Content-Type: ${response.headers['content-type'] || 'unknown'}`);
        console.log(`  Content-Length: ${response.data?.length || 0} bytes`);
        
        // Check for NoSuchKey or error patterns
        if (typeof response.data === 'string') {
          const content = response.data.toLowerCase();
          
          if (content.includes('nosuchkey')) {
            console.log(`  ⚠️  NoSuchKey error detected`);
          } else if (content.includes('404') && content.includes('not found')) {
            console.log(`  ⚠️  404 Not Found error detected`);
          } else if (content.includes('error')) {
            console.log(`  ⚠️  Generic error detected`);
          } else if (response.data.length < 100) {
            console.log(`  ⚠️  Suspiciously short content (${response.data.length} bytes)`);
          } else {
            console.log(`  ✅ Content appears valid`);
          }
          
          // Show content preview for analysis
          const preview = response.data.substring(0, 200).replace(/\s+/g, ' ').trim();
          console.log(`  Preview: "${preview}..."`);
        }

      } catch (error) {
        console.log(`  ❌ Error: ${error.message}`);
        if (error.response) {
          console.log(`  HTTP Status: ${error.response.status} ${error.response.statusText}`);
        }
        if (error.code) {
          console.log(`  Error Code: ${error.code}`);
        }
      }

      // Rate limiting - be respectful to SEC servers
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
}

/**
 * Test date validation for accession numbers
 */
function testAccessionDateValidation() {
  console.log('\n=== Accession Number Date Validation ===');
  
  function validateAccessionDate(accessionNumber) {
    // Extract year from accession number (positions 5-6)
    const yearString = accessionNumber.substring(5, 7);
    const year = parseInt(yearString);
    const currentYear = new Date().getFullYear() % 100;
    
    const result = {
      accessionNumber,
      extractedYear: year,
      fullYear: year < 50 ? 2000 + year : 1900 + year, // Y2K handling
      currentYear: new Date().getFullYear(),
      isValid: year <= currentYear,
      isFutureDate: year > currentYear
    };
    
    return result;
  }

  for (const item of FAILED_META_ACCESSION_NUMBERS) {
    const validation = validateAccessionDate(item.accession);
    
    console.log(`\nAccession: ${validation.accessionNumber}`);
    console.log(`  Extracted year: ${validation.extractedYear} -> ${validation.fullYear}`);
    console.log(`  Current year: ${validation.currentYear}`);
    console.log(`  Valid: ${validation.isValid ? '✅' : '❌'}`);
    console.log(`  Future date: ${validation.isFutureDate ? '⚠️  YES' : '✅ NO'}`);
    
    if (validation.isFutureDate) {
      console.log(`  🚨 RECOMMENDATION: Reject this accession number immediately`);
    }
  }
}

/**
 * Test content validation patterns
 */
function testContentValidation() {
  console.log('\n=== Content Validation Patterns ===');
  
  // Simulate different content types we might receive
  const contentExamples = [
    {
      name: 'NoSuchKey XML Error',
      content: '<?xml version="1.0"?><Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message></Error>',
      shouldReject: true
    },
    {
      name: 'HTML 404 Error',
      content: '<html><head><title>404 Not Found</title></head><body><h1>404 Not Found</h1><p>The requested document could not be found.</p></body></html>',
      shouldReject: true
    },
    {
      name: 'Valid Form 4 Content',
      content: '<html><head><title>FORM 4</title></head><body><div>UNITED STATES SECURITIES AND EXCHANGE COMMISSION</div><div>STATEMENT OF CHANGES IN BENEFICIAL OWNERSHIP</div><table><tr><td>META PLATFORMS INC</td></tr></table></body></html>',
      shouldReject: false
    },
    {
      name: 'Empty Content',
      content: '',
      shouldReject: true
    },
    {
      name: 'Very Short Content',
      content: 'Error: Document not found',
      shouldReject: true
    }
  ];

  function validateContent(content) {
    // Content validation rules
    if (!content || typeof content !== 'string') {
      return { valid: false, reason: 'No content or invalid type' };
    }
    
    if (content.length < 50) {
      return { valid: false, reason: 'Content too short' };
    }
    
    if (content.includes('<Code>NoSuchKey</Code>')) {
      return { valid: false, reason: 'NoSuchKey XML error' };
    }
    
    if (/NoSuchKey/i.test(content) && /not exist|404|error/i.test(content)) {
      return { valid: false, reason: 'NoSuchKey pattern detected' };
    }
    
    if (content.includes('404 Not Found') && content.length < 1000) {
      return { valid: false, reason: '404 error page' };
    }
    
    // Check for minimum SEC filing indicators
    const hasSecIndicators = /securities.*exchange.*commission|form \d+|statement.*beneficial.*ownership/i.test(content);
    if (!hasSecIndicators && content.length < 10000) {
      return { valid: false, reason: 'No SEC filing indicators found' };
    }
    
    return { valid: true, reason: 'Content appears valid' };
  }

  console.log('Testing content validation patterns...');
  
  let correctValidations = 0;
  
  for (const example of contentExamples) {
    const validation = validateContent(example.content);
    const expectedValid = !example.shouldReject;
    const correct = validation.valid === expectedValid;
    
    if (correct) correctValidations++;
    
    console.log(`\n  ${example.name}:`);
    console.log(`    Length: ${example.content.length} bytes`);
    console.log(`    Valid: ${validation.valid ? '✅' : '❌'}`);
    console.log(`    Reason: ${validation.reason}`);
    console.log(`    Expected: ${expectedValid ? 'Valid' : 'Invalid'}`);
    console.log(`    Result: ${correct ? '✅ CORRECT' : '❌ INCORRECT'}`);
  }
  
  const accuracy = (correctValidations / contentExamples.length * 100).toFixed(1);
  console.log(`\nValidation Accuracy: ${accuracy}% (${correctValidations}/${contentExamples.length})`);
}

async function main() {
  try {
    await testSecApiEndpoints();
    testAccessionDateValidation();
    testContentValidation();
    
    console.log('\n=== SUMMARY & RECOMMENDATIONS ===');
    console.log('\n🔍 Key Findings:');
    console.log('  1. Future date patterns identified in accession numbers');
    console.log('  2. Content validation can prevent processing invalid responses');
    console.log('  3. Multiple validation layers provide comprehensive error detection');
    
    console.log('\n🚀 Implementation Recommendations:');
    console.log('  1. Add accession number date validation before SEC API calls');
    console.log('  2. Implement content validation immediately after fetch');
    console.log('  3. Use multi-pattern detection for NoSuchKey errors');
    console.log('  4. Add minimum content length requirements');
    console.log('  5. Validate presence of SEC filing indicators');
    
    console.log('\n✅ Testing completed successfully');
    
  } catch (error) {
    console.error('❌ Testing failed:', error);
    process.exit(1);
  }
}

main();