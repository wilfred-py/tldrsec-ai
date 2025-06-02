// Simple test script for SEC Edgar API with proper XML namespace handling
import { SECEdgarClient } from '../lib/sec-edgar/client';
import { FilingType } from '../lib/sec-edgar/types';
import { DOMParser } from '@xmldom/xmldom';
import xpath from 'xpath';

// Initialize SEC Edgar client with a proper user agent
const secClient = new SECEdgarClient({
  userAgent: 'TLDRSEC-AI-App contact@example.com',
  maxRequestsPerSecond: 2 // Be conservative with rate limits
});

// Tesla's CIK and ticker
const teslaCIK = '0001318605';
const teslaTicker = 'TSLA';

// Create namespace resolver for Atom XML
function createNSResolver(doc: Document) {
  const nsResolver = doc.createNSResolver(doc.documentElement);
  
  return function(prefix: string) {
    const ns = {
      'atom': 'http://www.w3.org/2005/Atom'
    };
    return ns[prefix] || nsResolver.lookupNamespaceURI(prefix);
  };
}

async function testSECApi() {
  console.log('Testing SEC Edgar API with proper namespace handling...');
  
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
      
      // Register namespace
      const nsResolver = createNSResolver(doc);
      
      // Extract company name using local-name() to avoid namespace issues
      const companyName = xpath.select1('string(//*[local-name()="company-info"]/*[local-name()="conformed-name"])', doc as unknown as Node);
      console.log('Company name:', companyName);
      
      // Extract CIK using local-name() to avoid namespace issues
      const cik = xpath.select1('string(//*[local-name()="company-info"]/*[local-name()="cik"])', doc as unknown as Node);
      console.log('CIK:', cik);
      
      // Extract filings using local-name() to avoid namespace issues
      const entries = xpath.select('//*[local-name()="entry"]', doc as unknown as Node) as Node[];
      console.log(`Found ${entries?.length || 0} filings in company info`);
      
      if (entries && entries.length > 0) {
        const firstEntry = entries[0];
        const title = xpath.select1('string(./*[local-name()="title"])', firstEntry);
        const link = xpath.select1('string(./*[local-name()="link"]/@href)', firstEntry);
        const updated = xpath.select1('string(./*[local-name()="updated"])', firstEntry);
        
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
      
      // Extract company name using local-name() to avoid namespace issues
      const companyName = xpath.select1('string(//*[local-name()="company-info"]/*[local-name()="conformed-name"])', doc as unknown as Node);
      console.log('Company name:', companyName);
      
      // Extract CIK using local-name() to avoid namespace issues
      const cik = xpath.select1('string(//*[local-name()="company-info"]/*[local-name()="cik"])', doc as unknown as Node);
      console.log('CIK:', cik);
      
      // Extract filings using local-name() to avoid namespace issues
      const entries = xpath.select('//*[local-name()="entry"]', doc as unknown as Node) as Node[];
      console.log(`Found ${entries?.length || 0} filings in company info`);
      
      if (entries && entries.length > 0) {
        const firstEntry = entries[0];
        const title = xpath.select1('string(./*[local-name()="title"])', firstEntry);
        const link = xpath.select1('string(./*[local-name()="link"]/@href)', firstEntry);
        const updated = xpath.select1('string(./*[local-name()="updated"])', firstEntry);
        
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
      
      // Extract feed title using local-name() to avoid namespace issues
      const feedTitle = xpath.select1('string(//*[local-name()="feed"]/*[local-name()="title"])', doc as unknown as Node);
      console.log('Feed title:', feedTitle);
      
      // Extract entries using local-name() to avoid namespace issues
      const entries = xpath.select('//*[local-name()="entry"]', doc as unknown as Node) as Node[];
      console.log(`Found ${entries?.length || 0} filings`);
      
      if (entries && entries.length > 0) {
        const firstEntry = entries[0];
        const title = xpath.select1('string(./*[local-name()="title"])', firstEntry);
        const link = xpath.select1('string(./*[local-name()="link"]/@href)', firstEntry);
        const updated = xpath.select1('string(./*[local-name()="updated"])', firstEntry);
        const category = xpath.select1('string(./*[local-name()="category"]/@term)', firstEntry);
        
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
