import { estimateTokenCount } from '../../../lib/ai/token-counter';
import { logger } from '../../../lib/logging';

// Create a module-specific logger
const optimizerLogger = logger.child('token-optimizer');

/**
 * Token optimization levels based on subscription tiers
 */
export type OptimizationLevel = 'minimal' | 'conservative' | 'balanced' | 'aggressive';

/**
 * Subscription tier mapping to optimization levels
 */
export type SubscriptionTier = 'premium' | 'professional' | 'basic';

/**
 * Token optimization options
 */
export interface TokenOptimizationOptions {
  level: OptimizationLevel;
  preserveFinancialData?: boolean;
  preserveRiskFactors?: boolean;
  preserveMDA?: boolean;
  targetTokenReduction?: number;
}

/**
 * Token optimization result
 */
export interface TokenOptimizationResult {
  originalContent: string;
  optimizedContent: string;
  originalTokens: number;
  optimizedTokens: number;
  reductionPercentage: number;
  optimizationLevel: OptimizationLevel;
  sectionsPreserved: string[];
  sectionsRemoved: string[];
  qualityScore: number;
  warnings: string[];
}

/**
 * Map subscription tier to optimization level
 */
export function getOptimizationLevelForTier(tier: SubscriptionTier): OptimizationLevel {
  const tierMapping: Record<SubscriptionTier, OptimizationLevel> = {
    'premium': 'minimal',      // 50-60% reduction - maximum context
    'professional': 'conservative', // 67% reduction - comprehensive context
    'basic': 'balanced'        // 85% reduction - efficient context
  };
  
  return tierMapping[tier];
}

/**
 * Get optimization targets for each level
 */
export function getOptimizationTargets(level: OptimizationLevel): {
  targetReduction: number;
  preserveContext: boolean;
  preserveRiskDepth: boolean;
  preserveNarratives: boolean;
} {
  const targets = {
    'minimal': {
      targetReduction: 0.55,      // 50-60% reduction
      preserveContext: true,
      preserveRiskDepth: true,
      preserveNarratives: true
    },
    'conservative': {
      targetReduction: 0.67,      // 67% reduction
      preserveContext: true,
      preserveRiskDepth: true,
      preserveNarratives: false
    },
    'balanced': {
      targetReduction: 0.85,      // 85% reduction
      preserveContext: false,
      preserveRiskDepth: false,
      preserveNarratives: false
    },
    'aggressive': {
      targetReduction: 0.94,      // 94% reduction
      preserveContext: false,
      preserveRiskDepth: false,
      preserveNarratives: false
    }
  };
  
  return targets[level];
}

/**
 * Main token optimization function
 */
