"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FilingStorage = void 0;
const client_1 = require("@prisma/client");
const types_1 = require("./types");
const ticker_service_1 = require("./ticker-service");
/**
 * Service for storing and retrieving SEC filings from the database
 */
class FilingStorage {
    constructor(options = {}) {
        this.prisma = options.prisma || new client_1.PrismaClient();
        this.tickerResolver = options.tickerResolver || new ticker_service_1.TickerResolver({ prisma: this.prisma });
        // Default options
        this.defaultOptions = {
            deduplicateByUrl: true,
            updateExisting: true,
            archiveThresholdDays: 365, // 1 year
            batchSize: 100,
            ...options.defaultOptions
        };
    }
    /**
     * Store a filing in the database
     * @param filing Filing to store
     * @param options Storage options
     * @returns Stored filing with database ID
     */
    async storeFiling(filing, options = {}) {
        const opts = { ...this.defaultOptions, ...options };
        try {
            // Check if this is a duplicate if deduplication is enabled
            if (opts.deduplicateByUrl) {
                const existingFiling = await this.findFilingByUrl(filing.filingUrl);
                if (existingFiling) {
                    if (opts.updateExisting) {
                        // Update the existing filing
                        return await this.updateFiling(existingFiling.id, filing);
                    }
                    else {
                        // Skip inserting duplicate
                        return existingFiling;
                    }
                }
            }
            // Resolve the ticker to ensure we have the correct CIK
            const tickerResolution = await this.tickerResolver.resolveTicker(filing.ticker, {
                createIfNotExists: true
            });
            if (!tickerResolution.success) {
                throw new types_1.SECEdgarError(`Failed to resolve ticker ${filing.ticker}: ${tickerResolution.error}`, types_1.SECErrorCode.NOT_FOUND);
            }
            // Extract related company data from the database
            const cikMapping = await this.prisma.cikMapping.findFirst({
                where: {
                    OR: [
                        { ticker: { equals: filing.ticker, mode: 'insensitive' } },
                        { aliases: { has: filing.ticker.toUpperCase() } },
                        { cik: filing.cik.replace(/^0+/, '') } // Remove leading zeros for comparison
                    ],
                    isActive: true
                }
            });
            // Find the ticker in the user's watchlist
            const tickers = await this.prisma.ticker.findMany({
                where: {
                    symbol: { equals: filing.ticker, mode: 'insensitive' }
                }
            });
            // Create summaries for each user watching this ticker
            const summaries = [];
            for (const ticker of tickers) {
                const summary = await this.prisma.summary.create({
                    data: {
                        tickerId: ticker.id,
                        filingType: filing.filingType,
                        filingDate: filing.filingDate,
                        filingUrl: filing.filingUrl,
                        summaryText: filing.description || `${filing.filingType} filing for ${filing.companyName}`,
                        // Store the full filing data as JSON for future reference
                        summaryJSON: {
                            ...filing,
                            // Remove circular references or large fields if needed
                            content: filing.content ? filing.content.substring(0, 10000) : undefined
                        }
                    }
                });
                summaries.push(summary);
            }
            // Return the original filing with summaries
            return {
                ...filing,
                // If needed, we could add summary IDs or other metadata here
            };
        }
        catch (error) {
            console.error(`Error storing filing for ${filing.ticker} (${filing.filingType}):`, error);
            throw new types_1.SECEdgarError(`Failed to store filing: ${error.message}`, types_1.SECErrorCode.UNKNOWN_ERROR);
        }
    }
    /**
     * Find a filing by URL
     * @param url Filing URL to search for
     * @returns Filing if found, null otherwise
     */
    async findFilingByUrl(url) {
        try {
            const summary = await this.prisma.summary.findFirst({
                where: {
                    filingUrl: url
                }
            });
            if (!summary) {
                return null;
            }
            // Get the ticker to retrieve company information
            const ticker = await this.prisma.ticker.findUnique({
                where: {
                    id: summary.tickerId
                }
            });
            if (!ticker) {
                return null;
            }
            // Reconstruct the filing from summary data
            const filing = {
                id: summary.id,
                companyName: ticker.companyName,
                ticker: ticker.symbol,
                cik: summary.summaryJSON?.cik || '',
                filingType: summary.filingType,
                filingDate: summary.filingDate,
                filingUrl: summary.filingUrl,
                description: summary.summaryText,
                // Extract other fields from summaryJSON if needed
                ...summary.summaryJSON
            };
            return filing;
        }
        catch (error) {
            console.error(`Error finding filing by URL ${url}:`, error);
            return null;
        }
    }
    /**
     * Update an existing filing
     * @param id Filing ID
     * @param filing Updated filing data
     * @returns Updated filing
     */
    async updateFiling(id, filing) {
        try {
            // Find all summaries with this filing URL
            const summaries = await this.prisma.summary.findMany({
                where: {
                    filingUrl: filing.filingUrl
                },
                include: {
                    ticker: true
                }
            });
            if (!summaries.length) {
                throw new types_1.SECEdgarError(`Filing with ID ${id} not found`, types_1.SECErrorCode.NOT_FOUND);
            }
            // Update each summary
            for (const summary of summaries) {
                await this.prisma.summary.update({
                    where: {
                        id: summary.id
                    },
                    data: {
                        filingType: filing.filingType || summary.filingType,
                        filingDate: filing.filingDate || summary.filingDate,
                        summaryText: filing.description || summary.summaryText,
                        // Update the JSON data if provided
                        ...(filing.content ? {
                            summaryJSON: {
                                ...summary.summaryJSON,
                                ...filing,
                                content: filing.content.substring(0, 10000)
                            }
                        } : {})
                    }
                });
            }
            // Return the first summary as the updated filing
            const firstSummary = summaries[0];
            return {
                id: firstSummary.id,
                companyName: firstSummary.ticker.companyName,
                ticker: firstSummary.ticker.symbol,
                cik: firstSummary.summaryJSON?.cik || '',
                filingType: (filing.filingType || firstSummary.filingType),
                filingDate: filing.filingDate || firstSummary.filingDate,
                filingUrl: firstSummary.filingUrl,
                description: filing.description || firstSummary.summaryText,
                // Include other fields from the original filing
                ...firstSummary.summaryJSON,
                // Override with updated fields
                ...filing
            };
        }
        catch (error) {
            console.error(`Error updating filing ${id}:`, error);
            if (error instanceof types_1.SECEdgarError) {
                throw error;
            }
            throw new types_1.SECEdgarError(`Failed to update filing: ${error.message}`, types_1.SECErrorCode.UNKNOWN_ERROR);
        }
    }
    /**
     * Store multiple filings in a transaction
     * @param filings Filings to store
     * @param options Storage options
     * @returns Array of stored filings with database IDs
     */
    async storeFilingsBatch(filings, options = {}) {
        const opts = { ...this.defaultOptions, ...options };
        const batchSize = opts.batchSize || 100;
        const results = [];
        // Process in batches to avoid excessive memory usage
        for (let i = 0; i < filings.length; i += batchSize) {
            const batch = filings.slice(i, i + batchSize);
            // Process each batch in a transaction for atomicity
            try {
                await this.prisma.$transaction(async (tx) => {
                    // Create a temporary filing storage with the transaction client
                    const tempStorage = new FilingStorage({
                        prisma: tx,
                        tickerResolver: this.tickerResolver,
                        defaultOptions: opts
                    });
                    // Store each filing in the batch
                    for (const filing of batch) {
                        const result = await tempStorage.storeFiling(filing, opts);
                        results.push(result);
                    }
                });
            }
            catch (error) {
                console.error(`Error storing batch of ${batch.length} filings:`, error);
                throw new types_1.SECEdgarError(`Failed to store batch of filings: ${error.message}`, types_1.SECErrorCode.UNKNOWN_ERROR);
            }
        }
        return results;
    }
    /**
     * Find filings by ticker symbol
     * @param ticker Ticker symbol
     * @param limit Maximum number of filings to return
     * @returns Array of filings
     */
    async findFilingsByTicker(ticker, limit = 50) {
        try {
            const normalizedTicker = ticker.trim().toUpperCase();
            // Find all tickers matching this symbol
            const tickerRecords = await this.prisma.ticker.findMany({
                where: {
                    symbol: { equals: normalizedTicker, mode: 'insensitive' }
                }
            });
            if (!tickerRecords.length) {
                return [];
            }
            // Get summaries for these tickers
            const summaries = await this.prisma.summary.findMany({
                where: {
                    tickerId: {
                        in: tickerRecords.map((t) => t.id)
                    }
                },
                orderBy: {
                    filingDate: 'desc'
                },
                take: limit,
                include: {
                    ticker: true
                }
            });
            // Create a map of ticker IDs to ticker records for faster lookup
            const tickerMap = new Map(tickerRecords.map((t) => [t.id, t]));
            // Convert summaries to filings
            return summaries.map((summary) => {
                const ticker = tickerMap.get(summary.tickerId) || summary.ticker;
                return {
                    id: summary.id,
                    companyName: ticker.companyName,
                    ticker: ticker.symbol,
                    cik: summary.summaryJSON?.cik || '',
                    filingType: summary.filingType,
                    filingDate: summary.filingDate,
                    filingUrl: summary.filingUrl,
                    description: summary.summaryText,
                    // Include other fields from the summary JSON
                    ...summary.summaryJSON
                };
            });
        }
        catch (error) {
            console.error(`Error finding filings for ticker ${ticker}:`, error);
            return [];
        }
    }
    /**
     * Find filings by date range
     * @param options Date range options
     * @returns Array of filings
     */
    async findFilingsByDateRange(options) {
        const { startDate, endDate, filingTypes, limit = 100 } = options;
        try {
            // Build the where clause
            const where = {};
            if (startDate || endDate) {
                where.filingDate = {};
                if (startDate)
                    where.filingDate.gte = startDate;
                if (endDate)
                    where.filingDate.lte = endDate;
            }
            if (filingTypes?.length) {
                where.filingType = { in: filingTypes };
            }
            // Query summaries with this date range
            const summaries = await this.prisma.summary.findMany({
                where,
                orderBy: {
                    filingDate: 'desc'
                },
                take: limit,
                include: {
                    ticker: true
                }
            });
            // Convert summaries to filings
            return summaries.map((summary) => ({
                id: summary.id,
                companyName: summary.ticker.companyName,
                ticker: summary.ticker.symbol,
                cik: summary.summaryJSON?.cik || '',
                filingType: summary.filingType,
                filingDate: summary.filingDate,
                filingUrl: summary.filingUrl,
                description: summary.summaryText,
                // Include other fields from the summary JSON
                ...summary.summaryJSON
            }));
        }
        catch (error) {
            console.error(`Error finding filings by date range:`, error);
            return [];
        }
    }
    /**
     * Mark filings as sent to users
     * @param ids Filing IDs to mark
     * @returns Number of filings updated
     */
    async markFilingsAsSent(ids) {
        if (!ids.length)
            return 0;
        try {
            const result = await this.prisma.summary.updateMany({
                where: {
                    id: { in: ids }
                },
                data: {
                    sentToUser: true
                }
            });
            return result.count;
        }
        catch (error) {
            console.error(`Error marking filings as sent:`, error);
            return 0;
        }
    }
    /**
     * Archive old filings (move to archive table or mark as archived)
     * @param options Archiving options
     * @returns Number of filings archived
     */
    async archiveOldFilings(options = {}) {
        const { olderThanDays = this.defaultOptions.archiveThresholdDays, filingTypes } = options;
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - (olderThanDays || 365));
            // Build the where clause
            const where = {
                filingDate: { lt: cutoffDate },
                sentToUser: true // Only archive filings that have been sent to users
            };
            if (filingTypes?.length) {
                where.filingType = { in: filingTypes };
            }
            // For now, we'll just mark them as archived by deleting them
            // In a real implementation, we might move them to an archive table
            const result = await this.prisma.summary.deleteMany({
                where
            });
            return result.count;
        }
        catch (error) {
            console.error(`Error archiving old filings:`, error);
            return 0;
        }
    }
}
exports.FilingStorage = FilingStorage;
