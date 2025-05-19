/**
 * Base Prompt Template 
 * 
 * Provides a foundation for building structured prompts for SEC filing analysis
 */

import { estimateTokenCount } from '../token-counter';

/**
 * Base class for all prompt templates
 * Handles common functionality like token counting and prompt assembly
 */
export class PromptTemplate {
  protected systemPrompt: string;
  protected userPrompt: string;
  protected outputFormat: string;
  protected examplePrompt?: string;
  protected options: Record<string, any>;
  
  /**
   * Create a new prompt template
   * 
   * @param options - Options to customize the prompt
   */
  constructor(options: Record<string, any> = {}) {
    this.systemPrompt = '';
    this.userPrompt = '';
    this.outputFormat = '';
    this.options = options;
  }
  
  /**
   * Get the system prompt
   */
  getSystemPrompt(): string {
    return this.systemPrompt;
  }
  
  /**
   * Get the user prompt
   */
  getUserPrompt(): string {
    return this.userPrompt;
  }
  
  /**
   * Get the output format specification
   */
  getOutputFormat(): string {
    return this.outputFormat;
  }
  
  /**
   * Get examples, if any
   */
  getExamples(): string {
    return this.examplePrompt || '';
  }
  
  /**
   * Get the full prompt for Claude API
   * 
   * @param content - The SEC filing content to analyze
   * @param maxInputTokens - Maximum allowed input tokens (defaults to 100,000)
   * @returns The complete prompt
   */
  getFullPrompt(content: string, maxInputTokens: number = 100000): string {
    // Start with the system prompt and core instructions
    let fullPrompt = `${this.systemPrompt}\n\n${this.userPrompt}\n\n`;
    
    // Add output format instructions
    fullPrompt += `${this.outputFormat}\n\n`;
    
    // Add examples if available
    if (this.examplePrompt) {
      fullPrompt += `${this.examplePrompt}\n\n`;
    }
    
    // Calculate token budget for content
    const promptTokens = estimateTokenCount(fullPrompt);
    const contentIntroTokens = estimateTokenCount('Filing Content:\n');
    const availableTokens = maxInputTokens - promptTokens - contentIntroTokens - 100; // 100 token buffer
    
    // Truncate content if necessary
    let truncatedContent = content;
    if (estimateTokenCount(content) > availableTokens) {
      truncatedContent = this.truncateContent(content, availableTokens);
    }
    
    // Add the content
    fullPrompt += `Filing Content:\n${truncatedContent}`;
    
    return fullPrompt;
  }
  
  /**
   * Get the prompt length in tokens
   */
  get length(): number {
    return estimateTokenCount(this.systemPrompt + this.userPrompt + this.outputFormat + (this.examplePrompt || ''));
  }
  
  /**
   * Intelligently truncate content to fit within token limit
   * 
   * @param content - The content to truncate
   * @param maxTokens - Maximum allowed tokens
   * @returns Truncated content
   */
  protected truncateContent(content: string, maxTokens: number): string {
    // Simple approach: Take the beginning and end of the document
    // More sophisticated approaches would use section detection
    
    const contentTokens = estimateTokenCount(content);
    if (contentTokens <= maxTokens) {
      return content;
    }
    
    // Determine how to distribute tokens between beginning and end
    const beginningRatio = 0.7; // Allocate more to the beginning
    const beginTokens = Math.floor(maxTokens * beginningRatio);
    const endTokens = maxTokens - beginTokens;
    
    // Split content into lines
    const lines = content.split('\n');
    
    // Take beginning lines up to token limit
    let beginningContent = '';
    let beginningTokenCount = 0;
    let beginningIndex = 0;
    
    while (beginningIndex < lines.length && beginningTokenCount < beginTokens) {
      const line = lines[beginningIndex];
      const lineTokens = estimateTokenCount(line + '\n');
      
      if (beginningTokenCount + lineTokens <= beginTokens) {
        beginningContent += line + '\n';
        beginningTokenCount += lineTokens;
        beginningIndex++;
      } else {
        break;
      }
    }
    
    // Take end lines up to token limit
    let endContent = '';
    let endTokenCount = 0;
    let endIndex = lines.length - 1;
    
    while (endIndex > beginningIndex && endTokenCount < endTokens) {
      const line = lines[endIndex];
      const lineTokens = estimateTokenCount('\n' + line);
      
      if (endTokenCount + lineTokens <= endTokens) {
        endContent = '\n' + line + endContent;
        endTokenCount += lineTokens;
        endIndex--;
      } else {
        break;
      }
    }
    
    // Combine with a notice about truncation
    return `${beginningContent}\n\n[... Document truncated due to length (${contentTokens} tokens) ...]\n\n${endContent}`;
  }
} 