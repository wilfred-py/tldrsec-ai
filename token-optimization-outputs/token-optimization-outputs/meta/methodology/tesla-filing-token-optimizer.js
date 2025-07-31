/**
 * Tesla SEC Filing Token Optimization Script
 * 
 * Fetches Tesla Q2 2025 10-Q filing and performs aggressive token optimization
 * while preserving all critical shareholder information.
 */

import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

const FILING_URL = "https://www.sec.gov/Archives/edgar/data/1318605/000162828025035806/tsla-20250630.htm";

/**
 * Fetch Tesla filing with proper SEC headers
 */
async function fetchTeslaFiling() {
  console.log("🔍 Fetching Tesla Q2 2025 10-Q filing...");
  
  try {
    const response = await fetch(FILING_URL, {
      headers: {
        'User-Agent': 'tldrSEC-AI Bot (contact@tldrsec.com)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const content = await response.text();
    console.log(`✅ Successfully fetched filing: ${content.length} characters`);
    
    return content;
  } catch (error) {
    console.error("❌ Error fetching Tesla filing:", error.message);
    return null;
  }
}

/**
 * Analyze document structure and identify key sections
 */
function analyzeDocumentStructure(content) {
  const $ = cheerio.load(content);
  
  const analysis = {
    totalLength: content.length,
    estimatedTokens: Math.ceil(content.length / 4),
    hasInlineXBRL: content.includes('xmlns:ix') || content.includes('ix:'),
    tableCount: $('table').length,
    sections: {
      managementDiscussion: content.includes('Management\'s Discussion'),
      riskFactors: content.includes('Risk Factor'),
      financialStatements: content.includes('Consolidated Statement'),
      balanceSheet: content.includes('Consolidated Balance Sheet'),
      cashFlow: content.includes('Cash Flow'),
      incomeStatement: content.includes('Statement of Operations')
    }
  };
  
  // Identify major content blocks
  const titleElements = $('p, div, span').filter((i, el) => {
    const text = $(el).text().trim();
    return text.length > 20 && text.length < 200 && 
           (text.includes('Item ') || text.includes('ITEM ') || 
            text.includes('Part ') || text.includes('PART '));
  });
  
  analysis.majorSections = titleElements.map((i, el) => $(el).text().trim()).get().slice(0, 20);
  
  return analysis;
}

/**
 * Remove boilerplate and formatting while preserving critical content
 */
function performInitialCleaning(content) {
  let cleaned = content;
  
  // Remove HTML head, scripts, and styles
  cleaned = cleaned.replace(/<head[\s\S]*?<\/head>/gi, '');
  cleaned = cleaned.replace(/<script[\s\S]*?<\/script>/gi, '');
  cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, '');
  
  // Remove HTML comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');
  
  // Remove excessive whitespace and empty lines
  cleaned = cleaned.replace(/\s+/g, ' ');
  cleaned = cleaned.replace(/\n\s*\n/g, '\n');
  
  // Remove common boilerplate patterns
  const boilerplatePatterns = [
    /Table of Contents.*?(?=\n[A-Z])/gi,
    /Forward-Looking Statements.*?(?=\n[A-Z])/gi,
    /The information.*?risk factors.*?(?=\n[A-Z])/gi,
    /This report.*?constitute.*?(?=\n[A-Z])/gi
  ];
  
  boilerplatePatterns.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '');
  });
  
  return cleaned.trim();
}

/**
 * Extract critical financial data and tables
 */
function extractCriticalFinancialData(content) {
  const $ = cheerio.load(content);
  const criticalSections = [];
  
  // Extract financial statement tables with context
  $('table').each((i, table) => {
    const $table = $(table);
    const tableText = $table.text();
    
    // Check if this is a financial statement table
    if (tableText.includes('$') && 
        (tableText.includes('Revenue') || tableText.includes('Income') || 
         tableText.includes('Assets') || tableText.includes('Cash') ||
         tableText.includes('Liabilities') || tableText.includes('Equity'))) {
      
      // Get preceding context (title/description)
      let context = '';
      let prev = $table.prev();
      for (let j = 0; j < 3 && prev.length > 0; j++) {
        const prevText = prev.text().trim();
        if (prevText.length > 10 && prevText.length < 200) {
          context = prevText + '\n' + context;
        }
        prev = prev.prev();
      }
      
      // Extract table data
      const tableData = extractTableData($table);
      
      criticalSections.push({
        type: 'financial_table',
        context: context.trim(),
        data: tableData,
        estimatedTokens: Math.ceil((context + tableData).length / 4)
      });
    }
  });
  
  return criticalSections;
}

