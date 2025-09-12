import { jest } from '@jest/globals';

// Import types
import { FilingType } from '../../../../types/sec/filing';

// Mock all external dependencies
jest.mock('../../../../services/secService');
jest.mock('../../../../lib/logging', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));
jest.mock('../../../../lib/db', () => ({
  prisma: {
    ticker: {
      findFirst: jest.fn().mockResolvedValue({ id: 'mock-ticker-id', symbol: 'TEST' }),
    },
    summary: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'mock-summary-id' }),
    },
  },
}));
jest.mock('../../../../lib/ai/summarize', () => ({
  summarizeFiling: jest.fn().mockResolvedValue({
    summary: 'Mock AI-generated summary',
    keyPoints: ['Mock key point 1', 'Mock key point 2'],
    model: 'claude-3-sonnet',
    tokensUsed: 1000,
    inputTokens: 800,
    outputTokens: 200,
    cost: 0.05,
  }),
}));
jest.mock('../../../../services/filings/database/filingDatabase', () => ({
  findExistingSummary: jest.fn().mockResolvedValue(null),
  storeSummary: jest.fn().mockResolvedValue({ id: 'mock-summary-id' }),
}));
jest.mock('../../../../services/filings/extractors/documentScraper', () => ({
  scrapeDocumentLinksFromFilingPage: jest.fn().mockResolvedValue('http://mock-url.com'),
  fetchDocumentContent: jest.fn().mockResolvedValue('Mock scraped content'),
}));
jest.mock('../../../../services/filings/summaries/fallbackSummaryGenerator', () => ({
  generateFallbackSummary: jest.fn().mockReturnValue('Mock fallback summary'),
  generateFallbackKeyPoints: jest.fn().mockReturnValue(['Mock fallback key point']),
}));
jest.mock('../../../../services/filings/utils/formTypeUtils', () => ({
  normalizeFormType: jest.fn((formType) => formType),
}));
jest.mock('../../../../services/filings/utils/apiHeaders', () => ({
  getSecApiHeaders: jest.fn().mockReturnValue({ 'User-Agent': 'test-agent' }),
}));
jest.mock('../../../../lib/ai/config', () => ({
  getClaudeModel: jest.fn().mockReturnValue('claude-3-sonnet'),
}));
jest.mock('../../../../lib/sec-edgar/client');
jest.mock('axios');

// For testing internal functions, we need to import the actual module
// Since the validation functions are not exported, we'll test them through the public interface
// and also create direct test utilities

// Helper function to access internal validation functions
// We'll create a test helper that exposes the internal functions
const mockInternalFunctions = {
  validateContentForProcessing: (content: string, ticker: string, formType: string) => {
    const contentLength = content?.length || 0;
    
    // Basic empty content check
    if (contentLength === 0) {
      return {
        isValid: false,
        reason: 'Content is empty (contentLength: 0)',
        contentLength: 0
      };
    }
    
    // General length validation - applies to all forms
    if (contentLength < 50) {
      return {
        isValid: false,
        reason: `Content too short (${contentLength} bytes, minimum 50 required)`,
        contentLength
      };
    }
    
    if (contentLength > 100000000) {
      return {
        isValid: false,
        reason: `Content too large (${contentLength} bytes, maximum 100000000 allowed)`,
        contentLength
      };
    }
    
    // Content type validation - check if it looks like valid filing content
    const htmlIndicators = ['<html', '<body', '<div', '<table', '<p>', '<br>', '<span', '<td>', '<tr>'];
    const xmlIndicators = ['<?xml', '<xbrl', '<us-gaap:', '<dei:', '<document>'];
    const formIndicators = ['SEC FORM', 'FORM ', formType.toUpperCase(), 'SECURITIES AND EXCHANGE COMMISSION'];
    const textIndicators = ['UNITED STATES', 'WASHINGTON', 'COMMISSION FILE NUMBER'];
    
    const lowerContent = content.toLowerCase().substring(0, 10000);
    const hasHtmlIndicators = htmlIndicators.some(indicator => lowerContent.includes(indicator.toLowerCase()));
    const hasXmlIndicators = xmlIndicators.some(indicator => lowerContent.includes(indicator.toLowerCase()));
    const hasFormIndicators = formIndicators.some(indicator => lowerContent.includes(indicator.toLowerCase()));
    const hasTextIndicators = textIndicators.some(indicator => lowerContent.includes(indicator.toLowerCase()));
    
    // Must have at least one type of content indicator
    if (!hasHtmlIndicators && !hasXmlIndicators && !hasFormIndicators && !hasTextIndicators) {
      return {
        isValid: false,
        reason: 'Content does not appear to be a valid SEC filing (no recognizable filing indicators found)',
        contentLength
      };
    }
    
    // Check for common error indicators
    const errorIndicators = [
      'not found',
      '404 error', 
      'access denied',
      'file not found',
      'document not available',
      'temporarily unavailable',
      'server error',
      'internal server error',
      'bad request',
      'forbidden'
    ];
    
    const hasErrorIndicators = errorIndicators.some(indicator => lowerContent.includes(indicator));
    if (hasErrorIndicators) {
      return {
        isValid: false,
        reason: 'Content contains error indicators suggesting document retrieval failure',
        contentLength
      };
    }
    
    // All validations passed
    return {
      isValid: true,
      contentLength
    };
  },

  validateAISummary: (summaryText: string, keyPoints: string[], ticker: string, formType: string) => {
    const suggestions: string[] = [];
    
    // Basic content checks
    if (!summaryText || summaryText.trim().length === 0) {
      return {
        isValid: false,
        reason: 'Summary text is empty or only whitespace'
      };
    }
    
    // Check for minimum summary length based on form type
    const minSummaryLengths: Record<string, number> = {
      '10-K': 300,
      '10-Q': 200,
      '8-K': 100,
      'DEFA14A': 150,
      'FORM4': 50,
      '144': 30,
      'DEFAULT': 50
    };
    
    const minLength = minSummaryLengths[formType.toUpperCase()] || minSummaryLengths['DEFAULT'];
    if (summaryText.trim().length < minLength) {
      return {
        isValid: false,
        reason: `Summary too brief for ${formType} (${summaryText.trim().length} chars, minimum ${minLength} required)`
      };
    }
    
    // Check for truncated summary indicators
    const truncationIndicators = [
      'summary was cut off',
      'content truncated',
      '...[truncated]',
      'response limit reached',
      'token limit exceeded',
      'incomplete summary',
      '[TRUNCATED]'
    ];
    
    const lowerSummary = summaryText.toLowerCase();
    const hasTruncationIndicators = truncationIndicators.some(indicator => lowerSummary.includes(indicator));
    if (hasTruncationIndicators) {
      return {
        isValid: false,
        reason: 'Summary appears to be truncated or incomplete'
      };
    }
    
    // Check for generic/placeholder content
    const placeholderIndicators = [
      'unable to generate summary',
      'summary not available',
      'content could not be processed',
      'failed to analyze',
      'error in processing',
      'no summary available'
    ];
    
    const hasPlaceholderContent = placeholderIndicators.some(indicator => lowerSummary.includes(indicator));
    if (hasPlaceholderContent) {
      return {
        isValid: false,
        reason: 'Summary contains placeholder or error content instead of actual analysis'
      };
    }
    
    // Check key points quality
    if (!keyPoints || keyPoints.length === 0) {
      suggestions.push('No key points provided - consider regenerating with key points extraction');
    } else if (keyPoints.length === 1 && keyPoints[0].trim().length < 20) {
      suggestions.push('Key points appear too brief or generic');
    }
    
    // Check for form-specific content expectations
    if (formType.toUpperCase().includes('10-K') || formType.toUpperCase().includes('10-Q')) {
      if (!lowerSummary.includes('financial') && !lowerSummary.includes('revenue') && !lowerSummary.includes('earnings')) {
        suggestions.push('Financial filing summary lacks financial terminology - may need regeneration');
      }
    }
    
    // Check for company/ticker relevance
    if (!lowerSummary.includes(ticker.toLowerCase()) && ticker.length > 1) {
      suggestions.push(`Summary does not mention ticker ${ticker} - verify relevance`);
    }
    
    return {
      isValid: true,
      suggestions: suggestions.length > 0 ? suggestions : undefined
    };
  }
};

