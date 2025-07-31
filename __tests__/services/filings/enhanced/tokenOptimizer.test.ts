/**
 * Unit tests for token optimization service
 * Addresses quality issue: zero unit test coverage for optimization algorithms
 */

import { jest } from '@jest/globals';
import {
  optimizeTokens,
  getOptimizationLevelForTier,
  validateOptimization,
  estimateTokenCount,
  type OptimizationLevel,
  type SubscriptionTier,
  type TokenOptimizationResult
} from '../../../../services/filings/enhanced/tokenOptimizer';

// Mock the external dependencies
jest.mock('../../../../lib/ai/claude-client', () => ({
  createClaude: jest.fn(() => ({
    messages: {
      create: jest.fn()
    }
  }))
}));

jest.mock('../../../../lib/ai/rateLimiter', () => ({
  conservativeRateLimiter: {
    executeRequest: jest.fn()
  }
}));

describe('TokenOptimizer', () => {
  const sampleSECContent = `
    UNITED STATES SECURITIES AND EXCHANGE COMMISSION
    Washington, D.C. 20549
    
    FORM 10-K
    ANNUAL REPORT PURSUANT TO SECTION 13 OR 15(d) OF THE SECURITIES EXCHANGE ACT OF 1934
    
    For the fiscal year ended December 31, 2023
    
    TESLA, INC.
    (Exact name of registrant as specified in its charter)
    
    ITEM 1. BUSINESS
    Tesla designs, develops, manufactures, and sells electric vehicles and energy generation and storage systems.
    
    ITEM 1A. RISK FACTORS
    Our business faces significant risks including supply chain disruptions, regulatory changes, and competition.
    
    ITEM 2. PROPERTIES
    We lease and own various properties for manufacturing, offices, and service centers.
    
    ITEM 7. MANAGEMENT'S DISCUSSION AND ANALYSIS
    Revenue for the year ended December 31, 2023 was $96.8 billion compared to $81.5 billion in 2022.
    Our gross profit increased to $19.3 billion from $16.8 billion in the prior year.
    Net income was $15.0 billion compared to $12.6 billion in 2022.
    
    FINANCIAL STATEMENTS
    CONSOLIDATED STATEMENTS OF OPERATIONS
    (In millions, except per share data)
    
                                    Year Ended December 31,
                               2023        2022        2021
    Revenues                  $96,773     $81,462     $53,823
    Cost of revenues          $79,113     $60,609     $40,217
    Gross profit              $17,660     $20,853     $13,606
  `;

  describe('estimateTokenCount', () => {
    it('should estimate token count accurately', () => {
      const text = 'This is a test string with multiple words.';
      const tokenCount = estimateTokenCount(text);
      
      // Rough estimate: ~1.3 tokens per word
      expect(tokenCount).toBeGreaterThan(5);
      expect(tokenCount).toBeLessThan(15);
    });

    it('should handle empty string', () => {
      const tokenCount = estimateTokenCount('');
      expect(tokenCount).toBe(0);
    });

    it('should handle special characters and numbers', () => {
      const text = 'Revenue: $96,773 million (2023) vs $81,462 million (2022)';
      const tokenCount = estimateTokenCount(text);
      expect(tokenCount).toBeGreaterThan(10);
    });
  });

  describe('getOptimizationLevelForTier', () => {
    it('should map subscription tiers to optimization levels correctly', () => {
      expect(getOptimizationLevelForTier('basic')).toBe('balanced');
      expect(getOptimizationLevelForTier('professional')).toBe('conservative');
      expect(getOptimizationLevelForTier('premium')).toBe('minimal');
      expect(getOptimizationLevelForTier('enterprise')).toBe('minimal');
    });

    it('should default to balanced for unknown tiers', () => {
      expect(getOptimizationLevelForTier('unknown' as SubscriptionTier)).toBe('balanced');
    });
  });

  describe('optimizeTokens', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should optimize content with minimal level', async () => {
      // Arrange
      const mockOptimizedContent = `
        TESLA, INC. FORM 10-K - KEY HIGHLIGHTS
        
        BUSINESS: Electric vehicles and energy storage systems
        
        FINANCIAL PERFORMANCE (2023):
        • Revenue: $96.8B (+18.8% YoY)
        • Gross Profit: $19.3B
        • Net Income: $15.0B
        
        KEY RISKS: Supply chain, regulatory, competition
      `;

      const { conservativeRateLimiter } = require('../../../../lib/ai/rateLimiter');
      conservativeRateLimiter.executeRequest.mockResolvedValue({
        content: [{ text: mockOptimizedContent }],
        usage: { input_tokens: 1000, output_tokens: 200 }
      });

      // Act
      const result = await optimizeTokens(sampleSECContent, {
        level: 'minimal',
        preserveFinancialData: true,
        preserveRiskFactors: true,
        preserveMDA: true
      });

      // Assert
      expect(result).toMatchObject({
        optimizationLevel: 'minimal',
        originalContent: sampleSECContent,
        optimizedContent: mockOptimizedContent,
        originalTokens: expect.any(Number),
        optimizedTokens: expect.any(Number),
        reductionPercentage: expect.any(Number),
        qualityScore: expect.any(Number),
        preservedSections: expect.arrayContaining(['financial_data', 'risk_factors', 'mda'])
      });

      expect(result.reductionPercentage).toBeGreaterThan(50);
      expect(result.qualityScore).toBeGreaterThan(0);
    });

    it('should handle conservative optimization level', async () => {
      // Arrange
      const mockOptimizedContent = `
        TESLA, INC. - ANNUAL REPORT 2023
        
        BUSINESS OVERVIEW
        Tesla designs, develops, manufactures, and sells electric vehicles and energy storage systems.
        
        FINANCIAL HIGHLIGHTS
        Revenue for 2023: $96.8 billion vs $81.5 billion (2022)
        Gross profit: $19.3 billion vs $16.8 billion (2022)  
        Net income: $15.0 billion vs $12.6 billion (2022)
        
        RISK FACTORS
        Supply chain disruptions, regulatory changes, competition
        
        CONSOLIDATED STATEMENTS OF OPERATIONS ($ millions)
                    2023      2022      2021
        Revenues   $96,773   $81,462   $53,823
        Gross      $17,660   $20,853   $13,606
      `;

      const { conservativeRateLimiter } = require('../../../../lib/ai/rateLimiter');
      conservativeRateLimiter.executeRequest.mockResolvedValue({
        content: [{ text: mockOptimizedContent }],
        usage: { input_tokens: 1000, output_tokens: 300 }
      });

      // Act
      const result = await optimizeTokens(sampleSECContent, {
        level: 'conservative',
        preserveFinancialData: true,
        preserveRiskFactors: true,
        preserveMDA: true
      });

      // Assert
      expect(result.optimizationLevel).toBe('conservative');
      expect(result.reductionPercentage).toBeLessThan(80); // Conservative should be less aggressive
      expect(result.optimizedTokens).toBeGreaterThan(result.originalTokens * 0.2); // At least 20% remaining
    });

    it('should handle balanced optimization level', async () => {
      // Arrange
      const mockOptimizedContent = sampleSECContent.substring(0, Math.floor(sampleSECContent.length * 0.4));
      
      const { conservativeRateLimiter } = require('../../../../lib/ai/rateLimiter');
      conservativeRateLimiter.executeRequest.mockResolvedValue({
        content: [{ text: mockOptimizedContent }],
        usage: { input_tokens: 1000, output_tokens: 400 }
      });

      // Act
      const result = await optimizeTokens(sampleSECContent, {
        level: 'balanced'
      });

      // Assert
      expect(result.optimizationLevel).toBe('balanced');
      expect(result.reductionPercentage).toBeGreaterThan(50);
      expect(result.reductionPercentage).toBeLessThan(90);
    });

    it('should handle aggressive optimization level', async () => {
      // Arrange
      const mockOptimizedContent = 'TESLA 2023: Rev $96.8B, Profit $15B, Risks: supply/regulatory/competition';
      
      const { conservativeRateLimiter } = require('../../../../lib/ai/rateLimiter');
      conservativeRateLimiter.executeRequest.mockResolvedValue({
        content: [{ text: mockOptimizedContent }],
        usage: { input_tokens: 1000, output_tokens: 50 }
      });

      // Act
      const result = await optimizeTokens(sampleSECContent, {
        level: 'aggressive'
      });

      // Assert
      expect(result.optimizationLevel).toBe('aggressive');
      expect(result.reductionPercentage).toBeGreaterThan(90);
      expect(result.optimizedTokens).toBeLessThan(result.originalTokens * 0.1);
    });

    it('should handle API errors gracefully', async () => {
      // Arrange
      const { conservativeRateLimiter } = require('../../../../lib/ai/rateLimiter');
      conservativeRateLimiter.executeRequest.mockRejectedValue(new Error('API rate limit exceeded'));

      // Act & Assert
      await expect(optimizeTokens(sampleSECContent, { level: 'balanced' }))
        .rejects.toThrow('API rate limit exceeded');
    });

    it('should validate input parameters', async () => {
      // Act & Assert
      await expect(optimizeTokens('', { level: 'balanced' }))
        .rejects.toThrow('Content cannot be empty');

      await expect(optimizeTokens(sampleSECContent, { level: 'invalid' as OptimizationLevel }))
        .rejects.toThrow('Invalid optimization level');
    });

    it('should respect maxTokens parameter', async () => {
      // Arrange
      const longContent = sampleSECContent.repeat(100); // Very long content
      
      // Act & Assert
      await expect(optimizeTokens(longContent, { 
        level: 'balanced',
        maxTokens: 1000 
      })).rejects.toThrow('Content exceeds maximum token limit');
    });
  });

  describe('validateOptimization', () => {
    const createMockResult = (overrides: Partial<TokenOptimizationResult> = {}): TokenOptimizationResult => ({
      optimizationLevel: 'balanced',
      originalContent: sampleSECContent,
      optimizedContent: 'Tesla summary...',
      originalTokens: 1000,
      optimizedTokens: 300,
      reductionPercentage: 70,
      qualityScore: 85,
      preservedSections: ['financial_data'],
      metadata: {
        processingTime: 2000,
        model: 'claude-3-sonnet',
        promptTokens: 100,
        completionTokens: 200,
        totalTokens: 300
      },
      ...overrides
    });

    it('should validate successful optimization', () => {
      // Arrange
      const result = createMockResult();

      // Act
      const validation = validateOptimization(result);

      // Assert
      expect(validation.isValid).toBe(true);
      expect(validation.issues).toEqual([]);
      expect(validation.score).toBeGreaterThan(80);
    });

    it('should detect insufficient token reduction', () => {
      // Arrange
      const result = createMockResult({
        originalTokens: 1000,
        optimizedTokens: 950, // Only 5% reduction
        reductionPercentage: 5
      });

      // Act
      const validation = validateOptimization(result);

      // Assert
      expect(validation.isValid).toBe(false);
      expect(validation.issues).toContain('Insufficient token reduction: 5% (minimum 20% expected)');
    });

    it('should detect excessive token reduction for conservative level', () => {
      // Arrange
      const result = createMockResult({
        optimizationLevel: 'conservative',
        originalTokens: 1000,
        optimizedTokens: 50, // 95% reduction - too aggressive for conservative
        reductionPercentage: 95
      });

      // Act
      const validation = validateOptimization(result);

      // Assert
      expect(validation.isValid).toBe(false);
      expect(validation.issues).toContain('Excessive token reduction for conservative level: 95% (maximum 85% recommended)');
    });

    it('should detect missing critical sections', () => {
      // Arrange
      const result = createMockResult({
        optimizedContent: 'Just a brief summary', // No financial data
        preservedSections: []
      });

      // Act
      const validation = validateOptimization(result);

      // Assert
      expect(validation.isValid).toBe(false);
      expect(validation.issues).toContainEqual(expect.stringMatching(/Missing critical sections/));
    });

    it('should detect quality score issues', () => {
      // Arrange
      const result = createMockResult({
        qualityScore: 45 // Below minimum threshold
      });

      // Act
      const validation = validateOptimization(result);

      // Assert
      expect(validation.isValid).toBe(false);
      expect(validation.issues).toContain('Quality score too low: 45 (minimum 60 required)');
    });

    it('should detect malformed optimization result', () => {
      // Arrange
      const result = createMockResult({
        originalTokens: 1000,
        optimizedTokens: 1200 // More tokens than original - impossible
      });

      // Act
      const validation = validateOptimization(result);

      // Assert
      expect(validation.isValid).toBe(false);
      expect(validation.issues).toContain('Optimized content has more tokens than original');
    });

    it('should handle edge case with zero original tokens', () => {
      // Arrange
      const result = createMockResult({
        originalTokens: 0,
        optimizedTokens: 0,
        reductionPercentage: 0
      });

      // Act
      const validation = validateOptimization(result);

      // Assert
      expect(validation.isValid).toBe(false);
      expect(validation.issues).toContain('Invalid token counts: original=0, optimized=0');
    });
  });

  describe('Integration Tests', () => {
    it('should perform end-to-end optimization with validation', async () => {
      // Arrange
      const mockOptimizedContent = `
        TESLA, INC. - 2023 ANNUAL REPORT SUMMARY
        
        BUSINESS: Electric vehicle and energy storage manufacturer
        
        2023 FINANCIAL PERFORMANCE:
        • Revenue: $96.8 billion (+18.8% vs 2022: $81.5B)
        • Gross Profit: $19.3 billion (vs 2022: $16.8B)
        • Net Income: $15.0 billion (vs 2022: $12.6B)
        
        KEY RISKS: Supply chain disruptions, regulatory changes, competition
        
        FINANCIAL STATEMENTS SUMMARY:
        Revenues grew from $53.8B (2021) to $81.5B (2022) to $96.8B (2023)
        Gross margins remain strong despite cost pressures
      `;

      const { conservativeRateLimiter } = require('../../../../lib/ai/rateLimiter');
      conservativeRateLimiter.executeRequest.mockResolvedValue({
        content: [{ text: mockOptimizedContent }],
        usage: { input_tokens: 1000, output_tokens: 250 }
      });

      // Act
      const result = await optimizeTokens(sampleSECContent, {
        level: 'conservative',
        preserveFinancialData: true,
        preserveRiskFactors: true,
        preserveMDA: true
      });

      const validation = validateOptimization(result);

      // Assert
      expect(validation.isValid).toBe(true);
      expect(result.reductionPercentage).toBeGreaterThan(60);
      expect(result.reductionPercentage).toBeLessThan(85);
      expect(result.qualityScore).toBeGreaterThan(70);
      expect(result.preservedSections).toEqual(['financial_data', 'risk_factors', 'mda']);
    });

    it('should handle different document types appropriately', async () => {
      // Arrange
      const form8K = `
        CURRENT REPORT PURSUANT TO SECTION 13 OR 15(d) OF THE SECURITIES EXCHANGE ACT OF 1934
        TESLA, INC.
        ITEM 2.02 Results of Operations and Financial Condition
        Tesla announces Q4 2023 earnings results...
      `;

      const mockOptimized8K = 'TESLA Q4 2023 earnings announced';

      const { conservativeRateLimiter } = require('../../../../lib/ai/rateLimiter');
      conservativeRateLimiter.executeRequest.mockResolvedValue({
        content: [{ text: mockOptimized8K }],
        usage: { input_tokens: 200, output_tokens: 20 }
      });

      // Act
      const result = await optimizeTokens(form8K, {
        level: 'aggressive' // 8-K can be more aggressively optimized
      });

      // Assert
      expect(result.reductionPercentage).toBeGreaterThan(80);
      expect(result.optimizedContent).toContain('earnings');
    });
  });
});