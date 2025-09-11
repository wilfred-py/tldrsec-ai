import { jest } from '@jest/globals';

// Test helper that replicates the internal validation logic
// Since the actual functions are not exported, we test the logic through integration
// and also provide direct unit tests for the validation logic itself

const CONTENT_VALIDATION_RULES = {
  minBytes: 50,
  maxBytes: 100000000
};

/**
 * Test implementation of validateContentForProcessing logic
 */
function testValidateContentForProcessing(content: string, ticker: string, formType: string) {
  const contentLength = content?.length || 0;
  
  if (contentLength === 0) {
    return {
      isValid: false,
      reason: 'Content is empty (contentLength: 0)',
      contentLength: 0
    };
  }
  
  if (contentLength < CONTENT_VALIDATION_RULES.minBytes) {
    return {
      isValid: false,
      reason: `Content too short (${contentLength} bytes, minimum ${CONTENT_VALIDATION_RULES.minBytes} required)`,
      contentLength
    };
  }
  
  if (contentLength > CONTENT_VALIDATION_RULES.maxBytes) {
    return {
      isValid: false,
      reason: `Content too large (${contentLength} bytes, maximum ${CONTENT_VALIDATION_RULES.maxBytes} allowed)`,
      contentLength
    };
  }
  
  const htmlIndicators = ['<html', '<body', '<div', '<table', '<p>', '<br>', '<span', '<td>', '<tr>'];
  const xmlIndicators = ['<?xml', '<xbrl', '<us-gaap:', '<dei:', '<document>'];
  const formIndicators = ['SEC FORM', 'FORM ', formType.toUpperCase(), 'SECURITIES AND EXCHANGE COMMISSION'];
  const textIndicators = ['UNITED STATES', 'WASHINGTON', 'COMMISSION FILE NUMBER'];
  
  const lowerContent = content.toLowerCase().substring(0, 10000);
  const hasHtmlIndicators = htmlIndicators.some(indicator => lowerContent.includes(indicator.toLowerCase()));
  const hasXmlIndicators = xmlIndicators.some(indicator => lowerContent.includes(indicator.toLowerCase()));
  const hasFormIndicators = formIndicators.some(indicator => lowerContent.includes(indicator.toLowerCase()));
  const hasTextIndicators = textIndicators.some(indicator => lowerContent.includes(indicator.toLowerCase()));
  
  if (!hasHtmlIndicators && !hasXmlIndicators && !hasFormIndicators && !hasTextIndicators) {
    return {
      isValid: false,
      reason: 'Content does not appear to be a valid SEC filing (no recognizable filing indicators found)',
      contentLength
    };
  }
  
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
  
  return {
    isValid: true,
    contentLength
  };
}

/**
 * Test implementation of validateAISummary logic
 */
function testValidateAISummary(summaryText: string, keyPoints: string[], ticker: string, formType: string) {
  const suggestions: string[] = [];
  
  if (!summaryText || summaryText.trim().length === 0) {
    return {
      isValid: false,
      reason: 'Summary text is empty or only whitespace'
    };
  }
  
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
  const hasTruncationIndicators = truncationIndicators.some(indicator => lowerSummary.includes(indicator.toLowerCase()));
  if (hasTruncationIndicators) {
    return {
      isValid: false,
      reason: 'Summary appears to be truncated or incomplete'
    };
  }
  
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
  
  if (!keyPoints || keyPoints.length === 0) {
    suggestions.push('No key points provided - consider regenerating with key points extraction');
  } else if (keyPoints.length === 1 && keyPoints[0].trim().length < 20) {
    suggestions.push('Key points appear too brief or generic');
  }
  
  if (formType.toUpperCase().includes('10-K') || formType.toUpperCase().includes('10-Q')) {
    if (!lowerSummary.includes('financial') && !lowerSummary.includes('revenue') && !lowerSummary.includes('earnings')) {
      suggestions.push('Financial filing summary lacks financial terminology - may need regeneration');
    }
  }
  
  if (!lowerSummary.includes(ticker.toLowerCase()) && ticker.length > 1) {
    suggestions.push(`Summary does not mention ticker ${ticker} - verify relevance`);
  }
  
  return {
    isValid: true,
    suggestions: suggestions.length > 0 ? suggestions : undefined
  };
}