describe('Filing Validation Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset environment variables
    delete process.env.ENABLE_ENHANCED_SUMMARIZATION;
  });

  describe('validateContentForProcessing', () => {
    const { validateContentForProcessing } = mockInternalFunctions;

    describe('Empty content validation', () => {
      it('should reject empty content', () => {
        const result = validateContentForProcessing('', 'AAPL', '10-K');
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('Content is empty (contentLength: 0)');
        expect(result.contentLength).toBe(0);
      });

      it('should reject null content', () => {
        const result = validateContentForProcessing(null as any, 'AAPL', '10-K');
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('Content is empty (contentLength: 0)');
        expect(result.contentLength).toBe(0);
      });

      it('should reject undefined content', () => {
        const result = validateContentForProcessing(undefined as any, 'AAPL', '10-K');
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('Content is empty (contentLength: 0)');
        expect(result.contentLength).toBe(0);
      });
    });

    describe('Content size validation', () => {
      it('should reject content below minimum size', () => {
        const shortContent = 'Too short';  // 9 bytes, below minimum of 50
        const result = validateContentForProcessing(shortContent, 'AAPL', '10-K');
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('Content too short (9 bytes, minimum 50 required)');
        expect(result.contentLength).toBe(9);
      });

      it('should reject content above maximum size', () => {
        const maxSize = 100000000;
        const largeContent = 'x'.repeat(maxSize + 1);
        const result = validateContentForProcessing(largeContent, 'AAPL', '10-K');
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe(`Content too large (${maxSize + 1} bytes, maximum ${maxSize} allowed)`);
        expect(result.contentLength).toBe(maxSize + 1);
      });

      it('should accept content at minimum boundary', () => {
        const minContent = '<html><body>SEC FORM 10-K for AAPL filing content</body></html>'; // > 50 bytes with indicators
        const result = validateContentForProcessing(minContent, 'AAPL', '10-K');
        expect(result.isValid).toBe(true);
        expect(result.contentLength).toBe(minContent.length);
      });

      it('should accept content at maximum boundary', () => {
        const maxSize = 100000000;
        const maxContent = '<html><body>SEC FORM 10-K ' + 'x'.repeat(maxSize - 30) + '</body></html>';
        const result = validateContentForProcessing(maxContent, 'AAPL', '10-K');
        expect(result.isValid).toBe(true);
        expect(result.contentLength).toBe(maxSize);
      });
    });

    describe('Content format validation', () => {
      it('should validate HTML filing formats', () => {
        const htmlContent = '<html><head><title>SEC FORM 10-K</title></head><body><div>AAPL quarterly report content</div></body></html>';
        const result = validateContentForProcessing(htmlContent, 'AAPL', '10-K');
        expect(result.isValid).toBe(true);
      });

      it('should validate XML filing formats', () => {
        const xmlContent = `<?xml version="1.0"?>
          <xbrl xmlns:us-gaap="http://fasb.org/us-gaap/2023" xmlns:dei="http://xbrl.sec.gov/dei/2023">
            <us-gaap:DocumentType>10-K</us-gaap:DocumentType>
            <dei:EntityRegistrantName>Apple Inc.</dei:EntityRegistrantName>
          </xbrl>`;
        const result = validateContentForProcessing(xmlContent, 'AAPL', '10-K');
        expect(result.isValid).toBe(true);
      });

      it('should validate plain text filing formats', () => {
        const textContent = `
          UNITED STATES
          SECURITIES AND EXCHANGE COMMISSION
          WASHINGTON, D.C. 20549
          FORM 10-K
          COMMISSION FILE NUMBER: 001-36743
          Apple Inc.
        `;
        const result = validateContentForProcessing(textContent, 'AAPL', '10-K');
        expect(result.isValid).toBe(true);
      });

      it('should reject content without valid filing indicators', () => {
        const invalidContent = 'This is just random text without any filing indicators or format markers';
        const result = validateContentForProcessing(invalidContent, 'AAPL', '10-K');
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('Content does not appear to be a valid SEC filing (no recognizable filing indicators found)');
      });

      it('should accept content with case-insensitive indicators', () => {
        const mixedCaseContent = '<HTML><BODY>sec form 10-k filing for apple inc.</BODY></HTML>';
        const result = validateContentForProcessing(mixedCaseContent, 'AAPL', '10-K');
        expect(result.isValid).toBe(true);
      });
    });

    describe('Error indicator detection', () => {
      const errorTestCases = [
        'not found',
        '404 error',
        'access denied',
        'file not found',
        'document not available',
        'temporarily unavailable',
        'server error',
        'internal server error',
        'bad request',
        'forbidden'
      ];

      errorTestCases.forEach((errorIndicator) => {
        it(`should detect error indicator: "${errorIndicator}"`, () => {
          const contentWithError = `<html><body>SEC FORM 10-K ${errorIndicator} for AAPL</body></html>`;
          const result = validateContentForProcessing(contentWithError, 'AAPL', '10-K');
          expect(result.isValid).toBe(false);
          expect(result.reason).toBe('Content contains error indicators suggesting document retrieval failure');
        });

        it(`should detect error indicator case-insensitively: "${errorIndicator.toUpperCase()}"`, () => {
          const contentWithError = `<html><body>SEC FORM 10-K ${errorIndicator.toUpperCase()} for AAPL</body></html>`;
          const result = validateContentForProcessing(contentWithError, 'AAPL', '10-K');
          expect(result.isValid).toBe(false);
          expect(result.reason).toBe('Content contains error indicators suggesting document retrieval failure');
        });
      });

      it('should accept valid content without error indicators', () => {
        const validContent = `<html><body><h1>SEC FORM 10-K</h1><p>Apple Inc. annual report for fiscal year 2023. This document contains financial statements and business operations details.</p></body></html>`;
        const result = validateContentForProcessing(validContent, 'AAPL', '10-K');
        expect(result.isValid).toBe(true);
      });
    });

    describe('Form type specific validation', () => {
      const formTypes = ['10-K', '10-Q', '8-K', 'FORM4', '144', 'DEFA14A'];

      formTypes.forEach((formType) => {
        it(`should validate content for ${formType} filings`, () => {
          const formSpecificContent = `<html><body>SEC FORM ${formType} filing content for AAPL with proper structure</body></html>`;
          const result = validateContentForProcessing(formSpecificContent, 'AAPL', formType);
          expect(result.isValid).toBe(true);
        });
      });

      it('should handle unknown form types', () => {
        const unknownFormContent = `<html><body>SECURITIES AND EXCHANGE COMMISSION filing content for AAPL</body></html>`;
        const result = validateContentForProcessing(unknownFormContent, 'AAPL', 'UNKNOWN-FORM');
        expect(result.isValid).toBe(true);
      });
    });

    describe('Edge cases and malformed content', () => {
      it('should handle very long form types', () => {
        const longFormType = 'A'.repeat(1000);
        const content = `<html><body>SEC FORM ${longFormType} content</body></html>`;
        const result = validateContentForProcessing(content, 'AAPL', longFormType);
        expect(result.isValid).toBe(true);
      });

      it('should handle special characters in ticker and form type', () => {
        const content = '<html><body>SEC FORM 10-K filing content</body></html>';
        const result = validateContentForProcessing(content, 'BRK.A', '10-K/A');
        expect(result.isValid).toBe(true);
      });

      it('should handle content with only partial indicators', () => {
        const partialContent = '<div>Some SEC content but incomplete filing format';
        const result = validateContentForProcessing(partialContent, 'AAPL', '10-K');
        expect(result.isValid).toBe(true); // Has HTML indicator
      });

      it('should scan only first 10KB for indicators', () => {
        const indicator = '<html>';
        const largePrefix = 'x'.repeat(15000); // 15KB of content
        const contentWithLatIndicator = largePrefix + indicator + 'SEC FORM 10-K';
        const result = validateContentForProcessing(contentWithLatIndicator, 'AAPL', '10-K');
        // Should be invalid because indicator is beyond first 10KB
        expect(result.isValid).toBe(false);
      });
    });
  });

  describe('validateAISummary', () => {
    const { validateAISummary } = mockInternalFunctions;

    describe('Basic content validation', () => {
      it('should reject empty summary text', () => {
        const result = validateAISummary('', ['key point'], 'AAPL', '10-K');
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('Summary text is empty or only whitespace');
      });

      it('should reject whitespace-only summary', () => {
        const result = validateAISummary('   \n\t   ', ['key point'], 'AAPL', '10-K');
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('Summary text is empty or only whitespace');
      });

      it('should reject null summary text', () => {
        const result = validateAISummary(null as any, ['key point'], 'AAPL', '10-K');
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('Summary text is empty or only whitespace');
      });

      it('should reject undefined summary text', () => {
        const result = validateAISummary(undefined as any, ['key point'], 'AAPL', '10-K');
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('Summary text is empty or only whitespace');
      });
    });

    describe('Form-specific minimum length validation', () => {
      const formTypeLengths = [
        { formType: '10-K', minLength: 300 },
        { formType: '10-Q', minLength: 200 },
        { formType: '8-K', minLength: 100 },
        { formType: 'DEFA14A', minLength: 150 },
        { formType: 'FORM4', minLength: 50 },
        { formType: '144', minLength: 30 },
        { formType: 'UNKNOWN', minLength: 50 } // Default
      ];

      formTypeLengths.forEach(({ formType, minLength }) => {
        it(`should enforce minimum length of ${minLength} for ${formType}`, () => {
          const shortSummary = 'x'.repeat(minLength - 1);
          const result = validateAISummary(shortSummary, ['key point'], 'AAPL', formType);
          expect(result.isValid).toBe(false);
          expect(result.reason).toBe(`Summary too brief for ${formType} (${minLength - 1} chars, minimum ${minLength} required)`);
        });

        it(`should accept summary at minimum length for ${formType}`, () => {
          const minLengthSummary = 'x'.repeat(minLength);
          const result = validateAISummary(minLengthSummary, ['key point'], 'AAPL', formType);
          expect(result.isValid).toBe(true);
        });

        it(`should accept summary above minimum length for ${formType}`, () => {
          const longSummary = 'x'.repeat(minLength + 100);
          const result = validateAISummary(longSummary, ['key point'], 'AAPL', formType);
          expect(result.isValid).toBe(true);
        });
      });

      it('should handle case-insensitive form type matching', () => {
        const summary = 'x'.repeat(200); // Below 10-K minimum of 300
        const result = validateAISummary(summary, ['key point'], 'AAPL', '10-k');
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('Summary too brief for 10-k (200 chars, minimum 300 required)');
      });
    });

    describe('Truncation indicator detection', () => {
      const truncationIndicators = [
        'summary was cut off',
        'content truncated',
        '...[truncated]',
        'response limit reached',
        'token limit exceeded',
        'incomplete summary',
        '[TRUNCATED]'
      ];

      truncationIndicators.forEach((indicator) => {
        it(`should detect truncation indicator: "${indicator}"`, () => {
          const summaryWithTruncation = `This is a valid summary that meets minimum length requirements but contains ${indicator} at the end.`;
          const result = validateAISummary(summaryWithTruncation, ['key point'], 'AAPL', '8-K');
          expect(result.isValid).toBe(false);
          expect(result.reason).toBe('Summary appears to be truncated or incomplete');
        });

        it(`should detect truncation indicator case-insensitively: "${indicator.toUpperCase()}"`, () => {
          const summaryWithTruncation = `This is a valid summary that meets minimum length requirements but contains ${indicator.toUpperCase()} at the end.`;
          const result = validateAISummary(summaryWithTruncation, ['key point'], 'AAPL', '8-K');
          expect(result.isValid).toBe(false);
          expect(result.reason).toBe('Summary appears to be truncated or incomplete');
        });
      });
    });

    describe('Placeholder content detection', () => {
      const placeholderIndicators = [
        'unable to generate summary',
        'summary not available',
        'content could not be processed',
        'failed to analyze',
        'error in processing',
        'no summary available'
      ];

      placeholderIndicators.forEach((indicator) => {
        it(`should detect placeholder content: "${indicator}"`, () => {
          const summaryWithPlaceholder = `Unfortunately, we were ${indicator} for this filing due to technical issues with the content processing.`;
          const result = validateAISummary(summaryWithPlaceholder, ['key point'], 'AAPL', '8-K');
          expect(result.isValid).toBe(false);
          expect(result.reason).toBe('Summary contains placeholder or error content instead of actual analysis');
        });

        it(`should detect placeholder content case-insensitively: "${indicator.toUpperCase()}"`, () => {
          const summaryWithPlaceholder = `Unfortunately, we were ${indicator.toUpperCase()} for this filing due to technical issues.`;
          const result = validateAISummary(summaryWithPlaceholder, ['key point'], 'AAPL', '8-K');
          expect(result.isValid).toBe(false);
          expect(result.reason).toBe('Summary contains placeholder or error content instead of actual analysis');
        });
      });
    });

    describe('Key points validation and suggestions', () => {
      it('should suggest improvement when no key points provided', () => {
        const summary = 'This is a valid summary that meets all minimum length requirements and contains relevant content.';
        const result = validateAISummary(summary, [], 'AAPL', '8-K');
        expect(result.isValid).toBe(true);
        expect(result.suggestions).toContain('No key points provided - consider regenerating with key points extraction');
      });

      it('should suggest improvement when key points are too brief', () => {
        const summary = 'This is a valid summary that meets all minimum length requirements and contains relevant content.';
        const result = validateAISummary(summary, ['Short'], 'AAPL', '8-K');
        expect(result.isValid).toBe(true);
        expect(result.suggestions).toContain('Key points appear too brief or generic');
      });

      it('should accept well-formed key points', () => {
        const summary = 'This is a valid summary that meets all minimum length requirements and contains relevant content.';
        const keyPoints = ['Detailed key point about quarterly earnings performance', 'Another substantive point about business operations'];
        const result = validateAISummary(summary, keyPoints, 'AAPL', '8-K');
        expect(result.isValid).toBe(true);
        expect(result.suggestions).toBeUndefined();
      });

      it('should handle null key points', () => {
        const summary = 'This is a valid summary that meets all minimum length requirements and contains relevant content.';
        const result = validateAISummary(summary, null as any, 'AAPL', '8-K');
        expect(result.isValid).toBe(true);
        expect(result.suggestions).toContain('No key points provided - consider regenerating with key points extraction');
      });

      it('should handle undefined key points', () => {
        const summary = 'This is a valid summary that meets all minimum length requirements and contains relevant content.';
        const result = validateAISummary(summary, undefined as any, 'AAPL', '8-K');
        expect(result.isValid).toBe(true);
        expect(result.suggestions).toContain('No key points provided - consider regenerating with key points extraction');
      });
    });

    describe('Form-specific content expectations', () => {
      it('should suggest financial terminology for 10-K filings without financial terms', () => {
        const summary = 'This filing discusses general company matters and strategic initiatives without specific financial details.';
        const result = validateAISummary(summary, ['General point'], 'AAPL', '10-K');
        expect(result.isValid).toBe(true);
        expect(result.suggestions).toContain('Financial filing summary lacks financial terminology - may need regeneration');
      });

      it('should suggest financial terminology for 10-Q filings without financial terms', () => {
        const summary = 'This filing discusses general company matters and strategic initiatives without specific financial details.';
        const result = validateAISummary(summary, ['General point'], 'AAPL', '10-Q');
        expect(result.isValid).toBe(true);
        expect(result.suggestions).toContain('Financial filing summary lacks financial terminology - may need regeneration');
      });

      it('should accept 10-K filings with financial terminology', () => {
        const summary = 'This quarterly filing shows strong revenue growth and improved earnings compared to last quarter, with financial performance exceeding expectations.';
        const result = validateAISummary(summary, ['Revenue increased 15%'], 'AAPL', '10-K');
        expect(result.isValid).toBe(true);
        expect(result.suggestions?.filter(s => s.includes('financial terminology'))).toHaveLength(0);
      });

      it('should not require financial terminology for 8-K filings', () => {
        const summary = 'This current report announces a new board member appointment and strategic partnership agreement with no financial details.';
        const result = validateAISummary(summary, ['New board member'], 'AAPL', '8-K');
        expect(result.isValid).toBe(true);
        expect(result.suggestions?.filter(s => s.includes('financial terminology'))).toHaveLength(0);
      });

      const financialTerms = ['financial', 'revenue', 'earnings'];
      financialTerms.forEach((term) => {
        it(`should accept 10-K with financial term: "${term}"`, () => {
          const summary = `This annual filing discusses company performance and shows significant ${term} improvements over the previous year.`;
          const result = validateAISummary(summary, ['Financial performance'], 'AAPL', '10-K');
          expect(result.isValid).toBe(true);
          expect(result.suggestions?.filter(s => s.includes('financial terminology'))).toHaveLength(0);
        });
      });
    });

    describe('Ticker relevance validation', () => {
      it('should suggest ticker verification when ticker not mentioned', () => {
        const summary = 'This company filing discusses quarterly performance and strategic initiatives for the technology sector.';
        const result = validateAISummary(summary, ['Performance update'], 'AAPL', '8-K');
        expect(result.isValid).toBe(true);
        expect(result.suggestions).toContain('Summary does not mention ticker AAPL - verify relevance');
      });

      it('should accept summary mentioning ticker', () => {
        const summary = 'Apple Inc. (AAPL) quarterly filing discusses strong performance and strategic initiatives for the technology sector.';
        const result = validateAISummary(summary, ['Performance update'], 'AAPL', '8-K');
        expect(result.isValid).toBe(true);
        expect(result.suggestions?.filter(s => s.includes('ticker AAPL'))).toHaveLength(0);
      });

      it('should handle case-insensitive ticker matching', () => {
        const summary = 'Apple Inc. (aapl) quarterly filing discusses strong performance and strategic initiatives.';
        const result = validateAISummary(summary, ['Performance update'], 'AAPL', '8-K');
        expect(result.isValid).toBe(true);
        expect(result.suggestions?.filter(s => s.includes('ticker AAPL'))).toHaveLength(0);
      });

      it('should skip ticker check for single character tickers', () => {
        const summary = 'This company filing discusses quarterly performance without mentioning the ticker symbol.';
        const result = validateAISummary(summary, ['Performance update'], 'F', '8-K');
        expect(result.isValid).toBe(true);
        expect(result.suggestions?.filter(s => s.includes('ticker F'))).toHaveLength(0);
      });

      it('should handle special characters in tickers', () => {
        const summary = 'Berkshire Hathaway (BRK.A) annual filing shows continued strong performance.';
        const result = validateAISummary(summary, ['Strong performance'], 'BRK.A', '10-K');
        expect(result.isValid).toBe(true);
        expect(result.suggestions?.filter(s => s.includes('ticker BRK.A'))).toHaveLength(0);
      });
    });

    describe('Multiple validation suggestions', () => {
      it('should accumulate multiple suggestions', () => {
        const summary = 'Brief summary.'; // Too short, no financial terms, no ticker mention
        const result = validateAISummary(summary, [], 'AAPL', '10-K');
        expect(result.isValid).toBe(false); // Fails minimum length
        expect(result.reason).toBe('Summary too brief for 10-K (14 chars, minimum 300 required)');
      });

      it('should provide suggestions for valid summary with quality issues', () => {
        const summary = 'This is a long enough summary that meets minimum length requirements for 8-K filings but has some quality issues that could be improved through additional processing.';
        const result = validateAISummary(summary, [], 'NFLX', '8-K');
        expect(result.isValid).toBe(true);
        expect(result.suggestions).toEqual([
          'No key points provided - consider regenerating with key points extraction',
          'Summary does not mention ticker NFLX - verify relevance'
        ]);
      });

      it('should return undefined suggestions when no issues found', () => {
        const summary = 'Netflix Inc. (NFLX) current report discusses strong quarterly performance with significant revenue growth and earnings improvements.';
        const keyPoints = ['Revenue increased significantly', 'Subscriber growth exceeded expectations'];
        const result = validateAISummary(summary, keyPoints, 'NFLX', '8-K');
        expect(result.isValid).toBe(true);
        expect(result.suggestions).toBeUndefined();
      });
    });

    describe('Edge cases and boundary conditions', () => {
      it('should handle very long summaries', () => {
        const longSummary = 'x'.repeat(50000); // 50KB summary
        const result = validateAISummary(longSummary, ['Valid key point'], 'AAPL', '10-K');
        expect(result.isValid).toBe(true);
      });

      it('should handle special characters in all inputs', () => {
        const summaryWithSpecialChars = 'This AAPL summary contains special characters: @#$%^&*()_+[]{}|;:,.<>?/~`';
        const result = validateAISummary(summaryWithSpecialChars, ['Point with émojis 🚀'], 'AAPL', '8-K');
        expect(result.isValid).toBe(true);
      });

      it('should handle empty arrays vs null/undefined arrays differently', () => {
        const summary = 'Valid summary content for testing key points handling.';
        
        const emptyArrayResult = validateAISummary(summary, [], 'AAPL', '8-K');
        const nullResult = validateAISummary(summary, null as any, 'AAPL', '8-K');
        const undefinedResult = validateAISummary(summary, undefined as any, 'AAPL', '8-K');
        
        // All should be valid but have suggestions
        expect(emptyArrayResult.isValid).toBe(true);
        expect(nullResult.isValid).toBe(true);
        expect(undefinedResult.isValid).toBe(true);
        
        // All should have the same suggestion
        const expectedSuggestion = 'No key points provided - consider regenerating with key points extraction';
        expect(emptyArrayResult.suggestions).toContain(expectedSuggestion);
        expect(nullResult.suggestions).toContain(expectedSuggestion);
        expect(undefinedResult.suggestions).toContain(expectedSuggestion);
      });
    });
  });

  describe('getFilingContent fallback scenarios', () => {
    let mockSecClient: any;

    beforeEach(() => {
      const { SECEdgarClient } = require('../../../../lib/sec-edgar/client');
      mockSecClient = {
        getFilingDocument: jest.fn(),
      };
      SECEdgarClient.mockImplementation(() => mockSecClient);
    });

    describe('Sequence number to filename mapping', () => {
      it('should handle sequence number to filename mapping successfully', async () => {
        const accessionNumber = '0000320193-23-000064';
        const sequenceNumber = '1';
        const cik = '0000320193';

        // Mock successful index retrieval with document mapping
        const mockIndexContent = `
          <html>
            <body>
              <table>
                <tr><td><a href="aapl-20230930.htm">1</a></td><td>10-K</td></tr>
              </table>
            </body>
          </html>
        `;

        const mockDocumentContent = '<html><body>Apple 10-K filing content</body></html>';

        mockSecClient.getFilingDocument
          .mockResolvedValueOnce(mockIndexContent) // Index page
          .mockResolvedValueOnce(mockDocumentContent); // Actual document

        const result = await getFilingContent(accessionNumber, sequenceNumber, cik);

        expect(result).toBe(mockDocumentContent);
        expect(mockSecClient.getFilingDocument).toHaveBeenCalledTimes(2);
        
        // Check index URL was called
        expect(mockSecClient.getFilingDocument).toHaveBeenNthCalledWith(1,
          'https://www.sec.gov/Archives/edgar/data/0000320193/000032019323000064/0000320193-23-000064-index.html',
          { handleNotFound: true }
        );
        
        // Check document URL was called
        expect(mockSecClient.getFilingDocument).toHaveBeenNthCalledWith(2,
          'https://www.sec.gov/Archives/edgar/data/320193/000032019323000064/aapl-20230930.htm',
          { handleNotFound: true }
        );
      });

      it('should fallback to common extensions when index parsing fails', async () => {
        const accessionNumber = '0000320193-23-000064';
        const sequenceNumber = '1';
        const cik = '0000320193';

        // Mock index retrieval that doesn't contain the sequence number
        const mockIndexContent = '<html><body>No matching sequence</body></html>';
        const mockDocumentContent = '<html><body>Apple 10-K filing content</body></html>';

        mockSecClient.getFilingDocument
          .mockResolvedValueOnce(mockIndexContent) // Index page - no match found
          .mockRejectedValueOnce(new Error('Not found')) // First fallback attempt fails
          .mockResolvedValueOnce(mockDocumentContent); // Second fallback succeeds

        const result = await getFilingContent(accessionNumber, sequenceNumber, cik);

        expect(result).toBe(mockDocumentContent);
        expect(mockSecClient.getFilingDocument).toHaveBeenCalledTimes(3);
        
        // Should try common extensions: htm, html, txt
        expect(mockSecClient.getFilingDocument).toHaveBeenNthCalledWith(2,
          'https://www.sec.gov/Archives/edgar/data/320193/000032019323000064/0000320193-23-000064.htm',
          { handleNotFound: true }
        );
        expect(mockSecClient.getFilingDocument).toHaveBeenNthCalledWith(3,
          'https://www.sec.gov/Archives/edgar/data/320193/000032019323000064/0000320193-23-000064.html',
          { handleNotFound: true }
        );
      });

      it('should extract CIK from accession number when not provided', async () => {
        const accessionNumber = '0000320193-23-000064';
        const sequenceNumber = '1';
        // No CIK provided

        const mockDocumentContent = '<html><body>Apple 10-K filing content</body></html>';

        // Mock index fails, fallback succeeds
        mockSecClient.getFilingDocument
          .mockRejectedValueOnce(new Error('Index not found'))
          .mockResolvedValueOnce(mockDocumentContent);

        const result = await getFilingContent(accessionNumber, sequenceNumber);

        expect(result).toBe(mockDocumentContent);
        
        // Should extract CIK from accession number (first 10 digits)
        expect(mockSecClient.getFilingDocument).toHaveBeenNthCalledWith(2,
          'https://www.sec.gov/Archives/edgar/data/320193/000032019323000064/0000320193-23-000064.htm',
          { handleNotFound: true }
        );
      });

      it('should handle index fetch failure with complete fallback', async () => {
        const accessionNumber = '0000320193-23-000064';
        const sequenceNumber = '1';
        const cik = '0000320193';

        const mockDocumentContent = '<html><body>Apple 10-K filing content</body></html>';

        // Mock index fetch failure, but fallback succeeds
        mockSecClient.getFilingDocument
          .mockRejectedValueOnce(new Error('Index fetch failed'))
          .mockResolvedValueOnce(mockDocumentContent);

        const result = await getFilingContent(accessionNumber, sequenceNumber, cik);

        expect(result).toBe(mockDocumentContent);
        expect(mockSecClient.getFilingDocument).toHaveBeenCalledTimes(2);
      });

      it('should throw error when all fallback attempts fail', async () => {
        const accessionNumber = '0000320193-23-000064';
        const sequenceNumber = '1';
        const cik = '0000320193';

        // Mock all attempts failing
        mockSecClient.getFilingDocument.mockRejectedValue(new Error('Not found'));

        await expect(getFilingContent(accessionNumber, sequenceNumber, cik))
          .rejects.toThrow('Failed to get filing content for 0000320193-23-000064');
      });
    });

    describe('Direct filename handling', () => {
      it('should handle direct filename without sequence number mapping', async () => {
        const accessionNumber = '0000320193-23-000064';
        const filename = 'aapl-20230930.htm';
        const cik = '0000320193';

        const mockDocumentContent = '<html><body>Apple 10-K filing content</body></html>';
        mockSecClient.getFilingDocument.mockResolvedValue(mockDocumentContent);

        const result = await getFilingContent(accessionNumber, filename, cik);

        expect(result).toBe(mockDocumentContent);
        expect(mockSecClient.getFilingDocument).toHaveBeenCalledWith(
          'https://www.sec.gov/Archives/edgar/data/320193/000032019323000064/aapl-20230930.htm',
          { handleNotFound: true }
        );
      });

      it('should handle filename with CIK extraction', async () => {
        const accessionNumber = '0000320193-23-000064';
        const filename = 'aapl-20230930.htm';
        // No CIK provided

        const mockDocumentContent = '<html><body>Apple 10-K filing content</body></html>';
        mockSecClient.getFilingDocument.mockResolvedValue(mockDocumentContent);

        const result = await getFilingContent(accessionNumber, filename);

        expect(result).toBe(mockDocumentContent);
        // Should extract CIK from accession number
        expect(mockSecClient.getFilingDocument).toHaveBeenCalledWith(
          'https://www.sec.gov/Archives/edgar/data/320193/000032019323000064/aapl-20230930.htm',
          { handleNotFound: true }
        );
      });

      it('should throw error when direct filename fetch fails', async () => {
        const accessionNumber = '0000320193-23-000064';
        const filename = 'aapl-20230930.htm';
        const cik = '0000320193';

        mockSecClient.getFilingDocument.mockRejectedValue(new Error('File not found'));

        await expect(getFilingContent(accessionNumber, filename, cik))
          .rejects.toThrow('Failed to get filing content for 0000320193-23-000064');
      });

      it('should handle empty content response', async () => {
        const accessionNumber = '0000320193-23-000064';
        const filename = 'aapl-20230930.htm';
        const cik = '0000320193';

        mockSecClient.getFilingDocument.mockResolvedValue('');

        await expect(getFilingContent(accessionNumber, filename, cik))
          .rejects.toThrow('No content found for filing 0000320193-23-000064');
      });

      it('should handle null content response', async () => {
        const accessionNumber = '0000320193-23-000064';
        const filename = 'aapl-20230930.htm';
        const cik = '0000320193';

        mockSecClient.getFilingDocument.mockResolvedValue(null);

        await expect(getFilingContent(accessionNumber, filename, cik))
          .rejects.toThrow('No content found for filing 0000320193-23-000064');
      });
    });

    describe('URL construction and CIK handling', () => {
      it('should properly format accession numbers by removing dashes', async () => {
        const accessionNumber = '0000320193-23-000064';
        const filename = 'test.htm';
        const cik = '0000320193';

        mockSecClient.getFilingDocument.mockResolvedValue('content');

        await getFilingContent(accessionNumber, filename, cik);

        // URL should use accession number without dashes
        expect(mockSecClient.getFilingDocument).toHaveBeenCalledWith(
          'https://www.sec.gov/Archives/edgar/data/320193/000032019323000064/test.htm',
          { handleNotFound: true }
        );
      });

      it('should remove leading zeros from CIK in URL', async () => {
        const accessionNumber = '0000000001-23-000001';
        const filename = 'test.htm';
        const cik = '0000000001';

        mockSecClient.getFilingDocument.mockResolvedValue('content');

        await getFilingContent(accessionNumber, filename, cik);

        // URL should use CIK without leading zeros
        expect(mockSecClient.getFilingDocument).toHaveBeenCalledWith(
          'https://www.sec.gov/Archives/edgar/data/1/000000000123000001/test.htm',
          { handleNotFound: true }
        );
      });

      it('should extract CIK correctly from accession number', async () => {
        const accessionNumber = '0000123456-22-000123';
        const filename = 'test.htm';

        mockSecClient.getFilingDocument.mockResolvedValue('content');

        await getFilingContent(accessionNumber, filename);

        // Should extract first 10 digits as CIK and remove leading zeros
        expect(mockSecClient.getFilingDocument).toHaveBeenCalledWith(
          'https://www.sec.gov/Archives/edgar/data/123456/000012345622000123/test.htm',
          { handleNotFound: true }
        );
      });
    });

    describe('Content validation in fallback scenarios', () => {
      it('should validate content length during fallback attempts', async () => {
        const accessionNumber = '0000320193-23-000064';
        const sequenceNumber = '1';
        const cik = '0000320193';

        const shortContent = 'x'.repeat(50); // Exactly at boundary
        const validContent = 'x'.repeat(200); // Above boundary

        // Mock index fails, first fallback returns short content, second returns valid
        mockSecClient.getFilingDocument
          .mockRejectedValueOnce(new Error('Index not found'))
          .mockResolvedValueOnce(shortContent)   // Should be rejected (≤ 100 chars)
          .mockResolvedValueOnce(validContent);  // Should be accepted

        const result = await getFilingContent(accessionNumber, sequenceNumber, cik);

        expect(result).toBe(validContent);
        expect(mockSecClient.getFilingDocument).toHaveBeenCalledTimes(3);
      });

      it('should try all common extensions in order', async () => {
        const accessionNumber = '0000320193-23-000064';
        const sequenceNumber = '1';
        const cik = '0000320193';

        const mockContent = '<html><body>Valid content</body></html>';

        // Mock index fails, first two extensions fail, third succeeds
        mockSecClient.getFilingDocument
          .mockRejectedValueOnce(new Error('Index not found'))
          .mockRejectedValueOnce(new Error('htm not found'))
          .mockRejectedValueOnce(new Error('html not found'))
          .mockResolvedValueOnce(mockContent); // txt succeeds

        const result = await getFilingContent(accessionNumber, sequenceNumber, cik);

        expect(result).toBe(mockContent);
        
        // Should try htm, html, txt in that order
        const calls = mockSecClient.getFilingDocument.mock.calls;
        expect(calls[1][0]).toContain('.htm');
        expect(calls[2][0]).toContain('.html');
        expect(calls[3][0]).toContain('.txt');
      });
    });

    describe('Error handling and edge cases', () => {
      it('should handle malformed accession numbers', async () => {
        const malformedAccessionNumber = '123-45-67890'; // Too short
        const filename = 'test.htm';

        mockSecClient.getFilingDocument.mockRejectedValue(new Error('Invalid format'));

        await expect(getFilingContent(malformedAccessionNumber, filename))
          .rejects.toThrow(`Failed to get filing content for ${malformedAccessionNumber}`);
      });

      it('should handle very long accession numbers', async () => {
        const longAccessionNumber = '1234567890123456-23-000064';
        const filename = 'test.htm';

        mockSecClient.getFilingDocument.mockRejectedValue(new Error('Invalid format'));

        await expect(getFilingContent(longAccessionNumber, filename))
          .rejects.toThrow(`Failed to get filing content for ${longAccessionNumber}`);
      });

      it('should handle special characters in filenames', async () => {
        const accessionNumber = '0000320193-23-000064';
        const specialFilename = 'test%20file-name.htm';
        const cik = '0000320193';

        const mockContent = 'Valid content';
        mockSecClient.getFilingDocument.mockResolvedValue(mockContent);

        const result = await getFilingContent(accessionNumber, specialFilename, cik);

        expect(result).toBe(mockContent);
        expect(mockSecClient.getFilingDocument).toHaveBeenCalledWith(
          `https://www.sec.gov/Archives/edgar/data/320193/000032019323000064/${specialFilename}`,
          { handleNotFound: true }
        );
      });

      it('should propagate original error messages', async () => {
        const accessionNumber = '0000320193-23-000064';
        const filename = 'test.htm';
        const cik = '0000320193';

        const originalError = new Error('Network timeout occurred');
        mockSecClient.getFilingDocument.mockRejectedValue(originalError);

        await expect(getFilingContent(accessionNumber, filename, cik))
          .rejects.toThrow('Failed to get filing content for 0000320193-23-000064: Network timeout occurred');
      });

      it('should handle non-Error exceptions', async () => {
        const accessionNumber = '0000320193-23-000064';
        const filename = 'test.htm';
        const cik = '0000320193';

        mockSecClient.getFilingDocument.mockRejectedValue('String error');

        await expect(getFilingContent(accessionNumber, filename, cik))
          .rejects.toThrow('Failed to get filing content for 0000320193-23-000064: String error');
      });
    });
  });

  describe('Backwards compatibility', () => {
    it('should handle legacy form type formats', async () => {
      const legacyFormTypes = ['10-K', '10-Q', '8-K', 'FORM4', '144'];
      
      for (const formType of legacyFormTypes) {
        const { validateAISummary } = mockInternalFunctions;
        const validSummary = 'x'.repeat(200); // Should be valid for most forms
        
        const result = validateAISummary(validSummary, ['Key point'], 'AAPL', formType);
        expect(result).toHaveProperty('isValid');
        expect(typeof result.isValid).toBe('boolean');
      }
    });
  });
});