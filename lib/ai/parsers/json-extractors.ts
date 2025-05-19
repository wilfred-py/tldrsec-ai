/**
 * JSON Extraction Utilities
 * 
 * Provides methods to extract JSON from Claude's text responses
 * using different strategies.
 */

import { ExtractedJSON, ExtractionOptions } from './types';

/**
 * Extracts JSON from a text response using various methods
 * 
 * @param text - The text response from Claude
 * @param options - Extraction options
 * @returns The extracted JSON with metadata
 */
export function extractJSON(text: string, options: ExtractionOptions = {}): ExtractedJSON {
  // Try different extraction methods in order of preference
  
  // Method 1: Extract from code blocks
  const codeBlockResult = extractFromCodeBlocks(text);
  if (codeBlockResult.success) {
    return codeBlockResult;
  }
  
  // Method 2: Extract using bracket matching
  const bracketResult = extractUsingBracketMatching(text);
  if (bracketResult.success) {
    return bracketResult;
  }
  
  // Method 3: Extract the largest JSON-like structure
  const largestResult = extractLargestJSONStructure(text);
  if (largestResult.success) {
    return largestResult;
  }
  
  // Method 4: For partial extraction if allowed
  if (options.allowPartial) {
    const partialResult = attemptPartialExtraction(text);
    if (partialResult.success) {
      return partialResult;
    }
  }
  
  // If all methods fail, return a failure object
  return {
    raw: '',
    error: new Error('Failed to extract JSON with any method'),
    extractionMethod: 'none',
    success: false
  };
}

/**
 * Extracts JSON from markdown code blocks
 * 
 * @param text - The text to extract JSON from
 * @returns The extracted JSON object
 */
function extractFromCodeBlocks(text: string): ExtractedJSON {
  try {
    // Look for JSON in a code block with a language specifier
    const jsonBlockRegex = /```(?:json)\s*([\s\S]*?)```/;
    let match = text.match(jsonBlockRegex);
    
    // If not found, look for any code block
    if (!match) {
      const codeBlockRegex = /```\s*([\s\S]*?)```/;
      match = text.match(codeBlockRegex);
    }
    
    if (match && match[1]) {
      const jsonText = match[1].trim();
      const parsed = JSON.parse(jsonText);
      
      return {
        raw: jsonText,
        parsed,
        extractionMethod: 'codeBlock',
        success: true
      };
    }
    
    throw new Error('No JSON code blocks found');
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
 * Extracts JSON using bracket matching
 * 
 * @param text - The text to extract JSON from
 * @returns The extracted JSON object
 */
function extractUsingBracketMatching(text: string): ExtractedJSON {
  try {
    // Find the first { and the last } in the text
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const jsonText = text.substring(firstBrace, lastBrace + 1);
      
      // Validate that it's actually parseable JSON
      const parsed = JSON.parse(jsonText);
      
      return {
        raw: jsonText,
        parsed,
        extractionMethod: 'bracketMatching',
        success: true
      };
    }
    
    throw new Error('No JSON object with matching braces found');
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
 * Attempts partial extraction of JSON-like content
 * 
 * @param text - The text to extract JSON-like content from
 * @returns The partially extracted JSON object
 */
function attemptPartialExtraction(text: string): ExtractedJSON {
  try {
    // Look for key-value pairs in the text
    const keyValuePairs: Record<string, any> = {};
    const keyValueRegex = /"([^"]+)":\s*(?:"([^"]*)"|\{([^}]*)\}|(\[[^\]]*\])|([^,}\]]+))/g;
    
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
          keyValuePairs[key] = JSON.parse(`{${objectValue}}`);
        } catch {
          keyValuePairs[key] = objectValue;
        }
      } else if (arrayValue) {
        try {
          keyValuePairs[key] = JSON.parse(arrayValue);
        } catch {
          keyValuePairs[key] = arrayValue;
        }
      } else if (otherValue) {
        // Try to convert to number if possible
        const numberValue = Number(otherValue.trim());
        if (!isNaN(numberValue)) {
          keyValuePairs[key] = numberValue;
        } else if (otherValue.trim() === 'true') {
          keyValuePairs[key] = true;
        } else if (otherValue.trim() === 'false') {
          keyValuePairs[key] = false;
        } else if (otherValue.trim() === 'null') {
          keyValuePairs[key] = null;
        } else {
          keyValuePairs[key] = otherValue.trim();
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
 * Repairs common JSON syntax errors
 * 
 * @param jsonString - The potentially broken JSON string
 * @returns The repaired JSON string
 */
export function repairJSON(jsonString: string): string {
  let repairedJson = jsonString;
  
  // Common JSON errors and their fixes
  const repairs = [
    // Remove trailing commas in objects
    { regex: /,\s*}/g, replacement: '}' },
    
    // Remove trailing commas in arrays
    { regex: /,\s*\]/g, replacement: ']' },
    
    // Fix unquoted property names
    { regex: /([{,]\s*)([a-zA-Z0-9_$]+)(\s*:)/g, replacement: '$1"$2"$3' },
    
    // Fix single quotes used instead of double quotes for strings
    { regex: /'([^'\\]*(\\.[^'\\]*)*)'(\s*[,}:\]])/g, replacement: '"$1"$3' },
    
    // Fix single quotes used for property names
    { regex: /([{,]\s*)'([^'\\]*(\\.[^'\\]*)*)'(\s*:)/g, replacement: '$1"$2"$4' },
    
    // Add missing quotes around string values
    { regex: /:\s*([a-zA-Z][a-zA-Z0-9_$]*)(\s*[,}])/g, replacement: ': "$1"$2' },
    
    // Ensure all control characters are properly escaped
    { regex: /[\u0000-\u001F]+/g, replacement: '' }
  ];
  
  // Apply all repairs in sequence
  for (const { regex, replacement } of repairs) {
    repairedJson = repairedJson.replace(regex, replacement);
  }
  
  return repairedJson;
} 