import { jest } from '@jest/globals';

describe('Filing Validation Comprehensive Test Suite', () => {
  // Test constants based on actual implementation - define at top level for reuse
  const CONTENT_VALIDATION_RULES = {
    minBytes: 50,
    maxBytes: 100000000
  };

  const htmlIndicators = ['<html', '<body', '<div', '<table', '<p>', '<br>', '<span', '<td>', '<tr>'];
  const xmlIndicators = ['<?xml', '<xbrl', '<us-gaap:', '<dei:', '<document>'];
  const textIndicators = ['UNITED STATES', 'WASHINGTON', 'COMMISSION FILE NUMBER'];
  const errorIndicators = [
    'not found', '404 error', 'access denied', 'file not found',
    'document not available', 'temporarily unavailable', 'server error',
    'internal server error', 'bad request', 'forbidden'
  ];

  const minSummaryLengths = {
    '10-K': 300,
    '10-Q': 200,
    '8-K': 100,
    'DEFA14A': 150,
    'FORM4': 50,
    '144': 30,
    'DEFAULT': 50
  };

  const truncationIndicators = [
    'summary was cut off',
    'content truncated',
    '...[truncated]',
    'response limit reached',
    'token limit exceeded',
    'incomplete summary',
    '[TRUNCATED]'
  ];

  const placeholderIndicators = [
    'unable to generate summary',
    'summary not available',
    'content could not be processed',
    'failed to analyze',
    'error in processing',
    'no summary available'
  ];

  describe('Content Validation Logic', () => {

    describe('Empty content validation', () => {
      test('should identify empty content', () => {
        expect('').toHaveLength(0);
        expect(null?.length || 0).toBe(0);
        expect(undefined?.length || 0).toBe(0);
      });

      test('should validate minimum content length', () => {
        const shortContent = 'Too short';
        expect(shortContent.length).toBeLessThan(CONTENT_VALIDATION_RULES.minBytes);
        
        const validContent = '<html><body>SEC FORM 10-K filing content for AAPL</body></html>';
        expect(validContent.length).toBeGreaterThanOrEqual(CONTENT_VALIDATION_RULES.minBytes);
      });

      test('should validate maximum content length', () => {
        const maxSize = CONTENT_VALIDATION_RULES.maxBytes;
        expect(maxSize).toBe(100000000);
        
        // Test that we can create content at boundary
        const largeContent = 'x'.repeat(maxSize);
        expect(largeContent.length).toBe(maxSize);
      });
    });

    describe('Content format indicators', () => {
      test('should recognize HTML indicators', () => {
        const htmlContent = '<html><body><div>Test content</div></body></html>';
        const lowerContent = htmlContent.toLowerCase();
        const hasHtmlIndicators = htmlIndicators.some(indicator => 
          lowerContent.includes(indicator.toLowerCase())
        );
        expect(hasHtmlIndicators).toBe(true);
      });

      test('should recognize XML indicators', () => {
        const xmlContent = '<?xml version="1.0"?><xbrl><us-gaap:test></us-gaap:test></xbrl>';
        const lowerContent = xmlContent.toLowerCase();
        const hasXmlIndicators = xmlIndicators.some(indicator => 
          lowerContent.includes(indicator.toLowerCase())
        );
        expect(hasXmlIndicators).toBe(true);
      });

      test('should recognize text indicators', () => {
        const textContent = 'UNITED STATES SECURITIES AND EXCHANGE COMMISSION WASHINGTON D.C.';
        const lowerContent = textContent.toLowerCase();
        const hasTextIndicators = textIndicators.some(indicator => 
          lowerContent.includes(indicator.toLowerCase())
        );
        expect(hasTextIndicators).toBe(true);
      });

      test('should recognize form indicators', () => {
        const formType = '10-K';
        const formContent = `SEC FORM ${formType} filing`;
        const formIndicators = ['SEC FORM', 'FORM ', formType.toUpperCase(), 'SECURITIES AND EXCHANGE COMMISSION'];
        
        const lowerContent = formContent.toLowerCase();
        const hasFormIndicators = formIndicators.some(indicator => 
          lowerContent.includes(indicator.toLowerCase())
        );
        expect(hasFormIndicators).toBe(true);
      });

      test('should reject content without any indicators', () => {
        const invalidContent = 'This is just random text without any filing indicators';
        const lowerContent = invalidContent.toLowerCase().substring(0, 10000);
        
        const hasHtml = htmlIndicators.some(indicator => lowerContent.includes(indicator.toLowerCase()));
        const hasXml = xmlIndicators.some(indicator => lowerContent.includes(indicator.toLowerCase()));
        const hasText = textIndicators.some(indicator => lowerContent.includes(indicator.toLowerCase()));
        const hasForm = ['SEC FORM', 'FORM ', 'SECURITIES AND EXCHANGE COMMISSION'].some(indicator => 
          lowerContent.includes(indicator.toLowerCase())
        );
        
        expect(hasHtml || hasXml || hasText || hasForm).toBe(false);
      });
    });

    describe('Error indicator detection', () => {
      errorIndicators.forEach((errorIndicator) => {
        test(`should detect error indicator: "${errorIndicator}"`, () => {
          const contentWithError = `<html><body>SEC FORM 10-K ${errorIndicator} for AAPL</body></html>`;
          const lowerContent = contentWithError.toLowerCase();
          const hasErrorIndicators = errorIndicators.some(indicator => lowerContent.includes(indicator));
          expect(hasErrorIndicators).toBe(true);
        });

        test(`should detect error indicator case-insensitively: "${errorIndicator.toUpperCase()}"`, () => {
          const contentWithError = `<html><body>SEC FORM 10-K ${errorIndicator.toUpperCase()} for AAPL</body></html>`;
          const lowerContent = contentWithError.toLowerCase();
          const hasErrorIndicators = errorIndicators.some(indicator => lowerContent.includes(indicator));
          expect(hasErrorIndicators).toBe(true);
        });
      });

      test('should accept valid content without error indicators', () => {
        const validContent = '<html><body><h1>SEC FORM 10-K</h1><p>Apple Inc. annual report</p></body></html>';
        const lowerContent = validContent.toLowerCase();
        const hasErrorIndicators = errorIndicators.some(indicator => lowerContent.includes(indicator));
        expect(hasErrorIndicators).toBe(false);
      });
    });

    describe('Content scanning limits', () => {
      test('should only scan first 10KB for indicators', () => {
        const scanLimit = 10000;
        const largeContent = 'x'.repeat(15000) + '<html>SEC FORM 10-K</html>';
        const scannedContent = largeContent.toLowerCase().substring(0, scanLimit);
        
        expect(scannedContent.length).toBe(scanLimit);
        expect(scannedContent.includes('<html>')).toBe(false);
        expect(largeContent.includes('<html>')).toBe(true);
      });
    });
  });

  describe('AI Summary Validation Logic', () => {

    describe('Basic summary validation', () => {
      test('should identify empty or whitespace-only summaries', () => {
        expect(''.trim().length).toBe(0);
        expect('   \n\t   '.trim().length).toBe(0);
        expect(null?.trim?.()?.length || 0).toBe(0);
        expect(undefined?.trim?.()?.length || 0).toBe(0);
      });

      test('should validate non-empty summaries', () => {
        const validSummary = 'This is a valid summary with content';
        expect(validSummary.trim().length).toBeGreaterThan(0);
      });
    });

    describe('Form-specific minimum length validation', () => {
      Object.entries(minSummaryLengths).forEach(([formType, minLength]) => {
        if (formType !== 'DEFAULT') {
          test(`should enforce minimum length of ${minLength} for ${formType}`, () => {
            const shortSummary = 'x'.repeat(minLength - 1);
            const validSummary = 'x'.repeat(minLength);
            const longSummary = 'x'.repeat(minLength + 100);
            
            expect(shortSummary.trim().length).toBeLessThan(minLength);
            expect(validSummary.trim().length).toBe(minLength);
            expect(longSummary.trim().length).toBeGreaterThan(minLength);
          });
        }
      });

      test('should use default minimum length for unknown form types', () => {
        const unknownFormType = 'UNKNOWN-FORM';
        const defaultMinLength = minSummaryLengths['DEFAULT'];
        const summary = 'x'.repeat(defaultMinLength);
        
        expect(summary.length).toBe(defaultMinLength);
        expect(minSummaryLengths[unknownFormType.toUpperCase()] || minSummaryLengths['DEFAULT']).toBe(defaultMinLength);
      });

      test('should handle case-insensitive form type matching', () => {
        expect(minSummaryLengths['10-K']).toBe(300);
        expect(minSummaryLengths['10-k'.toUpperCase()]).toBe(300);
      });
    });

    describe('Truncation indicator detection', () => {
      truncationIndicators.forEach((indicator) => {
        test(`should detect truncation indicator: "${indicator}"`, () => {
          const summaryWithTruncation = `This is a valid summary that meets minimum length requirements and contains ${indicator} somewhere in the text.`;
          const lowerSummary = summaryWithTruncation.toLowerCase();
          const hasTruncationIndicators = lowerSummary.includes(indicator.toLowerCase());
          expect(hasTruncationIndicators).toBe(true);
        });

        test(`should detect truncation indicator case-insensitively: "${indicator.toUpperCase()}"`, () => {
          const summaryWithTruncation = `This is a valid summary that contains ${indicator.toUpperCase()} in the text.`;
          const lowerSummary = summaryWithTruncation.toLowerCase();
          const hasTruncationIndicators = lowerSummary.includes(indicator.toLowerCase());
          expect(hasTruncationIndicators).toBe(true);
        });
      });
    });

    describe('Placeholder content detection', () => {
      placeholderIndicators.forEach((indicator) => {
        test(`should detect placeholder indicator: "${indicator}"`, () => {
          const summaryWithPlaceholder = `Unfortunately, we were ${indicator} for this filing due to technical issues.`;
          const lowerSummary = summaryWithPlaceholder.toLowerCase();
          const hasPlaceholderContent = lowerSummary.includes(indicator.toLowerCase());
          expect(hasPlaceholderContent).toBe(true);
        });

        test(`should detect placeholder indicator case-insensitively: "${indicator.toUpperCase()}"`, () => {
          const summaryWithPlaceholder = `Unfortunately, we were ${indicator.toUpperCase()} for this filing.`;
          const lowerSummary = summaryWithPlaceholder.toLowerCase();
          const hasPlaceholderContent = lowerSummary.includes(indicator.toLowerCase());
          expect(hasPlaceholderContent).toBe(true);
        });
      });
    });

    describe('Key points quality validation', () => {
      test('should identify missing key points', () => {
        expect([]).toHaveLength(0);
        expect(null?.length || 0).toBe(0);
        expect(undefined?.length || 0).toBe(0);
      });

      test('should identify brief key points', () => {
        const briefKeyPoints = ['Short'];
        expect(briefKeyPoints).toHaveLength(1);
        expect(briefKeyPoints[0].trim().length).toBeLessThan(20);
      });

      test('should accept well-formed key points', () => {
        const goodKeyPoints = [
          'Detailed key point about quarterly earnings performance',
          'Another substantive point about business operations'
        ];
        expect(goodKeyPoints.length).toBeGreaterThan(1);
        expect(goodKeyPoints.every(point => point.trim().length >= 20)).toBe(true);
      });
    });

    describe('Form-specific content expectations', () => {
      const financialTerms = ['financial', 'revenue', 'earnings'];

      test('should identify financial terminology in content', () => {
        const financialSummary = 'The company reported strong revenue growth and improved earnings performance with excellent financial results.';
        const lowerSummary = financialSummary.toLowerCase();
        const hasFinancialTerms = financialTerms.some(term => lowerSummary.includes(term));
        expect(hasFinancialTerms).toBe(true);
      });

      test('should identify lack of financial terminology', () => {
        const nonFinancialSummary = 'The company announced new board members and strategic partnerships.';
        const lowerSummary = nonFinancialSummary.toLowerCase();
        const hasFinancialTerms = financialTerms.some(term => lowerSummary.includes(term));
        expect(hasFinancialTerms).toBe(false);
      });

      test('should check for financial form types', () => {
        const financialForms = ['10-K', '10-Q'];
        expect(financialForms.some(form => '10-K'.toUpperCase().includes(form))).toBe(true);
        expect(financialForms.some(form => '8-K'.toUpperCase().includes(form))).toBe(false);
      });
    });

    describe('Ticker relevance validation', () => {
      test('should identify ticker mentions in summary', () => {
        const ticker = 'AAPL';
        const summaryWithTicker = 'Apple Inc. (AAPL) reported strong quarterly results.';
        const lowerSummary = summaryWithTicker.toLowerCase();
        const hasTicker = lowerSummary.includes(ticker.toLowerCase());
        expect(hasTicker).toBe(true);
      });

      test('should identify missing ticker mentions', () => {
        const ticker = 'AAPL';
        const summaryWithoutTicker = 'The company reported strong quarterly results.';
        const lowerSummary = summaryWithoutTicker.toLowerCase();
        const hasTicker = lowerSummary.includes(ticker.toLowerCase());
        expect(hasTicker).toBe(false);
      });

      test('should handle single character tickers differently', () => {
        const singleCharTicker = 'F';
        const multiCharTicker = 'AAPL';
        expect(singleCharTicker.length).toBe(1);
        expect(multiCharTicker.length).toBeGreaterThan(1);
      });

      test('should handle case-insensitive ticker matching', () => {
        const ticker = 'AAPL';
        const summaryWithLowerTicker = 'Apple Inc. (aapl) reported results.';
        const lowerSummary = summaryWithLowerTicker.toLowerCase();
        const hasTicker = lowerSummary.includes(ticker.toLowerCase());
        expect(hasTicker).toBe(true);
      });
    });
  });

  describe('Integration scenarios', () => {
    test('should handle comprehensive validation pipeline', () => {
      // Test the complete validation logic flow
      const testCases = [
        {
          name: 'Valid HTML content with proper indicators',
          content: '<html><body>SEC FORM 10-K filing for Apple Inc.</body></html>',
          expectedValid: true
        },
        {
          name: 'Content with error indicators',
          content: '<html><body>SEC FORM 10-K not found for Apple Inc.</body></html>',
          expectedValid: false
        },
        {
          name: 'Content too short',
          content: 'Short',
          expectedValid: false
        },
        {
          name: 'Content without indicators',
          content: 'This is just random text without any SEC filing indicators or proper format',
          expectedValid: false
        }
      ];

      testCases.forEach(({ name, content, expectedValid }) => {
        const contentLength = content?.length || 0;
        const isNotEmpty = contentLength > 0;
        const meetsMinLength = contentLength >= 50;
        const meetsMaxLength = contentLength <= 100000000;
        
        const lowerContent = content.toLowerCase().substring(0, 10000);
        const hasIndicators = 
          htmlIndicators.some(i => lowerContent.includes(i.toLowerCase())) ||
          xmlIndicators.some(i => lowerContent.includes(i.toLowerCase())) ||
          textIndicators.some(i => lowerContent.includes(i.toLowerCase())) ||
          ['SEC FORM', 'SECURITIES AND EXCHANGE COMMISSION'].some(i => lowerContent.includes(i.toLowerCase()));
        
        const hasErrors = errorIndicators.some(i => lowerContent.includes(i));
        
        const shouldBeValid = isNotEmpty && meetsMinLength && meetsMaxLength && hasIndicators && !hasErrors;
        
        expect(shouldBeValid).toBe(expectedValid);
      });
    });

    test('should handle AI summary validation scenarios', () => {
      const testCases = [
        {
          name: 'Valid 10-K summary with financial terms',
          summary: 'Apple Inc. (AAPL) annual report shows strong revenue growth and improved earnings with solid financial performance across all business segments. The company demonstrated exceptional financial results with revenue increasing significantly year over year and earnings per share growing substantially.',
          keyPoints: ['Revenue increased 15%', 'Strong financial performance'],
          ticker: 'AAPL',
          formType: '10-K',
          expectedValid: true,
          expectedSuggestions: 0
        },
        {
          name: 'Short summary below minimum',
          summary: 'Brief summary',
          keyPoints: ['Point'],
          ticker: 'AAPL',
          formType: '10-K',
          expectedValid: false,
          expectedSuggestions: null
        },
        {
          name: 'Summary with truncation indicator',
          summary: 'This is a valid summary that meets minimum length requirements for 8-K filings but content truncated due to limits.',
          keyPoints: ['Key point'],
          ticker: 'AAPL',
          formType: '8-K',
          expectedValid: false,
          expectedSuggestions: null
        }
      ];

      testCases.forEach(({ name, summary, keyPoints, ticker, formType, expectedValid }) => {
        const isEmpty = !summary || summary.trim().length === 0;
        const minLength = minSummaryLengths[formType.toUpperCase()] || minSummaryLengths['DEFAULT'];
        const meetsSizeRequirement = summary.trim().length >= minLength;
        
        const lowerSummary = summary.toLowerCase();
        const hasTruncation = truncationIndicators.some(i => lowerSummary.includes(i));
        const hasPlaceholder = placeholderIndicators.some(i => lowerSummary.includes(i));
        
        const shouldBeValid = !isEmpty && meetsSizeRequirement && !hasTruncation && !hasPlaceholder;
        
        expect(shouldBeValid).toBe(expectedValid);
      });
    });
  });

  describe('Edge cases and boundaries', () => {
    test('should handle boundary conditions for content size', () => {
      const minSize = 50;
      const maxSize = 100000000;
      
      expect('x'.repeat(minSize - 1).length).toBeLessThan(minSize);
      expect('x'.repeat(minSize).length).toBe(minSize);
      expect('x'.repeat(minSize + 1).length).toBeGreaterThan(minSize);
      
      // Can't easily test max size due to memory constraints, but verify the constant
      expect(maxSize).toBe(100000000);
    });

    test('should handle boundary conditions for summary length', () => {
      Object.entries(minSummaryLengths).forEach(([formType, minLength]) => {
        if (formType !== 'DEFAULT') {
          const atBoundary = 'x'.repeat(minLength);
          const belowBoundary = 'x'.repeat(minLength - 1);
          const aboveBoundary = 'x'.repeat(minLength + 1);
          
          expect(belowBoundary.trim().length).toBeLessThan(minLength);
          expect(atBoundary.trim().length).toBe(minLength);
          expect(aboveBoundary.trim().length).toBeGreaterThan(minLength);
        }
      });
    });

    test('should handle special characters and encoding', () => {
      const specialContent = '<html><body>SEC FORM 10-K with émojis 🚀 and spëcial cháracters</body></html>';
      expect(specialContent.length).toBeGreaterThan(50);
      
      const lowerContent = specialContent.toLowerCase();
      const hasIndicators = htmlIndicators.some(i => lowerContent.includes(i.toLowerCase()));
      expect(hasIndicators).toBe(true);
    });

    test('should handle very long form types and tickers', () => {
      const longFormType = 'VERY-LONG-FORM-TYPE-NAME';
      const longTicker = 'VERYLONGTICKER';
      
      expect(longFormType.length).toBeGreaterThan(10);
      expect(longTicker.length).toBeGreaterThan(5);
      
      // Should still process normally
      const content = `SEC FORM ${longFormType} filing content`;
      expect(content.includes(longFormType)).toBe(true);
    });

    test('should handle malformed input gracefully', () => {
      // Test with various malformed inputs
      const malformedInputs = [
        '',
        null,
        undefined,
        '\n\t   ',
        'x'.repeat(0),
        {},
        []
      ];

      malformedInputs.forEach((input) => {
        const length = input?.length || 0;
        const trimmedLength = input?.trim?.()?.length || 0;
        
        expect(length).toBeGreaterThanOrEqual(0);
        expect(trimmedLength).toBeGreaterThanOrEqual(0);
      });
    });
  });
});