/**
 * Simplified Test Script for Tesla SEC Filings
 * 
 * This script demonstrates how to use Cheerio directly to parse SEC filings.
 * It uses the sample HTML from demo-parser.js to avoid network issues.
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

// Create a directory for output
const OUTPUT_DIR = path.join(__dirname, 'tesla-filing-results');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Sample HTML representing a Tesla 10-K filing
const sampleHTML = `
<!DOCTYPE html>
<html>
<head>
  <title>TESLA INC (0001318605) - Form 10-K - Filed on 01/31/2023</title>
</head>
<body>
  <h1>TESLA, INC - Annual Report (10-K)</h1>
  
  <h2>Item 1. Business</h2>
  <p>Tesla is a technology company focused on accelerating the world's transition to sustainable energy. We design, develop, manufacture, sell and lease electric vehicles and energy generation and storage systems, and offer services related thereto.</p>
  
  <h2>Item 1A. Risk Factors</h2>
  <p>We may face operational challenges that could adversely affect our business and future prospects and financial performance, as well as our ability to attain revenue growth and profitability objectives.</p>
  
  <h2>Management's Discussion and Analysis</h2>
  <p>Our business has been successful as we have scaled our operations and increased production to satisfy the growing demand for our products.</p>
  
  <h3>Financial Results</h3>
  <table>
    <caption>Annual Financial Data (in millions, except per share data)</caption>
    <thead>
      <tr>
        <th>Year</th>
        <th>Revenue</th>
        <th>Net Income</th>
        <th>EPS (Diluted)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>2022</td>
        <td>$81,462</td>
        <td>$12,556</td>
        <td>$3.62</td>
      </tr>
      <tr>
        <td>2021</td>
        <td>$53,823</td>
        <td>$5,519</td>
        <td>$1.59</td>
      </tr>
      <tr>
        <td>2020</td>
        <td>$31,536</td>
        <td>$862</td>
        <td>$0.25</td>
      </tr>
    </tbody>
  </table>
  
  <h3>Vehicle Production</h3>
  <ul>
    <li>Model S/X: 71,177 vehicles</li>
    <li>Model 3/Y: 1,298,434 vehicles</li>
    <li>Total: 1,369,611 vehicles</li>
  </ul>
</body>
</html>
`;

// Important sections by filing type
const IMPORTANT_SECTIONS = {
  '10-K': [
    'Management\'s Discussion and Analysis',
    'Risk Factors',
    'Financial Statements',
    'Notes to Financial Statements',
    'Business'
  ],
  '10-Q': [
    'Management\'s Discussion and Analysis',
    'Risk Factors',
    'Financial Statements',
    'Notes to Financial Statements',
  ],
  '8-K': [
    'Item 1.01',
    'Item 2.01',
    'Item 5.02',
    'Item 7.01',
    'Item 8.01',
    'Item 9.01',
  ],
  'DEFA14A': [
    'Additional Information and Where to Find It',
    'Participants in the Solicitation',
    'Information Regarding the Meeting'
  ]
};

/**
 * Detect the filing type from HTML content
 * 
 * @param {string} html - The HTML content to analyze
 * @returns {string|null} - The detected filing type or null if not detected
 */
function detectFilingType(html) {
  // Simple regex-based detection from title or content
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';
  
  // Check for common patterns in the title
  if (/Form 10-K|Annual Report|10-K/i.test(title)) return '10-K';
  if (/Form 10-Q|Quarterly Report|10-Q/i.test(title)) return '10-Q';
  if (/Form 8-K|Current Report|8-K/i.test(title)) return '8-K';
  if (/DEFA14A|DEFA 14A|Additional Proxy Materials/i.test(title)) return 'DEFA14A';
  
  // Check content if title doesn't provide clear indication
  if (/Form 10-K/i.test(html)) return '10-K';
  if (/Form 10-Q/i.test(html)) return '10-Q';
  if (/Form 8-K/i.test(html)) return '8-K';
  if (/DEFA14A|DEFA 14A|Additional Proxy Materials/i.test(html)) return 'DEFA14A';
  
  // No recognized pattern found
  return null;
}

/**
 * Parse an SEC filing HTML content
 * 
 * @param {string} html - The HTML content to parse
 * @param {string} filingType - The type of filing (10-K, 10-Q, etc.)
 * @returns {Object} - The parsed filing data
 */
