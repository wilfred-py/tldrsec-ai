/**
 * Test script to fetch Tesla filings from the SEC EDGAR API
 * 
 * This script demonstrates how to use the SEC EDGAR client to fetch filings for Tesla
 * Run with: node scripts/test-tesla-filings.js
 */

const { default: axios } = require('axios');

// Function to sleep for the specified number of milliseconds
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Simple SEC EDGAR client for testing
 */
class SimpleEdgarClient {
  constructor(userAgent) {
    this.client = axios.create({
      baseURL: 'https://www.sec.gov',
      timeout: 30000, // 30 seconds timeout
      headers: {
        'User-Agent': userAgent, // Required by SEC
        'Accept': 'application/json, text/html, application/xml, */*',
        'Accept-Encoding': 'gzip, deflate',
      }
    });
    
    // Interval between requests to comply with SEC fair access policy
    this.requestInterval = 100; // 10 requests per second
    this.lastRequestTime = 0;
  }
  
  async throttleRequest() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.requestInterval) {
      const sleepTime = this.requestInterval - timeSinceLastRequest;
      await sleep(sleepTime);
    }
    
    this.lastRequestTime = Date.now();
  }
  
  async getCompanyInfo(ticker) {
    await this.throttleRequest();
    
    try {
      const response = await this.client.get('/cgi-bin/browse-edgar', {
        params: {
          action: 'getcompany',
          company: ticker,
          output: 'atom'
        }
      });
      return response.data;
    } catch (error) {
      console.error(`Error fetching company info: ${error}`);
      throw error;
    }
  }
  
  async getTeslaFilings() {
    await this.throttleRequest();
    
    try {
      // Use the browse-edgar with action=getcurrent for recent filings
      // This endpoint is typically used by the SEC.gov website to show recent filings
      const response = await this.client.get('/cgi-bin/browse-edgar', {
        params: {
          action: 'getcurrent',
          CIK: '0001318605', // Tesla's CIK number
          type: '10-K,10-Q,8-K',
          count: 20,
          output: 'atom'
        }
      });
      return response.data;
    } catch (error) {
      console.error(`Error fetching filings: ${error}`);
      throw error;
    }
  }
  
  // Try a different approach using the HTML interface
  async getTeslaFilingsHtml() {
    await this.throttleRequest();
    
    try {
      // Use the standard web interface without specifying output=atom
      const response = await this.client.get('/cgi-bin/browse-edgar', {
        params: {
          action: 'getcompany',
          CIK: '0001318605', // Tesla's CIK number
          owner: 'exclude',  // Only show company filings, not insider transactions
          count: 10
        },
        responseType: 'text'
      });
      return response.data;
    } catch (error) {
      console.error(`Error fetching filings HTML: ${error}`);
      throw error;
    }
  }
}

/**
 * Simple XML parser for demonstration
 */
function extractFilingsFromXml(xmlString) {
  const filings = [];
  
  // Check if there are any entries in the feed
  if (!xmlString.includes('<entry>')) {
    console.log('No <entry> tags found in the response. Checking for company details...');
    
    // Extract company information from XML
    const companyName = (xmlString.match(/<conformed-name>(.*?)<\/conformed-name>/) || [])[1];
    const cikNumber = (xmlString.match(/<cik>(.*?)<\/cik>/) || [])[1];
    
    if (companyName || cikNumber) {
      console.log(`Company Name: ${companyName || 'Not found'}`);
      console.log(`CIK Number: ${cikNumber || 'Not found'}`);
    }
    
    return filings;
  }
  
  // Very basic XML parsing to extract filing entries
  const entries = xmlString.match(/<entry>[\s\S]*?<\/entry>/g) || [];
  console.log(`Found ${entries.length} entries in the XML response`);
  
  entries.forEach(entry => {
    const title = (entry.match(/<title>(.*?)<\/title>/) || [])[1] || 'Unknown';
    const updated = (entry.match(/<updated>(.*?)<\/updated>/) || [])[1] || '';
    
    // Extract the correct link - using the enclosure link
    let link = '';
    const enclosureMatch = entry.match(/<link rel="enclosure"[^>]*href="([^"]*)"/) || [];
    const alternateMatch = entry.match(/<link rel="alternate"[^>]*href="([^"]*)"/) || [];
    
    if (enclosureMatch[1]) {
      link = enclosureMatch[1];
    } else if (alternateMatch[1]) {
      link = alternateMatch[1];
    }
    
    const summary = (entry.match(/<summary[^>]*>([\s\S]*?)<\/summary>/) || [])[1] || '';
    
    // Clean up HTML in summary
    const cleanSummary = summary.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    
    filings.push({
      title,
      updated,
      link,
      summary: cleanSummary
    });
  });
  
  return filings;
}

/**
 * Extract filings from HTML response
 */
