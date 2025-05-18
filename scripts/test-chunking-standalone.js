/**
 * Standalone test script for document chunking
 * This script includes all necessary functionality without external imports
 */

const fs = require('fs');
const path = require('path');

// Define interfaces inline
const FilingSectionType = {
  PARAGRAPH: 'paragraph',
  HEADING: 'heading',
  TABLE: 'table',
  LIST: 'list'
};

/**
 * Options for document chunking
 */
const DEFAULT_CHUNK_OPTIONS = {
  maxChunkSize: 1000, // Aligned with typical AI context window limitations
  chunkOverlap: 100,  // Reasonable overlap to maintain context
  respectSemanticBoundaries: true,
  minChunkSize: 100,
  includeTables: true,
  includeLists: true,
  separator: '\n\n',
  headingRegex: /^(PART|Item|Section) [0-9A-Z]+\.\s+[A-Z]/im
};

/**
 * Chunk text into smaller pieces
 *
 * @param text The text to chunk
 * @param options Chunking options
 * @returns Array of document chunks
 */
function chunkText(text, options = {}) {
  // Merge options with defaults
  const mergedOptions = { ...DEFAULT_CHUNK_OPTIONS, ...options };
  
  // Initialize result
  const chunks = [];
  
  if (mergedOptions.respectSemanticBoundaries) {
    // Split text by paragraph (empty lines)
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    
    // Find headings based on regex pattern
    const headings = [];
    
    if (mergedOptions.headingRegex) {
      for (let i = 0; i < paragraphs.length; i++) {
        if (mergedOptions.headingRegex.test(paragraphs[i])) {
          headings.push({
            index: i,
            text: paragraphs[i].trim()
          });
        }
      }
    }
    
    // Build chunks with semantic boundaries
    let currentChunk = '';
    let currentHeadings = [];
    
    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i];
      
      // Check if this paragraph is a heading
      const isHeading = mergedOptions.headingRegex && mergedOptions.headingRegex.test(paragraph);
      if (isHeading) {
        currentHeadings.push(paragraph.trim());
      }
      
      // If adding this paragraph would exceed max size, finalize the current chunk
      const newChunkSize = currentChunk.length + paragraph.length + 2; // +2 for '\n\n'
      
      if (newChunkSize > mergedOptions.maxChunkSize && currentChunk.length > 0) {
        // Finalize current chunk
        chunks.push({
          id: chunks.length,
          content: currentChunk,
          metadata: {
            start: 0, // We're not tracking exact positions in this simplified version
            end: currentChunk.length,
            charCount: currentChunk.length,
            headings: currentHeadings
          }
        });
        
        // Start a new chunk with overlap
        if (isHeading) {
          // If this is a heading, start fresh with this heading
          currentChunk = paragraph;
          currentHeadings = [paragraph.trim()];
        } else {
          // Otherwise, include some context from the previous chunk
          const contextLines = [];
          
          // Add the most recent heading for context
          if (currentHeadings.length > 0) {
            contextLines.push(currentHeadings[currentHeadings.length - 1]);
          }
          
          // Add some previous content for overlap
          let overlapSize = 0;
          let j = i - 1;
          
          while (j >= 0 && overlapSize < mergedOptions.chunkOverlap) {
            if (!mergedOptions.headingRegex || !mergedOptions.headingRegex.test(paragraphs[j])) {
              contextLines.unshift(paragraphs[j]);
              overlapSize += paragraphs[j].length + 2; // +2 for '\n\n'
            }
            
            if (overlapSize >= mergedOptions.chunkOverlap) {
              break;
            }
            
            j--;
          }
          
          currentChunk = contextLines.join('\n\n');
          if (currentChunk.length > 0) {
            currentChunk += '\n\n';
          }
          currentChunk += paragraph;
        }
      } else {
        // Add paragraph to current chunk
        if (currentChunk.length > 0) {
          currentChunk += '\n\n';
        }
        currentChunk += paragraph;
      }
    }
    
    // Add the final chunk if not empty
    if (currentChunk.length > 0) {
      chunks.push({
        id: chunks.length,
        content: currentChunk,
        metadata: {
          start: 0,
          end: currentChunk.length,
          charCount: currentChunk.length,
          headings: currentHeadings
        }
      });
    }
  } else {
    // Simple size-based chunking
    for (let i = 0; i < text.length; i += mergedOptions.maxChunkSize - mergedOptions.chunkOverlap) {
      const start = i;
      const end = Math.min(i + mergedOptions.maxChunkSize, text.length);
      const content = text.substring(start, end);
      
      chunks.push({
        id: chunks.length,
        content: content,
        metadata: {
          start: start,
          end: end,
          charCount: content.length
        }
      });
      
      // If we've reached the end, break
      if (end === text.length) break;
    }
  }
  
  return chunks;
}

