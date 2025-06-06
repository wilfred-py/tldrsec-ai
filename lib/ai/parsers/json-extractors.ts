/**
 * JSON Extraction Utilities
 * 
 * Provides methods to extract JSON from Claude's text responses
 * using different strategies.
 */

import { ExtractedJSON, ExtractionOptions } from './types';

/**
 * Extracts JSON from text using multiple methods
 * 
 * @param text - The text to extract JSON from
 * @param options - Options for extraction
 * @returns The extracted JSON object
 */
export function extractJSON(text: string, options: ExtractionOptions = {}): ExtractedJSON {
  // Try each extraction method in sequence
  const extractionMethods: Array<() => ExtractedJSON> = [
    // First try to extract from code blocks
    () => extractFromCodeBlocks(text),
    
    // Then try to extract from Claude's structured response format
    () => extractFromStructuredResponse(text),
    
    // Then try bracket matching
    () => extractUsingBracketMatching(text),
    
    // Then try to find the largest JSON structure
    () => extractLargestJSONStructure(text),
    
    // Finally, try partial extraction if allowed
    ...(options.allowPartial ? [() => attemptPartialExtraction(text)] : [])
  ];
  
  // Try each method until one succeeds
  for (const method of extractionMethods) {
    const result = method();
    if (result.success) {
      return result;
    }
  }
  
  // If we get here, all methods failed
  return {
    raw: '',
    error: new Error('Failed to extract JSON using any method'),
    extractionMethod: 'none',
    success: false
  };
}

/**
 * Extracts JSON from Claude's structured response format
 * Claude often responds with a structured format like:
 * 
 * Here's the JSON summary of the filing:
 * 
 * ```json
 * { ... }
 * ```
 * 
 * Or sometimes with section headers and explanations before/after the JSON
 * 
 * @param text - The text to extract JSON from
 * @returns The extracted JSON object
 */
