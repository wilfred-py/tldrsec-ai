/**
 * Streaming Support for Claude AI Client
 * 
 * Provides streaming capabilities for faster partial results from Claude API.
 */

import { EventEmitter } from 'events';
import { SummarizationResult } from '../summarize';
import { logger } from '../../logging';
import { extractJSON, repairJSON } from '../parsers/json-extractors';
import { monitoring } from '../../monitoring';

// Logger for this component
const componentLogger = logger.child('stream-handler');

/**
 * Events emitted by the stream handler
 */
export enum StreamEvent {
  START = 'start',
  CONTENT = 'content',
  PARTIAL_JSON = 'partial-json',
  COMPLETE_JSON = 'complete-json',
  END = 'end',
  ERROR = 'error'
}

/**
 * Interface for stream handler options
 */
export interface StreamHandlerOptions {
  summaryId: string;
  extractPartialJSON?: boolean;
  jsonExtractionInterval?: number; // ms
}

/**
 * Interface for stream content update
 */
export interface StreamContentUpdate {
  summaryId: string;
  content: string;
  isDelta: boolean;
  timestamp: Date;
}

/**
 * Interface for stream JSON update
 */
export interface StreamJSONUpdate {
  summaryId: string;
  json: Record<string, unknown>;
  isComplete: boolean;
  timestamp: Date;
}

/**
 * Handler for streaming responses from Claude API
 */
export class StreamHandler extends EventEmitter {
  private summaryId: string;
  private buffer: string = '';
  private extractPartialJSON: boolean;
  private jsonExtractionInterval: number;
  private extractionTimer: NodeJS.Timeout | null = null;
  private startTime: number;
  private lastPartialJSON: Record<string, unknown> | null = null;
  
  /**
   * Create a new stream handler
   * @param options Configuration options
   */
  constructor(options: StreamHandlerOptions) {
    super();
    this.summaryId = options.summaryId;
    this.extractPartialJSON = options.extractPartialJSON ?? true;
    this.jsonExtractionInterval = options.jsonExtractionInterval ?? 2000; // Default: check every 2 seconds
    this.startTime = Date.now();
    
    componentLogger.debug(`Stream handler created for summary ${this.summaryId}`);
  }
  
  /**
   * Start the stream handler
   */
  start(): void {
    componentLogger.debug(`Stream started for summary ${this.summaryId}`);
    this.emit(StreamEvent.START, { summaryId: this.summaryId, timestamp: new Date() });
    
    // Start JSON extraction timer if enabled
    if (this.extractPartialJSON) {
      this.startExtractionTimer();
    }
    
    monitoring.incrementCounter('ai.streaming.streams_started', 1);
  }
  
  /**
   * Handle a chunk of content from the stream
   * @param chunk Content chunk from the stream
   */
  handleChunk(chunk: string): void {
    // Add chunk to buffer
    this.buffer += chunk;
    
    // Emit content update
    this.emit(StreamEvent.CONTENT, {
      summaryId: this.summaryId,
      content: chunk,
      isDelta: true,
      timestamp: new Date()
    } as StreamContentUpdate);
    
    monitoring.incrementCounter('ai.streaming.chunks_received', 1);
  }
  
  /**
   * End the stream
   */
  end(): void {
    // Stop extraction timer
    if (this.extractionTimer) {
      clearInterval(this.extractionTimer);
      this.extractionTimer = null;
    }
    
    // Final JSON extraction
    if (this.extractPartialJSON) {
      this.extractJSON(true);
    }
    
    // Emit final content
    this.emit(StreamEvent.CONTENT, {
      summaryId: this.summaryId,
      content: this.buffer,
      isDelta: false,
      timestamp: new Date()
    } as StreamContentUpdate);
    
    // Emit end event
    const duration = Date.now() - this.startTime;
    this.emit(StreamEvent.END, { 
      summaryId: this.summaryId, 
      timestamp: new Date(),
      duration
    });
    
    componentLogger.debug(`Stream ended for summary ${this.summaryId} after ${duration}ms`);
    monitoring.incrementCounter('ai.streaming.streams_completed', 1);
    monitoring.recordTiming('ai.streaming.stream_duration', duration);
  }
  
