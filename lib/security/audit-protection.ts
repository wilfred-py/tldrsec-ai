/**
 * Audit Log Protection System
 * 
 * Implements tamper-proof audit logging with integrity verification
 * Prevents audit log tampering and ensures compliance with security standards
 */

import { logger } from '../logging';
import { getPrismaClient } from '../db/prisma';

const auditLogger = logger.child('audit-protection');
// Lazy accessor to avoid build-time initialization
const getPrisma = () => getPrismaClient();

export interface SecureAuditEntry {
  id: string;
  timestamp: Date;
  action: string;
  userId: string;
  resourceId?: string;
  ipAddress: string;
  userAgent?: string;
  details?: Record<string, unknown>;
  integrity_hash: string;
  sequence_number: number;
  previous_hash?: string;
}

export interface AuditIntegrityReport {
  isValid: boolean;
  totalEntries: number;
  brokenChainAt?: number;
  tamperedEntries: string[];
  lastValidEntry?: string;
}

/**
 * Blockchain-style audit log protection
 */
export class AuditProtectionService {
  private static instance: AuditProtectionService;
  private sequenceCounter: number = 0;
  private lastHash: string = '';

  private constructor() {
    this.initializeChain();
  }

  static getInstance(): AuditProtectionService {
    if (!AuditProtectionService.instance) {
      AuditProtectionService.instance = new AuditProtectionService();
    }
    return AuditProtectionService.instance;
  }