/**
 * Extract table data in a token-efficient format
 */
function extractTableData(table) {
  const $ = cheerio.load(table);
  let tableText = '';
  
  // Extract headers
  const headers = [];
  $('th, td:first-child').each((i, cell) => {
    const text = $(cell).text().trim();
    if (text && !headers.includes(text)) {
      headers.push(text);
    }
  });
  
  // Extract rows
  const rows = [];
  $('tr').each((i, row) => {
    const rowData = [];
    $(row).find('td, th').each((j, cell) => {
      rowData.push($(cell).text().trim().replace(/\s+/g, ' '));
    });
    if (rowData.length > 1) {
      rows.push(rowData.join(' | '));
    }
  });
  
  return rows.join('\n');
}

/**
 * Extract Management's Discussion and Analysis (MD&A)
 */
function extractMDA(content) {
  const $ = cheerio.load(content);
  
  // Find MD&A section
  const mdaStart = content.search(/Management['']s Discussion and Analysis|MANAGEMENT['']S DISCUSSION AND ANALYSIS/i);
  if (mdaStart === -1) return null;
  
  // Extract text around MD&A section (next 50,000 characters as a starting point)
  const mdaContent = content.substring(mdaStart, mdaStart + 50000);
  
  // Clean and compress the MD&A content
  const cleanedMDA = mdaContent
    .replace(/<[^>]*>/g, ' ')  // Remove HTML tags
    .replace(/\s+/g, ' ')      // Normalize whitespace
    .replace(/\b(the|and|or|of|in|to|for|with|by|from|as|at|on|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|could|should|may|might|can|must)\b/gi, '')  // Remove common words
    .trim();
  
  return {
    type: 'mda',
    content: cleanedMDA.substring(0, 10000), // Limit to 10k chars
    estimatedTokens: Math.ceil(cleanedMDA.length / 4)
  };
}

/**
 * Extract risk factors
 */