export async function optimizeTokens(
  content: string,
  options: TokenOptimizationOptions
): Promise<TokenOptimizationResult> {
  const startTime = Date.now();
  const originalTokens = estimateTokenCount(content);
  const targets = getOptimizationTargets(options.level);
  
  optimizerLogger.info(`Starting token optimization`, {
    level: options.level,
    originalTokens,
    targetReduction: targets.targetReduction,
    contentLength: content.length
  });

  let optimizedContent = content;
  const sectionsPreserved: string[] = [];
  const sectionsRemoved: string[] = [];
  const warnings: string[] = [];

  try {
    // Step 1: Format identification and pre-cleaning
    optimizedContent = await performPreCleaning(optimizedContent, options.level);
    sectionsRemoved.push('HTML formatting', 'Scripts and styles', 'Navigation elements');

    // Step 2: Section identification and extraction
    const sections = identifySections(optimizedContent);
    optimizerLogger.debug(`Identified ${sections.length} sections`);

    // Step 3: Apply optimization based on level
    switch (options.level) {
      case 'minimal':
        optimizedContent = await applyMinimalOptimization(optimizedContent, sections);
        sectionsPreserved.push('All financial statements', 'Complete MD&A', 'All risk factors', 'Business overview');
        break;
        
      case 'conservative':
        optimizedContent = await applyConservativeOptimization(optimizedContent, sections);
        sectionsPreserved.push('Key financial statements', 'Essential MD&A', 'Major risk factors', 'Core business info');
        sectionsRemoved.push('Detailed regulatory compliance', 'Extensive forward-looking statements');
        break;
        
      case 'balanced':
        optimizedContent = await applyBalancedOptimization(optimizedContent, sections);
        sectionsPreserved.push('Financial summaries', 'Key business metrics', 'Material risks');
        sectionsRemoved.push('Detailed narratives', 'Non-material disclosures', 'Extensive compliance text');
        break;
        
      case 'aggressive':
        optimizedContent = await applyAggressiveOptimization(optimizedContent, sections);
        sectionsPreserved.push('Essential financial data', 'Key metrics', 'Top risk factors');
        sectionsRemoved.push('Most narratives', 'Detailed explanations', 'Non-critical disclosures');
        break;
    }

    // Step 4: Final cleanup and validation
    optimizedContent = await performFinalCleanup(optimizedContent);

    // Step 5: Calculate results
    const optimizedTokens = estimateTokenCount(optimizedContent);
    const reductionPercentage = ((originalTokens - optimizedTokens) / originalTokens) * 100;
    
    // Step 6: Quality assessment
    const qualityScore = assessOptimizationQuality(
      content,
      optimizedContent,
      options.level,
      reductionPercentage
    );

    // Step 7: Generate warnings if needed
    if (reductionPercentage < (targets.targetReduction * 100 - 10)) {
      warnings.push(`Reduction ${reductionPercentage.toFixed(1)}% below target ${(targets.targetReduction * 100).toFixed(0)}%`);
    }
    
    if (qualityScore < 80) {
      warnings.push(`Quality score ${qualityScore} below recommended threshold of 80`);
    }

    const processingTime = Date.now() - startTime;
    
    optimizerLogger.info(`Token optimization completed`, {
      level: options.level,
      originalTokens,
      optimizedTokens,
      reductionPercentage: reductionPercentage.toFixed(1),
      qualityScore,
      processingTime
    });

    return {
      originalContent: content,
      optimizedContent,
      originalTokens,
      optimizedTokens,
      reductionPercentage,
      optimizationLevel: options.level,
      sectionsPreserved,
      sectionsRemoved,
      qualityScore,
      warnings
    };

  } catch (error) {
    optimizerLogger.error(`Token optimization failed: ${error}`, {
      level: options.level,
      originalTokens
    });
    
    throw new Error(`Token optimization failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Perform initial cleaning (HTML, scripts, navigation)
 */
async function performPreCleaning(content: string, level: OptimizationLevel): Promise<string> {
  let cleaned = content;
  
  // Remove HTML scripts and styles
  cleaned = cleaned.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  
  // Clean up excessive HTML formatting
  cleaned = cleaned.replace(/<(div|span|p)[^>]*?style="[^"]*"[^>]*>/gi, '<$1>');
  cleaned = cleaned.replace(/<\/?(font|center|b|i|u|strong|em)[^>]*>/gi, '');
  
  // Remove navigation and boilerplate
  cleaned = cleaned.replace(/Table of Contents[\s\S]*?(?=PART|Item)/i, '');
  cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n'); // Reduce excessive newlines
  
  return cleaned;
}

/**
 * Identify key sections in the filing
 */
function identifySections(content: string): Array<{name: string; start: number; end: number; priority: number}> {
  const sections: Array<{name: string; start: number; end: number; priority: number}> = [];
  
  // High priority sections
  const highPrioritySections = [
    { pattern: /ITEM\s+1[^A-Z]*BUSINESS/i, name: 'Business Overview', priority: 1 },
    { pattern: /ITEM\s+1A[^A-Z]*RISK\s+FACTORS/i, name: 'Risk Factors', priority: 1 },
    { pattern: /ITEM\s+7[^A-Z]*MANAGEMENT['']?S\s+DISCUSSION/i, name: 'MD&A', priority: 1 },
    { pattern: /CONSOLIDATED\s+(STATEMENTS|BALANCE\s+SHEETS)/i, name: 'Financial Statements', priority: 1 }
  ];
  
  // Medium priority sections
  const mediumPrioritySections = [
    { pattern: /ITEM\s+2[^A-Z]*PROPERTIES/i, name: 'Properties', priority: 2 },
    { pattern: /ITEM\s+3[^A-Z]*LEGAL\s+PROCEEDINGS/i, name: 'Legal Proceedings', priority: 2 },
    { pattern: /ITEM\s+8[^A-Z]*FINANCIAL\s+STATEMENTS/i, name: 'Financial Statements Detail', priority: 2 }
  ];
  
  // Process all section patterns
  [...highPrioritySections, ...mediumPrioritySections].forEach(({ pattern, name, priority }) => {
    const match = content.match(pattern);
    if (match && match.index !== undefined) {
      sections.push({
        name,
        start: match.index,
        end: match.index + 1000, // Rough section size
        priority
      });
    }
  });
  
  return sections.sort((a, b) => a.start - b.start);
}

/**
 * Apply minimal optimization (50-60% reduction)
 */
async function applyMinimalOptimization(content: string, sections: any[]): Promise<string> {
  let optimized = content;
  
  // Remove only the most obvious boilerplate
  optimized = optimized.replace(/This\s+Annual\s+Report[\s\S]*?forward-looking\s+statements\./gi, '');
  optimized = optimized.replace(/SIGNATURES[\s\S]*$/i, ''); // Remove signature pages
  optimized = optimized.replace(/EXHIBIT\s+INDEX[\s\S]*$/i, ''); // Remove exhibit index
  
  // Clean up excessive whitespace but preserve structure
  optimized = optimized.replace(/\n\s*\n\s*\n/g, '\n\n');
  
  return optimized;
}

/**
 * Apply conservative optimization (67% reduction)
 */
async function applyConservativeOptimization(content: string, sections: any[]): Promise<string> {
  let optimized = content;
  
  // Apply minimal optimizations first
  optimized = await applyMinimalOptimization(optimized, sections);
  
  // Remove additional boilerplate
  optimized = optimized.replace(/The\s+following\s+discussion[\s\S]*?should\s+be\s+read/gi, '');
  optimized = optimized.replace(/Forward-Looking\s+Statements[\s\S]*?(?=ITEM|$)/gi, '');
  
  // Compress repetitive compliance language
  optimized = optimized.replace(/pursuant\s+to\s+the\s+requirements[\s\S]*?Exchange\s+Act/gi, '');
  
  return optimized;
}

/**
 * Apply balanced optimization (85% reduction)
 */
async function applyBalancedOptimization(content: string, sections: any[]): Promise<string> {
  let optimized = content;
  
  // Apply conservative optimizations first
  optimized = await applyConservativeOptimization(optimized, sections);
  
  // More aggressive removal of narratives
  optimized = optimized.replace(/We\s+believe[\s\S]*?(?=\.|We\s+|The\s+|Our\s+)/gi, '');
  optimized = optimized.replace(/In\s+addition[\s\S]*?(?=\.|In\s+|The\s+|Our\s+)/gi, '');
  
  // Remove detailed explanations but keep key data
  optimized = optimized.replace(/As\s+discussed[\s\S]*?(?=\.|As\s+|The\s+|Our\s+)/gi, '');
  
  return optimized;
}

/**
 * Apply aggressive optimization (94% reduction)
 */
async function applyAggressiveOptimization(content: string, sections: any[]): Promise<string> {
  let optimized = content;
  
  // Apply balanced optimizations first
  optimized = await applyBalancedOptimization(optimized, sections);
  
  // Very aggressive removal - keep only essential data
  optimized = optimized.replace(/(?:Our|We|The\s+Company)[\s\S]*?(?=\$|\d+%|\d+\.\d+|ITEM)/gi, '');
  
  // Keep only financial tables and key metrics
  const financialTableRegex = /\$[\d,]+(?:\.\d+)?(?:\s+million|\s+billion)?/g;
  const percentageRegex = /\d+\.\d+%|\d+%/g;
  
  // Extract key financial data and metrics
  const financialData = (optimized.match(financialTableRegex) || []).join(' ');
  const percentages = (optimized.match(percentageRegex) || []).join(' ');
  
  // Rebuild with only essential content
  optimized = `Financial Data: ${financialData}\nKey Metrics: ${percentages}\n${optimized.slice(-1000)}`;
  
  return optimized;
}

/**
 * Final cleanup pass
 */
async function performFinalCleanup(content: string): Promise<string> {
  let cleaned = content;
  
  // Remove excessive whitespace
  cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n');
  cleaned = cleaned.replace(/[ \t]+/g, ' ');
  
  // Remove empty lines and trim
  cleaned = cleaned.split('\n').filter(line => line.trim().length > 0).join('\n');
  
  return cleaned.trim();
}

/**
 * Assess optimization quality
 */
function assessOptimizationQuality(
  original: string,
  optimized: string,
  level: OptimizationLevel,
  reductionPercentage: number
): number {
  let score = 100;
  
  // Check if key financial data is preserved
  const originalFinancialMatches = (original.match(/\$[\d,]+(?:\.\d+)?/g) || []).length;
  const optimizedFinancialMatches = (optimized.match(/\$[\d,]+(?:\.\d+)?/g) || []).length;
  
  if (originalFinancialMatches > 0) {
    const financialPreservationRate = optimizedFinancialMatches / originalFinancialMatches;
    if (financialPreservationRate < 0.8) {
      score -= 20; // Significant penalty for losing financial data
    } else if (financialPreservationRate < 0.9) {
      score -= 10;
    }
  }
  
  // Check if reduction meets targets
  const targets = getOptimizationTargets(level);
  const targetReduction = targets.targetReduction * 100;
  
  if (reductionPercentage < targetReduction - 15) {
    score -= 15;
  } else if (reductionPercentage < targetReduction - 5) {
    score -= 5;
  }
  
  // Check content coherence (basic)
  if (optimized.length < 100) {
    score -= 30; // Too aggressive
  }
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Validate optimization result
 */
export function validateOptimization(result: TokenOptimizationResult): {
  isValid: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  
  if (result.qualityScore < 70) {
    issues.push(`Quality score ${result.qualityScore} is below acceptable threshold`);
  }
  
  if (result.optimizedTokens <= 0) {
    issues.push('Optimized content is empty');
  }
  
  if (result.reductionPercentage < 30) {
    issues.push(`Token reduction ${result.reductionPercentage.toFixed(1)}% is insufficient`);
  }
  
  if (result.warnings.length > 2) {
    issues.push(`Too many warnings: ${result.warnings.length}`);
  }
  
  return {
    isValid: issues.length === 0,
    issues
  };
}