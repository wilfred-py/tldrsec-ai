/**
 * Streaming SEC Filing Summary API
 * 
 * Provides real-time streaming of SEC filing summaries as they're being generated.
 * Uses Server-Sent Events (SSE) to stream partial results to the client.
 * 
 * Features:
 * - Real-time streaming of partial results
 * - Caching to prevent redundant API calls
 * - Enhanced chunking for large documents
 * - Detailed progress events
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]';
import { enhancedFilingService, EnhancedFilingEvent } from '../../../services/enhancedFilingService';
import { logger } from '../../../lib/logging';
import { FilingType } from '../../../lib/sec-edgar/types';
import { getFormMetadata } from '../../../lib/sec-edgar/form-registry';
import { prisma } from '../../../lib/db';

// API route logger
const apiLogger = logger.child('api-stream-summary');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Validate request method
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    // Get user session
    const session = await getServerSession(req, res, authOptions);
    const userId = session?.user?.id;
    
    // Extract query parameters
    const { ticker, formType, useCache, processAllChunks } = req.query;
    
    // Validate required parameters
    if (!ticker || typeof ticker !== 'string') {
      return res.status(400).json({ error: 'Ticker is required' });
    }
    
    if (!formType || typeof formType !== 'string') {
      return res.status(400).json({ error: 'Form type is required' });
    }
    
    // Validate form type
    const formMetadata = getFormMetadata(formType as FilingType);
    if (!formMetadata) {
      return res.status(400).json({ error: `Invalid form type: ${formType}` });
    }
    
    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // Disable Nginx buffering
    });
    
    // Helper function to send SSE events
    const sendEvent = (event: string, data: any) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      res.flush(); // Ensure data is sent immediately
    };
    
    // Send initial event
    sendEvent('start', { 
      ticker, 
      formType,
      timestamp: Date.now()
    });
    
    // Record request in analytics
    if (userId) {
      await prisma.userActivity.create({
        data: {
          userId,
          activityType: 'FILING_SUMMARY_STREAM_REQUEST',
          details: {
            ticker,
            formType,
            useCache: useCache !== 'false',
            processAllChunks: processAllChunks === 'true'
          }
        }
      });
    }
    
    // Set up event listeners for streaming updates
    const onProgress = (data: any) => {
      if (data.ticker === ticker && data.formType === formType) {
        sendEvent('progress', {
          ...data,
          timestamp: Date.now()
        });
      }
    };
    
    const onCompleted = (data: any) => {
      if (data.ticker === ticker && data.formType === formType) {
        sendEvent('complete', {
          ...data,
          timestamp: Date.now()
        });
        
        // End the response after completion
        cleanup();
        res.end();
      }
    };
    
    const onError = (data: any) => {
      if (data.ticker === ticker && data.formType === formType) {
        sendEvent('error', {
          ...data,
          timestamp: Date.now()
        });
        
        // End the response after error
        cleanup();
        res.end();
      }
    };
    
    // Set up cleanup function
    const cleanup = () => {
      enhancedFilingService.off(EnhancedFilingEvent.SUMMARY_PROGRESS, onProgress);
      enhancedFilingService.off(EnhancedFilingEvent.SUMMARY_COMPLETED, onCompleted);
      enhancedFilingService.off(EnhancedFilingEvent.SUMMARY_ERROR, onError);
    };
    
    // Register event listeners
    enhancedFilingService.on(EnhancedFilingEvent.SUMMARY_PROGRESS, onProgress);
    enhancedFilingService.on(EnhancedFilingEvent.SUMMARY_COMPLETED, onCompleted);
    enhancedFilingService.on(EnhancedFilingEvent.SUMMARY_ERROR, onError);
    
    // Handle client disconnect
    req.on('close', () => {
      apiLogger.info(`Client disconnected from stream: ${ticker} ${formType}`);
      cleanup();
    });
    
    // Start the filing summary process
    enhancedFilingService.getFilingSummary(
      ticker.toUpperCase(),
      formType as FilingType,
      {
        userId,
        useStreaming: true, // Always use streaming for this endpoint
        useCache: useCache !== 'false', // Default to true
        processAllChunks: processAllChunks === 'true'
      }
    ).catch(error => {
      // This should be caught by the error event handler,
      // but just in case, we'll handle it here too
      apiLogger.error(`Error in streaming summary: ${error.message}`);
      sendEvent('error', {
        ticker,
        formType,
        error: error.message,
        timestamp: Date.now()
      });
      cleanup();
      res.end();
    });
    
  } catch (error) {
    // Handle errors during setup
    apiLogger.error('Error setting up streaming summary', { error });
    
    // If headers haven't been sent yet, return a JSON error
    if (!res.headersSent) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json({ error: `Failed to set up streaming summary: ${message}` });
    }
    
    // Otherwise, send an error event and end the stream
    res.write(`event: error\n`);
    res.write(`data: ${JSON.stringify({ error: 'Internal server error' })}\n\n`);
    res.end();
  }
}
