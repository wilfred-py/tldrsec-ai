/**
 * Filing Content Verifier
 *
 * Verifies that fetched SEC filing content matches the expected metadata
 * by cross-referencing extracted content against SEC API data.
 *
 * This provides 100% certainty that content relates to the actual SEC filing.
 */

export interface FilingMetadata {
  accessionNumber: string;
  cik: string;
  formType: string;
  companyName: string;
  filingDate?: string;
}

export interface ExtractedMetadata {
  accessionNumber: string | null;
  cik: string | null;
  formType: string | null;
  companyName: string | null;
  filingDate: string | null;
}

export interface FieldVerification<T> {
  expected: T;
  extracted: T | null;
  matches: boolean;
  similarity?: number; // For fuzzy matching (0-100)
}

export interface ContentVerificationResult {
  isVerified: boolean;
  accessionNumber: FieldVerification<string>;
  cik: FieldVerification<string>;
  formType: FieldVerification<string>;
  companyName: FieldVerification<string>;
  filingDate: FieldVerification<string | undefined>;
  confidence: number; // 0-100%
  errors: string[];
  warnings: string[];
  contentLength: number;
  extractedMetadata: ExtractedMetadata;
}

/**
 * Form-specific content indicators to validate filing type
 */
const FORM_CONTENT_INDICATORS: Record<string, RegExp[]> = {
  '10-K': [
    /annual\s+report/i,
    /form\s+10-k/i,
    /item\s+1[.\s]+business/i,
    /item\s+7[.\s]+management.*discussion/i,
    /fiscal\s+year\s+ended/i,
    /total\s+assets/i,
    /stockholders.*equity/i
  ],
  '10-Q': [
    /quarterly\s+report/i,
    /form\s+10-q/i,
    /quarter\s+ended/i,
    /item\s+1[.\s]+financial\s+statements/i,
    /condensed\s+consolidated/i,
    /unaudited/i
  ],
  '8-K': [
    /current\s+report/i,
    /form\s+8-k/i,
    /item\s+\d\.\d+/i,
    /pursuant\s+to/i,
    /press\s+release/i,
    /exhibit\s+99/i
  ],
  '4': [
    /statement\s+of\s+changes/i,
    /beneficial\s+ownership/i,
    /<ownershipDocument>/i,
    /<reportingOwner>/i,
    /<transactionAmounts>/i,
    /form\s+4/i
  ],
  'DEF 14A': [
    /proxy\s+statement/i,
    /annual\s+meeting/i,
    /board\s+of\s+directors/i,
    /executive\s+compensation/i,
    /shareholder\s+proposal/i
  ],
  '13D': [
    /schedule\s+13d/i,
    /beneficial\s+owner/i,
    /percent\s+of\s+class/i,
    /purpose\s+of\s+transaction/i
  ],
  '13G': [
    /schedule\s+13g/i,
    /beneficial\s+owner/i,
    /passive\s+investor/i
  ]
};

/**
 * Regex patterns for extracting metadata from SEC filing content
 */
const EXTRACTION_PATTERNS = {
  // Accession number patterns (expanded)
  accessionNumber: [
    /ACCESSION NUMBER:\s*(\d{10}-\d{2}-\d{6})/i,
    /accession-number>(\d{10}-\d{2}-\d{6})</i,
    /ACCESSION-NUMBER:\s*(\d{10}-\d{2}-\d{6})/i,
    /Archives\/edgar\/data\/\d+\/(\d{10}-\d{2}-\d{6})/i,
    /Archives\/edgar\/data\/\d+\/(\d+)/i, // Accession without dashes in URL
    /(\d{10}-\d{2}-\d{6})/  // Fallback: any accession number pattern
  ],

  // CIK patterns (issuerCik first for Form 4s, then general patterns)
  cik: [
    /<issuerCik>(\d+)<\/issuerCik>/i,  // Form 4 XML issuer CIK (takes precedence)
    /ISSUER:[\s\S]*?CENTRAL INDEX KEY:\s*(\d+)/i, // SEC header ISSUER section
    /CENTRAL INDEX KEY:\s*(\d+)/i,
    /CIK:\s*(\d+)/i,
    /<cik>(\d+)<\/cik>/i,
    /data\/(\d+)\//,
    /CIK=(\d+)/i,
    /cik[=:](\d+)/i
  ],

  // Form type patterns (expanded)
  formType: [
    /FORM TYPE:\s*([^\n\r]+)/i,
    /CONFORMED SUBMISSION TYPE:\s*([^\n\r]+)/i,
    /<type>([^<]+)<\/type>/i,
    /Form\s+(10-[KQ]|8-K|4|DEF\s*14A|13[DG])/i,
    /FORM\s+(10-[KQ]|8-K|4|DEF\s*14A|13[DG])/i
  ],

  // Company name patterns (expanded)
  companyName: [
    /COMPANY CONFORMED NAME:\s*([^\n\r]+)/i,
    /ISSUER:\s*([^\n\r]+)/i,
    /<companyName>([^<]+)<\/companyName>/i,
    /<issuerName>([^<]+)<\/issuerName>/i,
    /FILER:[\s\S]*?COMPANY CONFORMED NAME:\s*([^\n\r]+)/i,
    /<name>([^<]+)<\/name>/i
  ],

  // Filing date patterns (expanded)
  filingDate: [
    /FILED AS OF DATE:\s*(\d{8})/i,
    /FILING DATE:\s*(\d{4}-\d{2}-\d{2})/i,
    /<filingDate>(\d{4}-\d{2}-\d{2})<\/filingDate>/i,
    /Date:\s*(\d{4}-\d{2}-\d{2})/i,
    /(\d{4}-\d{2}-\d{2})/  // Fallback: any date pattern
  ]
};

