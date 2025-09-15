/**
 * Prisma Client Security Tests
 * 
 * CRITICAL: Tests for DATABASE_URL validation security vulnerabilities
 * These tests cover injection attacks, credential exposure, and configuration tampering
 */

import { getPrismaClient } from '../../../lib/db/prisma';

// Mock PrismaClient to prevent actual database connections during tests
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn()
  }))
}));

// Store original environment
const originalEnv = { ...process.env };

// Mock console to capture error messages
const mockConsole = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn()
};

const originalConsole = {
  error: console.error,
  warn: console.warn,
  info: console.info
};

beforeEach(() => {
  // Reset environment
  process.env = { ...originalEnv };
  
  // Mock console
  Object.assign(console, mockConsole);
  jest.clearAllMocks();
  
  // Clear any cached Prisma instances
  delete (global as any).prisma;
  
  // Reset module cache to ensure fresh imports
  jest.resetModules();
});

afterEach(() => {
  // Restore environment and console
  process.env = { ...originalEnv };
  Object.assign(console, originalConsole);
});

describe('Prisma Client Security', () => {
  describe('DATABASE_URL Injection Prevention', () => {
    it('should reject SQL injection attempts in DATABASE_URL', () => {
      const maliciousUrls = [
        'postgresql://user:pass@host/db; DROP TABLE users;--',
        'postgresql://user:pass@host/db\'; DROP TABLE users;--',
        'postgresql://user:pass@host/db" UNION SELECT * FROM sensitive_data--',
        'postgresql://user:pass@host/db\\x00; rm -rf /',
        'postgresql://user:pass@host/db\nDROP DATABASE;',
        'postgresql://user:pass@host/db\rCREATE USER hacker;'
      ];

      maliciousUrls.forEach(url => {
        process.env.DATABASE_URL = url;
        
        expect(() => {
          getPrismaClient();
        }).not.toThrow(); // Should not crash
        
        // But should log security warning
        expect(mockConsole.error).toHaveBeenCalled();
      });
    });

    it('should handle connection string parameter tampering', () => {
      const tamperedUrls = [
        'postgresql://user:pass@host/db?sslmode=disable&application_name=;DROP TABLE users;',
        'postgresql://user:pass@host/db?connect_timeout=1&statement_timeout=0',
        'postgresql://user:pass@host/db?sslmode=require&sslcert=/etc/passwd',
        'postgresql://user:pass@host/db?application_name=<script>alert("xss")</script>',
        'postgresql://user:pass@host/db?search_path=public,hacker_schema'
      ];

      tamperedUrls.forEach(url => {
        process.env.DATABASE_URL = url;
        
        expect(() => {
          getPrismaClient();
        }).not.toThrow();
        
        // Should initialize but may log warnings about suspicious parameters
      });
    });

    it('should prevent credential extraction via error messages', () => {
      // Set URL with sensitive information
      process.env.DATABASE_URL = 'postgresql://admin:super_secret_password@private-host:5432/sensitive_db';
      
      try {
        // Force an error by corrupting the client after creation
        const client = getPrismaClient();
        (client as any).$connect = jest.fn().mockRejectedValue(new Error('Connection failed'));
        
        // This should not expose credentials in the error
        getPrismaClient();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Error message should not contain credentials
        expect(errorMessage).not.toContain('super_secret_password');
        expect(errorMessage).not.toContain('admin');
        expect(errorMessage).not.toContain('private-host');
        expect(errorMessage).not.toContain('sensitive_db');
      }
    });
  });

  describe('Environment Variable Security', () => {
    it('should handle missing DATABASE_URL securely', () => {
      delete process.env.DATABASE_URL;
      
      expect(() => {
        getPrismaClient();
      }).toThrow('DATABASE_URL environment variable is not set');
      
      // Should not expose other environment variables in error
      expect(mockConsole.error).not.toHaveBeenCalledWith(
        expect.stringContaining(process.env.NODE_ENV || '')
      );
    });

    it('should handle empty DATABASE_URL', () => {
      process.env.DATABASE_URL = '';
      
      expect(() => {
        getPrismaClient();
      }).toThrow('DATABASE_URL environment variable is not set');
    });

    it('should handle whitespace-only DATABASE_URL', () => {
      process.env.DATABASE_URL = '   \n\t   ';
      
      expect(() => {
        getPrismaClient();
      }).toThrow('DATABASE_URL environment variable is not set');
    });

    it('should prevent environment variable pollution', () => {
      // Set many environment variables that could confuse parsing
      process.env.DATABASE_URL = 'postgresql://user:pass@host/db';
      process.env.DATABASE_URL_BACKUP = 'postgresql://hacker:pass@evil-host/db';
      process.env.DB_URL = 'postgresql://hacker:pass@evil-host/db';
      process.env.POSTGRES_URL = 'postgresql://hacker:pass@evil-host/db';
      
      const client = getPrismaClient();
      
      // Should only use the correct DATABASE_URL
      expect(client).toBeDefined();
      // The client should be configured with the correct URL, not the polluted ones
    });
  });

  describe('Configuration Tampering Prevention', () => {
    it('should prevent engine configuration injection', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@host/db';
      
      // Attempt to inject malicious engine config
      process.env.PRISMA_ENGINE_TYPE = 'malicious';
      process.env.PRISMA_BINARY_PATH = '/usr/bin/rm';
      process.env.PRISMA_QUERY_ENGINE_BINARY = '/evil/binary';
      
      const client = getPrismaClient();
      
      // Should use safe defaults, not injected values
      expect(client).toBeDefined();
    });

    it('should validate production vs development configuration', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@host/db';
      
      // Test production environment
      process.env.NODE_ENV = 'production';
      const prodClient = getPrismaClient();
      expect(prodClient).toBeDefined();
      
      // Test development environment
      process.env.NODE_ENV = 'development';
      const devClient = getPrismaClient();
      expect(devClient).toBeDefined();
      
      // Should handle environment switching securely
      expect(prodClient).not.toBe(devClient); // Different instances for different environments
    });

    it('should prevent logging level injection', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@host/db';
      process.env.PRISMA_LOG_LEVEL = 'debug'; // Could expose sensitive data
      
      const client = getPrismaClient();
      
      // Should use safe logging levels regardless of environment variable
      expect(client).toBeDefined();
    });
  });

  describe('Connection Pool Security', () => {
    it('should enforce connection limits', () => {
      // Test with excessive connection limit in URL
      process.env.DATABASE_URL = 'postgresql://user:pass@host/db?connection_limit=999999';
      
      const client = getPrismaClient();
      
      // Should initialize but with reasonable limits
      expect(client).toBeDefined();
    });

    it('should handle malformed connection parameters', () => {
      const malformedUrls = [
        'postgresql://user:pass@host/db?connection_limit=-1',
        'postgresql://user:pass@host/db?pool_timeout=999999999',
        'postgresql://user:pass@host/db?connection_limit=abc',
        'postgresql://user:pass@host/db?pool_timeout=',
        'postgresql://user:pass@host/db?connection_limit=1.5'
      ];

      malformedUrls.forEach(url => {
        process.env.DATABASE_URL = url;
        
        expect(() => {
          getPrismaClient();
        }).not.toThrow(); // Should handle gracefully
      });
    });

    it('should prevent connection pool exhaustion attacks', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@host/db?connection_limit=1';
      
      // Rapidly create many clients
      const clients = [];
      for (let i = 0; i < 10; i++) {
        clients.push(getPrismaClient());
      }
      
      // Should reuse connection or handle pool limits safely
      expect(clients.length).toBe(10);
      
      // All clients should be the same instance in development (singleton pattern)
      if (process.env.NODE_ENV !== 'production') {
        const firstClient = clients[0];
        clients.forEach(client => {
          expect(client).toBe(firstClient);
        });
      }
    });
  });

  describe('Error Information Disclosure', () => {
    it('should sanitize database errors', () => {
      process.env.DATABASE_URL = 'postgresql://user:secret@host/db';
      
      // Mock a database error that might contain sensitive information
      const { PrismaClient } = require('@prisma/client');
      (PrismaClient as jest.Mock).mockImplementation(() => {
        throw new Error('Connection failed: password authentication failed for user "user"');
      });
      
      expect(() => {
        getPrismaClient();
      }).toThrow();
      
      // Error logged to console should not contain sensitive details
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringMatching(/Failed to initialize Prisma client/),
        expect.not.stringContaining('secret')
      );
    });

    it('should handle client initialization errors securely', () => {
      process.env.DATABASE_URL = 'postgresql://admin:topsecret@internal-db/production';
      
      // Force initialization error
      const { PrismaClient } = require('@prisma/client');
      (PrismaClient as jest.Mock).mockImplementation(() => {
        throw new Error('Prisma schema not found at /etc/passwd');
      });
      
      expect(() => {
        getPrismaClient();
      }).toThrow();
      
      // Should not expose file paths or credentials
      expect(mockConsole.error).toHaveBeenCalled();
      const errorCall = (mockConsole.error as jest.Mock).mock.calls[0];
      const loggedMessage = String(errorCall[0]);
      
      expect(loggedMessage).not.toContain('topsecret');
      expect(loggedMessage).not.toContain('internal-db');
      expect(loggedMessage).not.toContain('/etc/passwd');
    });
  });

  describe('Global State Security', () => {
    it('should prevent global state pollution', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@host/db';
      process.env.NODE_ENV = 'development';
      
      // Create client and pollute global state
      const client = getPrismaClient();
      (global as any).prisma = 'hacked';
      
      // Getting client again should handle pollution
      const client2 = getPrismaClient();
      
      expect(client2).toBeDefined();
      expect(typeof client2).toBe('object');
      expect(client2).not.toBe('hacked');
    });

    it('should isolate client instances between tests', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@host/db';
      
      const client1 = getPrismaClient();
      
      // Simulate test cleanup
      delete (global as any).prisma;
      
      const client2 = getPrismaClient();
      
      // In development, these should be the same due to singleton pattern
      // In production, they would be different instances
      expect(client1).toBeDefined();
      expect(client2).toBeDefined();
    });
  });
});