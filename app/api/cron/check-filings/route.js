import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { SECEdgarClient } from '@/lib/sec-edgar/client';
import { parseRssFeed, processFilingEntries } from '@/lib/sec-edgar/parsers';
import { JobQueueService } from '@/lib/job-queue';
import { LockService } from '@/lib/job-queue/lock-service';
import { logger } from '@/lib/logging';
import { monitoring } from '@/lib/monitoring';
import { appRouterAsyncHandler, createInternalError, createExternalApiError, ApiError } from '@/lib/error-handling';
import { v4 as uuidv4 } from 'uuid';
// Initialize Prisma client
const prisma = new PrismaClient();
// Initialize SEC EDGAR client with proper user agent
const secClient = new SECEdgarClient({
    userAgent: process.env.SEC_USER_AGENT || 'TLDRSEC-AI-App contact@example.com',
    maxRequestsPerSecond: 10
});
// Process ID for this instance
const processId = uuidv4();
// Component logger
const componentLogger = logger.child('sec-filing-checker');
// Filing type mapping for URL parameters to SEC filing types
const filingTypeMap = {
    '10-K': '10-K',
    '10-Q': '10-Q',
    '8-K': '8-K',
    'Form4': 'Form4',
    '4': 'Form4'
};
/**
 * GET handler for SEC filing cron job
 * This endpoint is called by Vercel Cron to check for new SEC filings
 */
