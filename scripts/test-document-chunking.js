/**
 * Test script for document chunking with SEC filings
 *
 * This script tests the chunking capabilities for large SEC filings
 * with both semantic and size-based chunking strategies.
 */
import axios from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';
import { chunkParsedFiling, reconstructDocument, measureMemoryUsage } from '../lib/parsers/chunk-manager';
import { createFilingParser } from '../lib/parsers/filing-parser-factory';
import { Logger } from '../lib/logging';
// Initialize logger
const logger = new Logger({}, 'test-document-chunking');
// Define some large filing examples to test with
const TEST_FILINGS = [
    {
        description: 'Tesla 10-K (2022)',
        url: 'https://www.sec.gov/ix?doc=/Archives/edgar/data/1318605/000095017023001409/tsla-20221231.htm',
        type: '10-K'
    },
    {
        description: 'Apple 10-K (2022)',
        url: 'https://www.sec.gov/ix?doc=/Archives/edgar/data/320193/000032019322000108/aapl-20220924.htm',
        type: '10-K'
    },
    {
        description: 'Microsoft 10-K (2022)',
        url: 'https://www.sec.gov/ix?doc=/Archives/edgar/data/789019/000156459022027041/msft-10k_20220630.htm',
        type: '10-K'
    }
];
// Chunking configurations to test
const CHUNK_CONFIGS = [
    {
        maxChunkSize: 4000,
        chunkOverlap: 500,
        respectSemanticBoundaries: true,
        includeTables: true,
        includeLists: true
    },
    {
        maxChunkSize: 8000,
        chunkOverlap: 1000,
        respectSemanticBoundaries: true,
        includeTables: false, // Test with tables as separate chunks
        includeLists: true
    },
    {
        maxChunkSize: 4000,
        chunkOverlap: 200,
        respectSemanticBoundaries: false, // Force size-based chunking
        includeTables: true,
        includeLists: true
    }
];
/**
 * Main test function
 */
async function runChunkingTest() {
    var _a;
    logger.info('Starting document chunking test');
    try {
        // Create output directory if it doesn't exist
        const outputDir = path.join(process.cwd(), 'test-output');
        await fs.mkdir(outputDir, { recursive: true });
        // Test each filing
        for (const filing of TEST_FILINGS) {
            logger.info(`Testing with ${filing.description}`);
            // Fetch and parse the filing
            const response = await axios.get(filing.url, {
                headers: {
                    'User-Agent': 'TLDRSec-AI/1.0 (https://tldrsec.com; support@tldrsec.com)'
                }
            });
            const html = response.data;
            // Create a parser for this filing type
            const parser = createFilingParser(filing.type);
            // Measure memory usage and time for parsing
            const startParseTime = Date.now();
            const parsedFiling = parser(html, { includeFullText: true });
            const parseTime = Date.now() - startParseTime;
            // Log filing statistics
            logger.info(`Parsed ${filing.description} in ${parseTime}ms`);
            logger.info(`Memory usage: ${measureMemoryUsage(parsedFiling).toFixed(2)} MB`);
            logger.info(`Full text length: ${((_a = parsedFiling.fullText) === null || _a === void 0 ? void 0 : _a.length) || 0} characters`);
            logger.info(`Number of sections: ${parsedFiling.sections.length}`);
            logger.info(`Number of tables: ${parsedFiling.tables.length}`);
            // Test with different chunking configurations
            for (const [index, config] of CHUNK_CONFIGS.entries()) {
                logger.info(`Testing chunking config #${index + 1}: maxChunkSize=${config.maxChunkSize}, overlap=${config.chunkOverlap}`);
                // Measure time for chunking
                const startChunkTime = Date.now();
                const chunkResult = chunkParsedFiling(parsedFiling, config);
                const chunkTime = Date.now() - startChunkTime;
                // Log chunking statistics
                logger.info(`Chunked into ${chunkResult.totalChunks} chunks in ${chunkTime}ms`);
                logger.info(`Average chunk size: ${chunkResult.averageChunkSize.toFixed(0)} characters`);
                // Verify chunk sizes are within expected bounds
                const oversizedChunks = chunkResult.chunks.filter(chunk => chunk.content.length > config.maxChunkSize * 1.2);
                if (oversizedChunks.length > 0) {
                    logger.warn(`Found ${oversizedChunks.length} oversized chunks (>20% of max size)`);
                }
                // Test document reconstruction
                const startReconstructTime = Date.now();
                const reconstructed = reconstructDocument(chunkResult.chunks, config);
                const reconstructTime = Date.now() - startReconstructTime;
                logger.info(`Reconstructed document in ${reconstructTime}ms`);
                // Check if semantic boundaries were respected
                checkSemanticBoundaries(chunkResult.chunks, config.respectSemanticBoundaries);
                // Write out test results for inspection
                await writeTestResults(outputDir, filing, chunkResult, index, config);
            }
        }
        logger.info('Document chunking tests completed successfully');
    }
    catch (error) {
        logger.error('Error running chunking tests:', error);
    }
}
/**
 * Check if semantic boundaries were respected in chunking
 */
