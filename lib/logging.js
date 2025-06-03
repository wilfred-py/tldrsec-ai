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
   * Log a debug message
   * @param {string} message - Message to log
   */
  debug(message) {
    if (process.env.DEBUG) {
      console.log(`[DEBUG] [${this.name}] ${message}`);
    }
  }

  /**
   * Log an info message
   * @param {string} message - Message to log
   */
  info(message) {
    console.log(`[INFO] [${this.name}] ${message}`);
  }

  /**
   * Log a warning message
   * @param {string} message - Message to log
   */
  warn(message) {
    console.warn(`[WARN] [${this.name}] ${message}`);
  }

  /**
   * Log an error message
   * @param {string} message - Message to log
   */
  error(message) {
    console.error(`[ERROR] [${this.name}] ${message}`);
  }
}

// Create and export the default logger
export const logger = new Logger('sec-service');

export default logger;
