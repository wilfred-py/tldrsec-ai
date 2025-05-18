import { PrismaClient } from '@prisma/client';
import { SECDataClient } from './sec-client';
/**
 * Service for resolving ticker symbols to CIK numbers and company information
 */
export class TickerResolver {
    constructor(options = {}) {
        this.cache = new Map();
        this.cacheTimeoutMs = 24 * 60 * 60 * 1000; // 24 hours
        this.cacheMaxSize = 1000; // Maximum cache size
        this.prisma = options.prisma || new PrismaClient();
        this.secClient = options.secClient || new SECDataClient();
        this.cacheTimeoutMs = options.cacheTimeoutMs || this.cacheTimeoutMs;
        this.cacheMaxSize = options.cacheMaxSize || this.cacheMaxSize;
    }
    /**
     * Resolve a ticker symbol to its CIK and company information
     * @param ticker Ticker symbol to resolve
     * @param options Resolution options
     * @returns Resolution result
     */
    async resolveTicker(ticker, options = {}) {
        // Normalize the ticker
        const normalizedTicker = this.normalizeTicker(ticker);
        // Start with a basic result
        const result = {
            success: false,
            ticker,
            normalizedTicker
        };
        try {
            // Check memory cache first if not forcing refresh
            if (!options.forceRefresh) {
                const cacheResult = this.checkCache(normalizedTicker);
                if (cacheResult) {
                    return Object.assign(Object.assign({}, result), { success: true, cik: cacheResult.cik, companyName: cacheResult.companyName, source: 'cache' });
                }
            }
            // Then check database
            const dbMappingResult = await this.findInDatabase(normalizedTicker);
            if (dbMappingResult) {
                // Add to cache
                this.addToCache(normalizedTicker, {
                    cik: dbMappingResult.cik,
                    companyName: dbMappingResult.companyName,
                    timestamp: Date.now()
                });
                return Object.assign(Object.assign({}, result), { success: true, cik: dbMappingResult.cik, companyName: dbMappingResult.companyName, source: 'database' });
            }
            // If not found in database, and createIfNotExists is enabled, fetch from SEC
            if (options.createIfNotExists) {
                return await this.fetchAndStoreCikInformation(normalizedTicker, options);
            }
            // If fuzzy matching is enabled, try to find a similar ticker
            if (options.fuzzyMatch) {
                // Implement fuzzy matching logic here
                // This would search for similar company names or ticker symbols
                // For now, we'll just return not found
            }
            // Not found
            return Object.assign(Object.assign({}, result), { success: false, error: `Ticker ${normalizedTicker} not found in database or SEC API` });
        }
        catch (error) {
            console.error(`Error resolving ticker ${normalizedTicker}:`, error);
            return Object.assign(Object.assign({}, result), { success: false, error: error.message });
        }
    }
    /**
     * Fetches CIK information from SEC API and stores it in the database
     */
    async fetchAndStoreCikInformation(ticker, options) {
        try {
            // For new tickers, we need to search by ticker symbol in a list
            // This is a simplification - in a production app, we would need a more complex lookup
            // To handle this properly, we would need to maintain a database of all tickers and their CIKs
            // For demonstration purposes, we'll use a direct ticker lookup approach
            // This assumes we already know the CIK for the ticker, which would not be the case
            // In a real implementation, we would need to use the SEC's ticker-to-CIK lookup or
            // a third-party data source for the initial lookup
            // In practice, we'd need a way to get the CIK from a ticker first
            // For now, we'll use a mock implementation where we assume tickers are actual CIKs
            // This is just for demonstration - in a real app, this would be a more complex process
            // Pretend ticker is a CIK for demonstration (this is NOT how it would work in production)
            const mockCik = ticker.replace(/\D/g, '').padStart(10, '0');
            console.log(`Fetching SEC data for ticker ${ticker} (using mock CIK: ${mockCik})`);
            // Get company data from SEC
            const companyData = await this.secClient.getCompanyData(mockCik);
            // Process the company data
            const cikData = this.processCompanyData(companyData);
            // If the actual ticker from SEC doesn't match our query, it's probably not correct
            if (!cikData.aliases.includes(ticker.toUpperCase())) {
                return {
                    success: false,
                    ticker,
                    normalizedTicker: ticker,
                    error: `Ticker ${ticker} not found in SEC data`
                };
            }
            // Store in database
            const dbEntry = await this.createCikMapping(cikData);
            // Add to cache
            this.addToCache(ticker, {
                cik: dbEntry.cik,
                companyName: dbEntry.companyName,
                timestamp: Date.now()
            });
            return {
                success: true,
                ticker,
                normalizedTicker: ticker,
                cik: dbEntry.cik,
                companyName: dbEntry.companyName,
                source: 'sec-api'
            };
        }
        catch (error) {
            console.error(`Error fetching CIK information from SEC for ${ticker}:`, error);
            // Create a record of the failed attempt
            await this.recordFailedLookup(ticker, error.message);
            return {
                success: false,
                ticker,
                normalizedTicker: ticker,
                error: `Failed to fetch CIK information from SEC: ${error.message}`
            };
        }
    }
    /**
     * Record a failed lookup attempt in the database
     */
    async recordFailedLookup(ticker, errorMessage) {
        try {
            // Check if we already have a record for this ticker
            const existingMapping = await this.prisma.cikMapping.findFirst({
                where: {
                    OR: [
                        { ticker: { equals: ticker, mode: 'insensitive' } },
                        { aliases: { has: ticker.toUpperCase() } }
                    ]
                }
            });
            if (existingMapping) {
                // Update the existing record
                await this.prisma.cikMapping.update({
                    where: { id: existingMapping.id },
                    data: {
                        fetchAttempts: { increment: 1 },
                        lastFetchStatus: errorMessage,
                        lastUpdated: new Date()
                    }
                });
            }
            else {
                // Create a new record for the failed attempt
                await this.prisma.cikMapping.create({
                    data: {
                        cik: 'UNKNOWN',
                        ticker: ticker.toUpperCase(),
                        companyName: 'Unknown',
                        aliases: [ticker.toUpperCase()],
                        exchangeCodes: [],
                        fetchAttempts: 1,
                        lastFetchStatus: errorMessage,
                        isActive: false
                    }
                });
            }
        }
        catch (error) {
            console.error(`Error recording failed lookup for ${ticker}:`, error);
            // Don't throw - this is just for tracking
        }
    }
    /**
     * Process company data from SEC API into our database format
     */
    processCompanyData(data) {
        // Format CIK with leading zeros
        const formattedCik = data.cik.padStart(10, '0');
        // Process former names into the format we need
        const formerNames = {};
        if (data.formerNames && data.formerNames.length > 0) {
            data.formerNames.forEach((name, index) => {
                formerNames[`name_${index}`] = {
                    from: name.from,
                    to: name.to
                };
            });
        }
        // Return formatted data
        return {
            cik: formattedCik,
            ticker: data.tickers && data.tickers.length > 0 ? data.tickers[0] : 'UNKNOWN',
            companyName: data.name,
            aliases: data.tickers || [],
            exchangeCodes: data.exchanges || [],
            sic: data.sic,
            ein: data.ein || undefined,
            entityType: data.entityType,
            formerNames: Object.keys(formerNames).length > 0 ? formerNames : undefined,
            formerTickers: undefined, // Not provided by SEC API
            lastFetchStatus: 'success',
            isActive: true
        };
    }
    /**
     * Create a new CIK mapping entry in the database
     */
    async createCikMapping(data) {
        return await this.prisma.cikMapping.create({
            data: Object.assign(Object.assign({}, data), { fetchAttempts: 1 })
        });
    }
    /**
     * Find a ticker in the database
     */
    async findInDatabase(ticker) {
        try {
            // Look for exact match on ticker or in aliases array
            const mapping = await this.prisma.cikMapping.findFirst({
                where: {
                    OR: [
                        { ticker: { equals: ticker, mode: 'insensitive' } },
                        { aliases: { has: ticker.toUpperCase() } }
                    ],
                    isActive: true
                }
            });
            return mapping;
        }
        catch (error) {
            console.error(`Error finding ticker ${ticker} in database:`, error);
            return null;
        }
    }
    /**
     * Check if a ticker is in the memory cache
     */
    checkCache(ticker) {
        const cacheEntry = this.cache.get(ticker);
        if (!cacheEntry) {
            return null;
        }
        // Check if cache entry is expired
        if (Date.now() - cacheEntry.timestamp > this.cacheTimeoutMs) {
            this.cache.delete(ticker);
            return null;
        }
        return cacheEntry;
    }
    /**
     * Add a ticker to the memory cache
     */
    addToCache(ticker, entry) {
        // Evict old entries if cache is too large
        if (this.cache.size >= this.cacheMaxSize) {
            // Remove oldest entries (first 10% of cache)
            const keysToRemove = Array.from(this.cache.keys())
                .slice(0, Math.floor(this.cacheMaxSize * 0.1));
            keysToRemove.forEach(key => this.cache.delete(key));
        }
        this.cache.set(ticker, entry);
    }
    /**
     * Normalize a ticker symbol (e.g., convert to uppercase, remove whitespace)
     */
    normalizeTicker(ticker) {
        // Remove whitespace, convert to uppercase, remove any special characters
        return ticker.trim().toUpperCase().replace(/[^\w.-]/g, '');
    }
    /**
     * Refresh the CIK information for a ticker from the SEC API
     */
    async refreshTickerInfo(ticker) {
        return this.resolveTicker(ticker, { forceRefresh: true, createIfNotExists: true });
    }
    /**
     * Batch resolve multiple tickers
     */
    async batchResolveTickers(tickers, options = {}) {
        const results = {};
        // Process each ticker in sequence to respect rate limits
        for (const ticker of tickers) {
            results[ticker] = await this.resolveTicker(ticker, options);
        }
        return results;
    }
    /**
     * Clear the memory cache
     */
    clearCache() {
        this.cache.clear();
    }
}
