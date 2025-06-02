// Simple test script for SEC Edgar API
import { SECEdgarClient } from '../lib/sec-edgar/client';
import { FilingType } from '../lib/sec-edgar/types';
import { DOMParser } from '@xmldom/xmldom';
import xpath from 'xpath';

// Type definitions to help with XML parsing
type XPathResult = string | number | boolean | Node | Node[] | null;
type XPathSelectResult = XPathResult & (string | number | boolean | Node);
type XPathNodeArray = Node[];


// Initialize SEC Edgar client with a proper user agent
const secClient = new SECEdgarClient({
  userAgent: 'TLDRSEC-AI-App contact@example.com',
  maxRequestsPerSecond: 2 // Be conservative with rate limits
});

// Tesla's CIK and ticker
const teslaCIK = '0001318605';
const teslaTicker = 'TSLA';

async function testSECApi() {
  console.log('Testing SEC Edgar API...');
  
  try {
    // Test 1: Get company info by CIK
    console.log('\nTest 1: Get company info by CIK');
    console.log('--------------------------------');
    try {
      const companyInfoXml = await secClient.getCompanyInfo(teslaCIK);
      console.log('Company info response type:', typeof companyInfoXml);
      
      // Log the first 500 characters of the raw response
      console.log('Raw response (first 500 chars):', 
        typeof companyInfoXml === 'string' 
          ? companyInfoXml.substring(0, 500) 
          : JSON.stringify(companyInfoXml).substring(0, 500));
      
      // Parse XML
      const parser = new DOMParser();
      const doc = parser.parseFromString(companyInfoXml as string, 'text/xml');
      
      // Extract company name
      const companyName = xpath.select1('string(//company-info/conformed-name)', doc as unknown as Node);
      console.log('Company name:', companyName);
      
      // Extract CIK
      const cik = xpath.select1('string(//company-info/cik)', doc as unknown as Node);
      console.log('CIK:', cik);
      
      // Extract filings
      const entries = xpath.select('//entry', doc as unknown as Node) as Node[];
      console.log(`Found ${entries?.length || 0} filings in company info`);
      
      if (entries && entries.length > 0) {
        const firstEntry = entries[0];
        const title = xpath.select1('string(./title)', firstEntry);
        const link = xpath.select1('string(./link/@href)', firstEntry);
        const updated = xpath.select1('string(./updated)', firstEntry);
        
        console.log('First filing:');
        console.log('- Title:', title);
        console.log('- Link:', link);
        console.log('- Updated:', updated);
      }
      
      console.log('Success!');
    } catch (error) {
      console.error('Error fetching by CIK:', error);
    }
    
    // Test 2: Get company info by ticker
    console.log('\nTest 2: Get company info by ticker');
    console.log('----------------------------------');
    try {
      const companyInfoXml = await secClient.getCompanyInfo(teslaTicker);
      console.log('Company info response type:', typeof companyInfoXml);
      
      // Log the first 500 characters of the raw response
      console.log('Raw response (first 500 chars):', 
        typeof companyInfoXml === 'string' 
          ? companyInfoXml.substring(0, 500) 
          : JSON.stringify(companyInfoXml).substring(0, 500));
      
      // Parse XML
      const parser = new DOMParser();
      const doc = parser.parseFromString(companyInfoXml as string, 'text/xml');
      
      // Extract company name
      const companyName = xpath.select1('string(//company-info/conformed-name)', doc as unknown as Node);
      console.log('Company name:', companyName);
      
      // Extract CIK
      const cik = xpath.select1('string(//company-info/cik)', doc as unknown as Node);
      console.log('CIK:', cik);
      
      // Extract filings
      const entries = xpath.select('//entry', doc as unknown as Node) as Node[];
      console.log(`Found ${entries?.length || 0} filings in company info`);
      
      if (entries && entries.length > 0) {
        const firstEntry = entries[0];
        const title = xpath.select1('string(./title)', firstEntry);
        const link = xpath.select1('string(./link/@href)', firstEntry);
        const updated = xpath.select1('string(./updated)', firstEntry);
        
        console.log('First filing:');
        console.log('- Title:', title);
        console.log('- Link:', link);
        console.log('- Updated:', updated);
      }
      
      console.log('Success!');
    } catch (error) {
      console.error('Error fetching by ticker:', error);
    }
    
    // Test 3: Get recent filings
    console.log('\nTest 3: Get recent filings');
    console.log('-------------------------');
    try {
      const filingsResponse = await secClient.getRecentFilings({
        cik: teslaCIK,
        count: 5
      });
      console.log('Filings response type:', typeof filingsResponse);
      
      // Log the first 500 characters of the raw response
      console.log('Raw response (first 500 chars):', 
        typeof filingsResponse === 'string' 
          ? (filingsResponse as string).substring(0, 500) 
          : JSON.stringify(filingsResponse || {}).substring(0, 500));
      
      // Convert response to string if it's not already
      const filingsXml = typeof filingsResponse === 'string' 
        ? filingsResponse 
        : JSON.stringify(filingsResponse);
      
      // Parse XML
      const parser = new DOMParser();
      const doc = parser.parseFromString(filingsXml, 'text/xml');
      
      // Extract feed title
      const feedTitle = xpath.select1('string(/feed/title)', doc as unknown as Node);
      console.log('Feed title:', feedTitle);
      
      // Extract entries
      const entries = xpath.select('//entry', doc as unknown as Node) as Node[];
      console.log(`Found ${entries?.length || 0} filings`);
      
      if (entries && entries.length > 0) {
        const firstEntry = entries[0];
        const title = xpath.select1('string(./title)', firstEntry);
        const link = xpath.select1('string(./link/@href)', firstEntry);
        const updated = xpath.select1('string(./updated)', firstEntry);
        const category = xpath.select1('string(./category/@term)', firstEntry);
        
        console.log('First filing:');
        console.log('- Title:', title);
        console.log('- Link:', link);
        console.log('- Updated:', updated);
        console.log('- Category:', category);
        
        // Extract filing type from title
        const filingTypeMatch = title?.toString().match(/\((.*?)\)/);
        const filingType = filingTypeMatch ? filingTypeMatch[1] : 'Unknown';
        console.log('- Filing Type:', filingType);
      }
      
      console.log('Success!');
    } catch (error) {
      console.error('Error fetching recent filings:', error);
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testSECApi().catch(console.error);