function checkSemanticBoundaries(chunks, respectSemanticBoundaries) {
    if (!respectSemanticBoundaries) {
        return; // No verification needed for pure size-based chunking
    }
    // Count chunks that break sentences
    let sentenceBreaks = 0;
    const sentenceEndRegex = /[.!?]['")]?\s*$/;
    const sentenceStartRegex = /^['"(]?[A-Z]/;
    for (let i = 0; i < chunks.length - 1; i++) {
        const currentChunkEnd = chunks[i].content.slice(-100).trim();
        const nextChunkStart = chunks[i + 1].content.slice(0, 100).trim();
        if (!sentenceEndRegex.test(currentChunkEnd) && sentenceStartRegex.test(nextChunkStart)) {
            sentenceBreaks++;
        }
    }
    if (sentenceBreaks > 0) {
        logger.warn(`Found ${sentenceBreaks} potential broken sentences across chunk boundaries`);
    }
    else {
        logger.info('Semantic boundaries appear to be preserved');
    }
}
/**
 * Write test results to files for inspection
 */
async function writeTestResults(outputDir, filing, chunkResult, configIndex, config) {
    try {
        // Create a subdirectory for this filing
        const filingDir = path.join(outputDir, `${filing.type}-${filing.description.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`);
        await fs.mkdir(filingDir, { recursive: true });
        // Create a subdirectory for this config
        const configDir = path.join(filingDir, `config-${configIndex + 1}`);
        await fs.mkdir(configDir, { recursive: true });
        // Write configuration details
        await fs.writeFile(path.join(configDir, 'config.json'), JSON.stringify(config, null, 2));
        // Write overall chunk statistics
        await fs.writeFile(path.join(configDir, 'stats.json'), JSON.stringify({
            totalChunks: chunkResult.totalChunks,
            originalLength: chunkResult.originalLength,
            averageChunkSize: chunkResult.averageChunkSize,
            minChunkSize: Math.min(...chunkResult.chunkLengths),
            maxChunkSize: Math.max(...chunkResult.chunkLengths),
        }, null, 2));
        // Write sample chunks (first, middle, last)
        const chunks = chunkResult.chunks;
        if (chunks.length > 0) {
            await fs.writeFile(path.join(configDir, 'chunk-first.txt'), chunks[0].content);
            if (chunks.length > 2) {
                const middleIndex = Math.floor(chunks.length / 2);
                await fs.writeFile(path.join(configDir, 'chunk-middle.txt'), chunks[middleIndex].content);
            }
            await fs.writeFile(path.join(configDir, 'chunk-last.txt'), chunks[chunks.length - 1].content);
        }
    }
    catch (error) {
        logger.error('Error writing test results:', error);
    }
}
// Run the test
runChunkingTest()
    .then(() => {
    logger.info('Document chunking test script completed');
    process.exit(0);
})
    .catch(error => {
    logger.error('Fatal error in test script:', error);
    process.exit(1);
});
