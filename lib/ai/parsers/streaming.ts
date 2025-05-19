/**
 * Streaming Response Parser
 * 
 * Provides utilities for handling streaming responses from Claude API,
 * including parsing JSON as it comes in incrementally.
 */

import { EventEmitter } from 'events';
import { 
  ExtractedJSON, 
  StreamingEventListener, 
  StreamingOptions, 
  StreamingParserState, 
  StreamingProgressEvent 
} from './types';
import { repairJSON } from './json-extractors';

/**
 * Class for parsing JSON from streaming responses
 */
export class StreamingParser extends EventEmitter {
  private state: StreamingParserState = {
    buffer: '',
    jsonStarted: false,
    jsonDepth: 0,
    inString: false,
    escape: false,
    currentKey: '',
    collectedChunks: [],
    partialResult: undefined
  };
  private options: StreamingOptions;
  private startTime: number;
  
  constructor(options: StreamingOptions = {}) {
    super();
    
    this.options = {
      bufferSize: 8192,  // Default buffer size (8KB)
      ...options
    };
    
    // Set up callbacks if provided
    if (this.options.onChunk) {
      this.on('chunk', data => this.options.onChunk!(data.data));
    }
    
    if (this.options.onPartialJson) {
      this.on('partial', data => this.options.onPartialJson!(data.data));
    }
    
    if (this.options.onComplete) {
      this.on('complete', data => this.options.onComplete!(data.data));
    }
    
    if (this.options.onError) {
      this.on('error', data => this.options.onError!(data.data));
    }
    
    // Initialize parser state
    this.resetState();
    this.startTime = Date.now();
  }
  
  /**
   * Reset the parser state
   */
  resetState(): void {
    this.state = {
      buffer: '',
      jsonStarted: false,
      jsonDepth: 0,
      inString: false,
      escape: false,
      currentKey: '',
      collectedChunks: [],
      partialResult: undefined
    };
    this.startTime = Date.now();
  }
  
  /**
   * Process a chunk of streaming data
   * 
   * @param chunk - A chunk of data from the stream
   */
  processChunk(chunk: string): void {
    // Emit the raw chunk event
    this.emitEvent('chunk', chunk);
    
    // Add to buffer and collected chunks
    this.state.buffer += chunk;
    this.state.collectedChunks.push(chunk);
    
    // Process the buffer for JSON content
    this.processBuffer();
  }
  
  /**
   * Process the current buffer to find and extract JSON
   */
  private processBuffer(): void {
    const buffer = this.state.buffer;
    
    // Scan for JSON start if we haven't found it yet
    if (!this.state.jsonStarted) {
      const openBraceIndex = buffer.indexOf('{');
      
      if (openBraceIndex === -1) {
        // No JSON start yet, keep collecting
        return;
      }
      
      // Found JSON start, update state
      this.state.jsonStarted = true;
      this.state.jsonDepth = 1;
      this.state.buffer = buffer.substring(openBraceIndex);
    }
    
    // Parse character by character to track JSON structure
    this.scanBufferForJSONStructure();
    
    // Try to extract partial results if configured to do so
    if (this.options.allowPartial) {
      this.attemptPartialExtraction();
    }
    
    // Trim buffer if it gets too large
    if (this.state.buffer.length > (this.options.bufferSize || 8192)) {
      // Keep just the last portion that might contain a valid JSON ending
      const truncatePoint = this.state.buffer.length - (this.options.bufferSize || 8192);
      this.state.buffer = this.state.buffer.substring(truncatePoint);
    }
  }
  
  /**
   * Scan the buffer to track JSON structure depth
   */
  private scanBufferForJSONStructure(): void {
    const buffer = this.state.buffer;
    
    // Process each character to track JSON state
    for (let i = 0; i < buffer.length; i++) {
      const char = buffer[i];
      
      // Handle string boundaries
      if (char === '"' && !this.state.escape) {
        this.state.inString = !this.state.inString;
      } else if (char === '\\' && this.state.inString) {
        this.state.escape = !this.state.escape;
      } else {
        this.state.escape = false;
      }
      
      // Only consider brackets outside strings
      if (!this.state.inString) {
        if (char === '{') {
          this.state.jsonDepth++;
        } else if (char === '}') {
          this.state.jsonDepth--;
          
          // Check if we've found a complete JSON object
          if (this.state.jsonDepth === 0) {
            this.handleCompleteJson(buffer.substring(0, i + 1));
            return;
          }
        }
      }
    }
  }
  
  /**
   * Handle a complete JSON string
   * 
   * @param jsonString - The complete JSON string
   */
  private handleCompleteJson(jsonString: string): void {
    try {
      // Try to parse the JSON
      const parsed = JSON.parse(jsonString);
      
      // Create the extracted result
      const result: ExtractedJSON = {
        raw: jsonString,
        parsed,
        extractionMethod: 'streaming',
        success: true
      };
      
      // Emit the complete event
      this.emitEvent('complete', result);
      
      // Reset state for potential next JSON object
      this.resetState();
    } catch (error) {
      // Try to repair the JSON if it's malformed
      try {
        const repairedJson = repairJSON(jsonString);
        const parsed = JSON.parse(repairedJson);
        
        const result: ExtractedJSON = {
          raw: jsonString,
          parsed,
          extractionMethod: 'streaming-repaired',
          success: true
        };
        
        this.emitEvent('complete', result);
        this.resetState();
      } catch (repairError) {
        // If repair failed, emit error
        this.emitEvent('error', error instanceof Error ? error : new Error(String(error)));
      }
    }
  }
  
