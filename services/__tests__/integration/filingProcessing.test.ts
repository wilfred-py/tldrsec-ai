/**
 * Integration Tests for Filing Processing
 * 
 * Tests the interaction between modularized components in the filing processing pipeline
 */

import { getFilingDetails } from '../../filings/filingDetails';
import { parseForm144 } from '../../filings/parsers/form144Parser';
import { extractFilingTableData } from '../../filings/extractors/tableExtractor';
import { secLogger } from '../../../utils/logger';
import { SecFilingDetails } from '../../../types/sec/filing';
import { Form144ParsedContent } from '../../../types/sec/form144';

// Mock dependencies
jest.mock('../../../utils/logger', () => ({
  secLogger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Mock filingService
jest.mock('../../filingService', () => ({
  __esModule: true,
  default: {
    getFilingById: jest.fn()
  }
}));

// Import the mocked module
import filingService from '../../filingService';

describe('Filing Processing Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should process a Form 144 filing through the entire pipeline', async () => {
    // Arrange
    const accessionNumber = '0001234567-22-000123';
    const cik = '0001234567';
    const form144XmlContent = `
      <XML>
      <ns1:ownershipDocument xmlns:ns1="http://www.sec.gov/edgar/document/ownership">
        <ns1:reportingOwner>
          <ns1:reportingOwnerId>
            <ns1:rptOwnerName>SMITH JOHN</ns1:rptOwnerName>
          </ns1:reportingOwnerId>
          <ns1:reportingOwnerRelationship>
            <ns1:officerTitle>CEO</ns1:officerTitle>
            <ns1:directorOrOfficer>Officer</ns1:directorOrOfficer>
          </ns1:reportingOwnerRelationship>
        </ns1:reportingOwner>
        <ns1:saleDate>2022-03-15</ns1:saleDate>
        <ns1:amountOfSecurities>10000</ns1:amountOfSecurities>
        <ns1:proposedSaleDate>2022-03-20</ns1:proposedSaleDate>
        <ns1:brokerName>Test Broker LLC</ns1:brokerName>
        <ns1:remarks>Test transaction</ns1:remarks>
      </ns1:ownershipDocument>
      </XML>
    `;

    const mockFilingResponse = {
      data: {
        filingDate: '2022-03-15',
        filingCode: 'FORM4',
        company: 'Test Company Inc.',
        content: `<SEC-DOCUMENT>
<XML>
form4.xml
${form144XmlContent}
</XML>
</SEC-DOCUMENT>`
      }
    };

    (filingService.getFilingById as jest.Mock).mockResolvedValue(mockFilingResponse);

    // Act
    // Step 1: Get filing details
    const filingDetails = await getFilingDetails(accessionNumber, cik);
    
    // Step 2: Extract XML content from the filing
    const xmlDoc = (filingDetails as SecFilingDetails & { documents: any[] }).documents.find(doc => 
      doc.type === 'XML' && doc.content && doc.content.includes('ownershipDocument')
    );
    
    if (!xmlDoc || !xmlDoc.content) {
      throw new Error('XML document not found or has no content');
    }
    
    // Step 3: Parse Form 144 data from XML
    const form144Data = xmlDoc ? await parseForm144({
      content: xmlDoc.content,
      companyName: 'Test Company Inc.',
      filingDate: '2022-03-15'
    }) : null;
    
    // Step 4: Extract any tables from the filing content
    const tables = await extractFilingTableData(filingDetails.content || '');

    // Assert
    // Filing details assertions
    expect(filingDetails).toBeDefined();
    expect(filingDetails.formType).toBe('FORM4');
    
    // XML document assertions
    expect(xmlDoc).toBeDefined();
    expect(xmlDoc?.content).toContain('ownershipDocument');
    
    // Form 144 parsing assertions
    expect(form144Data).toBeDefined();
    if (form144Data) {
      expect(form144Data.reportingPerson).toBe('SMITH JOHN');
      expect(form144Data.reportingPersonTitle).toBe('CEO');
      expect(form144Data.relationshipToIssuer).toBe('Officer');
      expect(form144Data.dateOfSale).toBe('2022-03-15');
      expect(form144Data.amountOfSecurities).toBe('10000');
      expect(form144Data.proposedSaleDate).toBe('2022-03-20');
      expect(form144Data.broker).toBe('Test Broker LLC');
      expect(form144Data.note).toBe('Test transaction');
    }
  });

  test('should process a filing with no document tags and create synthetic document', async () => {
    // Arrange
    const accessionNumber = '0001234567-22-000456';
    const cik = '0001234567';
    const tableHtml = `
      <table>
        <tr>
          <th>Header 1</th>
          <th>Header 2</th>
        </tr>
        <tr>
          <td>Data 1</td>
          <td>Data 2</td>
        </tr>
        <tr>
          <td>Data 3</td>
          <td>Data 4</td>
        </tr>
      </table>
    `;

    // Create a filing with no document tags to test synthetic document creation
    const mockFilingResponse = {
      data: {
        filingDate: '2022-03-15',
        filingCode: '10-K',
        company: 'Test Company Inc.',
        content: `<SEC-DOCUMENT>
This is the content of the 10-K filing with no document tags.
${tableHtml}
</SEC-DOCUMENT>`
      }
    };

    (filingService.getFilingById as jest.Mock).mockResolvedValue(mockFilingResponse);

    // Act
    // Step 1: Get filing details
    const filingDetails = await getFilingDetails(accessionNumber, cik);
    
    // Step 2: Extract tables from the filing content
    const tables = await extractFilingTableData(filingDetails.content || '');

    // Assert
    // Filing details assertions
    expect(filingDetails).toBeDefined();
    expect(filingDetails.formType).toBe('10-K');
    
    // Document assertions - should have created a synthetic document
    const documents = (filingDetails as SecFilingDetails & { documents: any[] }).documents;
    expect(documents).toBeDefined();
    expect(documents.length).toBe(1); // One synthetic document
    expect(documents[0].type).toBe('10-K');
    expect(documents[0].description).toBe('Complete Filing Text');
    expect(documents[0].content).toContain('This is the content of the 10-K filing with no document tags');
    
    // Table extraction assertions
    expect(tables).toBeDefined();
    expect(Object.keys(tables).length).toBe(1);
    const tableData = tables['table_0'];
    expect(tableData).toBeDefined();
    expect(tableData.length).toBe(3); // Header row + 2 data rows
    expect(tableData[0]).toContain('Header 1');
    expect(tableData[0]).toContain('Header 2');
    expect(tableData[1]).toContain('Data 1');
    expect(tableData[1]).toContain('Data 2');
    expect(tableData[2]).toContain('Data 3');
    expect(tableData[2]).toContain('Data 4');
  });
});
