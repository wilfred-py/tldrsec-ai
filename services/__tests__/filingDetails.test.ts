/**
 * Filing Details Module Tests
 * 
 * Tests the functionality for retrieving SEC filing details
 */

import { getFilingDetails } from '../filings/filingDetails';
import { SecFilingDetails, SecFilingDocument } from '../../types/sec/filing';

// Mock dependencies
jest.mock('../../utils/logger', () => ({
  secLogger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Mock the filingService
jest.mock('../filingService', () => ({
  __esModule: true,
  default: {
    getFilingById: jest.fn()
  }
}));

// Import the mocked module
import filingService from '../filingService';

describe('Filing Details Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should extract filing details and create synthetic document when no valid document tags found', async () => {
    // Arrange
    const accessionNumber = '0001234567-22-000123';
    const cik = '0001234567';
    const mockFilingResponse = {
      data: {
        filingDate: '2022-03-15',
        filingCode: '10-K',
        company: 'Test Company Inc.',
        content: 'This is a filing with no document tags'
      }
    };

    (filingService.getFilingById as jest.Mock).mockResolvedValue(mockFilingResponse);

    // Act
    const result = await getFilingDetails(accessionNumber, cik);

    // Assert
    expect(result).toBeDefined();
    expect(result.accessionNumber).toBe(accessionNumber);
    expect(result.formType).toBe('10-K');
    expect(result.companyName).toBe('Test Company Inc.');
    
    const documents = (result as SecFilingDetails & { documents: SecFilingDocument[] }).documents;
    expect(documents).toHaveLength(1);
    expect(documents[0].type).toBe('10-K');
    expect(documents[0].description).toBe('Complete Filing Text');
    expect(documents[0].content).toBe('This is a filing with no document tags');
  });

  test('should extract document with proper XML tags', async () => {
    // Arrange
    const accessionNumber = '0001234567-22-000123';
    const cik = '0001234567';
    const mockFilingResponse = {
      data: {
        filingDate: '2022-03-15',
        filingCode: 'FORM4',
        company: 'Test Company Inc.',
        content: `<SEC-DOCUMENT>
<XML>
form4.xml
<ownershipDocument>
  <reportingOwner>
    <reportingOwnerId>
      <rptOwnerName>SMITH JOHN</rptOwnerName>
    </reportingOwnerId>
  </reportingOwner>
</ownershipDocument>
</XML>
</SEC-DOCUMENT>`
      }
    };

    (filingService.getFilingById as jest.Mock).mockResolvedValue(mockFilingResponse);

    // Act
    const result = await getFilingDetails(accessionNumber, cik);

    // Assert
    expect(result).toBeDefined();
    const documents = (result as SecFilingDetails & { documents: SecFilingDocument[] }).documents;
    expect(documents.length).toBeGreaterThan(0);
    expect(documents.some(doc => doc.content && doc.content.includes('<ownershipDocument>'))).toBe(true);
  });

  test('should handle XML content in Form 4 filings', async () => {
    // Arrange
    const accessionNumber = '0001234567-22-000123';
    const cik = '0001234567';
    const mockFilingResponse = {
      data: {
        filingDate: '2022-03-15',
        filingCode: 'FORM4',
        company: 'Test Company Inc.',
        content: `
          <SEC-DOCUMENT>
          <FILENAME>form4.xml</FILENAME>
          <TYPE>FORM4</TYPE>
          <XML>
            <ownershipDocument>
              <reportingOwner>
                <reportingOwnerId>
                  <rptOwnerName>SMITH JOHN</rptOwnerName>
                </reportingOwnerId>
              </reportingOwner>
            </ownershipDocument>
          </XML>
          </SEC-DOCUMENT>
        `
      }
    };

    (filingService.getFilingById as jest.Mock).mockResolvedValue(mockFilingResponse);

    // Act
    const result = await getFilingDetails(accessionNumber, cik);

    // Assert
    expect(result).toBeDefined();
    expect(result.formType).toBe('FORM4');
    const documents = (result as SecFilingDetails & { documents: SecFilingDocument[] }).documents;
    expect(documents.some(doc => doc.type === 'XML')).toBe(true);
    const xmlDoc = documents.find(doc => doc.type === 'XML');
    expect(xmlDoc?.filename).toBe('form4.xml');
    expect(xmlDoc?.content).toContain('<ownershipDocument>');
  });

  test('should handle general XML files in filings', async () => {
    // Arrange
    const accessionNumber = '0001234567-22-000123';
    const cik = '0001234567';
    const mockFilingResponse = {
      data: {
        filingDate: '2022-03-15',
        filingCode: '8-K',
        company: 'Test Company Inc.',
        content: `
          <SEC-DOCUMENT>
          <FILENAME>report.htm</FILENAME>
          <TYPE>8-K</TYPE>
          <TEXT>
            This filing contains XML data: data.xml
          </TEXT>
          <XML>data.xml
            <customData>
              <item>Value 1</item>
              <item>Value 2</item>
            </customData>
          </XML>
          </SEC-DOCUMENT>
        `
      }
    };

    (filingService.getFilingById as jest.Mock).mockResolvedValue(mockFilingResponse);

    // Act
    const result = await getFilingDetails(accessionNumber, cik);

    // Assert
    expect(result).toBeDefined();
    const documents = (result as SecFilingDetails & { documents: SecFilingDocument[] }).documents;
    expect(documents.some(doc => doc.filename === 'data.xml')).toBe(true);
    const xmlDoc = documents.find(doc => doc.filename === 'data.xml');
    expect(xmlDoc?.content).toContain('<customData>');
  });

  test('should create synthetic document when no documents are found', async () => {
    // Arrange
    const accessionNumber = '0001234567-22-000123';
    const cik = '0001234567';
    const mockFilingResponse = {
      data: {
        filingDate: '2022-03-15',
        filingCode: '8-K',
        company: 'Test Company Inc.',
        content: 'This is a filing with no document tags'
      }
    };

    (filingService.getFilingById as jest.Mock).mockResolvedValue(mockFilingResponse);

    // Act
    const result = await getFilingDetails(accessionNumber, cik);

    // Assert
    expect(result).toBeDefined();
    const documents = (result as SecFilingDetails & { documents: SecFilingDocument[] }).documents;
    expect(documents).toHaveLength(1);
    expect(documents[0].type).toBe('8-K');
    expect(documents[0].description).toBe('Complete Filing Text');
    expect(documents[0].content).toBe('This is a filing with no document tags');
  });

  test('should handle string response from filing service', async () => {
    // Arrange
    const accessionNumber = '0001234567-22-000123';
    const cik = '0001234567';
    const mockFilingResponse = {
      data: 'This is a raw text filing with no structure'
    };

    (filingService.getFilingById as jest.Mock).mockResolvedValue(mockFilingResponse);

    // Act
    const result = await getFilingDetails(accessionNumber, cik);

    // Assert
    expect(result).toBeDefined();
    const documents = (result as SecFilingDetails & { documents: SecFilingDocument[] }).documents;
    expect(documents).toHaveLength(1);
    expect(documents[0].description).toBe('Complete Filing Text');
    expect(documents[0].content).toBe('This is a raw text filing with no structure');
  });

  test('should throw error when filing service returns no data', async () => {
    // Arrange
    const accessionNumber = '0001234567-22-000123';
    const cik = '0001234567';
    const mockFilingResponse = { data: null };

    (filingService.getFilingById as jest.Mock).mockResolvedValue(mockFilingResponse);

    // Act & Assert
    await expect(getFilingDetails(accessionNumber, cik)).rejects.toThrow(
      `Failed to get details for filing ${accessionNumber}`
    );
  });

  test('should handle filing service errors', async () => {
    // Arrange
    const accessionNumber = '0001234567-22-000123';
    const cik = '0001234567';
    const mockError = new Error('Service unavailable');

    (filingService.getFilingById as jest.Mock).mockRejectedValue(mockError);

    // Act & Assert
    await expect(getFilingDetails(accessionNumber, cik)).rejects.toThrow(
      `Failed to get details for filing ${accessionNumber}`
    );
  });
});