  /**
   * Attempt to extract partial JSON from the buffer
   */
  private attemptPartialExtraction(): void {
    const buffer = this.state.buffer;
    
    // Only attempt if we have already found JSON start
    if (!this.state.jsonStarted) {
      return;
    }
    
    // Look for complete key-value pairs 
    const keyValuePairs: Record<string, any> = {};
    const keyValueRegex = /"([^"]+)":\s*(?:"([^"]*)"|\{([^}]*)\}|(\[[^\]]*\])|([^,}\]]+))/g;
    
    let match;
    while ((match = keyValueRegex.exec(buffer)) !== null) {
      const key = match[1];
      const stringValue = match[2];
      const objectValue = match[3];
      const arrayValue = match[4];
      const otherValue = match[5];
      
      try {
        if (stringValue !== undefined) {
          keyValuePairs[key] = stringValue;
        } else if (objectValue) {
          try {
            keyValuePairs[key] = JSON.parse(`{${objectValue}}`);
          } catch {
            keyValuePairs[key] = objectValue;
          }
        } else if (arrayValue) {
          try {
            keyValuePairs[key] = JSON.parse(arrayValue);
          } catch {
            keyValuePairs[key] = arrayValue;
          }
        } else if (otherValue) {
          const trimmed = otherValue.trim();
          // Try to convert to appropriate type
          if (!isNaN(Number(trimmed))) {
            keyValuePairs[key] = Number(trimmed);
          } else if (trimmed === 'true') {
            keyValuePairs[key] = true;
          } else if (trimmed === 'false') {
            keyValuePairs[key] = false;
          } else if (trimmed === 'null') {
            keyValuePairs[key] = null;
          } else {
            keyValuePairs[key] = trimmed;
          }
        }
      } catch (e) {
        // Skip problematic values
        continue;
      }
    }
    
    // If we found key-value pairs and they're different from our last state
    if (Object.keys(keyValuePairs).length > 0 && 
        JSON.stringify(keyValuePairs) !== JSON.stringify(this.state.partialResult)) {
      this.state.partialResult = keyValuePairs;
      this.emitEvent('partial', keyValuePairs);
    }
  }
  
  /**
   * Finish the streaming parser and force completion
   */
  finish(): void {
    const combined = this.state.collectedChunks.join('');
    
    // Check if we already have a complete result
    if (!this.state.jsonStarted) {
      // No JSON found, try standard extraction
      this.emitEvent('error', new Error('No JSON structure found in the stream'));
      return;
    }
    
    // Try to repair any partial JSON we've collected
    try {
      const repairedJson = repairJSON(this.state.buffer);
      const parsed = JSON.parse(repairedJson);
      
      const result: ExtractedJSON = {
        raw: this.state.buffer,
        parsed,
        extractionMethod: 'streaming-repaired',
        success: true
      };
      
      this.emitEvent('complete', result);
    } catch (error) {
      // If we have a partial result but couldn't complete it
      if (this.state.partialResult && Object.keys(this.state.partialResult).length > 0) {
        const result: ExtractedJSON = {
          raw: JSON.stringify(this.state.partialResult),
          parsed: this.state.partialResult,
          extractionMethod: 'streaming-partial',
          success: true
        };
        
        this.emitEvent('complete', result);
      } else {
        this.emitEvent('error', new Error('Failed to extract any JSON from the stream'));
      }
    }
    
    // Reset after finishing
    this.resetState();
  }
  
  /**
   * Emit an event with standard format
   * 
   * @param type - Event type
   * @param data - Event data
   */
  private emitEvent(type: 'chunk' | 'partial' | 'complete' | 'error', data: any): void {
    const event: StreamingProgressEvent = {
      type,
      data,
      timestamp: Date.now(),
      progress: this.estimateProgress()
    };
    
    this.emit(type, event);
  }
  
  /**
   * Estimate progress based on structure and time
   * 
   * @returns Estimated progress percentage (0-100)
   */
  private estimateProgress(): number {
    if (!this.state.jsonStarted) {
      return 0;
    }
    
    // Use both time-based and structure-based estimates
    const timeBased = Math.min(
      ((Date.now() - this.startTime) / 20000) * 100, // Assume 20s is typical response time
      95 // Cap at 95% for time-based estimation
    );
    
    // Structure based (depth of 1 means we're at the top level)
    let structureBased = 0;
    if (this.state.jsonDepth === 0) {
      structureBased = 100; // Complete
    } else if (this.state.jsonDepth === 1) {
      // Count the keys we've found
      const keyCount = this.state.partialResult ? Object.keys(this.state.partialResult).length : 0;
      // Assume a typical object has around 10 keys
      structureBased = Math.min(keyCount * 10, 95);
    }
    
    // Combine the estimates (weight structure more if available)
    return this.state.partialResult 
      ? (structureBased * 0.7) + (timeBased * 0.3)
      : timeBased;
  }
}

/**
 * Create a streaming parser for Claude API responses
 * 
 * @param options - Options for the streaming parser
 * @returns StreamingParser instance
 */
export function createStreamingParser(options: StreamingOptions = {}): StreamingParser {
  return new StreamingParser(options);
} 