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

import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enhancedFilingService, EnhancedFilingEvent } from '../../../../services/enhancedFilingService';
import { logger } from '../../../../lib/logging';
import { FilingType } from '../../../../lib/sec-edgar/types';
import { getFormMetadata } from '../../../../lib/sec-edgar/form-registry';
import { getPrismaClient } from '../../../../lib/db/prisma';

// API route logger
const apiLogger = logger.child('api-stream-summary');

// In App Router, we need to use the Response object for SSE
export async function GET(request: NextRequest) {
  try {
    // Get user session
    const { userId } = await auth();
    
    // Extract query parameters
    const searchParams = request.nextUrl.searchParams;
    const ticker = searchParams.get('ticker');
    const formType = searchParams.get('formType');
    const useCache = searchParams.get('useCache') !== 'false'; // Default to true
    const processAllChunks = searchParams.get('processAllChunks') === 'true';
    
    // Validate required parameters
    if (!ticker) {
      return new Response(
        JSON.stringify({ error: 'Ticker is required' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    if (!formType) {
      return new Response(
        JSON.stringify({ error: 'Form type is required' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    // Validate form type
    const formMetadata = getFormMetadata(formType as FilingType);
    if (!formMetadata) {
      return new Response(
        JSON.stringify({ error: `Invalid form type: ${formType}` }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    // Create a ReadableStream for SSE
    const stream = new ReadableStream({
      start(controller) {
        // Helper function to send SSE events
        const sendEvent = (event: string, data: unknown) => {
          const eventString = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(new TextEncoder().encode(eventString));
        };
        
        // Send initial event
        sendEvent('start', { 
          ticker, 
          formType,
          timestamp: Date.now()
        });
        
        // Record request in analytics
        if (userId) {
          const prisma = getPrismaClient();
          prisma.userActivity.create({
            data: {
              userId,
              activityType: 'FILING_SUMMARY_STREAM_REQUEST',
              details: {
                ticker,
                formType,
                useCache,
                processAllChunks
              }
            }
          }).catch(error => {
            apiLogger.error('Error recording user activity', { error });
          });
        }
        
        // Set up event listeners for streaming updates
        const onProgress = (data: { ticker: string; formType: string; [key: string]: unknown }) => {
          if (data.ticker === ticker && data.formType === formType) {
            sendEvent('progress', {
              ...data,
              timestamp: Date.now()
            });
          }
        };
        
        const onCompleted = (data: { ticker: string; formType: string; [key: string]: unknown }) => {
          if (data.ticker === ticker && data.formType === formType) {
            sendEvent('complete', {
              ...data,
              timestamp: Date.now()
            });
            
            // End the stream after completion
            cleanup();
            controller.close();
          }
        };
        
        const onError = (data: { ticker: string; formType: string; [key: string]: unknown }) => {
          if (data.ticker === ticker && data.formType === formType) {
            sendEvent('error', {
              ...data,
              timestamp: Date.now()
            });
            
            // End the stream after error
            cleanup();
            controller.close();
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
        
        // Start the filing summary process
        enhancedFilingService.getFilingSummary(
          ticker.toUpperCase(),
          formType as FilingType,
          {
            userId,
            useStreaming: true, // Always use streaming for this endpoint
            useCache,
            processAllChunks
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
          controller.close();
        });
        
        // Handle client disconnect
        request.signal.addEventListener('abort', () => {
          apiLogger.info(`Client disconnected from stream: ${ticker} ${formType}`);
          cleanup();
          controller.close();
        });
      }
    });
    
    // Return the stream as a Response
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no' // Disable Nginx buffering
      }
    });
    
  } catch (error) {
    // Handle errors during setup
    apiLogger.error('Error setting up streaming summary', { error });
    
    // Return a JSON error response
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: `Failed to set up streaming summary: ${message}` }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