function parseSecFiling(html, filingType) {
  console.log(`Parsing ${filingType} filing...`);
  const $ = cheerio.load(html);
  
  // Extract basic document details
  const title = $('title').text().trim();
  const companyMatch = title.match(/([A-Z\s]+)\s*\(/i);
  const companyName = companyMatch ? companyMatch[1].trim() : 'Unknown Company';
  const cikMatch = title.match(/\((\d+)\)/);
  const cik = cikMatch ? cikMatch[1] : '';
  
  // Extract sections based on headers
  const sections = [];
  
  $('h1, h2, h3, h4').each((index, element) => {
    const headerElem = $(element);
    const headerText = headerElem.text().trim();
    
    // Skip empty headers
    if (!headerText) return;
    
    // Get all content until the next header
    let contentElements = [];
    let nextElem = headerElem.next();
    
    while (nextElem.length > 0) {
      const tagName = nextElem.prop('tagName');
      if (tagName && ['H1', 'H2', 'H3', 'H4'].includes(tagName.toUpperCase())) {
        break;
      }
      
      contentElements.push(nextElem.clone());
      nextElem = nextElem.next();
    }
    
    // Join the content
    const content = contentElements.map(elem => $(elem).text().trim()).join('\n');
    
    sections.push({
      title: headerText,
      content: content
    });
  });
  
  // Extract tables
  const tables = [];
  
  $('table').each((index, element) => {
    const tableElem = $(element);
    const captionElem = tableElem.find('caption');
    const title = captionElem.length ? captionElem.text().trim() : `Table ${index + 1}`;
    
    // Convert table to structured data
    const tableData = [];
    
    tableElem.find('tr').each((rowIndex, rowElement) => {
      const row = [];
      $(rowElement).find('th, td').each((cellIndex, cellElement) => {
        row.push($(cellElement).text().trim());
      });
      
      if (row.length > 0) {
        tableData.push(row);
      }
    });
    
    tables.push({
      title,
      tableData
    });
  });

  // Find important sections based on filing type
  const importantSections = {};
  const importantSectionNames = IMPORTANT_SECTIONS[filingType] || [];
  
  for (const sectionName of importantSectionNames) {
    const matchingSection = sections.find(section => 
      section.title.includes(sectionName) || 
      sectionName.includes(section.title)
    );
    
    if (matchingSection) {
      importantSections[sectionName] = matchingSection.content;
    }
  }
  
  return {
    filingType,
    title,
    companyName,
    cik,
    sections,
    tables,
    importantSections
  };
}

/**
 * Process the sample HTML
 */
function processSampleHTML() {
  try {
    console.log('Processing sample Tesla 10-K HTML...');
    
    // First, let's try to detect the filing type
    const detectedType = detectFilingType(sampleHTML);
    console.log(`Detected filing type: ${detectedType || 'Unknown'}`);
    
    // Save the sample HTML for reference
    fs.writeFileSync(path.join(OUTPUT_DIR, 'tesla-10k-sample.html'), sampleHTML);
    
    // Parse the filing
    const parsedFiling = parseSecFiling(sampleHTML, detectedType || '10-K');
    
    // Log some basic information
    console.log(`Successfully parsed sample filing:`);
    console.log(`- Filing type: ${parsedFiling.filingType}`);
    console.log(`- Company: ${parsedFiling.companyName}`);
    console.log(`- Title: ${parsedFiling.title}`);
    console.log(`- Sections: ${parsedFiling.sections.length}`);
    console.log(`- Tables: ${parsedFiling.tables.length}`);
    console.log(`- Important sections: ${Object.keys(parsedFiling.importantSections).length}`);
    
    // Save the parsed results
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'tesla-10k-parsed.json'), 
      JSON.stringify(parsedFiling, null, 2)
    );
    
    // Extract key sections based on filing type
    const importantSections = Object.keys(parsedFiling.importantSections);
    console.log(`Important sections found: ${importantSections.join(', ')}`);
    
    // Save each important section to a separate file
    for (const section of importantSections) {
      const content = parsedFiling.importantSections[section];
      const safeSection = section.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      fs.writeFileSync(
        path.join(OUTPUT_DIR, `tesla-10k-section-${safeSection}.txt`),
        content
      );
    }
    
    // Also save all tables
    parsedFiling.tables.forEach((table, index) => {
      let tableContent = `Table: ${table.title || 'Unnamed'}\n\n`;
      if (table.tableData) {
        tableContent += table.tableData.map(row => row.join('\t')).join('\n');
      }
      
      fs.writeFileSync(
        path.join(OUTPUT_DIR, `tesla-10k-table-${index}.txt`),
        tableContent
      );
    });
    
    console.log(`Results saved to ${OUTPUT_DIR}`);
    console.log('---------------------------------------------');
  } catch (error) {
    console.error(`Error processing sample HTML:`, error);
  }
}

/**
 * Main function to run the test
 */
function main() {
  console.log('Starting Tesla SEC filing parser test');
  console.log(`Output directory: ${OUTPUT_DIR}`);
  
  // Process the sample HTML
  processSampleHTML();
}

// Run the test
main(); 