/**
 * Fetch latest SEC EDGAR filings for Tesla
 * 
 * This script fetches the latest SEC EDGAR filings for Tesla (CIK: 0001318605)
 * and extracts the filing URLs for testing.
 */

import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

// Tesla CIK
const TESLA_CIK = '0001318605';

// Output file
const OUTPUT_FILE = './latest-tesla-filings.json';

// User agent for SEC requests
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36';

/**
 * Fetch latest SEC filings for a company
 * @param {string} cik - Company CIK
 * @returns {Promise<Array>} - Array of filing data
 */
async function fetchLatestFilings(cik) {
  try {
    // Normalize CIK format
    const normalizedCik = cik.padStart(10, '0');
    
    // Fetch company submissions
    const response = await axios.get(
      `https://data.sec.gov/submissions/CIK${normalizedCik}.json`,
      {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'application/json',
          'Host': 'data.sec.gov'
        },
        timeout: 10000
      }
    );
    
    if (!response.data || !response.data.filings) {
      throw new Error('Invalid response format from SEC API');
    }
    
    // Extract recent filings
    const recentFilings = response.data.filings.recent;
    
    if (!recentFilings || !recentFilings.accessionNumber) {
      throw new Error('No recent filings found');
    }
    
    // Process filings
    const filings = [];
    
    for (let i = 0; i < recentFilings.accessionNumber.length; i++) {
      const accessionNumber = recentFilings.accessionNumber[i];
      const form = recentFilings.form[i];
      const filingDate = recentFilings.filingDate[i];
      const primaryDocument = recentFilings.primaryDocument[i];
      
      // Only include 10-K, 10-Q, and 8-K filings
      if (['10-K', '10-Q', '8-K'].includes(form)) {
        // Format accession number for URL
        const formattedAccessionNumber = accessionNumber.replace(/-/g, '');
        
        // Build URLs
        const htmlUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${formattedAccessionNumber}/${primaryDocument}`;
        const viewerUrl = `https://www.sec.gov/ix?doc=/Archives/edgar/data/${cik}/${formattedAccessionNumber}/${primaryDocument}`;
        
        filings.push({
          form,
          filingDate,
          accessionNumber,
          primaryDocument,
          htmlUrl,
          viewerUrl
        });
      }
    }
    
    return filings;
    
  } catch (error) {
    console.error('Error fetching SEC filings:', error.message);
    return [];
  }
}

/**
 * Main function
 */
async function main() {
  console.log('Fetching latest Tesla SEC filings...');
  
  try {
    const filings = await fetchLatestFilings(TESLA_CIK);
    
    if (filings.length === 0) {
      console.log('No filings found');
      return;
    }
    
    // Group filings by form type
    const filingsByType = {
      '10-K': [],
      '10-Q': [],
      '8-K': []
    };
    
    for (const filing of filings) {
      if (filingsByType[filing.form]) {
        filingsByType[filing.form].push(filing);
      }
    }
    
    // Sort filings by date (newest first)
    for (const type in filingsByType) {
      filingsByType[type].sort((a, b) => 
        new Date(b.filingDate) - new Date(a.filingDate)
      );
    }
    
    // Save filings to file
    await fs.writeFile(
      OUTPUT_FILE,
      JSON.stringify(filingsByType, null, 2)
    );
    
    console.log(`Found ${filings.length} filings:`);
    console.log(`- 10-K: ${filingsByType['10-K'].length}`);
    console.log(`- 10-Q: ${filingsByType['10-Q'].length}`);
    console.log(`- 8-K: ${filingsByType['8-K'].length}`);
    console.log(`Results saved to ${OUTPUT_FILE}`);
    
    // Print latest filings of each type
    for (const type in filingsByType) {
      if (filingsByType[type].length > 0) {
        const latest = filingsByType[type][0];
        console.log(`\nLatest ${type} (${latest.filingDate}):`);
        console.log(`- HTML URL: ${latest.htmlUrl}`);
        console.log(`- Viewer URL: ${latest.viewerUrl}`);
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run the script
main();
