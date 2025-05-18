/**
 * Test script for PDF parser
 * 
 * This script demonstrates how to use the PDF parser to process PDF SEC filings.
 * It can either use a sample PDF or load a PDF file from disk.
 */

const fs = require('fs');
const path = require('path');
const { parsePDFFromBuffer } = require('../demo-pdf-parser');
const { createAutoParser } = require('../demo-filing-parser-factory');

// Set up output directory
const OUTPUT_DIR = path.join(__dirname, 'pdf-parser-results');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Simple logger
const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  error: (msg, err) => console.error(`[ERROR] ${msg}`, err),
  debug: (msg) => console.log(`[DEBUG] ${msg}`)
};

/**
 * Create a minimal PDF buffer for testing
 * This function generates a small PDF with some content
 * for testing when no real PDF is available
 */
function createSamplePDFBuffer() {
  // This is a minimal PDF file in Buffer format
  // It contains a simple PDF with text and a simple table
  const pdfHeader = '%PDF-1.4\n';
  const pdfContent = `
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj

2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj

3 0 obj
<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >>
   /MediaBox [0 0 612 792] /Contents 5 0 R >>
endobj

4 0 obj
<< /Type /Font /Subtype /Type1 /Name /F1 /BaseFont /Helvetica >>
endobj

5 0 obj
<< /Length 355 >>
stream
BT /F1 12 Tf
50 700 Td
(TESLA, INC - Annual Report (10-K)) Tj
0 -40 Td
(Item 1. Business) Tj
0 -20 Td
(Tesla is a technology company focused on electric vehicles, energy solutions, and automotive services.) Tj
0 -40 Td
(Item 1A. Risk Factors) Tj
0 -20 Td
(We face numerous risks including competition, manufacturing challenges, and economic conditions.) Tj
0 -40 Td
(Item 7. Management's Discussion and Analysis of Financial Condition) Tj
0 -20 Td
(This section discusses our financial performance and condition.) Tj
ET
endstream
endobj

xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000229 00000 n
0000000305 00000 n
trailer
<< /Size 6 /Root 1 0 R >>
startxref
712
%%EOF`;

  return Buffer.from(pdfHeader + pdfContent);
}

/**
 * Main function to run the PDF parser demo
 */
async function runPDFParserDemo() {
  try {
    logger.info('Starting PDF parser demo');
    
    // Create or load a PDF buffer
    let pdfBuffer;
    const samplePdfPath = path.join(__dirname, '..', 'assets', 'sample-sec-filing.pdf');
    
    if (fs.existsSync(samplePdfPath)) {
      logger.info(`Loading PDF from ${samplePdfPath}`);
      pdfBuffer = fs.readFileSync(samplePdfPath);
    } else {
      logger.info('No sample PDF found, using generated sample PDF');
      pdfBuffer = createSamplePDFBuffer();
    }
    
    // Test direct PDF parser
    logger.info('Testing direct PDF parser...');
    const sections = await parsePDFFromBuffer(pdfBuffer);
    
    // Save sections to a JSON file
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'pdf-sections.json'),
      JSON.stringify(sections, null, 2)
    );
    logger.info(`PDF sections saved to ${path.join(OUTPUT_DIR, 'pdf-sections.json')}`);
    
    // Test auto parser with PDF detection
    logger.info('Testing auto parser with PDF detection...');
    const parsedFiling = await createAutoParser(pdfBuffer);
    
    // Save the parsed filing to a JSON file
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'pdf-filing.json'),
      JSON.stringify(parsedFiling, null, 2)
    );
    logger.info(`Parsed filing saved to ${path.join(OUTPUT_DIR, 'pdf-filing.json')}`);
    
    // Display some information about the parsed PDF
    logger.info('\nPDF Parser Results:');
    logger.info(`Number of sections: ${sections.length}`);
    logger.info(`Number of tables: ${sections.filter(section => section.type === 'table').length}`);
    
    if (parsedFiling.metadata) {
      logger.info('\nMetadata:');
      Object.entries(parsedFiling.metadata).forEach(([key, value]) => {
        logger.info(`  ${key}: ${value}`);
      });
    }
    
    // List important sections
    if (Object.keys(parsedFiling.importantSections).length > 0) {
      logger.info('\nImportant Sections:');
      Object.keys(parsedFiling.importantSections).forEach(section => {
        logger.info(`  - ${section}`);
      });
    }
    
    logger.info('\nPDF parser demo completed successfully');
  } catch (error) {
    logger.error('PDF parser demo failed:', error);
  }
}

// Run the demo
runPDFParserDemo(); 