export const GET = appRouterAsyncHandler(async (request) => {
    const startTime = Date.now();
    // Extract filing type from query parameters if any
    const { searchParams } = new URL(request.url);
    const typeParam = searchParams.get('type');
    const filingType = typeParam && filingTypeMap[typeParam]
        ? filingTypeMap[typeParam]
        : undefined;
    // Create a lock name that includes the filing type if specified
    const lockName = filingType
        ? `check-filings-${filingType.toLowerCase()}`
        : 'check-filings-all';
    // Log the job start
    componentLogger.info(`Starting SEC filing check`, {
        filingType,
        lockName,
        processId
    });
    // Start tracking performance
    monitoring.incrementCounter('sec.check_started', 1, {
        filingType: filingType || 'all'
    });
    // Try to acquire a lock
    const lock = await LockService.acquireLock(lockName, processId);
    if (!lock) {
        componentLogger.info(`Another instance is already checking SEC filings for ${lockName}`);
        monitoring.incrementCounter('sec.check_skipped', 1, {
            reason: 'lock_exists',
            filingType: filingType || 'all'
        });
        return NextResponse.json({
            success: true,
            message: `Another instance is already checking SEC filings for ${lockName}`,
            filingType: filingType || 'all'
        });
    }
    try {
        // If a specific filing type is requested, fetch only that type
        if (filingType) {
            componentLogger.info(`Checking SEC filings for ${filingType}`, { filingType });
            // Create a background job for checking this specific filing type
            const jobType = `CHECK_${filingType.replace('-', '').replace('Form', '')}_FILINGS`;
            // Skip direct processing and add to job queue
            await JobQueueService.addJob({
                jobType,
                payload: {
                    filingType,
                    requestedAt: new Date().toISOString()
                },
                priority: 7, // Higher priority
                idempotencyKey: `${jobType}-${new Date().toISOString().split('T')[0]}` // Daily deduplication
            });
            // Track metrics
            monitoring.incrementCounter('sec.check_queued', 1, { filingType });
            // Calculate duration
            const duration = Date.now() - startTime;
            monitoring.recordTiming('sec.check_duration', duration, {
                filingType,
                result: 'queued'
            });
            // Return success response
            return NextResponse.json({
                success: true,
                message: `Added job to check ${filingType} filings`,
                filingType,
                queued: true,
                duration
            });
        }
        // If no specific filing type, fetch recent filings
        componentLogger.info(`Checking all recent SEC filings`);
        // Fetch the RSS feed
        const rssFeedUrl = 'https://www.sec.gov/Archives/edgar/usgaap.rss.xml';
        let rssData;
        try {
            componentLogger.debug(`Fetching SEC RSS feed: ${rssFeedUrl}`);
            // Track API call start
            const apiCallStart = Date.now();
            rssData = await secClient.fetchRssFeed(rssFeedUrl);
            // Track API call success
            const apiDuration = Date.now() - apiCallStart;
            monitoring.recordTiming('sec.api_response_time', apiDuration, {
                endpoint: 'rss_feed',
                result: 'success'
            });
        }
        catch (error) {
            // Track API failure
            monitoring.incrementCounter('sec.api_error', 1, {
                endpoint: 'rss_feed'
            });
            if (error instanceof Error) {
                throw createExternalApiError(`Failed to fetch SEC RSS feed: ${error.message}`, {
                    url: rssFeedUrl,
                    error
                });
            }
            throw error;
        }
        // Parse the RSS feed
        componentLogger.debug(`Parsing SEC RSS feed data`);
        const parsedFeed = parseRssFeed(rssData);
        // Process the filings
        const entries = parsedFeed.entries || [];
        componentLogger.info(`Found ${entries.length} entries to process`);
        // Track entry count
        monitoring.incrementCounter('sec.entries_found', entries.length);
        // Process the filings to find ones we need to track
        try {
            const processedFilings = await processFilingEntries(entries, prisma);
            // Track filing counts
            monitoring.incrementCounter('sec.new_filings', processedFilings.newFilings.length);
            monitoring.incrementCounter('sec.existing_filings', processedFilings.existingFilings.length);
            // Track filings by type
            const filingsByType = new Map();
            for (const filing of processedFilings.newFilings) {
                const count = filingsByType.get(filing.filingType) || 0;
                filingsByType.set(filing.filingType, count + 1);
            }
            // Record metrics for each filing type
            for (const [type, count] of filingsByType.entries()) {
                monitoring.trackFilingOperation('new', type, count);
            }
            // Queue jobs for each new filing that needs processing
            const jobPromises = processedFilings.newFilings.map(filing => {
                return JobQueueService.addJob({
                    jobType: 'PROCESS_FILING',
                    payload: {
                        filingId: filing.id,
                        companyName: filing.companyName,
                        ticker: filing.ticker,
                        filingType: filing.filingType,
                        filingDate: filing.filingDate.toISOString(),
                        filingUrl: filing.url,
                        requestedAt: new Date().toISOString()
                    },
                    priority: 5,
                    scheduledFor: new Date(), // Schedule immediately
                    idempotencyKey: `PROCESS_FILING-${filing.id}` // Prevent duplicate processing
                });
            });
            // Wait for all jobs to be queued
            await Promise.all(jobPromises);
            // Calculate duration
            const duration = Date.now() - startTime;
            // Track overall time
            monitoring.recordTiming('sec.check_duration', duration, {
                result: 'success'
            });
            // Log the success
            componentLogger.info(`SEC filing check completed successfully`, {
                totalFilings: entries.length,
                newFilings: processedFilings.newFilings.length,
                existingFilings: processedFilings.existingFilings.length,
                duration
            });
            // Return success response
            return NextResponse.json({
                success: true,
                message: `SEC filing check completed successfully`,
                totalFilings: entries.length,
                newFilings: processedFilings.newFilings.length,
                existingFilings: processedFilings.existingFilings.length,
                duration
            });
        }
        catch (error) {
            // Track processing failure
            monitoring.incrementCounter('sec.processing_error', 1);
            if (error instanceof Error) {
                throw createInternalError(`Failed to process filings: ${error.message}`, { error });
            }
            throw error;
        }
    }
    catch (error) {
        // This will be caught by the appRouterAsyncHandler and properly formatted
        if (error instanceof Error) {
            // Track overall failure
            monitoring.incrementCounter('sec.check_failed', 1, {
                errorType: error instanceof ApiError ? error.code : 'UNKNOWN',
                filingType: filingType || 'all'
            });
            throw error instanceof ApiError
                ? error
                : createInternalError(`SEC filing check failed: ${error.message}`, { error });
        }
        throw error;
    }
    finally {
        // Always release the lock regardless of outcome
        try {
            await LockService.releaseLock(lockName, processId);
            componentLogger.debug(`Released lock: ${lockName}`);
        }
        catch (releaseError) {
            componentLogger.error(`Failed to release lock: ${lockName}`, releaseError);
            monitoring.incrementCounter('locks.release_error', 1, {
                lockName
            });
        }
    }
});
