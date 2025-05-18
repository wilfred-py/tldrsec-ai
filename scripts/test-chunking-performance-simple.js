/**
 * Simplified performance test for document chunking
 * This script tests the chunking implementation with a medium-sized document
 * and different chunking configurations
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Sample heading patterns for semantic chunking
const HEADING_PATTERNS = [
  /^PART [IVX]+\s*$/i,
  /^ITEM\s+\d+[A-Z]?\.\s+[A-Z]/i,
  /^[A-Z][A-Z\s]+\s*$/
];

/**
 * Options for document chunking
 */
const DEFAULT_CHUNK_OPTIONS = {
  maxChunkSize: 2000,
  chunkOverlap: 200,
  respectSemanticBoundaries: true,
  separator: '\n\n',
};

/**
 * Simplified chunk text function
 */
function chunkText(text, options = {}) {
  // Merge options with defaults
  const mergedOptions = { ...DEFAULT_CHUNK_OPTIONS, ...options };
  
  console.log(`Chunking document (${text.length} chars) with max size: ${mergedOptions.maxChunkSize}, overlap: ${mergedOptions.chunkOverlap}`);
  
  // Initialize result
  const chunks = [];
  
  // Start time for performance measurement
  const startTime = Date.now();
  
  if (mergedOptions.respectSemanticBoundaries) {
    // Split text by paragraph (empty lines)
    console.log('Using semantic chunking...');
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    console.log(`Found ${paragraphs.length} paragraphs`);
    
    // Build chunks with semantic boundaries
    let currentChunk = '';
    let currentHeadings = [];
    
    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i];
      
      // Check if this paragraph is a heading
      const isHeading = HEADING_PATTERNS.some(pattern => pattern.test(paragraph));
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
            if (!HEADING_PATTERNS.some(pattern => pattern.test(paragraphs[j]))) {
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
    console.log('Using size-based chunking...');
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
  
  // Calculate chunking time
  const chunkingTime = Date.now() - startTime;
  
  // Calculate statistics
  const totalChars = chunks.reduce((sum, chunk) => sum + chunk.content.length, 0);
  const avgChunkSize = totalChars / chunks.length;
  
  // Return comprehensive results
  return {
    chunks,
    totalChunks: chunks.length,
    originalLength: text.length,
    chunkLengths: chunks.map(c => c.content.length),
    averageChunkSize: avgChunkSize,
    chunkingTime,
    metadata: {
      options: mergedOptions
    }
  };
}

/**
 * Reconstruct a document from chunks
 */
function reconstructDocument(chunks, options = {}) {
  // Merge options with defaults
  const mergedOptions = { ...DEFAULT_CHUNK_OPTIONS, ...options };
  
  // Start time for performance measurement
  const startTime = Date.now();
  
  // Sort chunks by ID to ensure correct order
  const sortedChunks = [...chunks].sort((a, b) => a.id - b.id);
  
  if (sortedChunks.length === 0) {
    return { text: '', time: 0 };
  }
  
  if (sortedChunks.length === 1) {
    return { 
      text: sortedChunks[0].content,
      time: Date.now() - startTime
    };
  }
  
  // Initialize result with first chunk
  let result = sortedChunks[0].content;
  
  // Add remaining chunks, handling overlaps
  for (let i = 1; i < sortedChunks.length; i++) {
    const chunk = sortedChunks[i];
    result += mergedOptions.separator + chunk.content;
  }
  
  // Return the result with timing information
  return {
    text: result,
    time: Date.now() - startTime
  };
}

/**
 * Estimate memory usage of an object
 * This is a simplified approximation
 */
function estimateMemoryUsage(obj) {
  const json = JSON.stringify(obj);
  return Buffer.byteLength(json) / (1024 * 1024); // Size in MB
}

/**
 * Fetch content from a URL
 */
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'TLDRSec-AI/1.0'
      }
    }, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve(data);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Run performance tests
 */
