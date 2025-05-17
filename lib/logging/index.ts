import { NextApiRequest, NextApiResponse } from 'next';

// Log levels
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal'
}

// Request types
export type HttpRequest = NextApiRequest | Request;
export type HttpResponse = NextApiResponse | Response;

// Log entry structure
export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, any>;
  error?: Error | unknown;
  request?: {
    method?: string;
    url?: string;
    headers?: Record<string, string | string[] | undefined>;
    body?: any;
  };
  response?: {
    statusCode?: number;
    body?: any;
  };
  component?: string;
  service?: string;
  duration?: number; // Duration in milliseconds
  tags?: string[];
}

// Logger config
export interface LoggerConfig {
  minLevel: LogLevel;
  enableConsole: boolean;
  service?: string;
  includeTimestamps?: boolean;
  includeStackTrace?: boolean; 
  formatter?: (entry: LogEntry) => string;
  transport?: (entry: LogEntry) => Promise<void>;
}

// Default config
const DEFAULT_CONFIG: LoggerConfig = {
  minLevel: process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG,
  enableConsole: true,
  includeTimestamps: true,
  includeStackTrace: process.env.NODE_ENV !== 'production',
};

/**
 * Logger class for structured logging
 */
export class Logger {
  private config: LoggerConfig;
  private component?: string;

  constructor(config?: Partial<LoggerConfig>, component?: string) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.component = component;
  }

  /**
   * Create a child logger with a specific component name
   */
  child(component: string): Logger {
    return new Logger(this.config, component);
  }

  /**
   * Log an entry
   */
  private async log(level: LogLevel, message: string, context?: Record<string, any>, error?: Error | unknown): Promise<void> {
    // Skip logging if level is below the min level
    if (!this.shouldLog(level)) {
      return;
    }

    // Create log entry
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context,
      error,
      component: this.component,
      service: this.config.service,
    };

    // Format error stack trace if available
    if (error instanceof Error && this.config.includeStackTrace) {
      entry.context = {
        ...entry.context,
        stack: error.stack,
      };
    }

    // Log to console if enabled
    if (this.config.enableConsole) {
      this.logToConsole(entry);
    }

    // Use custom transport if provided
    if (this.config.transport) {
      try {
        await this.config.transport(entry);
      } catch (transportError) {
        console.error('Error in log transport:', transportError);
      }
    }
  }

  /**
   * Check if the level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR, LogLevel.FATAL];
    const minLevelIndex = levels.indexOf(this.config.minLevel);
    const levelIndex = levels.indexOf(level);
    return levelIndex >= minLevelIndex;
  }

  /**
   * Format and log entry to console
   */
  private logToConsole(entry: LogEntry): void {
    const { level, message, timestamp, component, service, context, error } = entry;
    const formattedMessage = this.config.formatter
      ? this.config.formatter(entry)
      : this.formatLogMessage(entry);

    switch (level) {
      case LogLevel.DEBUG:
        console.debug(formattedMessage);
        break;
      case LogLevel.INFO:
        console.info(formattedMessage);
        break;
      case LogLevel.WARN:
        console.warn(formattedMessage);
        break;
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        console.error(formattedMessage);
        break;
    }
  }

  /**
   * Format log message for console
   */
  private formatLogMessage(entry: LogEntry): string {
    const { level, message, timestamp, component, service, context, error } = entry;
    
    let formattedMessage = '';
    
    // Add timestamp if enabled
    if (this.config.includeTimestamps) {
      formattedMessage += `[${timestamp}] `;
    }
    
    // Add level
    formattedMessage += `[${level.toUpperCase()}]`;
    
    // Add service and component if available
    if (service) {
      formattedMessage += ` [${service}]`;
    }
    
    if (component) {
      formattedMessage += ` [${component}]`;
    }
    
    // Add message
    formattedMessage += `: ${message}`;
    
    // Add context if available
    if (context && Object.keys(context).length > 0) {
      formattedMessage += `\nContext: ${JSON.stringify(context, null, 2)}`;
    }
    
    // Add error if available
    if (error instanceof Error) {
      formattedMessage += `\nError: ${error.message}`;
      if (this.config.includeStackTrace && error.stack) {
        formattedMessage += `\nStack: ${error.stack}`;
      }
    } else if (error) {
      formattedMessage += `\nError: ${JSON.stringify(error)}`;
    }
    
    return formattedMessage;
  }

  // Logger methods
  debug(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: Record<string, any>, error?: Error | unknown): void {
    this.log(LogLevel.WARN, message, context, error);
  }

  error(message: string, error?: Error | unknown, context?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  fatal(message: string, error?: Error | unknown, context?: Record<string, any>): void {
    this.log(LogLevel.FATAL, message, context, error);
  }

  /**
   * Extract request information safely from either NextApiRequest or standard Request
   */
  private extractRequestInfo(req: HttpRequest) {
    // For NextApiRequest
    if ('headers' in req && typeof req.headers === 'object' && req.headers !== null) {
      return {
        method: req.method || 'UNKNOWN',
        url: req.url || 'UNKNOWN',
        headers: req.headers,
      };
    }
    
    // For standard Request
    if (req instanceof Request) {
      return {
        method: req.method,
        url: req.url,
        headers: Object.fromEntries(req.headers.entries()),
      };
    }
    
    // Fallback for unknown request type
    return {
      method: 'UNKNOWN',
      url: 'UNKNOWN',
      headers: {},
    };
  }

  /**
   * Extract response information safely
   */
  private extractResponseInfo(res: HttpResponse) {
    // For NextApiResponse
    if ('statusCode' in res) {
      return {
        statusCode: res.statusCode,
      };
    }
    
    // For standard Response
    if (res instanceof Response) {
      return {
        statusCode: res.status,
      };
    }
    
    // Fallback
    return {
      statusCode: 0,
    };
  }

  // Request logging
  logRequest(req: HttpRequest, context?: Record<string, any>): void {
    const requestInfo = this.extractRequestInfo(req);
    
    this.info(`Request: ${requestInfo.method} ${requestInfo.url}`, {
      ...context,
      request: requestInfo
    });
  }

  // Response logging
  logResponse(
    res: HttpResponse, 
    duration: number,
    context?: Record<string, any>
  ): void {
    const responseInfo = this.extractResponseInfo(res);
    
    this.info(`Response: ${responseInfo.statusCode} (${duration}ms)`, {
      ...context,
      response: responseInfo,
      duration
    });
  }
}

// Create default logger
const defaultLogger = new Logger({
  service: 'tldrSEC-AI',
});

export { defaultLogger as logger };

// Create middleware for request logging
export function createRequestLogger(logger: Logger) {
  return async (req: NextApiRequest, res: NextApiResponse, next: () => Promise<void>) => {
    const start = Date.now();
    
    // Log the request
    logger.logRequest(req);
    
    // Call the next middleware
    await next();
    
    // Log the response with duration
    const duration = Date.now() - start;
    logger.logResponse(res, duration);
  };
} 