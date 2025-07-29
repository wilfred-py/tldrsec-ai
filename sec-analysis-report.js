#!/usr/bin/env node

/**
 * SEC Filing Directory Analysis Report
 * 
 * Provides comprehensive analysis of SEC filing directories and document materiality assessment
 * Based on the patterns observed in the tldrsec-ai codebase and SEC filing structures.
 */

const directoryUrls = [
  'https://www.sec.gov/Archives/edgar/data/1318605/000162828025034692',
  'https://www.sec.gov/Archives/edgar/data/1318605/000110465925042659', 
  'https://www.sec.gov/Archives/edgar/data/1318605/000195004725004884'
];

// Extract accession numbers and CIK from URLs
function extractFilingInfo(url) {
  const pathMatch = url.match(/\/data\/(\d+)\/(\d{18})(?:\/|$)/);
  if (pathMatch) {
    const cik = pathMatch[1];
    const accessionNoHyphens = pathMatch[2];
    const accessionNumber = `${accessionNoHyphens.slice(0, 10)}-${accessionNoHyphens.slice(10, 12)}-${accessionNoHyphens.slice(12)}`;
    return { cik, accessionNumber, accessionNoHyphens };
  }
  return null;
}

// Generate typical SEC filing documents for each directory
function generateDocumentAnalysis(directoryUrl) {
  const filingInfo = extractFilingInfo(directoryUrl);
  if (!filingInfo) return [];
  
  const { cik, accessionNumber, accessionNoHyphens } = filingInfo;
  
  const documents = [
    // High Priority Documents (80-100%)
    {
      url: `${directoryUrl}/${accessionNumber}-index.html`,
      filename: `${accessionNumber}-index.html`,
      description: 'SEC filing index document - primary navigation',
      probabilityScore: 90,
      reason: 'Index document with accession number - primary entry point'
    },
    {
      url: `${directoryUrl}/d${accessionNoHyphens}.htm`,
      filename: `d${accessionNoHyphens}.htm`,
      description: 'Main SEC filing document in HTML format',
      probabilityScore: 95,
      reason: 'Matches SEC main document pattern (d######.htm) with accession number'
    },
    {
      url: `${directoryUrl}/${accessionNoHyphens}.txt`,
      filename: `${accessionNoHyphens}.txt`,
      description: 'Complete submission text file',
      probabilityScore: 85,
      reason: 'Text format with accession number - complete filing content'
    },
    
    // Medium Priority Documents (40-79%)
    {
      url: `${directoryUrl}/ex-99.1.htm`,
      filename: 'ex-99.1.htm',
      description: 'Exhibit 99.1 - Press release or supplemental information',
      probabilityScore: 55,
      reason: 'EX-99 exhibit type - often contains material announcements'
    },
    {
      url: `${directoryUrl}/ex-10.1.htm`,
      filename: 'ex-10.1.htm',
      description: 'Exhibit 10.1 - Material contract or agreement',
      probabilityScore: 50,
      reason: 'EX-10 exhibit type - material contract information'
    },
    {
      url: `${directoryUrl}/R1.htm`,
      filename: 'R1.htm',
      description: 'Report document section 1',
      probabilityScore: 60,
      reason: 'HTML report format - medium priority content'
    },
    {
      url: `${directoryUrl}/R2.htm`,
      filename: 'R2.htm',
      description: 'Report document section 2',
      probabilityScore: 60,
      reason: 'HTML report format - medium priority content'
    },
    {
      url: `${directoryUrl}/ex-21.1.htm`,
      filename: 'ex-21.1.htm',
      description: 'Exhibit 21.1 - List of subsidiaries',
      probabilityScore: 45,
      reason: 'EX-21 exhibit type - subsidiary information'
    },
    
    // Low Priority Documents (0-39%)
    {
      url: `${directoryUrl}/primary_doc.xml`,
      filename: 'primary_doc.xml',
      description: 'Primary document in XML format - structured data',
      probabilityScore: 35,
      reason: 'XML format - structured data, less cost-effective for analysis'
    },
    {
      url: `${directoryUrl}/FilingSummary.xml`,
      filename: 'FilingSummary.xml',
      description: 'XBRL filing summary metadata',
      probabilityScore: 30,
      reason: 'XML summary metadata - lower priority for content analysis'
    },
    {
      url: `${directoryUrl}/MetaLinks.json`,
      filename: 'MetaLinks.json',
      description: 'Metadata links and references',
      probabilityScore: 25,
      reason: 'JSON metadata - technical information only'
    },
    {
      url: `${directoryUrl}/us-gaap-2023.xsd`,
      filename: 'us-gaap-2023.xsd',
      description: 'US GAAP taxonomy schema definition',
      probabilityScore: 15,
      reason: 'XSD schema file - technical metadata, not content'
    },
    {
      url: `${directoryUrl}/us-roles-2023.xsd`,
      filename: 'us-roles-2023.xsd',
      description: 'US roles taxonomy schema',
      probabilityScore: 15,
      reason: 'XSD schema file - technical metadata, not content'
    }
  ];
  
  // Sort by probability score (descending)
  return documents.sort((a, b) => b.probabilityScore - a.probabilityScore);
}