describe('Content Validation Functions - Unit Tests', () => {
  describe('validateContentForProcessing', () => {
    describe('Empty content validation', () => {
      it('should reject empty content', () => {
        const result = testValidateContentForProcessing('', 'AAPL', '10-K');
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('Content is empty (contentLength: 0)');
        expect(result.contentLength).toBe(0);
      });

      it('should reject null content', () => {
        const result = testValidateContentForProcessing(null as any, 'AAPL', '10-K');
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('Content is empty (contentLength: 0)');
        expect(result.contentLength).toBe(0);
      });

      it('should reject undefined content', () => {
        const result = testValidateContentForProcessing(undefined as any, 'AAPL', '10-K');
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('Content is empty (contentLength: 0)');
        expect(result.contentLength).toBe(0);
      });
    });

    describe('Content size validation', () => {
      it('should reject content below minimum size', () => {
        const shortContent = 'Too short';
        const result = testValidateContentForProcessing(shortContent, 'AAPL', '10-K');
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('Content too short (9 bytes, minimum 50 required)');
        expect(result.contentLength).toBe(9);
      });

      it('should reject content above maximum size', () => {
        const maxSize = 100000000;
        const largeContent = 'x'.repeat(maxSize + 1);
        const result = testValidateContentForProcessing(largeContent, 'AAPL', '10-K');
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe(`Content too large (${maxSize + 1} bytes, maximum ${maxSize} allowed)`);
        expect(result.contentLength).toBe(maxSize + 1);
      });

      it('should accept content at minimum boundary', () => {
        const minContent = '<html><body>SEC FORM 10-K for AAPL filing content</body></html>';
        const result = testValidateContentForProcessing(minContent, 'AAPL', '10-K');
        expect(result.isValid).toBe(true);
        expect(result.contentLength).toBe(minContent.length);
      });

      it('should accept content at reasonable size', () => {
        const content = '<html><body>SEC FORM 10-K ' + 'x'.repeat(1000) + '</body></html>';
        const result = testValidateContentForProcessing(content, 'AAPL', '10-K');
        expect(result.isValid).toBe(true);
        expect(result.contentLength).toBe(content.length);
      });
    });

    describe('Content format validation', () => {
      it('should validate HTML filing formats', () => {
        const htmlContent = '<html><head><title>SEC FORM 10-K</title></head><body><div>AAPL quarterly report content</div></body></html>';
        const result = testValidateContentForProcessing(htmlContent, 'AAPL', '10-K');
        expect(result.isValid).toBe(true);
      });

      it('should validate XML filing formats', () => {
        const xmlContent = `<?xml version="1.0"?>
          <xbrl xmlns:us-gaap="http://fasb.org/us-gaap/2023" xmlns:dei="http://xbrl.sec.gov/dei/2023">
            <us-gaap:DocumentType>10-K</us-gaap:DocumentType>
            <dei:EntityRegistrantName>Apple Inc.</dei:EntityRegistrantName>
          </xbrl>`;
        const result = testValidateContentForProcessing(xmlContent, 'AAPL', '10-K');
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
        const result = testValidateContentForProcessing(textContent, 'AAPL', '10-K');
        expect(result.isValid).toBe(true);
      });

      it('should reject content without valid filing indicators', () => {
        const invalidContent = 'This is just random text without any filing indicators or format markers that would suggest it is an SEC filing document';
        const result = testValidateContentForProcessing(invalidContent, 'AAPL', '10-K');
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('Content does not appear to be a valid SEC filing (no recognizable filing indicators found)');
      });

      it('should accept content with case-insensitive indicators', () => {
        const mixedCaseContent = '<HTML><BODY>sec form 10-k filing for apple inc.</BODY></HTML>';
        const result = testValidateContentForProcessing(mixedCaseContent, 'AAPL', '10-K');
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
          const result = testValidateContentForProcessing(contentWithError, 'AAPL', '10-K');
          expect(result.isValid).toBe(false);
          expect(result.reason).toBe('Content contains error indicators suggesting document retrieval failure');
        });

        it(`should detect error indicator case-insensitively: "${errorIndicator.toUpperCase()}"`, () => {
          const contentWithError = `<html><body>SEC FORM 10-K ${errorIndicator.toUpperCase()} for AAPL</body></html>`;
          const result = testValidateContentForProcessing(contentWithError, 'AAPL', '10-K');
          expect(result.isValid).toBe(false);
          expect(result.reason).toBe('Content contains error indicators suggesting document retrieval failure');
        });
      });

      it('should accept valid content without error indicators', () => {
        const validContent = `<html><body><h1>SEC FORM 10-K</h1><p>Apple Inc. annual report for fiscal year 2023. This document contains financial statements and business operations details.</p></body></html>`;
        const result = testValidateContentForProcessing(validContent, 'AAPL', '10-K');
        expect(result.isValid).toBe(true);
      });
    });

    describe('Form type specific validation', () => {
      const formTypes = ['10-K', '10-Q', '8-K', 'FORM4', '144', 'DEFA14A'];

      formTypes.forEach((formType) => {
        it(`should validate content for ${formType} filings`, () => {
          const formSpecificContent = `<html><body>SEC FORM ${formType} filing content for AAPL with proper structure</body></html>`;
          const result = testValidateContentForProcessing(formSpecificContent, 'AAPL', formType);
          expect(result.isValid).toBe(true);
        });
      });

      it('should handle unknown form types', () => {
        const unknownFormContent = `<html><body>SECURITIES AND EXCHANGE COMMISSION filing content for AAPL</body></html>`;
        const result = testValidateContentForProcessing(unknownFormContent, 'AAPL', 'UNKNOWN-FORM');
        expect(result.isValid).toBe(true);
      });
    });

    describe('Edge cases and boundary conditions', () => {
      it('should handle very long form types', () => {
        const longFormType = 'A'.repeat(100);
        const content = `<html><body>SEC FORM content for testing</body></html>`;
        const result = testValidateContentForProcessing(content, 'AAPL', longFormType);
        expect(result.isValid).toBe(true);
      });

      it('should handle special characters in ticker and form type', () => {
        const content = '<html><body>SEC FORM 10-K filing content</body></html>';
        const result = testValidateContentForProcessing(content, 'BRK.A', '10-K/A');
        expect(result.isValid).toBe(true);
      });

      it('should scan only first 10KB for indicators', () => {
        const indicator = '<html>';
        const largePrefix = 'x'.repeat(15000);
        const contentWithLateIndicator = largePrefix + indicator + 'SEC FORM 10-K';
        const result = testValidateContentForProcessing(contentWithLateIndicator, 'AAPL', '10-K');
        expect(result.isValid).toBe(false);
      });
    });
  });

  describe('validateAISummary', () => {
    describe('Basic content validation', () => {
      it('should reject empty summary text', () => {
        const result = testValidateAISummary('', ['key point'], 'AAPL', '10-K');
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('Summary text is empty or only whitespace');
      });

      it('should reject whitespace-only summary', () => {
        const result = testValidateAISummary('   \n\t   ', ['key point'], 'AAPL', '10-K');
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('Summary text is empty or only whitespace');
      });

      it('should reject null summary text', () => {
        const result = testValidateAISummary(null as any, ['key point'], 'AAPL', '10-K');
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('Summary text is empty or only whitespace');
      });

      it('should reject undefined summary text', () => {
        const result = testValidateAISummary(undefined as any, ['key point'], 'AAPL', '10-K');
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
        { formType: 'UNKNOWN', minLength: 50 }
      ];

      formTypeLengths.forEach(({ formType, minLength }) => {
        it(`should enforce minimum length of ${minLength} for ${formType}`, () => {
          const shortSummary = 'x'.repeat(minLength - 1);
          const result = testValidateAISummary(shortSummary, ['key point'], 'AAPL', formType);
          expect(result.isValid).toBe(false);
          expect(result.reason).toBe(`Summary too brief for ${formType} (${minLength - 1} chars, minimum ${minLength} required)`);
        });

        it(`should accept summary at minimum length for ${formType}`, () => {
          const minLengthSummary = 'x'.repeat(minLength);
          const result = testValidateAISummary(minLengthSummary, ['key point'], 'AAPL', formType);
          expect(result.isValid).toBe(true);
        });
      });

      it('should handle case-insensitive form type matching', () => {
        const summary = 'x'.repeat(200);
        const result = testValidateAISummary(summary, ['key point'], 'AAPL', '10-k');
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('Summary too brief for 10-k (200 chars, minimum 300 required)');
      });
    });

    describe('Truncation and placeholder detection', () => {
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
          const summaryWithTruncation = `This is a valid summary that meets minimum length requirements for 8-K filing and contains ${indicator} at the end.`;
          const result = testValidateAISummary(summaryWithTruncation, ['key point'], 'AAPL', '8-K');
          expect(result.isValid).toBe(false);
          expect(result.reason).toBe('Summary appears to be truncated or incomplete');
        });
      });

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
          const result = testValidateAISummary(summaryWithPlaceholder, ['key point'], 'AAPL', '8-K');
          expect(result.isValid).toBe(false);
          expect(result.reason).toBe('Summary contains placeholder or error content instead of actual analysis');
        });
      });
    });

    describe('Key points and suggestions', () => {
      it('should suggest improvement when no key points provided', () => {
        const summary = 'Apple Inc. (AAPL) valid summary that meets all minimum length requirements and contains relevant content.';
        const result = testValidateAISummary(summary, [], 'AAPL', '8-K');
        expect(result.isValid).toBe(true);
        expect(result.suggestions).toContain('No key points provided - consider regenerating with key points extraction');
      });

      it('should suggest improvement when key points are too brief', () => {
        const summary = 'Apple Inc. (AAPL) valid summary that meets all minimum length requirements and contains relevant content.';
        const result = testValidateAISummary(summary, ['Short'], 'AAPL', '8-K');
        expect(result.isValid).toBe(true);
        expect(result.suggestions).toContain('Key points appear too brief or generic');
      });

      it('should accept well-formed key points', () => {
        const summary = 'Apple Inc. (AAPL) valid summary that meets all minimum length requirements and contains relevant content.';
        const keyPoints = ['Detailed key point about quarterly earnings performance', 'Another substantive point about business operations'];
        const result = testValidateAISummary(summary, keyPoints, 'AAPL', '8-K');
        expect(result.isValid).toBe(true);
        expect(result.suggestions).toBeUndefined();
      });
    });

    describe('Form-specific content validation', () => {
      it('should suggest financial terminology for 10-K filings without financial terms', () => {
        const summary = 'Apple Inc. (AAPL) filing discusses general company matters and strategic initiatives without specific business data or metrics.'.repeat(4);
        const result = testValidateAISummary(summary, ['General point with proper length'], 'AAPL', '10-K');
        expect(result.isValid).toBe(true);
        expect(result.suggestions).toBeDefined();
        expect(result.suggestions).toContain('Financial filing summary lacks financial terminology - may need regeneration');
      });

      it('should accept 10-K filings with financial terminology', () => {
        const summary = 'Apple Inc. (AAPL) quarterly filing shows strong revenue growth and improved earnings compared to last quarter, with financial performance exceeding expectations.'.repeat(2);
        const result = testValidateAISummary(summary, ['Revenue increased 15%'], 'AAPL', '10-K');
        expect(result.isValid).toBe(true);
        expect(result.suggestions).toBeUndefined();
      });

      it('should not require financial terminology for 8-K filings', () => {
        const summary = 'This current report announces a new board member appointment and strategic partnership agreement with no financial details.';
        const result = testValidateAISummary(summary, ['New board member'], 'AAPL', '8-K');
        expect(result.isValid).toBe(true);
        expect(result.suggestions?.filter(s => s.includes('financial terminology'))).toHaveLength(0);
      });
    });

    describe('Ticker relevance validation', () => {
      it('should suggest ticker verification when ticker not mentioned', () => {
        const summary = 'This company filing discusses quarterly performance and strategic initiatives for the technology sector.';
        const result = testValidateAISummary(summary, ['Performance update'], 'AAPL', '8-K');
        expect(result.isValid).toBe(true);
        expect(result.suggestions).toContain('Summary does not mention ticker AAPL - verify relevance');
      });

      it('should accept summary mentioning ticker', () => {
        const summary = 'Apple Inc. (AAPL) quarterly filing discusses strong performance and strategic initiatives for the technology sector.';
        const result = testValidateAISummary(summary, ['Performance update'], 'AAPL', '8-K');
        expect(result.isValid).toBe(true);
        expect(result.suggestions?.filter(s => s.includes('ticker AAPL'))).toHaveLength(0);
      });

      it('should skip ticker check for single character tickers', () => {
        const summary = 'This company filing discusses quarterly performance without mentioning the ticker symbol in this filing.';
        const result = testValidateAISummary(summary, ['Performance update with detail'], 'F', '8-K');
        expect(result.isValid).toBe(true);
        expect(result.suggestions?.filter(s => s.includes('ticker F')) || []).toHaveLength(0);
      });
    });

    describe('Edge cases and comprehensive scenarios', () => {
      it('should handle very long summaries', () => {
        const longSummary = 'Valid summary content. '.repeat(2500);
        const result = testValidateAISummary(longSummary, ['Valid key point'], 'AAPL', '10-K');
        expect(result.isValid).toBe(true);
      });

      it('should accumulate multiple suggestions for valid summary with quality issues', () => {
        const summary = 'This is a long enough summary that meets minimum length requirements for 8-K filings but has some quality issues that could be improved through additional processing.';
        const result = testValidateAISummary(summary, [], 'NFLX', '8-K');
        expect(result.isValid).toBe(true);
        expect(result.suggestions).toEqual([
          'No key points provided - consider regenerating with key points extraction',
          'Summary does not mention ticker NFLX - verify relevance'
        ]);
      });

      it('should return undefined suggestions when no issues found', () => {
        const summary = 'Netflix Inc. (NFLX) current report discusses strong quarterly performance with significant revenue growth and earnings improvements.';
        const keyPoints = ['Revenue increased significantly', 'Subscriber growth exceeded expectations'];
        const result = testValidateAISummary(summary, keyPoints, 'NFLX', '8-K');
        expect(result.isValid).toBe(true);
        expect(result.suggestions).toBeUndefined();
      });
    });
  });
});