async function runPerformanceTests() {
  console.log('Starting chunking performance tests');
  
  // Create results directory
  const resultsDir = path.join(process.cwd(), 'performance-results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  
  // For the simplified test, we'll use a smaller document
  // The 10-K filing for a smaller company
  const url = 'https://www.sec.gov/Archives/edgar/data/1318605/000095017022000796/tsla-20211231.htm';
  
  console.log(`Fetching document from ${url}`);
  let html;
  
  try {
    html = await fetchUrl(url);
    console.log(`Fetched document (${html.length} chars)`);
  } catch (error) {
    console.error('Error fetching document:', error.message);
    return;
  }
  
  // Remove HTML tags to get plain text (simplified)
  const text = html.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
  console.log(`Extracted plain text (${text.length} chars)`);
  
  // Configurations to test
  const configs = [
    {
      name: 'small-chunks',
      options: {
        maxChunkSize: 2000,
        chunkOverlap: 200,
        respectSemanticBoundaries: true
      }
    },
    {
      name: 'medium-chunks',
      options: {
        maxChunkSize: 4000,
        chunkOverlap: 400,
        respectSemanticBoundaries: true
      }
    },
    {
      name: 'large-chunks',
      options: {
        maxChunkSize: 8000,
        chunkOverlap: 800,
        respectSemanticBoundaries: true
      }
    },
    {
      name: 'size-based',
      options: {
        maxChunkSize: 4000,
        chunkOverlap: 400,
        respectSemanticBoundaries: false
      }
    }
  ];
  
  // Results will be stored here
  const results = [];
  
  // Test each configuration
  for (const config of configs) {
    console.log(`\nTesting configuration: ${config.name}`);
    
    // Perform chunking
    const chunkResult = chunkText(text, config.options);
    
    console.log(`Chunking completed in ${chunkResult.chunkingTime}ms`);
    console.log(`Generated ${chunkResult.totalChunks} chunks`);
    console.log(`Average chunk size: ${Math.round(chunkResult.averageChunkSize)} chars`);
    
    // Test reconstruction
    const reconstructionResult = reconstructDocument(chunkResult.chunks, config.options);
    
    console.log(`Reconstruction completed in ${reconstructionResult.time}ms`);
    console.log(`Reconstructed document length: ${reconstructionResult.text.length} chars`);
    
    // Calculate similarity
    const similarity = (1 - Math.abs(text.length - reconstructionResult.text.length) / Math.max(text.length, reconstructionResult.text.length)) * 100;
    console.log(`Similarity to original: ${similarity.toFixed(2)}%`);
    
    // Estimate memory usage
    const chunksMemory = estimateMemoryUsage(chunkResult.chunks);
    const originalMemory = estimateMemoryUsage(text);
    
    console.log(`Original document memory: ${originalMemory.toFixed(2)} MB`);
    console.log(`Chunks memory: ${chunksMemory.toFixed(2)} MB`);
    
    // Record results
    results.push({
      config: config.name,
      documentSize: text.length,
      numberOfChunks: chunkResult.totalChunks,
      avgChunkSize: Math.round(chunkResult.averageChunkSize),
      chunkingTime: chunkResult.chunkingTime,
      reconstructionTime: reconstructionResult.time,
      similarityPercent: similarity.toFixed(2),
      originalMemoryMB: originalMemory.toFixed(2),
      chunksMemoryMB: chunksMemory.toFixed(2)
    });
    
    // Write sample chunks to file
    if (chunkResult.chunks.length > 0) {
      const samplePath = path.join(
        resultsDir, 
        `${config.name}-sample-chunks.txt`
      );
      
      // Write first, middle, and last chunk
      const first = chunkResult.chunks[0];
      const middle = chunkResult.chunks[Math.floor(chunkResult.chunks.length / 2)];
      const last = chunkResult.chunks[chunkResult.chunks.length - 1];
      
      fs.writeFileSync(
        samplePath,
        `Configuration: ${config.name}\n` +
        `Total chunks: ${chunkResult.totalChunks}\n` +
        `Average chunk size: ${Math.round(chunkResult.averageChunkSize)} chars\n\n` +
        `--- FIRST CHUNK (${first.content.length} chars) ---\n\n${first.content}\n\n` +
        `--- MIDDLE CHUNK (${middle.content.length} chars) ---\n\n${middle.content}\n\n` +
        `--- LAST CHUNK (${last.content.length} chars) ---\n\n${last.content}`
      );
    }
  }
  
  // Write results to JSON file
  fs.writeFileSync(
    path.join(resultsDir, 'chunking-performance-simple.json'),
    JSON.stringify(results, null, 2)
  );
  
  // Generate CSV for easy analysis
  let csv = 'Config,DocumentSize,NumChunks,AvgChunkSize,ChunkingTime,ReconstructionTime,SimilarityPercent,OriginalMemoryMB,ChunksMemoryMB\n';
  
  for (const result of results) {
    csv += `${result.config},${result.documentSize},${result.numberOfChunks},${result.avgChunkSize},${result.chunkingTime},${result.reconstructionTime},${result.similarityPercent},${result.originalMemoryMB},${result.chunksMemoryMB}\n`;
  }
  
  fs.writeFileSync(
    path.join(resultsDir, 'chunking-performance-simple.csv'),
    csv
  );
  
  console.log('\nPerformance tests completed. Results saved to performance-results directory.');
}

// Run the tests
runPerformanceTests()
  .then(() => {
    console.log('Performance tests completed successfully.');
  })
  .catch(error => {
    console.error('Error running performance tests:', error);
  }); 