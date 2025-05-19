/**
 * Schema Validators
 * 
 * Provides validation schemas for different filing types and
 * utilities to validate extracted JSON against these schemas.
 */

import { z } from 'zod';
import { SECFilingType } from '../prompts/prompt-types';
import { ValidationResult } from './types';

/**
 * Common reused schema elements
 */
const moneySchema = z.object({
  label: z.string(),
  value: z.string(),
  growth: z.string().optional(),
  unit: z.string().optional()
});

const sectionSchema = z.object({
  heading: z.string(),
  content: z.string(),
  page: z.number().optional()
});

/**
 * Schema for 10-K annual reports
 */
const schema10K = z.object({
  company: z.string(),
  period: z.string(),
  fiscalYear: z.string().optional(),
  filingDate: z.string().optional(),
  financials: z.array(moneySchema),
  insights: z.array(z.string()),
  risks: z.array(z.string()),
  sections: z.array(sectionSchema).optional(),
  summary: z.string().optional()
});

/**
 * Schema for 10-Q quarterly reports
 */
const schema10Q = z.object({
  company: z.string(),
  period: z.string(),
  fiscalQuarter: z.string().optional(),
  filingDate: z.string().optional(),
  financials: z.array(moneySchema),
  insights: z.array(z.string()),
  risks: z.array(z.string()),
  marketOutlook: z.string().optional(),
  sections: z.array(sectionSchema).optional(),
  summary: z.string().optional()
});

/**
 * Schema for 8-K current reports
 */
const schema8K = z.object({
  company: z.string(),
  reportDate: z.string(),
  filingDate: z.string().optional(),
  eventType: z.string(),
  summary: z.string(),
  positiveDevelopments: z.string().or(z.array(z.string())),
  potentialConcerns: z.string().or(z.array(z.string())),
  structuralChanges: z.string().or(z.array(z.string())).optional(),
  additionalNotes: z.string().optional()
});

/**
 * Schema for Form 4 insider trading reports
 */
const schemaForm4 = z.object({
  company: z.string(),
  filingDate: z.string(),
  filerName: z.string(),
  relationship: z.string(),
  ownershipType: z.string(),
  transactions: z.array(
    z.object({
      type: z.string(),
      date: z.string(),
      shares: z.number().or(z.string()),
      price: z.number().or(z.string()).optional(),
      value: z.number().or(z.string()).optional(),
      code: z.string().optional(),
      description: z.string().optional()
    })
  ),
  totalValue: z.string().optional(),
  percentageChange: z.string().optional(),
  previousStake: z.string().optional(),
  newStake: z.string().optional(),
  summary: z.string()
});

/**
 * Schema for S-1 registration statements
 */
const schemaS1 = z.object({
  company: z.string(),
  filingDate: z.string(),
  offeringType: z.string(),
  offeringAmount: z.string().optional(),
  useOfProceeds: z.array(z.string()).optional(),
  businessOverview: z.string(),
  riskFactors: z.array(z.string()),
  financialHighlights: z.array(moneySchema).optional(),
  managementTeam: z.array(
    z.object({
      name: z.string(),
      title: z.string(),
      background: z.string().optional()
    })
  ).optional(),
  summary: z.string()
});

/**
 * Schema for DEF 14A proxy statements
 */
const schemaDEF14A = z.object({
  company: z.string(),
  filingDate: z.string(),
  meetingDate: z.string(),
  meetingType: z.string(),
  proposals: z.array(
    z.object({
      number: z.number().or(z.string()),
      title: z.string(),
      description: z.string(),
      boardRecommendation: z.string().optional()
    })
  ),
  executiveCompensation: z.array(
    z.object({
      name: z.string(),
      title: z.string(),
      salary: z.string().optional(),
      bonus: z.string().optional(),
      stockAwards: z.string().optional(),
      optionAwards: z.string().optional(),
      total: z.string().optional()
    })
  ).optional(),
  summary: z.string()
});

/**
 * Generic schema for any SEC filing
 */
const schemaGeneric = z.object({
  company: z.string(),
  filingType: z.string(),
  filingDate: z.string(),
  sections: z.array(sectionSchema).optional(),
  keyPoints: z.array(z.string()),
  summary: z.string()
});

/**
 * Map filing types to their schemas
 */
const schemaMap: Record<SECFilingType, z.ZodTypeAny> = {
  '10-K': schema10K,
  '10-Q': schema10Q,
  '8-K': schema8K,
  '20-F': schema10K, // Similar to 10-K but for foreign issuers
  '6-K': schema10Q,  // Similar to 10-Q but for foreign issuers
  'S-1': schemaS1,
  'S-4': schemaS1,   // Similar to S-1 but for business combinations
  '424B': schemaGeneric,
  'DEF 14A': schemaDEF14A,
  'Generic': schemaGeneric
};

/**
 * Validate extracted JSON against the appropriate schema
 * 
 * @param data - The data to validate
 * @param filingType - The type of filing
 * @param options - Validation options
 * @returns Validation result with status and errors if any
 */
export function validateAgainstSchema(
  data: any, 
  filingType: SECFilingType = 'Generic',
  strict = false
): ValidationResult {
  try {
    // Get the appropriate schema
    const schema = schemaMap[filingType] || schemaGeneric;
    
    // In strict mode, we validate against the full schema
    if (strict) {
      const result = schema.safeParse(data);
      
      if (result.success) {
        return {
          valid: true,
          validatedData: result.data
        };
      } else {
        return {
          valid: false,
          errors: result.error.errors.map((e: z.ZodIssue) => e.message),
          partialData: data
        };
      }
    } 
    // In non-strict mode, we validate as much as possible
    else {
      // Create a partial schema with only the fields that exist in the data
      // Type assertion to handle the fact that partial() is not on ZodTypeAny
      const partialSchema = (schema as z.ZodObject<any, any, any>).partial();
      const result = partialSchema.safeParse(data);
      
      if (result.success) {
        // Also check if we have the minimum required fields
        const minimumRequired = z.object({
          company: z.string(),
          summary: z.string().optional()
        });
        
        const minimumCheck = minimumRequired.safeParse(data);
        
        return {
          valid: minimumCheck.success,
          validatedData: result.data,
          errors: minimumCheck.success ? undefined : ['Missing minimum required fields']
        };
      } else {
        return {
          valid: false,
          errors: result.error.errors.map((e: z.ZodIssue) => e.message),
          partialData: data
        };
      }
    }
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
      partialData: data
    };
  }
}

/**
 * Extract partial valid data from an invalid object
 * 
 * @param data - The data to extract from
 * @param filingType - The type of filing
 * @returns The extracted valid fields
 */
export function extractValidFields(
  data: any,
  filingType: SECFilingType = 'Generic'
): Record<string, any> {
  try {
    const schema = schemaMap[filingType] || schemaGeneric;
    const validFields: Record<string, any> = {};
    
    // Try to validate each field individually
    Object.entries(data).forEach(([key, value]) => {
      try {
        // Get the schema for this particular field if it exists
        const fieldSchema = (schema as any)._def.shape()[key];
        
        if (fieldSchema) {
          const result = fieldSchema.safeParse(value);
          if (result.success) {
            validFields[key] = value;
          }
        } else {
          // If there's no schema for this field, include it as-is
          validFields[key] = value;
        }
      } catch {
        // Skip fields that error
      }
    });
    
    return validFields;
  } catch {
    // Return the original data if something goes wrong
    return data;
  }
} 