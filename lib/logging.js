/**
 * Enhanced logging module for the SEC filing integration
 */

// Log level constants
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

// ANSI color codes for terminal output
const COLORS = {
  RESET: '\x1b[0m',
  DIM: '\x1b[2m',
  BRIGHT: '\x1b[1m',
  DEBUG: '\x1b[36m', // Cyan
  INFO: '\x1b[32m',  // Green
  WARN: '\x1b[33m',  // Yellow
  ERROR: '\x1b[31m'  // Red
};

// Status symbols for visual identification
const SYMBOLS = {
  SUCCESS: '✓',  // Green checkmark for success
  ERROR: '✘',    // Red cross for errors
  WARNING: '⚠️',  // Warning symbol
  INFO: 'ℹ️',     // Info symbol
  DEBUG: '🔍'     // Debug symbol
};

/**
 * Logger class with enhanced logging functionality
 */
class Logger {
  constructor(name = 'app') {
    this.name = name;
    
    // Default log level from environment or INFO
    const envLogLevel = process.env.LOG_LEVEL || 'INFO';
    this.logLevel = LOG_LEVELS[envLogLevel] !== undefined ? LOG_LEVELS[envLogLevel] : LOG_LEVELS.INFO;
  }

  /**
   * Create a child logger with a specific name
   * @param {string} name - Name for the child logger
   * @returns {Logger} New logger instance
   */
  child(name) {
    return new Logger(`${this.name}:${name}`);
  }

  /**
   * Format a log message
   * @param {string} level - Log level
   * @param {string|object} message - Message or object to log
   * @param {object} [data] - Optional data to include in the log
   * @returns {string} Formatted log message
   * @private
   */
  _formatLogMessage(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const color = COLORS[level.toUpperCase()] || '';
    const reset = COLORS.RESET;
    const dim = COLORS.DIM;
    const bright = COLORS.BRIGHT;
    
    // Get the appropriate symbol based on log level
    let symbol = '';
    switch(level.toUpperCase()) {
      case 'ERROR':
        symbol = `${color}${SYMBOLS.ERROR} `;
        break;
      case 'WARN':
        symbol = `${COLORS.WARN}${SYMBOLS.WARNING} `;
        break;
      case 'INFO':
        // For INFO messages that indicate success, we'll add the success symbol in the message itself
        symbol = `${COLORS.INFO}${SYMBOLS.INFO} `;
        break;
      case 'DEBUG':
        symbol = `${COLORS.DEBUG}${SYMBOLS.DEBUG} `;
        break;
      default:
        symbol = '';
    }
    
    // Format the base message
    let formattedMessage = `${dim}[${timestamp}]${reset} ${color}${level.toUpperCase()}${reset} ${symbol}${bright}[${this.name}]${reset} `;
    
    // Add the main message
    if (typeof message === 'object') {
      formattedMessage += this._formatObject(message);
    } else {
      // Check if this is a success message and add a green checkmark
      if (level.toUpperCase() === 'INFO' && 
          (message.toLowerCase().includes('success') || 
           message.toLowerCase().includes('completed') ||
           message.toLowerCase().includes('fetched'))) {
        formattedMessage = formattedMessage.replace(SYMBOLS.INFO, SYMBOLS.SUCCESS);
      }
      formattedMessage += message;
    }
    
    // Add additional data if present, but format it to avoid excessive verbosity
    if (Object.keys(data).length > 0) {
      formattedMessage += ` ${dim}${this._formatObject(data)}${reset}`;
    }
    
    return formattedMessage;
  }

  /**
   * Log a debug message
   * @param {string|object} message - Message or object to log
   * @param {object} [data] - Optional data to include in the log
   */
  debug(message, data = {}) {
    if (this.logLevel <= LOG_LEVELS.DEBUG) {
      const formattedMessage = this._formatLogMessage('debug', message, data);
      console.log(formattedMessage);
    }
  }

  /**
   * Log an info message
   * @param {string|object} message - Message or object to log
   * @param {object} [data] - Optional data to include in the log
   */
  info(message, data = {}) {
    if (this.logLevel <= LOG_LEVELS.INFO) {
      const formattedMessage = this._formatLogMessage('info', message, data);
      console.log(formattedMessage);
    }
  }

  /**
   * Log a warning message
   * @param {string|object} message - Message or object to log
   * @param {object} [data] - Optional data to include in the log
   */
  warn(message, data = {}) {
    if (this.logLevel <= LOG_LEVELS.WARN) {
      const formattedMessage = this._formatLogMessage('warn', message, data);
      console.log(formattedMessage);
    }
  }

