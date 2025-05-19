/**
 * Document Chunking Manager for SEC Filings
 *
 * Handles chunking of large SEC filings into manageable pieces for AI processing.
 * Supports both semantic chunking (based on document structure) and size-based chunking.
 */
import { FilingSectionType } from './html-parser';
import { Logger } from '@/lib/logging';
// Create a logger for the chunk manager
const logger = new Logger({}, 'chunk-manager');
/**
 * Default chunking options
 */
const DEFAULT_CHUNK_OPTIONS = {
    maxChunkSize: 4000, // Aligned with typical AI context window limitations
    chunkOverlap: 500, // Reasonable overlap to maintain context
    respectSemanticBoundaries: true,
    minChunkSize: 100,
    includeTables: true,
    includeLists: true,
    separator: '\n\n',
};
/**
 * Chunk a parsed SEC filing into smaller pieces
 *
 * @param filing The parsed SEC filing to chunk
 * @param options Chunking options
 * @returns The chunking result
 */
export function chunkParsedFiling(filing, options = DEFAULT_CHUNK_OPTIONS) {
    try {
        logger.debug(`Chunking ${filing.filingType} filing`);
        // Merge options with defaults
        const mergedOptions = Object.assign(Object.assign({}, DEFAULT_CHUNK_OPTIONS), options);
        // If filing has sections, use semantic chunking
        if (filing.sections && filing.sections.length > 0) {
            return semanticChunking(filing, mergedOptions);
        }
        // Otherwise, default to simple chunking of the full text
        return sizeBasedChunking(filing.fullText || JSON.stringify(filing.importantSections), mergedOptions);
    }
    catch (error) {
        logger.error('Error chunking filing:', error);
        throw new Error(`Failed to chunk filing: ${error}`);
    }
}
/**
 * Chunk a document based on semantic structure (sections, paragraphs)
 *
 * @param filing The parsed SEC filing
 * @param options Chunking options
 * @returns The chunking result
 */
function semanticChunking(filing, options) {
    var _a;
    const chunks = [];
    let currentChunk = [];
    let currentChunkSize = 0;
    let currentChunkMetadata = {
        sectionTypes: [],
        sectionTitles: [],
        isTable: false,
        isList: false,
    };
    const processSection = (section, depth = 0) => {
        // If the current chunk is already at or near max size, finalize it
        if (currentChunkSize >= options.maxChunkSize && currentChunk.length > 0) {
            finalizeChunk();
        }
        // Process tables and lists separately if configured
        if (section.type === FilingSectionType.TABLE && !options.includeTables) {
            // For tables, create individual chunks if they're excluded from main content
            const tableChunk = {
                id: chunks.length,
                content: section.content,
                metadata: {
                    start: 0, // We don't track exact positions in semantic chunking
                    end: section.content.length,
                    sectionTypes: [FilingSectionType.TABLE],
                    sectionTitles: section.title ? [section.title] : [],
                    isTable: true,
                    charCount: section.content.length
                }
            };
            chunks.push(tableChunk);
            return;
        }
        if (section.type === FilingSectionType.LIST && !options.includeLists) {
            // For lists, create individual chunks if they're excluded from main content
            const listChunk = {
                id: chunks.length,
                content: section.content,
                metadata: {
                    start: 0, // We don't track exact positions in semantic chunking
                    end: section.content.length,
                    sectionTypes: [FilingSectionType.LIST],
                    sectionTitles: section.title ? [section.title] : [],
                    isList: true,
                    charCount: section.content.length
                }
            };
            chunks.push(listChunk);
            return;
        }
        // Add the section to the current chunk
        let sectionText = '';
        // Include title if present
        if (section.title) {
            const titlePrefix = '#'.repeat(Math.min(depth + 1, 6)) + ' ';
            sectionText += titlePrefix + section.title + '\n\n';
            currentChunkMetadata.sectionTitles.push(section.title);
        }
        // Add content if present
        if (section.content) {
            sectionText += section.content + '\n\n';
        }
        // Track section type
        currentChunkMetadata.sectionTypes.push(section.type);
        // Update flags for special content
        if (section.type === FilingSectionType.TABLE) {
            currentChunkMetadata.isTable = true;
        }
        if (section.type === FilingSectionType.LIST) {
            currentChunkMetadata.isList = true;
        }
        // If adding this section would exceed max chunk size, create a new chunk
        if (currentChunkSize + sectionText.length > options.maxChunkSize &&
            currentChunkSize > options.minChunkSize) {
            finalizeChunk();
            currentChunk.push(sectionText);
            currentChunkSize = sectionText.length;
        }
        else {
            // Otherwise add to current chunk
            currentChunk.push(sectionText);
            currentChunkSize += sectionText.length;
        }
        // Process children recursively
        if (section.children && section.children.length > 0) {
            section.children.forEach(child => processSection(child, depth + 1));
        }
    };
    const finalizeChunk = () => {
        if (currentChunk.length === 0)
            return;
        const content = currentChunk.join('');
        chunks.push({
            id: chunks.length,
            content,
            metadata: {
                start: 0, // We don't track exact positions in semantic chunking
                end: content.length,
                sectionTypes: [...currentChunkMetadata.sectionTypes],
                sectionTitles: [...currentChunkMetadata.sectionTitles],
                isTable: currentChunkMetadata.isTable,
                isList: currentChunkMetadata.isList,
                charCount: content.length
            }
        });
        // Reset for next chunk, but keep overlap if configured
        currentChunk = [];
        currentChunkSize = 0;
        currentChunkMetadata = {
            sectionTypes: [],
            sectionTitles: [],
            isTable: false,
            isList: false,
        };
    };
    // Process all sections
    filing.sections.forEach(section => processSection(section));
    // Finalize the last chunk if needed
    if (currentChunk.length > 0) {
        finalizeChunk();
    }
    // Calculate statistics
    const chunkLengths = chunks.map(c => c.content.length);
    const totalLength = chunkLengths.reduce((acc, len) => acc + len, 0);
    const averageSize = totalLength / chunks.length;
    return {
        chunks,
        totalChunks: chunks.length,
        originalLength: totalLength,
        chunkLengths,
        averageChunkSize: averageSize,
        metadata: {
            options,
            filingType: filing.filingType,
            documentTitle: filing.importantSections['Title'] || ((_a = filing.metadata) === null || _a === void 0 ? void 0 : _a.companyName)
        }
    };
}
/**
 * Chunk a document based purely on size
 *
 * @param text The text to chunk
 * @param options Chunking options
 * @returns The chunking result
 */
