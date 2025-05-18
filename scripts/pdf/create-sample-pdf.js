/**
 * Create Sample PDF for Testing
 * 
 * This script creates a sample PDF file with content that mimics an SEC filing
 * for testing purposes.
 */

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

// Output directory and file path
const outputDir = path.join(__dirname, '..', 'assets');
const outputPath = path.join(outputDir, 'sample-sec-filing.pdf');

// Make sure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Create a new PDF document
const doc = new PDFDocument({
  info: {
    Title: 'TESLA INC - Annual Report (10-K)',
    Author: 'Tesla, Inc.',
    Subject: 'SEC Filing',
    Keywords: 'SEC, 10-K, Annual Report, Tesla',
    CreationDate: new Date(),
    Producer: 'Sample PDF Generator for Testing'
  }
});

// Pipe the PDF to a file
doc.pipe(fs.createWriteStream(outputPath));

// Add some content to the PDF
doc.fontSize(24)
   .text('TESLA, INC.', { align: 'center' })
   .fontSize(18)
   .text('Annual Report (10-K)', { align: 'center' })
   .moveDown(2);

doc.fontSize(16)
   .text('Item 1. Business')
   .fontSize(12)
   .moveDown(0.5)
   .text('Tesla, Inc. ("Tesla", the "Company", "we", "us" or "our") designs, develops, manufactures and sells high-performance, fully electric vehicles, solar energy generation systems and energy storage products. We also install and maintain such systems and sell solar electricity. We are the world\'s first vertically integrated sustainable energy company, offering end-to-end clean energy products.\n\nWe currently produce and sell three fully electric vehicles: the Model S sedan, the Model X sport utility vehicle ("SUV") and the Model 3 sedan. We continue to enhance our vehicle offerings with enhanced Autopilot options, internet connectivity and free over-the-air software updates to provide additional safety, convenience and performance features.')
   .moveDown(2);

doc.fontSize(16)
   .text('Item 1A. Risk Factors')
   .fontSize(12)
   .moveDown(0.5)
   .text('You should carefully consider the risks described below together with the other information set forth in this report, which could materially affect our business, financial condition and future results. The risks described below are not the only risks facing our company. Risks and uncertainties not currently known to us or that we currently deem to be immaterial also may materially adversely affect our business, financial condition and operating results.\n\nRisks Related to Our Business and Industry\n\nWe face competition from both established automotive manufacturers and new entrants into the automotive market, and if we are unable to compete effectively, our financial performance could suffer.');
   
doc.moveDown(2);

doc.fontSize(16)
   .text('Item 7. Management\'s Discussion and Analysis of Financial Condition')
   .fontSize(12)
   .moveDown(0.5)
   .text('The following discussion and analysis should be read in conjunction with our consolidated financial statements and related notes included elsewhere in this Annual Report on Form 10-K.');

doc.moveDown(2);

// Add a table
doc.fontSize(14)
   .text('Financial Results', { underline: true })
   .moveDown(0.5);

// Define table data
const tableData = [
  ['Financial Metric', '2022', '2021', '2020'],
  ['Revenue (in millions)', '$81,462', '$53,823', '$31,536'],
  ['Gross Profit (in millions)', '$20,853', '$13,606', '$6,630'],
  ['Net Income (in millions)', '$12,556', '$5,519', '$721'],
  ['EPS (diluted)', '$3.52', '$1.59', '$0.64']
];

// Define table position and style
const tableX = 72;
let tableY = doc.y + 15;
const cellPadding = 10;
const columnWidths = [180, 90, 90, 90];

// Draw table header
doc.fontSize(12).font('Helvetica-Bold');
tableData[0].forEach((header, i) => {
  doc.text(header, tableX + columnWidths.slice(0, i).reduce((sum, w) => sum + w, 0), tableY, {
    width: columnWidths[i],
    align: i === 0 ? 'left' : 'right'
  });
});

// Draw table rows
doc.font('Helvetica');
tableY += 20;
for (let i = 1; i < tableData.length; i++) {
  const row = tableData[i];
  row.forEach((cell, j) => {
    doc.text(cell, tableX + columnWidths.slice(0, j).reduce((sum, w) => sum + w, 0), tableY, {
      width: columnWidths[j],
      align: j === 0 ? 'left' : 'right'
    });
  });
  tableY += 20;
}

// Draw table borders
doc.lineWidth(1);
// Horizontal lines
doc.moveTo(tableX, doc.y - tableData.length * 20 - 20)
   .lineTo(tableX + columnWidths.reduce((sum, w) => sum + w, 0), doc.y - tableData.length * 20 - 20)
   .stroke();
doc.moveTo(tableX, doc.y - tableData.length * 20)
   .lineTo(tableX + columnWidths.reduce((sum, w) => sum + w, 0), doc.y - tableData.length * 20)
   .stroke();
doc.moveTo(tableX, doc.y)
   .lineTo(tableX + columnWidths.reduce((sum, w) => sum + w, 0), doc.y)
   .stroke();

// Vertical lines
let verticalLineX = tableX;
doc.moveTo(verticalLineX, doc.y - tableData.length * 20 - 20)
   .lineTo(verticalLineX, doc.y)
   .stroke();
for (const width of columnWidths) {
  verticalLineX += width;
  doc.moveTo(verticalLineX, doc.y - tableData.length * 20 - 20)
     .lineTo(verticalLineX, doc.y)
     .stroke();
}

doc.moveDown(3);

// Add a list
doc.fontSize(14)
   .text('Key Business Priorities:', { underline: true })
   .moveDown(0.5);

doc.fontSize(12)
   .text('• Increase vehicle production capacity', { indent: 20 })
   .moveDown(0.5)
   .text('• Expand global service center and Supercharger networks', { indent: 20 })
   .moveDown(0.5)
   .text('• Continue to improve battery technology and reduce costs', { indent: 20 })
   .moveDown(0.5)
   .text('• Expand energy generation and storage business', { indent: 20 })
   .moveDown(0.5)
   .text('• Further development of autonomous driving technology', { indent: 20 });

// Finalize the PDF
doc.end();

console.log(`Sample PDF created at: ${outputPath}`); 