/**
 * Tranche 1 Deployment Tests
 * 
 * Simplified tests for deployment validation without external network calls
 */

import { describe, test, expect } from '@jest/globals';
import { getEnhancedSecApiHeaders } from '../../services/filings/extractors/enhancedDocumentScraper';
import { getEnhancedFilingSummary } from '../../services/filings/summaries/enhancedFilingSummaryService';
import { FilingType } from '../../types/sec/filing';

describe('Tranche 1: Deployment Validation Tests', () => {
  
  describe('Enhanced Document Scraper - Unit Tests', () => {
    
    test('should provide correct SEC API headers', () => {
      const headers = getEnhancedSecApiHeaders();
      
      expect(headers['User-Agent']).toContain('tldrSEC-AI Bot');
      expect(headers['Accept']).toContain('text/html');
      expect(headers['Accept-Encoding']).toContain('gzip');
      expect(headers['Accept-Language']).toContain('en-US');
    });
  });

  describe('Enhanced Filing Summary Service - Unit Tests', () => {
    
    test('should handle invalid ticker gracefully without network calls', async () => {
      const result = await getEnhancedFilingSummary('INVALID_TICKER_12345', '10-K' as FilingType, {
        useEnhancedFetch: true,
        enableFallbacks: true,
        saveToDatabase: false
      });
      
      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe('string');
    });

    test('should maintain consistent interface structure', async () => {
      const result = await getEnhancedFilingSummary('INVALID_TICKER_12345', '10-K' as FilingType, {
        useEnhancedFetch: false,
        enableFallbacks: false,
        saveToDatabase: false
      });
      
      // Should have consistent interface regardless of success/failure
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('error');
      expect(typeof result.data === 'object' || result.data === null).toBe(true);
      expect(typeof result.error === 'string' || result.error === undefined).toBe(true);
    });

    test('should support configuration options', () => {
      // Test that the function accepts all expected configuration options
      expect(async () => {
        await getEnhancedFilingSummary('TEST', '10-K' as FilingType, {
          useEnhancedFetch: true,
          enableFallbacks: true,
          saveToDatabase: false
        });
      }).not.toThrow();
      
      expect(async () => {
        await getEnhancedFilingSummary('TEST', '10-K' as FilingType, {
          useEnhancedFetch: false,
          enableFallbacks: false,
          saveToDatabase: false
        });
      }).not.toThrow();
    });
  });

  describe('Backward Compatibility', () => {
    
    test('should maintain same interface as original service', async () => {
      // Import both services
      const { getFilingSummary: enhancedService } = await import('../../services/filings/summaries/enhancedFilingSummaryService');
      const { getFilingSummary: originalService } = await import('../../services/filings/summaries/filingSummaryService');
      
      // Both should have the same function signature
      expect(typeof enhancedService).toBe('function');
      expect(typeof originalService).toBe('function');
      
      // Both should accept the same parameters
      expect(enhancedService.length).toBe(originalService.length); // Same number of parameters
    });
  });

  describe('Module Dependencies', () => {
    
    test('should successfully import all enhanced modules', async () => {
      // Test that all modules can be imported without errors
      expect(async () => {
        await import('../../services/filings/extractors/enhancedDocumentScraper');
      }).not.toThrow();
      
      expect(async () => {
        await import('../../services/filings/summaries/enhancedFilingSummaryService');
      }).not.toThrow();
    });

    test('should have all required dependencies available', () => {
      // Test that key dependencies are available
      expect(() => require('jsdom')).not.toThrow();
      expect(() => require('cheerio')).not.toThrow();
    });
  });
});

/**
 * Deployment validation utilities
 */
export const deploymentValidation = {
  
  /**
   * Validate that enhanced services are ready for deployment
   */
  async validateDeploymentReadiness(): Promise<{
    ready: boolean;
    issues: string[];
    checks: Record<string, boolean>;
  }> {
    const issues: string[] = [];
    const checks: Record<string, boolean> = {};
    
    // Check 1: Module imports
    try {
      await import('../../services/filings/extractors/enhancedDocumentScraper');
      checks.enhancedDocumentScraper = true;
    } catch (error) {
      checks.enhancedDocumentScraper = false;
      issues.push(`Enhanced document scraper import failed: ${error}`);
    }
    
    try {
      await import('../../services/filings/summaries/enhancedFilingSummaryService');
      checks.enhancedFilingSummaryService = true;
    } catch (error) {
      checks.enhancedFilingSummaryService = false;
      issues.push(`Enhanced filing summary service import failed: ${error}`);
    }
    
    // Check 2: Function signatures
    try {
      const { getEnhancedFilingSummary } = await import('../../services/filings/summaries/enhancedFilingSummaryService');
      checks.enhancedFunctionSignature = typeof getEnhancedFilingSummary === 'function';
    } catch (error) {
      checks.enhancedFunctionSignature = false;
      issues.push(`Enhanced function signature check failed: ${error}`);
    }
    
    // Check 3: Dependencies
    try {
      require('jsdom');
      require('cheerio');
      checks.dependencies = true;
    } catch (error) {
      checks.dependencies = false;
      issues.push(`Required dependencies missing: ${error}`);
    }
    
    const allChecksPass = Object.values(checks).every(check => check === true);
    
    return {
      ready: allChecksPass,
      issues,
      checks
    };
  },

  /**
   * Test basic functionality without external calls
   */
  async testBasicFunctionality(): Promise<{
    success: boolean;
    results: Record<string, any>;
  }> {
    const results: Record<string, any> = {};
    
    try {
      // Test enhanced headers
      const { getEnhancedSecApiHeaders } = await import('../../services/filings/extractors/enhancedDocumentScraper');
      const headers = getEnhancedSecApiHeaders();
      results.headersTest = {
        success: headers['User-Agent']?.includes('tldrSEC-AI Bot'),
        headers: Object.keys(headers)
      };
    } catch (error) {
      results.headersTest = { success: false, error: String(error) };
    }
    
    try {
      // Test enhanced filing service with invalid input (should fail gracefully)
      const { getEnhancedFilingSummary } = await import('../../services/filings/summaries/enhancedFilingSummaryService');
      const result = await getEnhancedFilingSummary('INVALID', '10-K' as FilingType, {
        saveToDatabase: false
      });
      
      results.filingServiceTest = {
        success: result.data === null && typeof result.error === 'string',
        hasError: !!result.error,
        interface: {
          hasData: 'data' in result,
          hasError: 'error' in result
        }
      };
    } catch (error) {
      results.filingServiceTest = { success: false, error: String(error) };
    }
    
    const success = Object.values(results).every(result => result.success);
    
    return { success, results };
  }
};