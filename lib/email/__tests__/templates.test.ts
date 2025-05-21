/**
 * Tests for email templates
 */

import { 
  getEmailTemplate, 
  immediateNotificationTemplate, 
  digestTemplate, 
  welcomeTemplate, 
  BaseTemplateData,
  FilingTemplateData
} from '../templates';
import { EmailType } from '../types';

describe('Email Templates', () => {
  const baseTemplateData: BaseTemplateData = {
    recipientName: 'Test User',
    recipientEmail: 'test@example.com',
    unsubscribeUrl: 'https://tldrsec.com/unsubscribe',
    preferencesUrl: 'https://tldrsec.com/settings',
    currentYear: 2023
  };

  describe('getEmailTemplate', () => {
    // Create a simplified test for getEmailTemplate that doesn't rely on spying
    it('should return appropriate template content based on type', () => {
      // Create test data with required fields
      const testFiling: FilingTemplateData = {
        symbol: 'TEST',
        companyName: 'Test Company',
        filingType: '10-K',
        filingDate: new Date(),
        filingUrl: 'https://example.com',
        summaryUrl: 'https://example.com/summary',
        summaryId: '123'
      };
      
      // Act - get results for different template types
      const immediateResult = getEmailTemplate(EmailType.IMMEDIATE, { 
        ...baseTemplateData, 
        filing: testFiling 
      });
      
      const digestResult = getEmailTemplate(EmailType.DIGEST, { 
        ...baseTemplateData, 
        tickerGroups: [
          {
            symbol: 'TEST',
            companyName: 'Test Company',
            filings: [testFiling]
          }
        ] 
      });
      
      const welcomeResult = getEmailTemplate(EmailType.WELCOME, {
        ...baseTemplateData,
        selectedTickers: ['AAPL', 'MSFT']
      });
      
      // Assert - verify each template type returns appropriate content
      expect(immediateResult.html).toContain('New 10-K for TEST');
      expect(digestResult.html).toContain('Your Daily SEC Filings Digest');
      expect(welcomeResult.html).toContain('Welcome to tldrSEC');
    });
    
    it('should throw error for unsupported template types', () => {
      // Act & Assert
      expect(() => {
        getEmailTemplate('unsupported' as EmailType, {});
      }).toThrow('Template type "unsupported" not implemented');
    });
  });
  
  describe('immediateNotificationTemplate', () => {
    const filingData10K: FilingTemplateData = {
      symbol: 'AAPL',
      companyName: 'Apple Inc.',
      filingType: '10-K',
      filingDate: new Date('2023-01-15'),
      filingUrl: 'https://example.com/filing.pdf',
      summaryUrl: 'https://tldrsec.com/summary/123',
      summaryId: '123',
      summaryData: {
        period: 'FY 2022',
        financials: [
          { label: 'Revenue', value: '$394.3B', growth: '+8%' },
          { label: 'Net Income', value: '$99.8B', growth: '+5%' }
        ],
        insights: [
          'Strong iPhone sales despite market slowdown',
          'Services revenue growing by 14%',
          'Supply chain issues resolved in Q4'
        ]
      }
    };
    
    const filingData8K: FilingTemplateData = {
      symbol: 'MSFT',
      companyName: 'Microsoft Corporation',
      filingType: '8-K',
      filingDate: new Date('2023-02-20'),
      filingUrl: 'https://example.com/filing8k.pdf',
      summaryUrl: 'https://tldrsec.com/summary/456',
      summaryId: '456',
      summaryData: {
        eventType: 'Executive Changes',
        summary: 'CEO announced retirement effective June 2023',
        positiveHighlights: 'Smooth transition planned with internal candidate',
        negativeHighlights: 'Some uncertainty during leadership change'
      }
    };
    
    const filingDataForm4: FilingTemplateData = {
      symbol: 'TSLA',
      companyName: 'Tesla Inc.',
      filingType: 'Form4',
      filingDate: new Date('2023-03-10'),
      filingUrl: 'https://example.com/form4.pdf',
      summaryUrl: 'https://tldrsec.com/summary/789',
      summaryId: '789',
      summaryData: {
        filerName: 'Elon Musk',
        relationship: 'CEO',
        summary: 'Purchased 100,000 shares',
        totalValue: '$21.5M',
        percentageChange: '+0.5%',
        newStake: '21.5% of outstanding shares'
      }
    };
    
    it('should generate HTML and text for 10-K filings', () => {
      // Act
      const result = immediateNotificationTemplate({
        ...baseTemplateData,
        filing: filingData10K
      });
      
      // Assert
      expect(result).toHaveProperty('html');
      expect(result).toHaveProperty('text');
      
      // HTML checks
      expect(result.html).toContain('New 10-K for AAPL');
      expect(result.html).toContain('Apple Inc.');
      expect(result.html).toContain('Key Financials');
      expect(result.html).toContain('Revenue');
      expect(result.html).toContain('$394.3B');
      expect(result.html).toContain('Strong iPhone sales');
      
      // Text checks
      expect(result.text).toContain('NEW 10-K FOR AAPL');
      expect(result.text).toContain('Apple Inc.');
      expect(result.text).toContain('Filing Type: 10-K');
    });
    
    it('should generate HTML and text for 8-K filings', () => {
      // Act
      const result = immediateNotificationTemplate({
        ...baseTemplateData,
        filing: filingData8K
      });
      
      // Assert
      expect(result.html).toContain('New 8-K for MSFT');
      expect(result.html).toContain('Microsoft Corporation');
      expect(result.html).toContain('Executive Changes');
      expect(result.html).toContain('CEO announced retirement');
      expect(result.html).toContain('Smooth transition planned');
      
      expect(result.text).toContain('NEW 8-K FOR MSFT');
    });
    
    it('should generate HTML and text for Form4 filings', () => {
      // Act
      const result = immediateNotificationTemplate({
        ...baseTemplateData,
        filing: filingDataForm4
      });
      
      // Assert
      expect(result.html).toContain('New Form4 for TSLA');
      expect(result.html).toContain('Tesla Inc.');
      expect(result.html).toContain('Elon Musk');
      expect(result.html).toContain('CEO');
      expect(result.html).toContain('Purchased 100,000 shares');
      
      expect(result.text).toContain('NEW Form4 FOR TSLA');
    });
    
    it('should handle filings without summary data', () => {
      // Arrange
      const plainFiling: FilingTemplateData = {
        ...filingData10K,
        summaryData: undefined,
        summaryText: 'This is a plain text summary without structured data.'
      };
      
      // Act
      const result = immediateNotificationTemplate({
        ...baseTemplateData,
        filing: plainFiling
      });
      
      // Assert
      expect(result.html).toContain('New 10-K for AAPL');
      expect(result.html).toContain('This is a plain text summary');
      expect(result.html).not.toContain('Key Financials');
      
      expect(result.text).toContain('This is a plain text summary');
    });
  });
  
  describe('digestTemplate', () => {
    const tickerGroups = [
      {
        symbol: 'AAPL',
        companyName: 'Apple Inc.',
        filings: [
          {
            symbol: 'AAPL',
            companyName: 'Apple Inc.',
            filingType: '10-K',
            filingDate: new Date('2023-01-15'),
            filingUrl: 'https://example.com/filing.pdf',
            summaryUrl: 'https://tldrsec.com/summary/123',
            summaryId: '123',
            summaryData: {
              period: 'FY 2022',
              insights: ['Strong iPhone sales despite market slowdown']
            }
          },
          {
            symbol: 'AAPL',
            companyName: 'Apple Inc.',
            filingType: '8-K',
            filingDate: new Date('2023-01-20'),
            filingUrl: 'https://example.com/filing2.pdf',
            summaryUrl: 'https://tldrsec.com/summary/124',
            summaryId: '124',
            summaryData: {
              eventType: 'Earnings Release',
              summary: 'Q1 2023 earnings exceeded expectations'
            }
          }
        ]
      },
      {
        symbol: 'MSFT',
        companyName: 'Microsoft Corporation',
        filings: [
          {
            symbol: 'MSFT',
            companyName: 'Microsoft Corporation',
            filingType: 'Form4',
            filingDate: new Date('2023-01-18'),
            filingUrl: 'https://example.com/filing3.pdf',
            summaryUrl: 'https://tldrsec.com/summary/125',
            summaryId: '125',
            summaryData: {
              filerName: 'Satya Nadella',
              summary: 'Sold 50,000 shares as part of planned trading program'
            }
          }
        ]
      }
    ];
    
    it('should generate HTML and text for digest emails', () => {
      // Act
      const result = digestTemplate({
        ...baseTemplateData,
        tickerGroups
      });
      
      // Assert
      expect(result).toHaveProperty('html');
      expect(result).toHaveProperty('text');
      
      // HTML checks
      expect(result.html).toContain('Your Daily SEC Filings Digest');
      expect(result.html).toContain('Test User');
      expect(result.html).toContain('AAPL - Apple Inc.');
      expect(result.html).toContain('MSFT - Microsoft Corporation');
      expect(result.html).toContain('10-K');
      expect(result.html).toContain('8-K');
      expect(result.html).toContain('Form4');
      expect(result.html).toContain('Strong iPhone sales');
      expect(result.html).toContain('Earnings Release');
      expect(result.html).toContain('Satya Nadella');
      
      // Text checks
      expect(result.text).toContain('YOUR DAILY SEC FILINGS DIGEST');
      expect(result.text).toContain('AAPL - Apple Inc.');
      expect(result.text).toContain('MSFT - Microsoft Corporation');
    });
    
    it('should handle empty ticker groups', () => {
      // Act
      const result = digestTemplate({
        ...baseTemplateData,
        tickerGroups: []
      });
      
      // Assert
      expect(result.html).toContain('Your Daily SEC Filings Digest');
      expect(result.html).toContain('0 SEC filings');
      expect(result.text).toContain('YOUR DAILY SEC FILINGS DIGEST');
      expect(result.text).toContain('0 SEC filing');
    });
  });
  
  describe('welcomeTemplate', () => {
    it('should generate welcome email with selected tickers', () => {
      // Act
      const result = welcomeTemplate({
        ...baseTemplateData,
        selectedTickers: ['AAPL', 'MSFT', 'GOOGL']
      });
      
      // Assert
      expect(result.html).toContain('Welcome to tldrSEC!');
      expect(result.html).toContain('Test User');
      expect(result.html).toContain('Your Selected Tickers');
      expect(result.html).toContain('AAPL');
      expect(result.html).toContain('MSFT');
      expect(result.html).toContain('GOOGL');
      expect(result.html).toContain('Getting Started');
      
      expect(result.text).toContain('WELCOME TO TLDRSEC!');
      expect(result.text).toContain('YOUR SELECTED TICKERS');
      expect(result.text).toContain('- AAPL');
    });
    
    it('should generate welcome email without selected tickers', () => {
      // Act
      const result = welcomeTemplate(baseTemplateData);
      
      // Assert
      expect(result.html).toContain('Welcome to tldrSEC!');
      expect(result.html).toContain('Test User');
      expect(result.html).not.toContain('Your Selected Tickers');
      expect(result.html).toContain('Getting Started');
      
      expect(result.text).toContain('WELCOME TO TLDRSEC!');
      expect(result.text).not.toContain('YOUR SELECTED TICKERS');
    });
  });
}); 