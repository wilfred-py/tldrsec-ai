/**
 * Form 144 Parser Tests
 * 
 * Tests the Form 144 parser module functionality
 */

import { parseForm144 } from '../filings/parsers/form144Parser';
import { Form144ParsedContent } from '../../types/sec/form144';

// Mock the logger to prevent console output during tests
jest.mock('../../utils/logger', () => ({
  secLogger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Mock the xmldom module
jest.mock('@xmldom/xmldom', () => {
  // Create a mock implementation of DOMParser
  const mockEvaluate = jest.fn();
  
  // Helper to set up mock responses for different XPath expressions
  const setupMockResponses = (doc: any, responses: Record<string, string>) => {
    mockEvaluate.mockImplementation((xpath: string) => {
      const response = responses[xpath] || '';
      const iterator = function* () {
        if (response) {
          yield { textContent: response };
        }
      }();
      
      return {
        iterateNext: () => {
          const next = iterator.next();
          return next.done ? null : next.value;
        }
      };
    });
  };
  
  return {
    DOMParser: jest.fn().mockImplementation(() => ({
      parseFromString: jest.fn().mockImplementation((xml: string) => {
        const doc: Record<string, any> = {};
        // Add evaluate method to the document
        doc.evaluate = mockEvaluate;
        return doc;
      })
    })),
    // Expose the setup helper for tests
    __setupMockResponses: setupMockResponses,
    mockEvaluate
  };
});

// Import the mocked module
const xmldomMock = jest.requireMock('@xmldom/xmldom');

describe('Form 144 Parser', () => {
  test('should parse valid Form 144 XML content', async () => {
    // Arrange
    const mockFiling = {
      content: '<XML><ns1:ownershipDocument></ns1:ownershipDocument></XML>',
      companyName: 'Example Corp',
      filingDate: '2023-06-15'
    };
    
    // Set up mock responses for XPath expressions
    xmldomMock.__setupMockResponses({}, {
      '//ns1:reportingOwner/ns1:reportingOwnerId/ns1:rptOwnerName/text()': 'John Smith',
      '//ns1:reportingOwner/ns1:reportingOwnerRelationship/ns1:officerTitle/text()': 'Chief Financial Officer',
      '//ns1:reportingOwner/ns1:reportingOwnerRelationship/ns1:directorOrOfficer/text()': 'Officer',
      '//ns1:saleDate/text()': '2023-06-15',
      '//ns1:amountOfSecurities/text()': '10000',
      '//ns1:proposedSaleDate/text()': '2023-06-20',
      '//ns1:brokerName/text()': 'Example Broker LLC',
      '//ns1:remarks/text()': 'Sale pursuant to Rule 10b5-1 trading plan'
    });

    // Act
    const result = await parseForm144(mockFiling);

    // Assert
    expect(result).not.toBeNull();
    expect(result).toEqual({
      reportingPerson: 'John Smith',
      reportingPersonTitle: 'Chief Financial Officer',
      relationshipToIssuer: 'Officer',
      dateOfSale: '2023-06-15',
      amountOfSecurities: '10000',
      proposedSaleDate: '2023-06-20',
      broker: 'Example Broker LLC',
      note: 'Sale pursuant to Rule 10b5-1 trading plan'
    });
  });

  test('should return null when no XML content is found', async () => {
    // Arrange
    const mockFiling = {
      content: 'No XML content here',
      companyName: 'Example Corp',
      filingDate: '2023-06-15'
    };

    // Act
    const result = await parseForm144(mockFiling);

    // Assert
    expect(result).toBeNull();
  });

  test('should handle malformed XML gracefully', async () => {
    // Arrange
    const mockFiling = {
      content: '<XML>Malformed XML content</XML>',
      companyName: 'Example Corp',
      filingDate: '2023-06-15'
    };
    
    // Set up mock responses for XPath expressions - all empty
    xmldomMock.__setupMockResponses({}, {
      '//ns1:reportingOwner/ns1:reportingOwnerId/ns1:rptOwnerName/text()': '',
      '//ns1:reportingOwner/ns1:reportingOwnerRelationship/ns1:officerTitle/text()': '',
      '//ns1:reportingOwner/ns1:reportingOwnerRelationship/ns1:directorOrOfficer/text()': '',
      '//ns1:saleDate/text()': '',
      '//ns1:amountOfSecurities/text()': '',
      '//ns1:proposedSaleDate/text()': '',
      '//ns1:brokerName/text()': '',
      '//ns1:remarks/text()': ''
    });

    // Act
    const result = await parseForm144(mockFiling);

    // Assert
    expect(result).not.toBeNull();
    if (result) {
      Object.values(result).forEach(value => {
        expect(value).toBe('');
      });
    }
  });

  test('should handle missing fields gracefully', async () => {
    // Arrange
    const mockFiling = {
      content: `
        <XML>
          <ns1:ownershipDocument>
            <ns1:reportingOwner>
              <ns1:reportingOwnerId>
                <ns1:rptOwnerName>John Smith</ns1:rptOwnerName>
              </ns1:reportingOwnerId>
              <!-- Missing reportingOwnerRelationship -->
            </ns1:reportingOwner>
            <!-- Missing other fields -->
          </ns1:ownershipDocument>
        </XML>
      `,
      companyName: 'Example Corp',
      filingDate: '2023-06-15'
    };
    
    // Set up mock responses for XPath expressions - only name present
    xmldomMock.__setupMockResponses({}, {
      '//ns1:reportingOwner/ns1:reportingOwnerId/ns1:rptOwnerName/text()': 'John Smith',
      '//ns1:reportingOwner/ns1:reportingOwnerRelationship/ns1:officerTitle/text()': '',
      '//ns1:reportingOwner/ns1:reportingOwnerRelationship/ns1:directorOrOfficer/text()': '',
      '//ns1:saleDate/text()': '',
      '//ns1:amountOfSecurities/text()': '',
      '//ns1:proposedSaleDate/text()': '',
      '//ns1:brokerName/text()': '',
      '//ns1:remarks/text()': ''
    });

    // Act
    const result = await parseForm144(mockFiling);

    // Assert
    expect(result).not.toBeNull();
    expect(result).toEqual({
      reportingPerson: 'John Smith',
      reportingPersonTitle: '',
      relationshipToIssuer: '',
      dateOfSale: '',
      amountOfSecurities: '',
      proposedSaleDate: '',
      broker: '',
      note: ''
    });
  });
});
