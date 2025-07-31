/**
 * Test script to extract Tesla Q2 2025 SEC filing for token optimization
 */

const filingUrl = "https://www.sec.gov/Archives/edgar/data/1318605/000162828025035806/tsla-20250630.htm";

// Simple fetch with proper headers
async function fetchTeslaFiling() {
  try {
    console.log("Fetching Tesla Q2 2025 10-Q filing...");
    console.log("URL:", filingUrl);
    
    const response = await fetch(filingUrl, {
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
    
    console.log("\n=== FILING EXTRACTION SUCCESS ===");
    console.log("Content length:", content.length, "characters");
    console.log("Estimated tokens (4 chars/token):", Math.ceil(content.length / 4));
    
    // Basic structure analysis
    const hasTable = content.includes('<table');
    const hasXBRL = content.includes('xbrl') || content.includes('XBRL');
    const hasInlineXBRL = content.includes('ix:') || content.includes('xmlns:ix');
    
    console.log("\n=== DOCUMENT STRUCTURE ===");
    console.log("Contains tables:", hasTable);
    console.log("Contains XBRL:", hasXBRL);
    console.log("Contains inline XBRL:", hasInlineXBRL);
    
    // Look for key sections
    const sections = [];
    if (content.includes('Management\'s Discussion')) sections.push('MD&A');
    if (content.includes('Risk Factor')) sections.push('Risk Factors');
    if (content.includes('Consolidated Statement')) sections.push('Financial Statements');
    if (content.includes('Consolidated Balance Sheet')) sections.push('Balance Sheet');
    if (content.includes('Cash Flow')) sections.push('Cash Flow Statement');
    
    console.log("Key sections found:", sections.join(', '));
    
    // Preview first 1000 characters
    console.log("\n=== CONTENT PREVIEW ===");
    console.log(content.substring(0, 1000));
    console.log("...[content continues]...");
    
    return {
      content,
      length: content.length,
      estimatedTokens: Math.ceil(content.length / 4),
      hasTable,
      hasXBRL,
      hasInlineXBRL,
      sections
    };
    
  } catch (error) {
    console.error("Error fetching Tesla filing:", error.message);
    return null;
  }
}

// Run the extraction
fetchTeslaFiling()
  .then(result => {
    if (result) {
      console.log("\n=== EXTRACTION COMPLETE ===");
      console.log("Ready for token optimization process...");
    }
  })
  .catch(error => {
    console.error("Script failed:", error);
  });