  /**
   * Initialize the audit chain from database
   */
  private async initializeChain(): Promise<void> {
    try {
      // Get the last audit entry to continue the chain
      const lastEntry = await getPrisma().auditLog.findFirst({
        orderBy: { sequenceNumber: 'desc' },
        select: { sequenceNumber: true, integrityHash: true }
      });

      if (lastEntry) {
        this.sequenceCounter = lastEntry.sequenceNumber;
        this.lastHash = lastEntry.integrityHash || '';
      }

      auditLogger.info('Audit chain initialized', {
        lastSequence: this.sequenceCounter,
        hasLastHash: !!this.lastHash
      });

    } catch (error) {
      auditLogger.error('Failed to initialize audit chain', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Start fresh if database initialization fails
      this.sequenceCounter = 0;
      this.lastHash = '';
    }
  }

  /**
   * Create cryptographically secure hash for audit entry
   */
  private async createIntegrityHash(
    entry: Omit<SecureAuditEntry, 'integrity_hash'>,
    previousHash: string
  ): Promise<string> {
    const data = JSON.stringify({
      timestamp: entry.timestamp.toISOString(),
      action: entry.action,
      userId: entry.userId,
      resourceId: entry.resourceId,
      sequence: entry.sequence_number,
      previous: previousHash,
      details: entry.details
    });

    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Log secure audit entry with integrity protection
   */
  async logSecureAuditEntry(
    action: string,
    userId: string,
    ipAddress: string,
    resourceId?: string,
    userAgent?: string,
    details?: Record<string, unknown>
  ): Promise<void> {
    try {
      // Increment sequence number atomically
      this.sequenceCounter++;
      const sequenceNumber = this.sequenceCounter;

      // Create audit entry
      const auditEntry: Omit<SecureAuditEntry, 'integrity_hash'> = {
        id: `audit_${Date.now()}_${sequenceNumber}`,
        timestamp: new Date(),
        action: this.sanitizeString(action),
        userId: this.sanitizeString(userId),
        resourceId: resourceId ? this.sanitizeString(resourceId) : undefined,
        ipAddress: this.hashIPAddress(ipAddress), // Hash IP for privacy
        userAgent: userAgent ? this.sanitizeString(userAgent.slice(0, 200)) : undefined,
        details: this.sanitizeDetails(details),
        sequence_number: sequenceNumber,
        previous_hash: this.lastHash
      };

      // Generate integrity hash
      const integrityHash = await this.createIntegrityHash(auditEntry, this.lastHash);

      // Store in database with integrity protection
      await getPrisma().auditLog.create({
        data: {
          id: auditEntry.id,
          timestamp: auditEntry.timestamp,
          action: auditEntry.action,
          userId: auditEntry.userId,
          resourceId: auditEntry.resourceId,
          ipAddress: auditEntry.ipAddress,
          userAgent: auditEntry.userAgent,
          details: auditEntry.details,
          integrityHash,
          sequenceNumber,
          previousHash: this.lastHash,
          success: true // Mark as successful audit entry
        }
      });

      // Update chain state
      this.lastHash = integrityHash;

      auditLogger.debug('Secure audit entry created', {
        action: auditEntry.action,
        userId: auditEntry.userId,
        sequence: sequenceNumber,
        hasIntegrityHash: !!integrityHash
      });

    } catch (error) {
      auditLogger.error('Failed to create secure audit entry', {
        action,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Log the failure itself (without incrementing sequence to avoid chain corruption)
      try {
        await getPrisma().auditLog.create({
          data: {
            id: `audit_error_${Date.now()}`,
            timestamp: new Date(),
            action: 'AUDIT_LOG_FAILURE',
            userId: userId,
            ipAddress: this.hashIPAddress(ipAddress),
            details: { 
              original_action: action,
              error_message: error instanceof Error ? error.message : 'Unknown error'
            },
            success: false,
            sequenceNumber: -1, // Mark as error entry
            integrityHash: 'ERROR'
          }
        });
      } catch (fallbackError) {
        auditLogger.error('Critical: Failed to log audit failure', {
          fallbackError: fallbackError instanceof Error ? fallbackError.message : 'Unknown error'
        });
      }
    }
  }

  /**
   * Verify audit log chain integrity
   */
  async verifyAuditIntegrity(): Promise<AuditIntegrityReport> {
    try {
      const auditEntries = await getPrisma().auditLog.findMany({
        where: { sequenceNumber: { gte: 0 } }, // Exclude error entries
        orderBy: { sequenceNumber: 'asc' },
        select: {
          id: true,
          timestamp: true,
          action: true,
          userId: true,
          resourceId: true,
          details: true,
          integrityHash: true,
          sequenceNumber: true,
          previousHash: true
        }
      });

      const report: AuditIntegrityReport = {
        isValid: true,
        totalEntries: auditEntries.length,
        tamperedEntries: []
      };

      let previousHash = '';

      for (let i = 0; i < auditEntries.length; i++) {
        const entry = auditEntries[i];

        // Check previous hash linkage
        if (entry.previousHash !== previousHash) {
          report.isValid = false;
          report.brokenChainAt = entry.sequenceNumber;
          break;
        }

        // Verify integrity hash
        const expectedHash = await this.createIntegrityHash({
          id: entry.id,
          timestamp: entry.timestamp,
          action: entry.action,
          userId: entry.userId,
          resourceId: entry.resourceId || undefined,
          ipAddress: '', // We don't store raw IP
          userAgent: undefined,
          details: entry.details,
          sequence_number: entry.sequenceNumber,
          previous_hash: entry.previousHash || ''
        }, entry.previousHash || '');

        if (entry.integrityHash !== expectedHash) {
          report.isValid = false;
          report.tamperedEntries.push(entry.id);
        }

        previousHash = entry.integrityHash || '';
      }

      auditLogger.info('Audit integrity verification completed', {
        totalEntries: report.totalEntries,
        isValid: report.isValid,
        tamperedCount: report.tamperedEntries.length
      });

      return report;

    } catch (error) {
      auditLogger.error('Audit integrity verification failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        isValid: false,
        totalEntries: 0,
        tamperedEntries: []
      };
    }
  }

  /**
   * Get audit statistics for monitoring
   */
  async getAuditStatistics(): Promise<{
    totalEntries: number;
    entriesLast24h: number;
    failedEntries: number;
    lastIntegrityCheck?: Date;
    chainValid: boolean;
  }> {
    try {
      const [total, recent, failed] = await Promise.all([
        prisma.auditLog.count(),
        prisma.auditLog.count({
          where: {
            timestamp: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
            }
          }
        }),
        prisma.auditLog.count({
          where: { success: false }
        })
      ]);

      // Quick integrity check on recent entries
      const recentIntegrityReport = await this.verifyRecentIntegrity();

      return {
        totalEntries: total,
        entriesLast24h: recent,
        failedEntries: failed,
        lastIntegrityCheck: new Date(),
        chainValid: recentIntegrityReport.isValid
      };

    } catch (error) {
      auditLogger.error('Failed to get audit statistics', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        totalEntries: 0,
        entriesLast24h: 0,
        failedEntries: 0,
        chainValid: false
      };
    }
  }

  /**
   * Verify integrity of recent audit entries (performance optimized)
   */
  private async verifyRecentIntegrity(): Promise<AuditIntegrityReport> {
    try {
      // Check last 100 entries for performance
      const recentEntries = await getPrisma().auditLog.findMany({
        where: { sequenceNumber: { gte: 0 } },
        orderBy: { sequenceNumber: 'desc' },
        take: 100,
        select: {
          id: true,
          integrityHash: true,
          sequenceNumber: true,
          previousHash: true
        }
      });

      const report: AuditIntegrityReport = {
        isValid: true,
        totalEntries: recentEntries.length,
        tamperedEntries: []
      };

      // Check chain linkage (reversed order since we got DESC)
      for (let i = recentEntries.length - 1; i > 0; i--) {
        const current = recentEntries[i];
        const next = recentEntries[i - 1];

        if (next.previousHash !== current.integrityHash) {
          report.isValid = false;
          report.brokenChainAt = next.sequenceNumber;
          break;
        }
      }

      return report;

    } catch {
      return {
        isValid: false,
        totalEntries: 0,
        tamperedEntries: []
      };
    }
  }

  /**
   * Sanitize string input to prevent log injection
   */
  private sanitizeString(input: string): string {
    return input
      .replace(/[\r\n]/g, '') // Remove line breaks
      .replace(/[<>]/g, '') // Remove HTML
      .replace(/['"]/g, '') // Remove quotes
      .slice(0, 500); // Limit length
  }

  /**
   * Sanitize details object
   */
  private sanitizeDetails(details?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!details) return undefined;

    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(details)) {
      const cleanKey = this.sanitizeString(key);
      if (typeof value === 'string') {
        sanitized[cleanKey] = this.sanitizeString(value);
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        sanitized[cleanKey] = value;
      } else {
        sanitized[cleanKey] = JSON.stringify(value).slice(0, 1000);
      }
    }
    return sanitized;
  }

  /**
   * Hash IP address for privacy while maintaining uniqueness for security analysis
   */
  private async hashIPAddress(ipAddress: string): Promise<string> {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(ipAddress + process.env.AUDIT_SALT || 'default_salt');
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
    } catch {
      return 'hash_error';
    }
  }
}

// Export singleton instance
export const auditProtection = AuditProtectionService.getInstance();

// Convenience functions
export async function logSecureAudit(
  action: string,
  userId: string,
  ipAddress: string,
  resourceId?: string,
  userAgent?: string,
  details?: Record<string, unknown>
): Promise<void> {
  return auditProtection.logSecureAuditEntry(action, userId, ipAddress, resourceId, userAgent, details);
}

export async function verifyAuditIntegrity(): Promise<AuditIntegrityReport> {
  return auditProtection.verifyAuditIntegrity();
}

export async function getAuditStatistics() {
  return auditProtection.getAuditStatistics();
}