/**
 * Context Window Management for Claude AI
 * 
 * This module provides utilities for intelligently managing the context window
 * for large documents, ensuring optimal use of token budgets and maintaining
 * coherence between document chunks.
 */

import { ContextWindowConfig, SECFilingSection, SECFilingType } from './prompt-types';

// Default configuration for different filing types
const DEFAULT_CONTEXT_CONFIGS: Record<SECFilingType, ContextWindowConfig> = {
  '10-K': {
    maxChunkSize: 12000,      // Large enough for most sections of a 10-K
    overlapSize: 1000,         // Significant overlap to maintain context
    useSemanticChunking: true, // Use semantic boundaries when possible
    chunkStrategy: 'section-based', // Chunk by document sections
  },
  '10-Q': {
    maxChunkSize: 8000,        // Moderate size for quarterly reports
    overlapSize: 800,
    useSemanticChunking: true,
    chunkStrategy: 'section-based',
  },
  '8-K': {
    maxChunkSize: 4000,        // Smaller for event reports
    overlapSize: 400,
    useSemanticChunking: true,
    chunkStrategy: 'adaptive',
  },
  '20-F': {
    maxChunkSize: 12000,
    overlapSize: 1000,
    useSemanticChunking: true,
    chunkStrategy: 'section-based',
  },
  '6-K': {
    maxChunkSize: 8000,
    overlapSize: 800,
    useSemanticChunking: true,
    chunkStrategy: 'adaptive',
  },
  'S-1': {
    maxChunkSize: 10000,
    overlapSize: 1000,
    useSemanticChunking: true,
    chunkStrategy: 'section-based',
  },
  'S-4': {
    maxChunkSize: 10000,
    overlapSize: 1000,
    useSemanticChunking: true,
    chunkStrategy: 'section-based',
  },
  '424B': {
    maxChunkSize: 8000,
    overlapSize: 800,
    useSemanticChunking: true,
    chunkStrategy: 'adaptive',
  },
  'DEF 14A': {
    maxChunkSize: 8000,
    overlapSize: 800,
    useSemanticChunking: true,
    chunkStrategy: 'section-based',
  },
  'Generic': {
    maxChunkSize: 6000,        // Conservative default
    overlapSize: 600,
    useSemanticChunking: false,
    chunkStrategy: 'fixed',
  },
};

// Section-specific token budgets
const SECTION_TOKEN_BUDGETS: Record<SECFilingSection, number> = {
  'Risk Factors': 15000,        // Often lengthy and detailed
  'Management Discussion': 12000, // Substantial analysis
  'Business Overview': 10000,    // Company description
  'Financial Statements': 8000,  // Structured data
  'Legal Proceedings': 6000,     // Usually shorter
  'Controls and Procedures': 4000,
  'Corporate Governance': 5000,
  'Executive Compensation': 6000,
  'Material Changes': 4000,
  'Complete Document': 25000,    // For summarizing the entire filing
};

/**
 * Get context window configuration based on filing type and section
 */
export function getContextConfig(
  filingType: SECFilingType,
  section?: SECFilingSection,
  customConfig?: Partial<ContextWindowConfig>
): ContextWindowConfig {
  // Start with the default config for this filing type
  const baseConfig = { ...DEFAULT_CONTEXT_CONFIGS[filingType] };
  
  // Adjust based on section if specified
  if (section) {
    const sectionBudget = SECTION_TOKEN_BUDGETS[section];
    if (sectionBudget) {
      // Adjust chunk size based on the section's typical length
      baseConfig.maxChunkSize = Math.min(baseConfig.maxChunkSize, sectionBudget);
      
      // For complete document processing, always use section-based chunking
      if (section === 'Complete Document') {
        baseConfig.chunkStrategy = 'section-based';
      }
    }
  }
  
  // Apply any custom overrides
  return { ...baseConfig, ...customConfig };
}

/**
 * Split a document into optimally sized chunks for processing
 */
export function splitDocumentIntoChunks(
  document: string,
  config: ContextWindowConfig
): string[] {
  const { maxChunkSize, overlapSize, useSemanticChunking, chunkStrategy } = config;
  
  // For now, we'll implement a simple size-based chunking
  // In a real implementation, this would use more sophisticated techniques
  const chunks: string[] = [];
  
  if (chunkStrategy === 'fixed' || !useSemanticChunking) {
    // Simple size-based chunking with overlap
    let position = 0;
    while (position < document.length) {
      const end = Math.min(position + maxChunkSize, document.length);
      chunks.push(document.substring(position, end));
      position = end - overlapSize; // Create overlap between chunks
      
      // Prevent infinite loops for small documents
      if (position >= document.length) break;
    }
  } else if (chunkStrategy === 'section-based') {
    // For section-based chunking, we'd identify section boundaries
    // This is a simplified version - a real implementation would use regex or NLP
    const sections = document.split(/(?=\n#{1,3} )/); // Split on markdown-like headings
    
    let currentChunk = '';
    for (const section of sections) {
      // If adding this section would exceed our chunk size, start a new chunk
      if (currentChunk.length + section.length > maxChunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk);
        // Include some overlap by repeating the last part of previous chunk
        const overlapText = currentChunk.substring(Math.max(0, currentChunk.length - overlapSize));
        currentChunk = overlapText + section;
      } else {
        currentChunk += section;
      }
    }
    
    // Don't forget the last chunk
    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }
  } else if (chunkStrategy === 'adaptive') {
    // In adaptive mode, we'd adjust chunk sizes based on content complexity
    // This is a simplified version that looks for natural breaks
    
    // Split on double newlines (paragraph breaks) or other natural indicators
    const paragraphs = document.split(/\n\n+/);
    
    let currentChunk = '';
    for (const paragraph of paragraphs) {
      if (currentChunk.length + paragraph.length + 2 > maxChunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk);
        // Include overlap with previous chunk
        const overlapText = currentChunk.substring(Math.max(0, currentChunk.length - overlapSize));
        currentChunk = overlapText + '\n\n' + paragraph;
      } else {
        if (currentChunk.length > 0) {
          currentChunk += '\n\n';
        }
        currentChunk += paragraph;
      }
    }
    
    // Add the final chunk
    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }
  }
  
  return chunks;
}

/**
 * Calculate the estimated tokens for a document
 * This is a simple approximation - real implementation would use a tokenizer
 */
export function estimateTokenCount(text: string): number {
  // A very rough estimation: ~4 characters per token for English
  return Math.ceil(text.length / 4);
}

/**
 * Determine if a document needs chunking based on its size and filing type
 */
export function needsChunking(
  document: string,
  filingType: SECFilingType,
  section?: SECFilingSection
): boolean {
  const config = getContextConfig(filingType, section);
  const estimatedTokens = estimateTokenCount(document);
  
  // Add a buffer to be safe
  return estimatedTokens > config.maxChunkSize * 0.9;
} 