  /**
   * Handle an error in the stream
   * @param error Error that occurred
   */
  handleError(error: Error): void {
    // Stop extraction timer
    if (this.extractionTimer) {
      clearInterval(this.extractionTimer);
      this.extractionTimer = null;
    }
    
    // Emit error event
    this.emit(StreamEvent.ERROR, {
      summaryId: this.summaryId,
      error,
      timestamp: new Date()
    });
    
    componentLogger.error(`Stream error for summary ${this.summaryId}: ${error.message}`);
    monitoring.incrementCounter('ai.streaming.stream_errors', 1);
  }
  
  /**
   * Start the JSON extraction timer
   */
  private startExtractionTimer(): void {
    if (this.extractionTimer) {
      clearInterval(this.extractionTimer);
    }
    
    this.extractionTimer = setInterval(() => {
      this.extractJSON(false);
    }, this.jsonExtractionInterval);
  }
  
  /**
   * Extract JSON from the current buffer
   * @param isFinal Whether this is the final extraction
   */
  private extractJSON(isFinal: boolean): void {
    try {
      // Try to extract JSON from the buffer
      const result = extractJSON(this.buffer);
      
      if (result.success && result.parsed) {
        // JSON successfully extracted
        const json = result.parsed as Record<string, unknown>;
        
        // Check if this JSON is different from the last one we emitted
        const jsonStr = JSON.stringify(json);
        const lastJsonStr = this.lastPartialJSON ? JSON.stringify(this.lastPartialJSON) : '';
        
        if (jsonStr !== lastJsonStr) {
          // Emit JSON update
          this.lastPartialJSON = json;
          
          this.emit(isFinal ? StreamEvent.COMPLETE_JSON : StreamEvent.PARTIAL_JSON, {
            summaryId: this.summaryId,
            json,
            isComplete: isFinal,
            timestamp: new Date()
          } as StreamJSONUpdate);
          
          componentLogger.debug(`Extracted ${isFinal ? 'complete' : 'partial'} JSON for summary ${this.summaryId}`);
          monitoring.incrementCounter('ai.streaming.json_extractions', 1);
        }
      } else if (isFinal) {
        // If this is the final extraction and we couldn't extract JSON, try to repair it
        componentLogger.debug(`Attempting to repair JSON for summary ${this.summaryId}`);
        
        // Look for JSON-like structures in the buffer
        const jsonPattern = /\{[\s\S]*\}/g;
        const matches = this.buffer.match(jsonPattern);
        
        if (matches && matches.length > 0) {
          // Try to repair the first match
          const potentialJson = matches[0];
          const repairedJson = repairJSON(potentialJson);
          
          try {
            const json = JSON.parse(repairedJson) as Record<string, unknown>;
            
            // Emit repaired JSON
            this.emit(StreamEvent.COMPLETE_JSON, {
              summaryId: this.summaryId,
              json,
              isComplete: true,
              timestamp: new Date()
            } as StreamJSONUpdate);
            
            componentLogger.debug(`Repaired and extracted JSON for summary ${this.summaryId}`);
            monitoring.incrementCounter('ai.streaming.json_repairs', 1);
          } catch (parseError) {
            componentLogger.warn(`Failed to parse repaired JSON for summary ${this.summaryId}: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
          }
        }
      }
    } catch (error) {
      componentLogger.warn(`Error extracting JSON for summary ${this.summaryId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Get the current buffer content
   * @returns Current buffer content
   */
  getBuffer(): string {
    return this.buffer;
  }
  
  /**
   * Convert stream results to a summarization result
   * @returns Summarization result object
   */
  toSummarizationResult(): SummarizationResult {
    return {
      summaryId: this.summaryId,
      summaryText: this.buffer,
      summaryJSON: this.lastPartialJSON || undefined,
      duration: Date.now() - this.startTime,
      isPartial: false
    };
  }
}

/**
 * Create a stream handler for a summarization
 * @param options Configuration options
 * @returns Stream handler instance
 */
export function createStreamHandler(options: StreamHandlerOptions): StreamHandler {
  return new StreamHandler(options);
}
