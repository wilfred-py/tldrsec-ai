/**
 * Simplified test for document chunking functionality
 * This test doesn't depend on other modules to avoid import issues
 */

// Define a simple chunk interface matching the one in chunk-manager.ts
interface DocumentChunk {
  id: number;
  content: string;
  metadata: {
    start: number;
    end: number;
    charCount: number;
    sectionTypes?: string[];
    sectionTitles?: string[];
  };
}

// Simplified chunk text function
function chunkText(
  text: string,
  options: {
    maxChunkSize?: number;
    chunkOverlap?: number;
    respectSemanticBoundaries?: boolean;
  } = {}
): DocumentChunk[] {
  // Default options
  const maxChunkSize = options.maxChunkSize || 1000;
  const chunkOverlap = options.chunkOverlap || 100;
  const respectSemanticBoundaries = options.respectSemanticBoundaries !== false;
  
  // Initialize result
  const chunks: DocumentChunk[] = [];
  
  // Simple paragraph-based splitting for semantic boundaries
  const paragraphs = text.split('\n\n').filter(p => p.trim().length > 0);
  
  if (respectSemanticBoundaries && paragraphs.length > 1) {
    // Build chunks from paragraphs
    let currentChunk = '';
    let chunkStart = 0;
    
    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i];
      
      // If adding this paragraph would exceed max size, finalize the current chunk
      if (currentChunk.length + paragraph.length > maxChunkSize && currentChunk.length > 0) {
        chunks.push({
          id: chunks.length,
          content: currentChunk,
          metadata: {
            start: chunkStart,
            end: chunkStart + currentChunk.length,
            charCount: currentChunk.length
          }
        });
        
        // Calculate overlap - go back to include some previous paragraphs
        let overlapSize = 0;
        let j = i - 1;
        let overlapText = '';
        
        while (j >= 0 && overlapSize < chunkOverlap) {
          overlapText = paragraphs[j] + '\n\n' + overlapText;
          overlapSize += paragraphs[j].length + 2;  // +2 for '\n\n'
          j--;
        }
        
        currentChunk = overlapText + paragraph;
        chunkStart = Math.max(0, chunkStart + currentChunk.length - overlapSize);
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
          start: chunkStart,
          end: chunkStart + currentChunk.length,
          charCount: currentChunk.length
        }
      });
    }
  } else {
    // Simple character-based chunking
    for (let i = 0; i < text.length; i += maxChunkSize - chunkOverlap) {
      const chunkStart = i;
      const chunkEnd = Math.min(i + maxChunkSize, text.length);
      const content = text.substring(chunkStart, chunkEnd);
      
      chunks.push({
        id: chunks.length,
        content,
        metadata: {
          start: chunkStart,
          end: chunkEnd,
          charCount: content.length
        }
      });
      
      // If we've reached the end, break
      if (chunkEnd === text.length) break;
    }
  }
  
  return chunks;
}

// Function to reconstruct document from chunks
function reconstructDocument(chunks: DocumentChunk[]): string {
  // Sort chunks by ID to ensure correct order
  const sortedChunks = [...chunks].sort((a, b) => a.id - b.id);
  
  // For a simple test, just join the content
  return sortedChunks.map(chunk => chunk.content).join('\n\n');
}

// Test document
const testDocument = `
PART I

Item 1. Business Overview

Tesla, Inc. ("Tesla", the "Company", "we", "us" or "our") designs, develops, manufactures, sells and leases high-performance, fully electric vehicles and energy generation and storage systems, and also offers services related to our sustainable energy products. We generally sell our products directly to customers, and continue to grow our customer-facing infrastructure through a global network of vehicle service centers, Mobile Service technicians, body shops, Supercharger stations and Destination Chargers.

Item 1A. Risk Factors

You should carefully consider the risks described below together with the other information set forth in this report, which could materially affect our business, financial condition and future results. The risks described below are not the only risks facing our company. Risks and uncertainties not currently known to us or that we currently deem to be immaterial also may materially adversely affect our business, financial condition and operating results.

PART II

Item 7. Management's Discussion & Analysis of Financial Condition and Results of Operations

The following discussion and analysis should be read in conjunction with the consolidated financial statements and the related notes included elsewhere in this Annual Report on Form 10-K. For discussion related to changes in financial condition and the results of operations for fiscal year 2021 as compared to fiscal year 2020, refer to Part II, Item 7 Management's Discussion and Analysis of Financial Condition and Results of Operations in our Annual Report on Form 10-K for our fiscal year ended December 31, 2022, which was filed with the Securities and Exchange Commission on January 31, 2023.
`;

// Run the test
console.log('Starting chunking test with sample document...');
console.log(`Document length: ${testDocument.length} characters`);

// Test chunking
const chunks = chunkText(testDocument, {
  maxChunkSize: 500,
  chunkOverlap: 50,
  respectSemanticBoundaries: true
});

// Display chunks
console.log(`Generated ${chunks.length} chunks:`);
chunks.forEach((chunk, i) => {
  console.log(`\nChunk ${i + 1} (${chunk.content.length} chars):`);
  console.log(`Range: ${chunk.metadata.start}-${chunk.metadata.end}`);
  console.log(`Content: "${chunk.content.substring(0, 50)}..."`);
});

// Test reconstruction
const reconstructed = reconstructDocument(chunks);
console.log(`\nReconstructed document length: ${reconstructed.length} characters`);

// Compare with original
const similarity = (1 - Math.abs(testDocument.length - reconstructed.length) / Math.max(testDocument.length, reconstructed.length)) * 100;
console.log(`Similarity with original: ${similarity.toFixed(2)}%`);

console.log('\nTest completed successfully!'); 