  /**
   * Log an error message
   * @param {string|object} message - Message or object to log
   * @param {object} [data] - Optional data to include in the log
   */
  error(message, data = {}) {
    if (this.logLevel <= LOG_LEVELS.ERROR) {
      const formattedMessage = this._formatLogMessage('error', message, data);
      console.error(formattedMessage);
    }
  }
  
  /**
   * Set the log level
   * @param {string} level - Log level (DEBUG, INFO, WARN, ERROR)
   */
  /**
   * Format an object for logging, truncating large objects and arrays
   * @param {object} obj - Object to format
   * @param {number} [maxDepth=2] - Maximum depth to traverse
   * @param {number} [maxArrayLength=3] - Maximum array items to include
   * @param {number} [maxStringLength=100] - Maximum string length
   * @returns {string} Formatted object string
   * @private
   */
  _formatObject(obj, maxDepth = 2, maxArrayLength = 3, maxStringLength = 100) {
    // Handle null and undefined
    if (obj === null) return 'null';
    if (obj === undefined) return 'undefined';
    
    // For non-objects, return as is
    if (typeof obj !== 'object') {
      if (typeof obj === 'string' && obj.length > maxStringLength) {
        return `"${obj.substring(0, maxStringLength)}..." (${obj.length} chars)`;
      }
      return String(obj);
    }
    
    // Don't go too deep
    if (maxDepth <= 0) {
      if (Array.isArray(obj)) {
        return `[Array(${obj.length})]`;
      }
      return '{...}';
    }
    
    // Handle arrays
    if (Array.isArray(obj)) {
      if (obj.length === 0) return '[]';
      
      // Truncate arrays that are too long
      if (obj.length > maxArrayLength) {
        const items = obj.slice(0, maxArrayLength).map(item => 
          this._formatObject(item, maxDepth - 1, maxArrayLength, maxStringLength)
        ).join(', ');
        return `[${items}, ... ${obj.length - maxArrayLength} more]`;
      }
      
      const items = obj.map(item => 
        this._formatObject(item, maxDepth - 1, maxArrayLength, maxStringLength)
      ).join(', ');
      return `[${items}]`;
    }
    
    // Handle Error objects
    if (obj instanceof Error) {
      return obj.stack ? obj.stack : `${obj.name}: ${obj.message}`;
    }
    
    // Handle Date objects
    if (obj instanceof Date) {
      return obj.toISOString();
    }
    
    // Handle regular objects
    try {
      const keys = Object.keys(obj);
      if (keys.length === 0) return '{}';
      
      // Special handling for URL attempts to make them more readable
      if ('url' in obj && ('success' in obj || 'error' in obj)) {
        // This looks like a URL attempt object
        const urlInfo = obj.url.split('/').slice(-2).join('/');
        return `{url: ".../${urlInfo}", success: ${obj.success}${obj.error ? `, error: "${obj.error.substring(0, 30)}..."` : ''}}`;  
      }
      
      // Special handling for common verbose objects
      if ('urlAttempts' in obj && Array.isArray(obj.urlAttempts)) {
        const successCount = obj.urlAttempts.filter(a => a.success).length;
        return `{urlAttempts: [${successCount}/${obj.urlAttempts.length} successful]}`;
      }
      
      // Limit the number of keys for large objects
      const maxKeys = 5;
      let formattedObj = '{';
      
      if (keys.length > maxKeys) {
        // Show only the most important keys
        const visibleKeys = keys.slice(0, maxKeys);
        formattedObj += visibleKeys.map(key => {
          const value = this._formatObject(obj[key], maxDepth - 1, maxArrayLength, maxStringLength);
          return `${key}: ${value}`;
        }).join(', ');
        formattedObj += `, ... ${keys.length - maxKeys} more keys}`;
      } else {
        formattedObj += keys.map(key => {
          const value = this._formatObject(obj[key], maxDepth - 1, maxArrayLength, maxStringLength);
          return `${key}: ${value}`;
        }).join(', ');
        formattedObj += '}';
      }
      
      return formattedObj;
    } catch (e) {
      return `[Object: ${e.message}]`;
    }
  }
  
  /**
   * Set the log level
   * @param {string} level - Log level (DEBUG, INFO, WARN, ERROR)
   */
  setLogLevel(level) {
    if (LOG_LEVELS[level] !== undefined) {
      this.logLevel = LOG_LEVELS[level];
    }
  }
}

// Create and export the default logger
export const logger = new Logger('sec-service');

// Export log level constants for external use
export const LOG_LEVEL = LOG_LEVELS;

export default logger;