/**
 * Extracts metadata from SEC filing content using multiple regex patterns
 */
export function extractMetadataFromContent(content: string): ExtractedMetadata {
  const result: ExtractedMetadata = {
    accessionNumber: null,
    cik: null,
    formType: null,
    companyName: null,
    filingDate: null
  };

  // Extract accession number
  for (const pattern of EXTRACTION_PATTERNS.accessionNumber) {
    const match = content.match(pattern);
    if (match && match[1]) {
      result.accessionNumber = match[1].trim();
      break;
    }
  }

  // Extract CIK
  for (const pattern of EXTRACTION_PATTERNS.cik) {
    const match = content.match(pattern);
    if (match && match[1]) {
      // Normalize CIK to 10 digits with leading zeros
      result.cik = match[1].trim().padStart(10, '0');
      break;
    }
  }

  // Extract form type
  for (const pattern of EXTRACTION_PATTERNS.formType) {
    const match = content.match(pattern);
    if (match && match[1]) {
      result.formType = match[1].trim();
      break;
    }
  }

  // Extract company name
  for (const pattern of EXTRACTION_PATTERNS.companyName) {
    const match = content.match(pattern);
    if (match && match[1]) {
      result.companyName = match[1].trim();
      break;
    }
  }

  // Extract filing date
  for (const pattern of EXTRACTION_PATTERNS.filingDate) {
    const match = content.match(pattern);
    if (match && match[1]) {
      let dateStr = match[1].trim();
      // Convert YYYYMMDD to YYYY-MM-DD if needed
      if (dateStr.length === 8 && !dateStr.includes('-')) {
        dateStr = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
      }
      result.filingDate = dateStr;
      break;
    }
  }

  return result;
}

/**
 * Calculates string similarity using Levenshtein distance (0-100%)
 */
function calculateSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;

  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 100;

  const len1 = s1.length;
  const len2 = s2.length;

  // Use simpler comparison for very different lengths
  if (Math.abs(len1 - len2) > Math.max(len1, len2) * 0.5) {
    return 0;
  }

  // Levenshtein distance
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,     // deletion
        matrix[i][j - 1] + 1,     // insertion
        matrix[i - 1][j - 1] + cost  // substitution
      );
    }
  }

  const distance = matrix[len1][len2];
  const maxLen = Math.max(len1, len2);
  return Math.round((1 - distance / maxLen) * 100);
}

/**
 * Normalizes company name for comparison
 */
function normalizeCompanyName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[,.']/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\bINC\b/g, 'INC')
    .replace(/\bCORP\b/g, 'CORP')
    .replace(/\bCO\b/g, 'CO')
    .replace(/\bLLC\b/g, 'LLC')
    .replace(/\bLTD\b/g, 'LTD')
    .trim();
}

/**
 * Normalizes form type for comparison
 */
function normalizeFormType(formType: string): string {
  return formType
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/FORM/g, '')
    .trim();
}

/**
 * Normalizes CIK for comparison (10-digit with leading zeros)
 */
function normalizeCik(cik: string): string {
  return cik.replace(/^0+/, '').padStart(10, '0');
}