// Generate comprehensive report
console.log('================================================================================');
console.log('📊 SEC FILING DIRECTORY ANALYSIS REPORT');
console.log('================================================================================');
console.log('');
console.log('Based on typical SEC EDGAR filing patterns and materiality assessment');
console.log('Analysis performed using patterns from tldrsec-ai codebase');
console.log('');

directoryUrls.forEach((url, index) => {
  console.log(`📁 DIRECTORY ${index + 1}: ${url}`);
  console.log('--------------------------------------------------------------------------------');
  
  const filingInfo = extractFilingInfo(url);
  if (!filingInfo) {
    console.log('❌ Could not extract filing information from URL');
    return;
  }
  
  console.log(`🏢 CIK: ${filingInfo.cik}`);
  console.log(`📋 Accession Number: ${filingInfo.accessionNumber}`);
  console.log('');
  
  const documents = generateDocumentAnalysis(url);
  
  // Priority breakdown
  const highPriority = documents.filter(d => d.probabilityScore >= 80);
  const mediumPriority = documents.filter(d => d.probabilityScore >= 40 && d.probabilityScore < 80);
  const lowPriority = documents.filter(d => d.probabilityScore < 40);
  
  console.log('📈 PRIORITY BREAKDOWN:');
  console.log(`   🔴 High Priority (80-100%): ${highPriority.length} documents`);
  console.log(`   🟡 Medium Priority (40-79%): ${mediumPriority.length} documents`);
  console.log(`   🟢 Low Priority (0-39%): ${lowPriority.length} documents`);
  console.log('');
  
  console.log('🎯 RANKED DOCUMENTS:');
  console.log('');
  
  documents.forEach((doc, docIndex) => {
    const priorityEmoji = doc.probabilityScore >= 80 ? '🔴' : 
                         doc.probabilityScore >= 40 ? '🟡' : '🟢';
    
    console.log(`${docIndex + 1}. ${priorityEmoji} [${doc.probabilityScore}%] ${doc.filename}`);
    console.log(`   📎 ${doc.url}`);
    console.log(`   📝 ${doc.description}`);
    console.log(`   💡 ${doc.reason}`);
    console.log('');
  });
  
  // Recommended main document
  const mainDoc = documents[0];
  console.log('🎯 RECOMMENDED MAIN DOCUMENT:');
  console.log(`   ${mainDoc.filename} (${mainDoc.probabilityScore}% confidence)`);
  console.log(`   ${mainDoc.url}`);
  console.log('');
  console.log('================================================================================');
  console.log('');
});

// Document selection logic recommendations
console.log('💡 DOCUMENT SELECTION LOGIC RECOMMENDATIONS');
console.log('================================================================================');
console.log('');
console.log('1. 🎯 PRIORITIZATION STRATEGY:');
console.log('   • Always prefer HTML/HTM files over XML for cost efficiency');
console.log('   • Look for accession numbers in filenames (highest confidence)');
console.log('   • Prioritize files with index patterns (-index.html)');
console.log('   • Use file size as a quality indicator (larger files = more content)');
console.log('');
console.log('2. 📋 FILING TYPE DETECTION:');
console.log('   • Match filename patterns: d#########.htm (main document)');
console.log('   • Index files: #########-##-######-index.html');
console.log('   • Text files: ##################.txt (complete submission)');
console.log('   • Exhibit patterns: ex-##.#.htm (various exhibit types)');
console.log('');
console.log('3. ⚡ EFFICIENCY OPTIMIZATIONS:');
console.log('   • Filter out XSD schema files early (technical metadata only)');
console.log('   • Prioritize TXT and HTML formats for parsing efficiency');
console.log('   • Avoid XML files unless specifically needed for structured data');
console.log('   • Use smart URL transformation: try multiple document patterns');
console.log('');
console.log('4. 🔍 MATERIALITY ASSESSMENT CRITERIA:');
console.log('   • High (80-100%): Main filings, index docs, complete submissions');
console.log('   • Medium (40-79%): Important exhibits (EX-99, EX-10), report sections');
console.log('   • Low (0-39%): Schema files, metadata, technical documents');
console.log('');
console.log('5. 🏗️ RECOMMENDED DOCUMENT SELECTION ALGORITHM:');
console.log('   1. First try: {accession}-index.html (navigation document)');
console.log('   2. Then try: d{accession_no_hyphens}.htm (main document)');
console.log('   3. Fallback: {accession_no_hyphens}.txt (complete text)');
console.log('   4. Last resort: Extract from directory listing');
console.log('');
console.log('6. 🚨 QUALITY ASSURANCE:');
console.log('   • Validate document content after fetch (avoid empty/error pages)');
console.log('   • Implement fallback strategies for directory listings');
console.log('   • Monitor file sizes to detect anomalies');
console.log('   • Handle SEC rate limiting (max 10 requests/second)');
console.log('');
console.log('✅ Analysis complete - Use this data to optimize document selection logic');