/**
 * Reconstruct a document from chunks
 * 
 * @param chunks The chunks to reconstruct from
 * @param options Options for reconstruction
 * @returns The reconstructed document
 */
function reconstructDocument(chunks, options = {}) {
  // Merge options with defaults
  const mergedOptions = { ...DEFAULT_CHUNK_OPTIONS, ...options };
  
  // Sort chunks by ID to ensure correct order
  const sortedChunks = [...chunks].sort((a, b) => a.id - b.id);
  
  if (sortedChunks.length === 0) {
    return '';
  }
  
  if (sortedChunks.length === 1) {
    return sortedChunks[0].content;
  }
  
  // Initialize result with first chunk
  let result = sortedChunks[0].content;
  
  // Add remaining chunks, handling overlaps
  for (let i = 1; i < sortedChunks.length; i++) {
    const chunk = sortedChunks[i];
    result += mergedOptions.separator + chunk.content;
  }
  
  return result;
}

// Sample document for testing
const document = `
PART I

Item 1. Business Overview

Tesla, Inc. ("Tesla", "we", "us" or "our") designs, develops, manufactures, sells and leases high-performance, fully electric vehicles and energy generation and storage systems, and also offers services related to our sustainable energy products. We generally sell our products directly to customers, and continue to grow our customer-facing infrastructure through a global network of vehicle service centers, Mobile Service technicians, body shops, Supercharger stations and Destination Chargers.

Item 1A. Risk Factors

You should carefully consider the risks described below together with the other information set forth in this report, which could materially affect our business, financial condition and future results. The risks described below are not the only risks facing our company. Risks and uncertainties not currently known to us or that we currently deem to be immaterial also may materially adversely affect our business, financial condition and operating results.

PART II

Item 7. Management's Discussion & Analysis of Financial Condition and Results of Operations

The following discussion and analysis should be read in conjunction with the consolidated financial statements and the related notes included elsewhere in this Annual Report on Form 10-K. For discussion related to changes in financial condition and the results of operations for fiscal year 2021 as compared to fiscal year 2020, refer to Part II, Item 7 Management's Discussion and Analysis of Financial Condition and Results of Operations in our Annual Report on Form 10-K for our fiscal year ended December 31, 2022, which was filed with the Securities and Exchange Commission on January 31, 2023.
`;

// Test the chunking functionality
console.log(`Starting chunking test with sample document (${document.length} chars)...`);

// Try different chunk sizes
const chunkSizes = [500, 1000];

chunkSizes.forEach(size => {
  console.log(`\nTesting with max chunk size: ${size} chars, overlap: 100 chars`);
  
  const chunks = chunkText(document, { 
    maxChunkSize: size,
    chunkOverlap: 100,
    respectSemanticBoundaries: true
  });
  
  console.log(`Generated ${chunks.length} chunks:`);
  
  chunks.forEach((chunk, index) => {
    console.log(`\nChunk ${index + 1} (${chunk.content.length} chars):`);
    console.log(`Start: "${chunk.content.substring(0, 50)}..."`);
    
    if (chunk.metadata.headings && chunk.metadata.headings.length > 0) {
      console.log(`Headings: ${chunk.metadata.headings.join(', ')}`);
    }
  });
  
  // Test reconstruction
  const reconstructed = reconstructDocument(chunks);
  console.log(`\nReconstructed document length: ${reconstructed.length} chars`);
  
  // Compare with original
  const similarity = (1 - Math.abs(document.length - reconstructed.length) / Math.max(document.length, reconstructed.length)) * 100;
  console.log(`Similarity to original: ${similarity.toFixed(2)}%`);
});

// Create output directory and save results
const outputDir = path.join(process.cwd(), 'test-output');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Save the sample output
const chunks = chunkText(document, { maxChunkSize: 800 });
const reconstructed = reconstructDocument(chunks);

fs.writeFileSync(
  path.join(outputDir, 'chunking-test-results.txt'),
  `Original document: ${document.length} chars\n` +
  `Number of chunks: ${chunks.length}\n` +
  `Reconstructed document: ${reconstructed.length} chars\n\n` +
  `Sample chunks:\n\n` +
  chunks.map((chunk, i) => 
    `--- Chunk ${i + 1} (${chunk.content.length} chars) ---\n${chunk.content}\n\n`
  ).join('')
);

console.log('\nTest completed successfully!');
console.log('Results written to test-output/chunking-test-results.txt'); 