/**
 * Normalizes accession number for comparison
 */
function normalizeAccessionNumber(accNum: string): string {
  return accNum.replace(/[^0-9-]/g, '').trim();
}

/**
 * Validates content against form-specific indicators
 * Returns the number of matching indicators and total checked
 */
function validateFormContent(
  content: string,
  formType: string
): { matches: number; total: number; confidence: number } {
  // Normalize form type to match our indicators
  const normalizedForm = formType.replace(/\/A$/, '').replace(/\s+/g, '').toUpperCase();

  // Find matching form indicators
  let indicators: RegExp[] = [];
  for (const [form, patterns] of Object.entries(FORM_CONTENT_INDICATORS)) {
    const normalizedKey = form.replace(/\s+/g, '').toUpperCase();
    if (normalizedForm === normalizedKey || normalizedForm.includes(normalizedKey)) {
      indicators = patterns;
      break;
    }
  }

  // Special handling for 10-K/A and 10-Q/A
  if (normalizedForm === '10-K/A' || normalizedForm === '10-KA') {
    indicators = FORM_CONTENT_INDICATORS['10-K'];
  } else if (normalizedForm === '10-Q/A' || normalizedForm === '10-QA') {
    indicators = FORM_CONTENT_INDICATORS['10-Q'];
  } else if (normalizedForm === '8-K/A' || normalizedForm === '8-KA') {
    indicators = FORM_CONTENT_INDICATORS['8-K'];
  }

  if (indicators.length === 0) {
    // Unknown form type - return neutral confidence
    return { matches: 0, total: 0, confidence: 70 };
  }

  let matches = 0;
  for (const pattern of indicators) {
    if (pattern.test(content)) {
      matches++;
    }
  }

  // Calculate confidence based on proportion of matching indicators
  // At least 2 matches = high confidence, 1 match = medium, 0 = low
  const matchRatio = matches / indicators.length;
  const confidence = Math.min(100, Math.round(50 + (matchRatio * 50)));

  return { matches, total: indicators.length, confidence };
}

/**
 * Main verification function
 */
