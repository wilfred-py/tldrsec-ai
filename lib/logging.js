/**
 * Simple logging module for the SEC filing integration
 */

/**
 * Logger class with basic logging functionality
 */
class Logger {
  constructor(name = 'app') {
    this.name = name;
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
   * Format a log message as a table row
   * @param {string} level - Log level
   * @param {string|object} message - Message or object to log
   * @param {object} [data] - Optional data to include in the log
   * @returns {object} Formatted log data
   * @private
   */
  _formatLogData(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const logData = {
      timestamp,
      level: level.toUpperCase(),
      service: this.name,
      ...(typeof message === 'object' ? message : { message }),
      ...(Object.keys(data).length > 0 ? { data } : {})
    };
    return logData;
  }

  /**
   * Log a debug message
   * @param {string|object} message - Message or object to log
   * @param {object} [data] - Optional data to include in the log
   */
  debug(message, data = {}) {
    if (process.env.DEBUG) {
      const logData = this._formatLogData('debug', message, data);
      console.log('┌─────────────────────────────────────────────────────────────────────────────┐');
      console.table(logData);
      console.log('└─────────────────────────────────────────────────────────────────────────────┘');
    }
  }

  /**
   * Log an info message
   * @param {string|object} message - Message or object to log
   * @param {object} [data] - Optional data to include in the log
   */
  info(message, data = {}) {
    const logData = this._formatLogData('info', message, data);
    console.log('┌─────────────────────────────────────────────────────────────────────────────┐');
    console.table(logData);
    console.log('└─────────────────────────────────────────────────────────────────────────────┘');
  }

  /**
   * Log a warning message
   * @param {string|object} message - Message or object to log
   * @param {object} [data] - Optional data to include in the log
   */
  warn(message, data = {}) {
    const logData = this._formatLogData('warn', message, data);
    console.log('┌─────────────────────────────────────────────────────────────────────────────┐');
    console.table(logData);
    console.log('└─────────────────────────────────────────────────────────────────────────────┘');
  }

  /**
   * Log an error message
   * @param {string|object} message - Message or object to log
   * @param {object} [data] - Optional data to include in the log
   */
  error(message, data = {}) {
    const logData = this._formatLogData('error', message, data);
    console.log('┌─────────────────────────────────────────────────────────────────────────────┐');
    console.table(logData);
    console.log('└─────────────────────────────────────────────────────────────────────────────┘');
  }
}

// Create and export the default logger
export const logger = new Logger('sec-service');

export default logger;
