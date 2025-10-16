/**
 * Security Audit Report for Weak Random Number Generation
 * 
 * This module provides comprehensive auditing of the codebase for weak
 * random number generation patterns and validates security fixes.
 */

import { auditRandomUsage } from './secure-random';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { logger } from '../logging';

const auditLogger = logger.child('security-audit');

export interface AuditResult {
  totalFiles: number;
  scannedFiles: number;
  totalIssues: number;
  criticalIssues: number;
  highIssues: number;
  mediumIssues: number;
  lowIssues: number;
  fileResults: Array<{
    filePath: string;
    issues: Array<{
      line: number;
      issue: string;
      severity: 'HIGH' | 'MEDIUM' | 'LOW';
      recommendation: string;
    }>;
  }>;
  summary: {
    fixedFiles: string[];
    remainingIssues: string[];
    testFiles: string[];
    nonSecuritySensitive: string[];
  };
}

/**
 * Audits the entire codebase for weak random number generation
 * @param rootPath Root path to audit (default: current working directory)
 * @returns Comprehensive audit results
 */
export async function auditCodebaseForWeakRandom(rootPath: string = process.cwd()): Promise<AuditResult> {
  const result: AuditResult = {
    totalFiles: 0,
    scannedFiles: 0,
    totalIssues: 0,
    criticalIssues: 0,
    highIssues: 0,
    mediumIssues: 0,
    lowIssues: 0,
    fileResults: [],
    summary: {
      fixedFiles: [],
      remainingIssues: [],
      testFiles: [],
      nonSecuritySensitive: []
    }
  };

  try {
    const filesToScan = await getTypeScriptFiles(rootPath);
    result.totalFiles = filesToScan.length;

    for (const filePath of filesToScan) {
      try {
        const content = readFileSync(filePath, 'utf-8');
        const issues = auditRandomUsage(content);
        
        if (issues.length > 0) {
          result.fileResults.push({
            filePath: filePath.replace(rootPath, ''),
            issues
          });

          result.totalIssues += issues.length;
          
          // Count by severity
          issues.forEach(issue => {
            switch (issue.severity) {
              case 'HIGH':
                result.highIssues++;
                break;
              case 'MEDIUM':
                result.mediumIssues++;
                break;
              case 'LOW':
                result.lowIssues++;
                break;
            }
          });

          // Categorize files
          if (filePath.includes('test') || filePath.includes('__tests__')) {
            result.summary.testFiles.push(filePath);
          } else if (issues.some(i => i.severity === 'HIGH')) {
            result.summary.remainingIssues.push(filePath);
          } else {
            result.summary.nonSecuritySensitive.push(filePath);
          }
        } else {
          // File has no issues - likely fixed
          if (content.includes('Math.random()') && 
              content.includes('generateSecure')) {
            result.summary.fixedFiles.push(filePath);
          }
        }
        
        result.scannedFiles++;
      } catch (fileError) {
        auditLogger.warn('Failed to scan file', { 
          filePath, 
          error: fileError instanceof Error ? fileError.message : String(fileError) 
        });
      }
    }

    auditLogger.info('Security audit completed', {
      totalFiles: result.totalFiles,
      scannedFiles: result.scannedFiles,
      totalIssues: result.totalIssues,
      highIssues: result.highIssues,
      mediumIssues: result.mediumIssues,
      lowIssues: result.lowIssues
    });

    return result;
    
  } catch (error) {
    auditLogger.error('Security audit failed', { 
      error: error instanceof Error ? error.message : String(error) 
    });
    throw error;
  }
}

/**
 * Gets all TypeScript files in the project
 * @param rootPath Root directory to scan
 * @returns Array of file paths
 */