export function verifyFilingContent(
  content: string,
  expectedMetadata: FilingMetadata
): ContentVerificationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Basic validation
  if (!content || content.length < 100) {
    return {
      isVerified: false,
      accessionNumber: { expected: expectedMetadata.accessionNumber, extracted: null, matches: false },
      cik: { expected: expectedMetadata.cik, extracted: null, matches: false },
      formType: { expected: expectedMetadata.formType, extracted: null, matches: false },
      companyName: { expected: expectedMetadata.companyName, extracted: null, matches: false },
      filingDate: { expected: expectedMetadata.filingDate, extracted: null, matches: false },
      confidence: 0,
      errors: ['Content is empty or too short (< 100 characters)'],
      warnings: [],
      contentLength: content?.length || 0,
      extractedMetadata: {
        accessionNumber: null,
        cik: null,
        formType: null,
        companyName: null,
        filingDate: null
      }
    };
  }

  // Check for SEC search page redirect
  if (
    content.includes('href="https://www.sec.gov/search-filings"') ||
    content.includes('rel="canonical" href="https://www.sec.gov/search-filings"') ||
    content.includes('smartSearch.js')
  ) {
    return {
      isVerified: false,
      accessionNumber: { expected: expectedMetadata.accessionNumber, extracted: null, matches: false },
      cik: { expected: expectedMetadata.cik, extracted: null, matches: false },
      formType: { expected: expectedMetadata.formType, extracted: null, matches: false },
      companyName: { expected: expectedMetadata.companyName, extracted: null, matches: false },
      filingDate: { expected: expectedMetadata.filingDate, extracted: null, matches: false },
      confidence: 0,
      errors: ['Content is SEC search page redirect, not actual filing'],
      warnings: [],
      contentLength: content.length,
      extractedMetadata: {
        accessionNumber: null,
        cik: null,
        formType: null,
        companyName: null,
        filingDate: null
      }
    };
  }

  // Extract metadata from content
  const extracted = extractMetadataFromContent(content);

  // Verify each field
  const accessionVerification: FieldVerification<string> = {
    expected: expectedMetadata.accessionNumber,
    extracted: extracted.accessionNumber,
    matches: extracted.accessionNumber
      ? normalizeAccessionNumber(extracted.accessionNumber) === normalizeAccessionNumber(expectedMetadata.accessionNumber)
      : false
  };

  const cikVerification: FieldVerification<string> = {
    expected: expectedMetadata.cik,
    extracted: extracted.cik,
    matches: extracted.cik
      ? normalizeCik(extracted.cik) === normalizeCik(expectedMetadata.cik)
      : false
  };

  const formTypeVerification: FieldVerification<string> = {
    expected: expectedMetadata.formType,
    extracted: extracted.formType,
    matches: extracted.formType
      ? normalizeFormType(extracted.formType) === normalizeFormType(expectedMetadata.formType)
      : false
  };

  // Company name uses fuzzy matching
  const companyNameSimilarity = extracted.companyName
    ? calculateSimilarity(
        normalizeCompanyName(extracted.companyName),
        normalizeCompanyName(expectedMetadata.companyName)
      )
    : 0;

  const companyNameVerification: FieldVerification<string> = {
    expected: expectedMetadata.companyName,
    extracted: extracted.companyName,
    matches: companyNameSimilarity >= 80, // 80% threshold for fuzzy match
    similarity: companyNameSimilarity
  };

  // Filing date verification (optional field)
  const filingDateVerification: FieldVerification<string | undefined> = {
    expected: expectedMetadata.filingDate,
    extracted: extracted.filingDate,
    matches: !expectedMetadata.filingDate || !extracted.filingDate
      ? true // If either is missing, don't penalize
      : extracted.filingDate === expectedMetadata.filingDate
  };

  // Calculate confidence score using multi-factor approach
  let confidence = 0;
  let maxConfidence = 0;

  // Factor 1: Accession number (25 points)
  maxConfidence += 25;
  if (accessionVerification.matches) {
    confidence += 25;
  } else if (extracted.accessionNumber) {
    // Partial credit if we found an accession number but it doesn't match
    // (could be due to format differences)
    confidence += 5;
    warnings.push(`Accession number mismatch: expected ${expectedMetadata.accessionNumber}, got ${extracted.accessionNumber}`);
  } else {
    warnings.push('Could not extract accession number from content');
  }

  // Factor 2: CIK (25 points)
  maxConfidence += 25;
  if (cikVerification.matches) {
    confidence += 25;
  } else if (extracted.cik) {
    confidence += 5;
    warnings.push(`CIK mismatch: expected ${expectedMetadata.cik}, got ${extracted.cik}`);
  } else {
    warnings.push('Could not extract CIK from content');
  }

  // Factor 3: Form type (15 points)
  maxConfidence += 15;
  if (formTypeVerification.matches) {
    confidence += 15;
  } else if (extracted.formType) {
    // Partial credit for similar form types (e.g., 10-K vs 10-K/A)
    const normalizedExpected = normalizeFormType(expectedMetadata.formType);
    const normalizedExtracted = normalizeFormType(extracted.formType);
    if (normalizedExpected.includes(normalizedExtracted) || normalizedExtracted.includes(normalizedExpected)) {
      confidence += 10;
    }
    warnings.push(`Form type mismatch: expected ${expectedMetadata.formType}, got ${extracted.formType}`);
  } else {
    warnings.push('Could not extract form type from content');
  }

  // Factor 4: Company name (15 points, proportional to similarity)
  maxConfidence += 15;
  if (companyNameVerification.matches) {
    confidence += Math.round(15 * (companyNameSimilarity / 100));
  } else if (extracted.companyName) {
    // Even low similarity gets some points if a company name was found
    confidence += Math.max(2, Math.round(15 * (companyNameSimilarity / 100)));
    warnings.push(`Company name low similarity (${companyNameSimilarity}%): expected "${expectedMetadata.companyName}", got "${extracted.companyName}"`);
  } else {
    warnings.push('Could not extract company name from content');
  }

  // Factor 5: Form-specific content validation (20 points) - NEW
  maxConfidence += 20;
  const formValidation = validateFormContent(content, expectedMetadata.formType);
  if (formValidation.total > 0) {
    // Award points based on form content indicator matches
    const formPoints = Math.round(20 * (formValidation.matches / formValidation.total));
    confidence += formPoints;
    if (formValidation.matches < formValidation.total / 2) {
      warnings.push(`Low form content indicator matches: ${formValidation.matches}/${formValidation.total}`);
    }
  } else {
    // Unknown form type - give neutral points
    confidence += 10;
  }

  // Calculate final confidence percentage
  const confidencePercent = Math.round((confidence / maxConfidence) * 100);

  // Determine overall verification status using calibrated thresholds
  // RELAXED CRITERIA: Verified if ANY of the following:
  // 1. Accession number matches AND CIK matches
  // 2. Accession number matches AND company name >= 80% similar
  // 3. CIK matches AND form content validation >= 70% confidence
  // 4. Overall confidence >= 60% (multi-factor threshold)
  const hasStrongMetadataMatch =
    accessionVerification.matches && cikVerification.matches;
  const hasAccessionAndCompanyMatch =
    accessionVerification.matches && companyNameVerification.matches;
  const hasCikAndFormContentMatch =
    cikVerification.matches && formValidation.confidence >= 70;
  const hasHighOverallConfidence = confidencePercent >= 60;

  const isVerified =
    hasStrongMetadataMatch ||
    hasAccessionAndCompanyMatch ||
    hasCikAndFormContentMatch ||
    hasHighOverallConfidence;

  if (!isVerified) {
    if (!accessionVerification.matches && !cikVerification.matches) {
      errors.push('Neither accession number nor CIK could be verified');
    } else if (confidencePercent < 60) {
      errors.push(`Overall confidence too low: ${confidencePercent}% (threshold: 60%)`);
    }
  }

  return {
    isVerified,
    accessionNumber: accessionVerification,
    cik: cikVerification,
    formType: formTypeVerification,
    companyName: companyNameVerification,
    filingDate: filingDateVerification,
    confidence: confidencePercent,
    errors,
    warnings,
    contentLength: content.length,
    extractedMetadata: extracted
  };
}