function sizeBasedChunking(text, options) {
    const chunks = [];
    const { maxChunkSize, chunkOverlap } = options;
    // Ensure valid configuration
    if (maxChunkSize <= chunkOverlap) {
        throw new Error('Maximum chunk size must be greater than overlap size');
    }
    // Create appropriate chunk boundaries
    const chunkBoundaries = findChunkBoundaries(text, maxChunkSize, chunkOverlap, options.respectSemanticBoundaries);
    // Create chunks based on boundaries
    for (let i = 0; i < chunkBoundaries.length - 1; i++) {
        const start = chunkBoundaries[i];
        const end = chunkBoundaries[i + 1] + (i < chunkBoundaries.length - 2 ? chunkOverlap : 0);
        const content = text.substring(start, Math.min(end, text.length));
        chunks.push({
            id: i,
            content,
            metadata: {
                start,
                end,
                sectionTypes: [FilingSectionType.PARAGRAPH], // Default type
                sectionTitles: [],
                charCount: content.length
            }
        });
    }
    // Calculate statistics
    const chunkLengths = chunks.map(c => c.content.length);
    const totalLength = text.length;
    const averageSize = chunks.length > 0 ? totalLength / chunks.length : 0;
    return {
        chunks,
        totalChunks: chunks.length,
        originalLength: totalLength,
        chunkLengths,
        averageChunkSize: averageSize,
        metadata: {
            options
        }
    };
}
/**
 * Find appropriate chunk boundaries respecting semantic structures
 * like paragraphs and sentences when possible
 */
function findChunkBoundaries(text, maxChunkSize, overlap, respectSemanticBoundaries) {
    const boundaries = [0]; // Start with the beginning of text
    let currentPos = maxChunkSize;
    while (currentPos < text.length) {
        let breakPoint = currentPos;
        if (respectSemanticBoundaries) {
            // Look for paragraph breaks first (most preferred)
            const paragraphBreak = text.lastIndexOf('\n\n', currentPos);
            if (paragraphBreak !== -1 && paragraphBreak > currentPos - maxChunkSize / 2) {
                breakPoint = paragraphBreak + 2; // +2 to include the paragraph break
            }
            else {
                // Look for sentence breaks
                const sentenceBreaks = ['. ', '! ', '? ', '.\n', '!\n', '?\n'];
                let bestBreakPoint = -1;
                for (const sentenceBreak of sentenceBreaks) {
                    const breakIndex = text.lastIndexOf(sentenceBreak, currentPos);
                    if (breakIndex !== -1 && breakIndex > currentPos - maxChunkSize / 2 && breakIndex > bestBreakPoint) {
                        bestBreakPoint = breakIndex + sentenceBreak.length; // Include the break
                    }
                }
                if (bestBreakPoint !== -1) {
                    breakPoint = bestBreakPoint;
                }
                else {
                    // Fall back to word boundaries
                    const spaceBreak = text.lastIndexOf(' ', currentPos);
                    if (spaceBreak !== -1 && spaceBreak > currentPos - maxChunkSize / 3) {
                        breakPoint = spaceBreak + 1; // Include the space
                    }
                }
            }
        }
        // Add the boundary and advance
        boundaries.push(breakPoint);
        currentPos = breakPoint + maxChunkSize - overlap;
    }
    // Add the end of the text if it's not already included
    if (boundaries[boundaries.length - 1] < text.length) {
        boundaries.push(text.length);
    }
    return boundaries;
}
/**
 * Reconstruct the original document from chunks
 *
 * @param chunks The document chunks
 * @param options Options for reconstruction (particularly the separator)
 * @returns The reconstructed text
 */
export function reconstructDocument(chunks, options = DEFAULT_CHUNK_OPTIONS) {
    // Sort chunks by ID to ensure correct order
    chunks.sort((a, b) => a.id - b.id);
    const separator = options.separator || DEFAULT_CHUNK_OPTIONS.separator;
    let reconstructed = '';
    for (let i = 0; i < chunks.length; i++) {
        reconstructed += chunks[i].content;
        // Add separator between chunks if not the last chunk
        if (i < chunks.length - 1) {
            reconstructed += separator;
        }
    }
    return reconstructed;
}
/**
 * Measure memory usage of a parsed filing or text
 * Used for benchmarking and optimization
 */
export function measureMemoryUsage(input) {
    let byteSize = 0;
    if (typeof input === 'string') {
        byteSize = Buffer.byteLength(input, 'utf8');
    }
    else {
        byteSize = Buffer.byteLength(JSON.stringify(input), 'utf8');
    }
    // Return size in megabytes
    return byteSize / (1024 * 1024);
}