async function getTypeScriptFiles(rootPath: string): Promise<string[]> {
  const files: string[] = [];
  const ignoreDirs = [
    'node_modules', 
    '.next', 
    'dist', 
    'build', 
    '.git',
    'coverage',
    '.vercel',
    '.cache'
  ];
  
  function scanDirectory(dirPath: string) {
    try {
      const entries = readdirSync(dirPath);
      
      for (const entry of entries) {
        const fullPath = join(dirPath, entry);
        const stat = statSync(fullPath);
        
        if (stat.isDirectory()) {
          if (!ignoreDirs.includes(entry)) {
            scanDirectory(fullPath);
          }
        } else if (stat.isFile()) {
          if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      auditLogger.warn('Failed to scan directory', { 
        dirPath, 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }
  
  scanDirectory(rootPath);
  return files;
}

/**
 * Generates a detailed security audit report
 * @param auditResult Results from the audit
 * @returns Formatted report string
 */
export function generateAuditReport(auditResult: AuditResult): string {
  const report = [
    '='.repeat(80),
    'SECURITY AUDIT REPORT: WEAK RANDOM NUMBER GENERATION',
    '='.repeat(80),
    '',
    `Scan Date: ${new Date().toISOString()}`,
    `Total Files Scanned: ${auditResult.scannedFiles}/${auditResult.totalFiles}`,
    `Total Security Issues Found: ${auditResult.totalIssues}`,
    '',
    'SEVERITY BREAKDOWN:',
    `  🔴 HIGH (Critical Security Issues): ${auditResult.highIssues}`,
    `  🟡 MEDIUM (Security Concerns): ${auditResult.mediumIssues}`,
    `  🟢 LOW (Best Practice): ${auditResult.lowIssues}`,
    '',
    'SUMMARY:',
    `  ✅ Fixed Files: ${auditResult.summary.fixedFiles.length}`,
    `  ❌ Remaining Critical Issues: ${auditResult.summary.remainingIssues.length}`,
    `  🧪 Test Files (Acceptable): ${auditResult.summary.testFiles.length}`,
    `  ℹ️  Non-Security Sensitive: ${auditResult.summary.nonSecuritySensitive.length}`,
    '',
  ];

  if (auditResult.summary.fixedFiles.length > 0) {
    report.push('SUCCESSFULLY FIXED FILES:');
    auditResult.summary.fixedFiles.forEach(file => {
      report.push(`  ✅ ${file.replace(process.cwd(), '')}`);
    });
    report.push('');
  }

  if (auditResult.summary.remainingIssues.length > 0) {
    report.push('🚨 CRITICAL ISSUES REQUIRING IMMEDIATE ATTENTION:');
    auditResult.fileResults
      .filter(fr => auditResult.summary.remainingIssues.includes(fr.filePath))
      .forEach(fileResult => {
        report.push(`\n  📁 ${fileResult.filePath}`);
        fileResult.issues
          .filter(issue => issue.severity === 'HIGH')
          .forEach(issue => {
            report.push(`    Line ${issue.line}: ${issue.issue}`);
            report.push(`    🔧 Fix: ${issue.recommendation}`);
          });
      });
    report.push('');
  }

  if (auditResult.summary.testFiles.length > 0) {
    report.push('TEST FILES (Math.random() acceptable for testing):');
    auditResult.summary.testFiles.forEach(file => {
      report.push(`  🧪 ${file.replace(process.cwd(), '')}`);
    });
    report.push('');
  }

  // Overall security assessment
  if (auditResult.highIssues === 0) {
    report.push('🎉 SECURITY STATUS: PASS');
    report.push('No critical security vulnerabilities detected.');
    report.push('All security-sensitive random number generation uses cryptographic methods.');
  } else {
    report.push('⚠️  SECURITY STATUS: FAIL');
    report.push(`${auditResult.highIssues} critical security issues require immediate fixing.`);
    report.push('Use crypto.randomBytes() or the provided secure-random utilities.');
  }

  report.push('');
  report.push('RECOMMENDATIONS:');
  report.push('1. All security-sensitive IDs should use generateSecureExecutionId()');
  report.push('2. Correlation IDs should use generateSecureCorrelationId()');
  report.push('3. Request IDs should use generateSecureRequestId()');
  report.push('4. Session tokens should use generateSecureSessionToken()');
  report.push('5. Math.random() is only acceptable in test files and non-security contexts');
  report.push('');
  report.push('='.repeat(80));

  return report.join('\n');
}

/**
 * Validates that security fixes are properly implemented
 * @param filePath Path to file to validate
 * @returns Validation result
 */
export function validateSecurityFix(filePath: string): {
  isValid: boolean;
  issues: string[];
  recommendations: string[];
} {
  const result = {
    isValid: true,
    issues: [] as string[],
    recommendations: [] as string[]
  };

  try {
    const content = readFileSync(filePath, 'utf-8');
    
    // Check for remaining Math.random() in security contexts
    const mathRandomMatches = content.match(/Math\.random\(\)/g);
    if (mathRandomMatches) {
      const lines = content.split('\n');
      lines.forEach((line, index) => {
        if (line.includes('Math.random()')) {
          const lineNumber = index + 1;
          
          // Check context - is this in a security-sensitive area?
          const isSecuritySensitive = 
            line.includes('Id') || 
            line.includes('token') || 
            line.includes('secret') ||
            line.includes('session') ||
            line.includes('correlation') ||
            line.includes('execution');
            
          if (isSecuritySensitive && !filePath.includes('test')) {
            result.isValid = false;
            result.issues.push(`Line ${lineNumber}: Math.random() in security-sensitive context`);
            result.recommendations.push(`Replace with appropriate generateSecure*() function`);
          }
        }
      });
    }
    
    // Check for proper imports
    if (content.includes('generateSecure') && !content.includes('from \'../security/secure-random\'')) {
      result.issues.push('Missing import for secure-random utilities');
      result.recommendations.push('Add: import { generateSecure* } from \'../security/secure-random\'');
    }
    
  } catch (error) {
    result.isValid = false;
    result.issues.push(`Failed to validate file: ${error instanceof Error ? error.message : String(error)}`);
  }

  return result;
}

/**
 * CLI function to run security audit from command line
 */
export async function runSecurityAuditCLI(): Promise<void> {
  console.log('🔍 Starting security audit for weak random number generation...\n');
  
  try {
    const auditResult = await auditCodebaseForWeakRandom();
    const report = generateAuditReport(auditResult);
    
    console.log(report);
    
    // Exit with error code if critical issues found
    if (auditResult.highIssues > 0) {
      process.exit(1);
    } else {
      console.log('\n✅ Security audit passed! No critical vulnerabilities detected.');
      process.exit(0);
    }
    
  } catch (error) {
    console.error('❌ Security audit failed:', error);
    process.exit(1);
  }
}

// Export for CLI usage
if (require.main === module) {
  runSecurityAuditCLI();
}