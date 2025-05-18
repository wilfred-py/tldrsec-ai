/**
 * Test script for chunking performance with very large SEC filings
 * 
 * This script tests the performance of the chunking system with
 * different size documents and varying chunk options.
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { 
  createAutoParserWithChunking 
} = require('../dist/lib/parsers/filing-parser-factory');
const { 
  chunkParsedFiling,
  reconstructDocument,
  measureMemoryUsage
} = require('../dist/lib/parsers/chunk-manager');
const { Logger } = require('../dist/lib/logging');

// Setup logger
const logger = new Logger({ level: 'info' }, 'chunking-performance-test');

// Very large filings for stress testing
const LARGE_FILINGS = [
  // Apple 10-K - very large with complex structure
  {
    symbol: 'AAPL',
    url: 'https://www.sec.gov/ix?doc=/Archives/edgar/data/320193/000032019322000108/aapl-20220924.htm'
  }
];

// Various chunking configurations to test
const CHUNK_CONFIGS = [
  // Baseline configuration
  {
    name: 'baseline',
    options: {
      maxChunkSize: 4000,
      chunkOverlap: 500,
      respectSemanticBoundaries: true
    }
  },
  // Optimize for memory usage
  {
    name: 'memory-optimized',
    options: {
      maxChunkSize: 2000,
      chunkOverlap: 200,
      respectSemanticBoundaries: true
    }
  },
  // Optimize for context preservation
  {
    name: 'context-optimized',
    options: {
      maxChunkSize: 8000,
      chunkOverlap: 2000,
      respectSemanticBoundaries: true
    }
  },
  // Size-based only (ignoring semantic boundaries)
  {
    name: 'size-based',
    options: {
      maxChunkSize: 4000,
      chunkOverlap: 500,
      respectSemanticBoundaries: false
    }
  }
];

/**
 * Run the performance tests
 */
async function runPerformanceTests() {
  logger.info('Starting chunking performance tests');
  
  // Create results directory
  const resultsDir = path.join(process.cwd(), 'performance-results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  
  // Results will be stored here
  const results = [];
  
  // Process each filing
  for (const filing of LARGE_FILINGS) {
    logger.info(`Testing with ${filing.symbol} filing`);
    
    try {
      // Fetch the filing content
      const response = await axios.get(filing.url, {
        headers: {
          'User-Agent': 'TLDRSec-AI/1.0'
        }
      });
      const html = response.data;
      
      // Parse without chunking first to measure baseline
      logger.info('Parsing the filing without chunking as baseline');
      const startParseTime = Date.now();
      const parsedFiling = await createAutoParserWithChunking(html, { includeFullText: true }, false);
      const parseTime = Date.now() - startParseTime;
      
      // Log baseline stats
      const baselineMemory = measureMemoryUsage(parsedFiling);
      logger.info(`Baseline parsing time: ${parseTime}ms`);
      logger.info(`Baseline memory usage: ${baselineMemory.toFixed(2)} MB`);
      logger.info(`Document size: ${(parsedFiling.fullText?.length || 0).toLocaleString()} chars`);
      
      // Test each chunking configuration
      for (const config of CHUNK_CONFIGS) {
        logger.info(`Testing configuration: ${config.name}`);
        
        // Time the chunking operation
        const startChunkTime = Date.now();
        const chunkResult = chunkParsedFiling(parsedFiling, config.options);
        const chunkTime = Date.now() - startChunkTime;
        
        // Log results
        logger.info(`Chunking time: ${chunkTime}ms`);
        logger.info(`Number of chunks: ${chunkResult.totalChunks}`);
        logger.info(`Average chunk size: ${chunkResult.averageChunkSize.toFixed(0)} chars`);
        
        // Test reconstruction time
        const startReconstructTime = Date.now();
        const reconstructed = reconstructDocument(chunkResult.chunks);
        const reconstructTime = Date.now() - startReconstructTime;
        
        logger.info(`Reconstruction time: ${reconstructTime}ms`);
        
        // Measure memory usage of chunks
        const chunksJson = JSON.stringify(chunkResult.chunks);
        const chunksMemory = Buffer.byteLength(chunksJson) / (1024 * 1024);
        logger.info(`Chunks memory usage: ${chunksMemory.toFixed(2)} MB`);
        
        // Calculate memory savings percentage
        const memorySavings = baselineMemory > 0 ? 
          ((baselineMemory - chunksMemory) / baselineMemory) * 100 : 0;
        
        // Record results
        results.push({
          filing: filing.symbol,
          config: config.name,
          documentSize: parsedFiling.fullText?.length || 0,
          numberOfChunks: chunkResult.totalChunks,
          avgChunkSize: Math.round(chunkResult.averageChunkSize),
          chunkingTime: chunkTime,
          reconstructionTime: reconstructTime,
          baselineMemoryMB: baselineMemory,
          chunksMemoryMB: chunksMemory,
          memorySavingsPercent: memorySavings
        });
        
        // Write a sample chunk for examination
        if (chunkResult.chunks.length > 0) {
          const sampleChunkPath = path.join(
            resultsDir, 
            `${filing.symbol}-${config.name}-sample-chunk.txt`
          );
          fs.writeFileSync(
            sampleChunkPath, 
            chunkResult.chunks[Math.floor(chunkResult.chunks.length / 2)].content
          );
        }
      }
    } catch (error) {
      logger.error(`Error processing ${filing.symbol}:`, error);
    }
  }
  
  // Write overall results
  fs.writeFileSync(
    path.join(resultsDir, 'chunking-performance-results.json'),
    JSON.stringify(results, null, 2)
  );
  
  // Generate CSV for easy analysis
  let csv = 'Filing,Config,DocumentSize,NumChunks,AvgChunkSize,ChunkingTime,ReconstructionTime,BaselineMemoryMB,ChunksMemoryMB,MemorySavingsPct\n';
  for (const result of results) {
    csv += `${result.filing},${result.config},${result.documentSize},${result.numberOfChunks},${result.avgChunkSize},${result.chunkingTime},${result.reconstructionTime},${result.baselineMemoryMB.toFixed(2)},${result.chunksMemoryMB.toFixed(2)},${result.memorySavingsPercent.toFixed(2)}\n`;
  }
  
  fs.writeFileSync(
    path.join(resultsDir, 'chunking-performance-results.csv'),
    csv
  );
  
  logger.info('Performance tests completed. Results saved to performance-results directory.');
}

// Run the tests
runPerformanceTests()
  .then(() => {
    console.log('Performance tests completed successfully.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error running performance tests:', error);
    process.exit(1);
  }); 