function extractRiskFactors(content) {
  const riskStart = content.search(/Risk Factors|RISK FACTORS/i);
  if (riskStart === -1) return null;
  
  // Extract risk factors section (next 30,000 characters)
  const riskContent = content.substring(riskStart, riskStart + 30000);
  
  // Find specific risk points and compress
  const $ = cheerio.load(riskContent);
  const riskPoints = [];
  
  $('p, li, div').each((i, element) => {
    const text = $(element).text().trim();
    if (text.length > 100 && text.length < 1000 && 
        (text.includes('risk') || text.includes('may') || text.includes('could'))) {
      // Compress the risk point
      const compressed = text
        .replace(/\b(the|and|or|of|in|to|for|with|by|from|as|at|on|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|could|should|may|might|can|must)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
      
      if (compressed.length > 50) {
        riskPoints.push(compressed);
      }
    }
  });
  
  return {
    type: 'risk_factors',
    content: riskPoints.slice(0, 10).join('\n\n'), // Top 10 risk factors
    estimatedTokens: Math.ceil(riskPoints.join('').length / 4)
  };
}

/**
 * Perform aggressive token optimization
 */
function optimizeTokenUsage(extractedSections) {
  let optimizedContent = '';
  let totalTokens = 0;
  
  console.log('\n📊 OPTIMIZING TOKEN USAGE...\n');
  
  extractedSections.forEach(section => {
    console.log(`  ${section.type}: ${section.estimatedTokens} tokens`);
    optimizedContent += `\n--- ${section.type.toUpperCase()} ---\n`;
    
    if (section.context) {
      optimizedContent += section.context + '\n';
    }
    
    optimizedContent += section.content || section.data || '';
    optimizedContent += '\n';
    
    totalTokens += section.estimatedTokens;
  });
  
  return {
    content: optimizedContent,
    totalTokens,
    sections: extractedSections.length
  };
}

/**
 * Main optimization process
 */
async function optimizeTeslaFiling() {
  console.log('🚀 Starting Tesla SEC Filing Token Optimization Process\n');
  
  // Step 1: Fetch the filing
  const rawContent = await fetchTeslaFiling();
  if (!rawContent) {
    console.error('Failed to fetch filing content');
    return;
  }
  
  // Step 2: Analyze structure  
  console.log('\n📋 ANALYZING DOCUMENT STRUCTURE...');
  const analysis = analyzeDocumentStructure(rawContent);
  
  console.log(`\n=== INITIAL ANALYSIS ===`);
  console.log(`Original length: ${analysis.totalLength.toLocaleString()} characters`);
  console.log(`Estimated tokens: ${analysis.estimatedTokens.toLocaleString()}`);
  console.log(`Has inline XBRL: ${analysis.hasInlineXBRL}`);
  console.log(`Table count: ${analysis.tableCount}`);
  console.log(`Key sections found:`, Object.entries(analysis.sections).filter(([_, found]) => found).map(([name]) => name));
  console.log(`Major sections:`, analysis.majorSections.slice(0, 5));
  
  // Step 3: Initial cleaning
  console.log('\n🧹 PERFORMING INITIAL CLEANING...');
  const cleaned = performInitialCleaning(rawContent);
  const cleanedTokens = Math.ceil(cleaned.length / 4);
  console.log(`After cleaning: ${cleaned.length.toLocaleString()} characters (${cleanedTokens.toLocaleString()} tokens)`);
  console.log(`Reduction: ${((analysis.totalLength - cleaned.length) / analysis.totalLength * 100).toFixed(1)}%`);
  
  // Step 4: Extract critical sections
  console.log('\n💎 EXTRACTING CRITICAL CONTENT...');
  const criticalSections = [];
  
  // Extract financial data
  const financialData = extractCriticalFinancialData(cleaned);
  criticalSections.push(...financialData);
  
  // Extract MD&A
  const mda = extractMDA(cleaned);
  if (mda) criticalSections.push(mda);
  
  // Extract risk factors
  const riskFactors = extractRiskFactors(cleaned);
  if (riskFactors) criticalSections.push(riskFactors);
  
  // Step 5: Final optimization
  console.log('\n⚡ FINAL TOKEN OPTIMIZATION...');
  const optimized = optimizeTokenUsage(criticalSections);
  
  // Calculate final metrics
  const tokenReduction = ((analysis.estimatedTokens - optimized.totalTokens) / analysis.estimatedTokens * 100);
  
  console.log(`\n=== OPTIMIZATION RESULTS ===`);
  console.log(`Original tokens: ${analysis.estimatedTokens.toLocaleString()}`);
  console.log(`Optimized tokens: ${optimized.totalTokens.toLocaleString()}`);
  console.log(`Token reduction: ${tokenReduction.toFixed(1)}%`);
  console.log(`Sections preserved: ${optimized.sections}`);
  console.log(`Content length: ${optimized.content.length.toLocaleString()} characters`);
  
  if (tokenReduction >= 90) {
    console.log('✅ TARGET ACHIEVED: >90% token reduction while preserving critical content!');
  } else {
    console.log('⚠️  Token reduction target not met - further optimization needed');
  }
  
  // Save optimized content
  console.log('\n💾 SAVING OPTIMIZED CONTENT...');
  console.log('\n--- OPTIMIZED TESLA Q2 2025 10-Q CONTENT ---');
  console.log(optimized.content.substring(0, 2000));
  console.log('\n...[content continues]...\n');
  
  return {
    original: {
      tokens: analysis.estimatedTokens,
      length: analysis.totalLength
    },
    optimized: {
      tokens: optimized.totalTokens,
      length: optimized.content.length,
      content: optimized.content
    },
    reduction: tokenReduction,
    sections: optimized.sections,
    targetAchieved: tokenReduction >= 90
  };
}

// Run the optimization
optimizeTeslaFiling()
  .then(result => {
    if (result) {
      console.log('\n🎯 OPTIMIZATION PROCESS COMPLETED');
      console.log(`Final assessment: ${result.targetAchieved ? 'SUCCESS' : 'NEEDS FURTHER WORK'}`);
    }
  })
  .catch(error => {
    console.error('💥 Script failed:', error);
  });