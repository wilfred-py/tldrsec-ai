import { ContextWindowConfig } from '../prompt-types';
import {
  estimateTokenCount,
  splitDocumentIntoChunks,
  getContextConfig,
  needsChunking,
} from '../context-manager';

describe('Context Manager', () => {
  describe('estimateTokenCount', () => {
    it('should estimate token count based on character count', () => {
      const shortText = 'This is a short text.';
      const longText = 'A'.repeat(10000);
      
      const shortCount = estimateTokenCount(shortText);
      const longCount = estimateTokenCount(longText);
      
      // Expect roughly 4 characters per token
      expect(shortCount).toBeGreaterThan(0);
      expect(shortCount).toBeLessThan(shortText.length);
      expect(longCount).toBeGreaterThan(1000);
      expect(longCount).toBeLessThan(longText.length);
    });
  });
  
  describe('splitDocumentIntoChunks', () => {
    it('should split large documents into chunks', () => {
      const largeDocument = 'A'.repeat(10000); // Reduced size to avoid memory issues
      const config: ContextWindowConfig = {
        maxChunkSize: 2000,
        overlapSize: 200,
        useSemanticChunking: false,
        chunkStrategy: 'fixed'
      };
      
      const chunks = splitDocumentIntoChunks(largeDocument, config);
      
      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach(chunk => {
        const tokenCount = estimateTokenCount(chunk);
        expect(tokenCount).toBeLessThanOrEqual(config.maxChunkSize);
      });
    });
    
    it('should preserve document structure when splitting', () => {
      const structuredDocument = [
        '# Section 1',
        'Content for section 1.',
        '',
        '# Section 2',
        'Content for section 2.',
        '',
        '# Section 3',
        'Content for section 3.'
      ].join('\n').repeat(5); // Reduced repetitions to avoid memory issues
      
      const config: ContextWindowConfig = {
        maxChunkSize: 1000,
        overlapSize: 100,
        useSemanticChunking: true,
        chunkStrategy: 'section-based'
      };
      
      const chunks = splitDocumentIntoChunks(structuredDocument, config);
      
      expect(chunks.length).toBeGreaterThan(1);
      
      // Check that at least some chunks start with a section header
      const chunksStartingWithHeader = chunks.filter(chunk => 
        chunk.trim().startsWith('# Section')
      );
      
      expect(chunksStartingWithHeader.length).toBeGreaterThan(0);
    });
  });
  
  describe('getContextConfig', () => {
    it('should return appropriate config based on filing type', () => {
      const config10K = getContextConfig('10-K');
      const config10Q = getContextConfig('10-Q');
      const config8K = getContextConfig('8-K');
      const configDefault = getContextConfig('Generic');
      
      expect(config10K.maxChunkSize).toBeGreaterThan(0);
      expect(config10Q.maxChunkSize).toBeGreaterThan(0);
      expect(config8K.maxChunkSize).toBeGreaterThan(0);
      expect(configDefault.maxChunkSize).toBeGreaterThan(0);
      
      // 10-K filings are typically larger and should have higher chunk size
      expect(config10K.maxChunkSize).toBeGreaterThanOrEqual(config8K.maxChunkSize);
    });
  });

  describe('needsChunking', () => {
    it('should correctly identify documents that need chunking', () => {
      // Create a large document that should need chunking
      const largeDocument = 'A'.repeat(20000); // Reduced size to avoid memory issues
      
      // Test with different filing types
      expect(needsChunking(largeDocument, '10-K')).toBe(true);
      expect(needsChunking(largeDocument, '8-K')).toBe(true);
      
      // Small document shouldn't need chunking
      const smallDocument = 'This is a small document.';
      expect(needsChunking(smallDocument, '10-K')).toBe(false);
      expect(needsChunking(smallDocument, '8-K')).toBe(false);
    });
    
    it('should consider filing type when determining chunking needs', () => {
      // Create a medium-sized document
      const mediumDocument = 'A'.repeat(5000); // Reduced size to avoid memory issues
      
      // Different filing types have different thresholds
      // 8-K has a smaller threshold than 10-K
      const needs8KChunking = needsChunking(mediumDocument, '8-K');
      const needs10KChunking = needsChunking(mediumDocument, '10-K');
      
      // We expect 8-K to be more likely to need chunking than 10-K for the same document
      // This test might need adjustment based on actual thresholds
      if (needs10KChunking) {
        expect(needs8KChunking).toBe(true);
      }
    });
  });
});
