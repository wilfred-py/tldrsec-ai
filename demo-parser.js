/**
 * Demo HTML Parser Script
 * 
 * This script demonstrates the HTML parsing capabilities using sample HTML content
 * without needing to import the complete module structure.
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

// Create a directory for output
const OUTPUT_DIR = path.join(__dirname, 'parser-demo-output');
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

// Basic HTML parser function
function parseHTML(html) {
  console.log('Parsing HTML content...');
  const $ = cheerio.load(html);
  
  // Extract basic document details
  const title = $('title').text().trim();
  console.log(`Document title: ${title}`);
  
  // Extract sections based on headers
  const sections = [];
  
  $('h1, h2, h3').each((index, element) => {
    const headerElem = $(element);
    const headerText = headerElem.text().trim();
    const headerType = element.name; // h1, h2, etc.
    
    // Get all content until the next header of same or higher level
    let contentElements = [];
    let nextElem = headerElem.next();
    
    while (nextElem.length > 0) {
      const tagName = nextElem.prop('tagName');
      if (tagName && ['H1', 'H2', 'H3'].includes(tagName.toUpperCase())) {
        if (tagName.toUpperCase() <= headerType.toUpperCase()) {
          break;
        }
      }
      
      contentElements.push(nextElem.clone());
      nextElem = nextElem.next();
    }
    
    // Join the content
    const content = contentElements.map(elem => $(elem).text().trim()).join('\n');
    
    sections.push({
      title: headerText,
      type: `${headerType.toUpperCase()}_SECTION`,
      content
    });
  });
  
  console.log(`Found ${sections.length} sections.`);
  
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
      type: 'TABLE',
      tableData
    });
  });
  
  console.log(`Found ${tables.length} tables.`);
  
  // Extract lists
  const lists = [];
  
  $('ul, ol').each((index, element) => {
    const listElem = $(element);
    const listItems = [];
    
    listElem.find('li').each((itemIndex, itemElement) => {
      listItems.push($(itemElement).text().trim());
    });
    
    // Try to find a header before the list
    let title = '';
    let prevElem = listElem.prev();
    while (prevElem.length > 0) {
      const tagName = prevElem.prop('tagName');
      if (tagName && ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(tagName.toUpperCase())) {
        title = prevElem.text().trim();
        break;
      }
      prevElem = prevElem.prev();
    }
    
    lists.push({
      title: title || `List ${index + 1}`,
      type: 'LIST',
      items: listItems
    });
  });
  
  console.log(`Found ${lists.length} lists.`);
  
  // Return the parsed results
  return {
    title,
    sections,
    tables,
    lists
  };
}

// Function to save results
function saveResults(parsed) {
  console.log('\nSaving parsed results...');
  
  // Save the whole parsed object
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'parsed-results.json'),
    JSON.stringify(parsed, null, 2)
  );
  
  // Save sections
  parsed.sections.forEach((section, index) => {
    const safeSectionName = section.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    fs.writeFileSync(
      path.join(OUTPUT_DIR, `section-${safeSectionName}.txt`),
      `${section.title}\n${'='.repeat(section.title.length)}\n\n${section.content}`
    );
  });
  
  // Save tables
  parsed.tables.forEach((table, index) => {
    let content = `${table.title}\n${'='.repeat(table.title.length)}\n\n`;
    
    if (table.tableData && table.tableData.length > 0) {
      // Calculate column widths
      const columnWidths = [];
      
      table.tableData.forEach(row => {
        row.forEach((cell, cellIndex) => {
          const cellWidth = cell.length;
          if (!columnWidths[cellIndex] || columnWidths[cellIndex] < cellWidth) {
            columnWidths[cellIndex] = cellWidth;
          }
        });
      });
      
      // Generate formatted table
      table.tableData.forEach((row, rowIndex) => {
        const formattedRow = row.map((cell, cellIndex) => {
          return cell.padEnd(columnWidths[cellIndex] + 2);
        }).join('');
        
        content += formattedRow + '\n';
        
        // Add separator after header
        if (rowIndex === 0) {
          content += row.map((_, cellIndex) => {
            return '-'.repeat(columnWidths[cellIndex] + 2);
          }).join('') + '\n';
        }
      });
    }
    
    fs.writeFileSync(
      path.join(OUTPUT_DIR, `table-${index + 1}.txt`),
      content
    );
  });
  
  // Save lists
  parsed.lists.forEach((list, index) => {
    let content = `${list.title}\n${'='.repeat(list.title.length)}\n\n`;
    
    list.items.forEach((item, itemIndex) => {
      content += `${itemIndex + 1}. ${item}\n`;
    });
    
    fs.writeFileSync(
      path.join(OUTPUT_DIR, `list-${index + 1}.txt`),
      content
    );
  });
  
  console.log(`All results saved to ${OUTPUT_DIR}`);
}

// Main function
function main() {
  console.log('=== Tesla SEC Filing Parser Demo ===\n');
  
  try {
    // Parse the sample HTML
    const parsed = parseHTML(sampleHTML);
    
    // Save the results
    saveResults(parsed);
    
    console.log('\nDemo completed successfully!');
  } catch (error) {
    console.error('Error running the demo:', error);
  }
}

// Run the demo
main(); 