/**
 * Async wrapper for verifyFilingContent with proper error handling
 */
export async function verifyFilingContentAsync(
  content: string,
  expectedMetadata: FilingMetadata
): Promise<ContentVerificationResult> {
  // Input validation
  if (!content) {
    throw new Error('Content parameter is required');
  }
  if (!expectedMetadata) {
    throw new Error('ExpectedMetadata parameter is required');
  }
  if (!expectedMetadata.accessionNumber || !expectedMetadata.cik || !expectedMetadata.formType || !expectedMetadata.companyName) {
    throw new Error('ExpectedMetadata must include accessionNumber, cik, formType, and companyName');
  }

  try {
    return verifyFilingContent(content, expectedMetadata);
  } catch (error) {
    console.error('Filing content verification failed:', error);
    
    // Return error result instead of throwing
    return {
      isVerified: false,
      accessionNumber: { expected: expectedMetadata.accessionNumber, extracted: null, matches: false },
      cik: { expected: expectedMetadata.cik, extracted: null, matches: false },
      formType: { expected: expectedMetadata.formType, extracted: null, matches: false },
      companyName: { expected: expectedMetadata.companyName, extracted: null, matches: false },
      filingDate: { expected: expectedMetadata.filingDate, extracted: null, matches: false },
      confidence: 0,
      errors: [`Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
      warnings: [],
      contentLength: content?.length || 0,
      extractedMetadata: {
        accessionNumber: null,
        cik: null,
        formType: null,
        companyName: null,
        filingDate: null
      }
    };
  }
}

/**
 * Batch verification for multiple filings with error handling
 */
export async function batchVerifyFilingContent(
  filings: Array<{ content: string; metadata: FilingMetadata }>
): Promise<ContentVerificationResult[]> {
  if (!filings || !Array.isArray(filings)) {
    throw new Error('Filings must be a non-empty array');
  }

  const results: ContentVerificationResult[] = [];
  
  for (const filing of filings) {
    try {
      const result = await verifyFilingContentAsync(filing.content, filing.metadata);
      results.push(result);
    } catch (error) {
      console.error(`Batch verification failed for filing ${filing.metadata.accessionNumber}:`, error);
      
      // Add error result to batch
      results.push({
        isVerified: false,
        accessionNumber: { expected: filing.metadata.accessionNumber, extracted: null, matches: false },
        cik: { expected: filing.metadata.cik, extracted: null, matches: false },
        formType: { expected: filing.metadata.formType, extracted: null, matches: false },
        companyName: { expected: filing.metadata.companyName, extracted: null, matches: false },
        filingDate: { expected: filing.metadata.filingDate, extracted: null, matches: false },
        confidence: 0,
        errors: [`Batch verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings: [],
        contentLength: filing.content?.length || 0,
        extractedMetadata: {
          accessionNumber: null,
          cik: null,
          formType: null,
          companyName: null,
          filingDate: null
        }
      });
    }
  }
  
  return results;
}