function extractFromStructuredResponse(text: string): ExtractedJSON {
  try {
    // Look for common patterns in Claude's responses
    const patterns = [
      // Pattern 1: "Here's the JSON..." followed by a code block
      /(?:here(?:'s|\sis)\sthe\s(?:json|summary|analysis|result))[^{]*({[\s\S]*})/i,
      
      // Pattern 2: Section header followed by JSON
      /(?:##\s*(?:json|summary|analysis|result)[^{]*|\*\*(?:json|summary|analysis|result)\*\*[^{]*)({[\s\S]*})/i,
      
      // Pattern 3: "I've analyzed..." followed by JSON
      /(?:I(?:'ve|\shave)\s(?:analyzed|summarized|extracted|prepared))[^{]*({[\s\S]*})/i,
      
      // Pattern 4: "Based on the filing..." followed by JSON
      /(?:Based\son\sthe\s(?:filing|document|content))[^{]*({[\s\S]*})/i
    ];
    
    // Try each pattern
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        // Extract the JSON part
        const jsonCandidate = match[1].trim();
        
        try {
          // Try to parse it directly
          const parsed = JSON.parse(jsonCandidate);
          return {
            raw: jsonCandidate,
            parsed,
            extractionMethod: 'structuredResponse',
            success: true
          };
        } catch (parseError) {
          // Try to repair and parse again
          const repaired = repairJSON(jsonCandidate);
          try {
            const parsed = JSON.parse(repaired);
            return {
              raw: repaired,
              parsed,
              extractionMethod: 'structuredResponseRepaired',
              success: true
            };
          } catch {
            // Continue to the next pattern
          }
        }
      }
    }
    
    throw new Error('No structured response pattern matched');
  } catch (error) {
    return {
      raw: '',
      error: error instanceof Error ? error : new Error(String(error)),
      extractionMethod: 'structuredResponse',
      success: false
    };
  }
}

/**
 * Extracts JSON from markdown code blocks
 * Enhanced to handle multiple code blocks and common Claude formatting issues
 * 
 * @param text - The text to extract JSON from
 * @returns The extracted JSON object
 */
function extractFromCodeBlocks(text: string): ExtractedJSON {
  try {
    // Look for JSON in a code block with a language specifier
    const jsonBlockRegex = /```(?:json|JSON)\s*([\s\S]*?)```/g;
    const matches = Array.from(text.matchAll(jsonBlockRegex));
    
    // If not found, look for any code block
    let anyMatches: RegExpMatchArray[] = [];
    if (matches.length === 0) {
      const codeBlockRegex = /```\s*([\s\S]*?)```/g;
      anyMatches = Array.from(text.matchAll(codeBlockRegex));
    }
    
    // Try each match until we find valid JSON
    const allMatches = matches.length > 0 ? matches : anyMatches;
    
    for (const match of allMatches) {
      if (match && match[1]) {
        try {
          let jsonText = match[1].trim();
          
          // Handle common Claude formatting issues
          // Sometimes Claude adds escape characters or extra quotes
          jsonText = jsonText.replace(/\\\"([^\"]*)\\\"/g, '"$1"');
          
          const parsed = JSON.parse(jsonText);
          
          return {
            raw: jsonText,
            parsed,
            extractionMethod: 'codeBlock',
            success: true
          };
        } catch (parseError) {
          // Continue to the next match if this one fails
          continue;
        }
      }
    }
    
    throw new Error('No valid JSON code blocks found');
  } catch (error) {
    return {
      raw: '',
      error: error instanceof Error ? error : new Error(String(error)),
      extractionMethod: 'codeBlock',
      success: false
    };
  }
}

/**
 * Extracts JSON using bracket matching with improved balance checking
 * 
 * @param text - The text to extract JSON from
 * @returns The extracted JSON object
 */
function extractUsingBracketMatching(text: string): ExtractedJSON {
  try {
    // Find potential JSON objects by looking for balanced braces
    const candidates: string[] = [];
    let depth = 0;
    let start = -1;
    let inString = false;
    let escaped = false;
    
    // First pass: find all potential JSON objects with balanced braces
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      
      // Handle string content
      if (char === '"' && !escaped) {
        inString = !inString;
      } else if (char === '\\' && inString) {
        escaped = !escaped;
        continue;
      } else {
        escaped = false;
      }
      
      // Only process braces when not in a string
      if (!inString) {
        if (char === '{') {
          if (depth === 0) {
            start = i;
          }
          depth++;
        } else if (char === '}') {
          depth--;
          if (depth === 0 && start !== -1) {
            candidates.push(text.substring(start, i + 1));
          }
        }
      }
    }
    
    // Try to parse each candidate, starting with the longest ones
    candidates.sort((a, b) => b.length - a.length);
    
    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        return {
          raw: candidate,
          parsed,
          extractionMethod: 'bracketMatching',
          success: true
        };
      } catch {
        // Try the next candidate
        continue;
      }
    }
    
    throw new Error('No valid JSON object with matching braces found');
  } catch (error) {
    return {
      raw: '',
      error: error instanceof Error ? error : new Error(String(error)),
      extractionMethod: 'bracketMatching',
      success: false
    };
  }
}

/**
 * Attempts to find the largest valid JSON structure in text
 * 
 * @param text - The text to extract JSON from
 * @returns The extracted JSON object
 */
function extractLargestJSONStructure(text: string): ExtractedJSON {
  try {
    // Look for patterns that might be JSON objects
    const potentialObjects = [];
    let openIndex = -1;
    let depth = 0;
    let inString = false;
    let escape = false;
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      
      // Handle string content
      if (char === '"' && !escape) {
        inString = !inString;
      } else if (char === '\\' && inString) {
        escape = !escape;
      } else {
        escape = false;
      }
      
      // Handle object boundaries - only when not in a string
      if (!inString) {
        if (char === '{') {
          if (depth === 0) {
            openIndex = i;
          }
          depth++;
        } else if (char === '}') {
          depth--;
          if (depth === 0 && openIndex !== -1) {
            potentialObjects.push(text.substring(openIndex, i + 1));
            openIndex = -1;
          }
        }
      }
    }
    
    // Try to parse each potential object, starting with the largest
    const validObjects = potentialObjects
      .sort((a, b) => b.length - a.length) // Sort by length, largest first
      .map(obj => {
        try {
          return {
            raw: obj,
            parsed: JSON.parse(obj),
            success: true
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    
    if (validObjects.length > 0) {
      const result = validObjects[0]!;
      return {
        raw: result.raw,
        parsed: result.parsed,
        extractionMethod: 'largestStructure',
        success: true
      };
    }
    
    throw new Error('No valid JSON structures found');
  } catch (error) {
    return {
      raw: '',
      error: error instanceof Error ? error : new Error(String(error)),
      extractionMethod: 'largestStructure',
      success: false
    };
  }
}

/**
 * Attempts partial extraction of JSON-like content with enhanced pattern matching
 * 
 * @param text - The text to extract JSON-like content from
 * @returns The partially extracted JSON object
 */
function attemptPartialExtraction(text: string): ExtractedJSON {
  try {
    // First try to extract structured data from common patterns in Claude's responses
    const structuredData = extractStructuredData(text);
    if (Object.keys(structuredData).length > 0) {
      return {
        raw: JSON.stringify(structuredData),
        parsed: structuredData,
        extractionMethod: 'structuredExtraction',
        success: true
      };
    }
    
    // Look for key-value pairs in the text with improved regex
    const keyValuePairs: Record<string, any> = {};
    const keyValueRegex = /"([^"]+)"\s*:\s*(?:"([^"]*)"|(\{[^{}]*\})|(\[[^\[\]]*\])|([^,}\]]+))/g;
    
    let match;
    while ((match = keyValueRegex.exec(text)) !== null) {
      const key = match[1];
      const stringValue = match[2];
      const objectValue = match[3];
      const arrayValue = match[4];
      const otherValue = match[5];
      
      if (stringValue !== undefined) {
        keyValuePairs[key] = stringValue;
      } else if (objectValue) {
        try {
          keyValuePairs[key] = JSON.parse(objectValue);
        } catch {
          // Try to clean up the object value and parse again
          try {
            const cleanedObject = objectValue.replace(/([{,])\s*([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
            keyValuePairs[key] = JSON.parse(cleanedObject);
          } catch {
            keyValuePairs[key] = objectValue;
          }
        }
      } else if (arrayValue) {
        try {
          keyValuePairs[key] = JSON.parse(arrayValue);
        } catch {
          // Try to clean up the array value and parse again
          try {
            const cleanedArray = arrayValue.replace(/([\[,])\s*([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
            keyValuePairs[key] = JSON.parse(cleanedArray);
          } catch {
            keyValuePairs[key] = arrayValue;
          }
        }
      } else if (otherValue) {
        // Try to convert to number if possible
        const trimmedValue = otherValue.trim();
        const numberValue = Number(trimmedValue);
        if (!isNaN(numberValue)) {
          keyValuePairs[key] = numberValue;
        } else if (trimmedValue === 'true') {
          keyValuePairs[key] = true;
        } else if (trimmedValue === 'false') {
          keyValuePairs[key] = false;
        } else if (trimmedValue === 'null') {
          keyValuePairs[key] = null;
        } else {
          keyValuePairs[key] = trimmedValue;
        }
      }
    }
    
    // Ensure we found at least something
    if (Object.keys(keyValuePairs).length > 0) {
      const parsedPartial = keyValuePairs;
      const rawJson = JSON.stringify(parsedPartial);
      
      return {
        raw: rawJson,
        parsed: parsedPartial,
        extractionMethod: 'partialExtraction',
        success: true
      };
    }
    
    throw new Error('No key-value pairs found for partial extraction');
  } catch (error) {
    return {
      raw: '',
      error: error instanceof Error ? error : new Error(String(error)),
      extractionMethod: 'partialExtraction',
      success: false
    };
  }
}

/**
 * Extract structured data from common patterns in Claude's responses
 */
function extractStructuredData(text: string): Record<string, any> {
  const result: Record<string, any> = {};
  
  // Look for sections with headings that might contain structured data
  const sections = text.split(/\n\s*#{1,3}\s+|\n\s*\*\*[^*]+\*\*\s*:\s*|\n\s*\d+\.\s+/);
  
  for (const section of sections) {
    // Skip empty sections
    if (!section.trim()) continue;
    
    // Try to identify key fields like summary, key points, risk factors
    if (/summary|overview|conclusion/i.test(section)) {
      result.summary = extractParagraph(section);
    } else if (/key\s*points|highlights|takeaways/i.test(section)) {
      result.keyPoints = extractBulletPoints(section);
    } else if (/risk\s*factors/i.test(section)) {
      result.riskFactors = extractBulletPoints(section);
    } else if (/financial|performance|metrics/i.test(section)) {
      result.financialHighlights = extractBulletPoints(section);
    }
  }
  
  return result;
}

/**
 * Extract the first paragraph from text
 */
function extractParagraph(text: string): string {
  const paragraphs = text.split(/\n\n+/);
  for (const p of paragraphs) {
    const trimmed = p.trim();
    if (trimmed && trimmed.length > 20) { // Minimum length to be considered a paragraph
      return trimmed;
    }
  }
  return text.trim();
}

/**
 * Extract bullet points from text
 */
function extractBulletPoints(text: string): string[] {
  const bulletPoints: string[] = [];
  const bulletRegex = /(?:^|\n)\s*(?:-|\*|\d+\.)\s+([^\n]+)/g;
  
  let match;
  while ((match = bulletRegex.exec(text)) !== null) {
    if (match[1] && match[1].trim()) {
      bulletPoints.push(match[1].trim());
    }
  }
  
  return bulletPoints;
}

/**
 * Repairs common JSON syntax errors in Claude responses
 * 
 * @param jsonString - The potentially broken JSON string
 * @returns The repaired JSON string
 */
export function repairJSON(jsonString: string): string {
  let repaired = jsonString;
  
  // Remove any markdown code block markers
  repaired = repaired.replace(/```(?:json)?\n?/g, '');
  
  // Replace escaped quotes inside strings
  repaired = repaired.replace(/\\"([^"]*)\\"/, '"$1"');
  
  // Fix trailing commas in objects
  repaired = repaired.replace(/,\s*}/g, '}');
  
  // Fix trailing commas in arrays
  repaired = repaired.replace(/,\s*\]/g, ']');
  
  // Fix missing quotes around property names
  repaired = repaired.replace(/([{,]\s*)([a-zA-Z0-9_$]+)(\s*:)/g, '$1"$2"$3');
  
  // Fix single quotes used instead of double quotes for property names
  repaired = repaired.replace(/([{,]\s*)'([^']+)'(\s*:)/g, '$1"$2"$3');
  
  // Fix single quotes used instead of double quotes for string values
  repaired = repaired.replace(/(:\s*)'([^']*)'(?=[,}])/g, '$1"$2"');
  
  // Fix unescaped newlines in strings
  repaired = repaired.replace(/"([^"]*)\n([^"]*)"(?=[,}\]])/g, '"$1\\n$2"');
  
  // Fix unescaped tabs in strings
  repaired = repaired.replace(/"([^"]*)\t([^"]*)"(?=[,}\]])/g, '"$1\\t$2"');
  
  // Fix unquoted boolean values
  repaired = repaired.replace(/:\s*(true|false)\s*([,}])/g, ': "$1"$2');
  
  // Fix unquoted null values
  repaired = repaired.replace(/:\s*null\s*([,}])/g, ': "null"$1');
  
  // Fix unquoted string values (words without quotes after a colon)
  repaired = repaired.replace(/(:\s*)([a-zA-Z0-9_$]+)\s*([,}])/g, '$1"$2"$3');
  
  // Fix unquoted numeric values that should be strings (e.g., dates, IDs)
  repaired = repaired.replace(/"(date|id|code)"\s*:\s*(\d{4}-\d{2}-\d{2}|[A-Z0-9-]{5,})\s*([,}])/gi, '"$1": "$2"$3');
  
  // Ensure all control characters are properly escaped
  repaired = repaired.replace(/[\u0000-\u001F]+/g, '');
  
  return repaired;
}