/**
 * SEC Fetch Monitoring Service
 * 
 * Tracks and analyzes SEC filing fetch attempts to identify patterns,
 * failures, and potential edge cases that need addressing.
 */

import { logger } from '../../lib/logging';
import { PrismaClient } from '@prisma/client';
import { logXmlDocument, generateXmlSummary, XmlSummary } from '../../lib/xmlLogging';

// Initialize Prisma client with lazy loading pattern
// This prevents errors during build time when Prisma client hasn't been generated yet
let prismaInstance: PrismaClient | null = null;

function getPrismaClient(): PrismaClient {
  if (!prismaInstance) {
    try {
      prismaInstance = new PrismaClient();
    } catch (error) {
      logger.error(`Failed to initialize Prisma client: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  return prismaInstance;
}

// Types for monitoring
export interface UrlAttempt {
  url: string;
  success: boolean;
  statusCode?: number;
  error?: string;
  timestamp: number;
  xmlSummary?: XmlSummary;
  parsingStages?: {
    fetchComplete: boolean;
    xmlParsed: boolean;
    namespacesResolved: boolean;
    contextRefsValid: boolean;
  };
}

export interface FetchAttemptData {
  filingId: string;
  ticker?: string;
  formType?: string;
  attempts: UrlAttempt[];
  successful: boolean;
  timestamp: number;
  xmlContent?: string;
  hasXmlContent?: boolean;
  xmlSize?: number;
}

/**
 * Records a filing fetch attempt with all URL attempts
 * @param data Fetch attempt data
 */
export async function recordFetchAttempt(data: FetchAttemptData): Promise<void> {
  try {
    // Process XML content if available
    let xmlSummary: XmlSummary | null = null;
    if (data.xmlContent) {
      // Log the XML content with structured formatting
      xmlSummary = logXmlDocument(
        data.xmlContent,
        `XML Content Summary for ${data.filingId} (${data.formType || 'unknown'})`,
        data.successful ? 'debug' : 'info' // Use higher log level for failed attempts
      );
      
      // Update the data object with XML information
      data.hasXmlContent = true;
      data.xmlSize = data.xmlContent.length;
      
      // Update the most recent successful URL attempt with XML summary
      const successfulAttempts = data.attempts.filter(a => a.success);
      if (successfulAttempts.length > 0) {
        const lastSuccessfulAttempt = successfulAttempts[successfulAttempts.length - 1];
        lastSuccessfulAttempt.xmlSummary = xmlSummary;
      }
    }
    
    // Log the fetch attempt with visual indicators for parsing stages
    const status = data.successful ? '✓' : '✘';
    const successCount = data.attempts.filter(a => a.success).length;
    const totalCount = data.attempts.length;
    
    // Add XML indicators if applicable
    const xmlIndicator = data.hasXmlContent 
      ? (xmlSummary?.hasEmbeddedHtml ? '🔄 [HTML]' : '📄 [XML]') 
      : '';
    
    logger.info(`${status} SEC Fetch Monitor: ${data.filingId} (${data.formType || 'unknown'}) - ${successCount}/${totalCount} URLs successful ${xmlIndicator}`);
    
    // Store the fetch attempt in the database for analysis
    try {
      await getPrismaClient().secFetchAttempt.create({
        data: {
          filingId: data.filingId,
          ticker: data.ticker || '',
          formType: data.formType || '',
          urlAttempts: JSON.stringify(data.attempts),
          successful: data.successful,
          attemptCount: totalCount,
          successCount: successCount,
          timestamp: new Date(data.timestamp),
          hasXmlContent: data.hasXmlContent || false,
          xmlSize: data.xmlSize || 0,
          hasEmbeddedHtml: xmlSummary?.hasEmbeddedHtml || false,
          namespaceCount: xmlSummary ? Object.keys(xmlSummary.namespaces).length : 0,
          contextRefCount: xmlSummary?.contextRefs ? Object.keys(xmlSummary.contextRefs).length : 0
        }
      });
    } catch (dbError) {
      // If the table doesn't exist yet, just log the error but don't fail
      logger.error(`Failed to store SEC fetch attempt in database: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
    }
  } catch (error) {
    logger.error(`Error recording SEC fetch attempt: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Analyzes recent fetch attempts to identify patterns and issues
 * @param days Number of days to analyze
 * @returns Analysis results
 */
export async function analyzeFetchAttempts(days: number = 7) {
  try {
    // Calculate the date range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // Try to query the database for fetch attempts
    try {
      const attempts = await getPrismaClient().secFetchAttempt.findMany({
        where: {
          timestamp: {
            gte: startDate
          }
        }
      });
      
      // Calculate statistics
      const totalAttempts = attempts.length;
      const successfulAttempts = attempts.filter(a => a.successful).length;
      const successRate = totalAttempts > 0 ? (successfulAttempts / totalAttempts) * 100 : 0;
      
      // Group by form type
      const formTypeStats: Record<string, { total: number, successful: number, rate: number }> = {};
      attempts.forEach(attempt => {
        const formType = attempt.formType || 'unknown';
        if (!formTypeStats[formType]) {
          formTypeStats[formType] = { total: 0, successful: 0, rate: 0 };
        }
        formTypeStats[formType].total++;
        if (attempt.successful) {
          formTypeStats[formType].successful++;
        }
      });
      
      // Calculate rates for each form type
      Object.keys(formTypeStats).forEach(formType => {
        const stats = formTypeStats[formType];
        stats.rate = stats.total > 0 ? (stats.successful / stats.total) * 100 : 0;
      });
      
      // Find the most problematic form types (lowest success rates)
      const problematicFormTypes = Object.entries(formTypeStats)
        .filter(([_, stats]) => stats.total >= 5) // Only consider form types with at least 5 attempts
        .sort(([_, statsA], [__, statsB]) => statsA.rate - statsB.rate)
        .slice(0, 3); // Top 3 most problematic
      
      // Find the most common error messages
      const errorMessages: Record<string, number> = {};
      attempts.forEach(attempt => {
        const urlAttempts = JSON.parse(attempt.urlAttempts as string) as UrlAttempt[];
        urlAttempts.forEach(urlAttempt => {
          if (!urlAttempt.success && urlAttempt.error) {
            const error = urlAttempt.error;
            errorMessages[error] = (errorMessages[error] || 0) + 1;
          }
        });
      });
      
      const commonErrors = Object.entries(errorMessages)
        .sort(([_, countA], [__, countB]) => countB - countA)
        .slice(0, 5); // Top 5 most common errors
      
      // Return the analysis results
      return {
        period: `${days} days`,
        totalAttempts,
        successfulAttempts,
        successRate: successRate.toFixed(2) + '%',
        formTypeStats,
        problematicFormTypes: problematicFormTypes.map(([formType, stats]) => ({
          formType,
          successRate: stats.rate.toFixed(2) + '%',
          attempts: stats.total
        })),
        commonErrors: commonErrors.map(([error, count]) => ({
          error,
          count,
          percentage: ((count / totalAttempts) * 100).toFixed(2) + '%'
        }))
      };
    } catch (dbError) {
      // If the table doesn't exist yet, return a placeholder analysis
      logger.warn(`Could not analyze SEC fetch attempts: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
      return {
        period: `${days} days`,
        error: 'Could not analyze fetch attempts - database table may not exist yet',
        suggestion: 'Run a Prisma migration to create the secFetchAttempt table'
      };
    }
  } catch (error) {
    logger.error(`Error analyzing SEC fetch attempts: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Generates a report of SEC fetch attempts
 * @param days Number of days to include in the report
 * @returns Report as a formatted string
 */
export async function generateFetchReport(days: number = 7): Promise<string> {
  try {
    const analysis = await analyzeFetchAttempts(days);
    
    // If there was an error, return a simple message
    if ('error' in analysis) {
      return `SEC Fetch Monitoring Report\n\nError: ${analysis.error}\n\n${analysis.suggestion}`;
    }
    
    // Generate a formatted report
    let report = `SEC Fetch Monitoring Report (Last ${analysis.period})\n\n`;
    
    report += `Total Attempts: ${analysis.totalAttempts}\n`;
    report += `Successful: ${analysis.successfulAttempts} (${analysis.successRate})\n\n`;
    
    report += `Form Type Success Rates:\n`;
    Object.entries(analysis.formTypeStats).forEach(([formType, stats]) => {
      report += `- ${formType}: ${stats.successful}/${stats.total} (${stats.rate.toFixed(2)}%)\n`;
    });
    
    report += `\nMost Problematic Form Types:\n`;
    analysis.problematicFormTypes.forEach((item, index) => {
      report += `${index + 1}. ${item.formType}: ${item.successRate} (${item.attempts} attempts)\n`;
    });
    
    report += `\nMost Common Errors:\n`;
    analysis.commonErrors.forEach((item, index) => {
      report += `${index + 1}. "${item.error}" - ${item.count} occurrences (${item.percentage})\n`;
    });
    
    // Add XML analysis section if available
    if (analysis.xmlAnalysis && analysis.xmlAnalysis.totalXmlFiles > 0) {
      const xml = analysis.xmlAnalysis;
      
      report += `\nXML Content Analysis:\n`;
      report += `- Total XML Files: ${xml.totalXmlFiles}\n`;
      report += `- Average Size: ${formatBytes(xml.avgXmlSize)}\n`;
      report += `- Size Distribution: Small: ${xml.xmlSizeDistribution.small}, `;
      report += `Medium: ${xml.xmlSizeDistribution.medium}, `;
      report += `Large: ${xml.xmlSizeDistribution.large}, `;
      report += `Very Large: ${xml.xmlSizeDistribution.very_large}\n`;
      report += `- Files with Embedded HTML: ${xml.hasEmbeddedHtml} (${((xml.hasEmbeddedHtml / xml.totalXmlFiles) * 100).toFixed(2)}%)\n`;
      report += `- Average Namespaces Per File: ${xml.avgNamespaceCount}\n`;
      
      report += `\nMost Common Namespaces:\n`;
      xml.topNamespaces.forEach((item, index) => {
        report += `${index + 1}. ${item.namespace}: ${item.count} occurrences (${item.percentage})\n`;
      });
    }
    
    return report;
  } catch (error) {
    return `Error generating SEC fetch report: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Formats a byte size into a human-readable string
 * @param bytes The number of bytes
 * @returns A formatted string (e.g., "1.23 MB")
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default {
  recordFetchAttempt,
  analyzeFetchAttempts,
  generateFetchReport
};