function extractFilingsFromHtml(htmlString) {
  const filings = [];
  
  // Look for filing table
  if (!htmlString.includes('Filing Type') && !htmlString.includes('Filing</th>')) {
    console.log('No filing table found in HTML response');
    return filings;
  }
  
  // Find the main filings table
  const tableMatch = htmlString.match(/<table class="tableFile[^"]*"[\s\S]*?<\/table>/);
  if (!tableMatch) {
    console.log('Unable to locate main filings table');
    return filings;
  }
  
  const tableContent = tableMatch[0];
  
  // Find all table rows in the document table
  const tableRows = tableContent.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
  
  // Skip the header row
  const dataRows = tableRows.slice(1);
  
  console.log(`Found ${dataRows.length} filing rows in the HTML table`);
  
  dataRows.forEach((row, index) => {
    // Extract filing type (10-K, 10-Q, 8-K)
    const typeMatch = row.match(/>([^<>]*(?:10-K|10-Q|8-K|10-K\/A|10-Q\/A|8-K\/A)[^<>]*)<\/a>/);
    const filingType = typeMatch ? typeMatch[1].trim() : 'Unknown';
    
    // Extract filing date
    const dateMatches = row.match(/<[^>]*nowrap[^>]*>([^<]+)<\/td>/g);
    const filingDate = dateMatches && dateMatches.length > 0 
      ? dateMatches[0].replace(/<[^>]*nowrap[^>]*>([^<]+)<\/td>/, '$1').trim()
      : '';
    
    // Extract filing description
    const descMatches = row.match(/<td[^>]*>(?:[^<]|<(?!td|tr))*<\/td>/g);
    let description = descMatches && descMatches.length > 2
      ? descMatches[2].replace(/<[^>]*>|<\/[^>]*>/g, '').trim()
      : '';
      
    // Clean up HTML entities
    description = description
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
      
    // Truncate description if it's too long
    const shortDescription = description.length > 80 
      ? description.substring(0, 80) + '...'
      : description;
    
    // Extract document link
    const linkMatch = row.match(/href="([^"]*\/Archives\/edgar\/data\/[^"]*\/[^"]*-index.html?)"/);
    const link = linkMatch ? `https://www.sec.gov${linkMatch[1]}` : '';
    
    filings.push({
      title: `${filingType}${shortDescription ? ` - ${shortDescription}` : ''}`,
      updated: filingDate,
      link,
      summary: description,
      filingType
    });
  });
  
  return filings;
}

/**
 * Main test function
 */
async function testTeslaFilings() {
  console.log('Starting SEC EDGAR API test for Tesla filings...\n');
  
  // Create a new SEC EDGAR client
  const secClient = new SimpleEdgarClient('TLDRSec-AI-Testing contact@example.com');
  
  try {
    // Test getting company info for Tesla
    console.log('Fetching company info for Tesla (TSLA)...');
    const companyInfo = await secClient.getCompanyInfo('TSLA');
    
    // Extract CIK from company info
    const cikMatch = companyInfo.match(/<cik>(.*?)<\/cik>/);
    const cik = cikMatch ? cikMatch[1] : null;
    
    if (cik) {
      console.log(`Found Tesla CIK: ${cik}`);
    }
    
    // Test fetching Tesla filings using XML API
    console.log('\nFetching recent filings for Tesla (XML format)...');
    const filingData = await secClient.getTeslaFilings();
    
    // Parse the XML response to extract filings
    const xmlFilings = extractFilingsFromXml(filingData);
    
    let allFilings = [...xmlFilings];
    
    // If XML approach didn't work, try HTML approach
    if (xmlFilings.length === 0) {
      console.log('\nTrying HTML approach to fetch Tesla filings...');
      const htmlData = await secClient.getTeslaFilingsHtml();
      
      // Extract filings from HTML
      const htmlFilings = extractFilingsFromHtml(htmlData);
      allFilings = [...htmlFilings];
    }
    
    // Display found filings
    if (allFilings.length > 0) {
      console.log(`\nFound ${allFilings.length} total filings for Tesla:\n`);
      
      console.log('---------------------------------------------------------------------');
      console.log('| Type  | Filing Date | Description                                 |');
      console.log('---------------------------------------------------------------------');
      
      allFilings.forEach((filing, index) => {
        const typeFormatted = filing.filingType.padEnd(6, ' ');
        const dateFormatted = filing.updated.padEnd(12, ' ');
        const descFormatted = filing.summary 
          ? filing.summary.substring(0, 40).padEnd(44, ' ')
          : ''.padEnd(44, ' ');
          
        console.log(`| ${typeFormatted}| ${dateFormatted}| ${descFormatted}|`);
        
        if (index === allFilings.length - 1) {
          console.log('---------------------------------------------------------------------');
        } else {
          console.log('|----------------------------------------------------------------------|');
        }
      });
      
      console.log('\nLinks to SEC filings:');
      allFilings.slice(0, 5).forEach((filing, index) => {
        console.log(`[${index + 1}] ${filing.filingType}: ${filing.link}`);
      });
      
      console.log(`\nSuccessfully retrieved Tesla filings from SEC EDGAR API!`);
    } else {
      console.log('\nNo Tesla filings could be extracted from either XML or HTML formats.');
      console.log('This may be due to changes in the SEC EDGAR API or parsing limitations.');
    }
    
  } catch (error) {
    console.error('Error during SEC EDGAR API testing:', error);
  }
}

// Run the test
testTeslaFilings().catch(console.error); 