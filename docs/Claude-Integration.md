# Claude AI Integration

This document provides instructions for setting up and using the Claude AI integration in the tldrsec-ai project.

## Setup

### 1. Obtain an Anthropic API Key

1. Visit the [Anthropic Console](https://console.anthropic.com/) and sign up or sign in
2. Navigate to the API Keys section
3. Create a new API key

### 2. Configure Environment Variables

Create or update your `.env` file in the project root with the following variables:

```
# Claude AI Integration
ANTHROPIC_API_KEY=your-anthropic-api-key
ANTHROPIC_MODEL=claude-3-sonnet-20240229  # Options: claude-3-opus-20240229, claude-3-sonnet-20240229, claude-3-haiku-20240307

# Optional: Anthropic API Configuration
ANTHROPIC_MAX_TOKENS=4000
ANTHROPIC_TEMPERATURE=0.3
```

### 3. Install Dependencies

Ensure all dependencies are installed:

```bash
npm install
```

## Using the Claude Client

The Claude client is available throughout the application:

```typescript
import claudeClient from '../lib/ai';
// or
import { claudeClient } from '../lib/ai/claude-client';

// Send a message to Claude
const response = await claudeClient.sendMessage([
  { role: 'user', content: 'Analyze this SEC filing for risk factors...' }
], {
  model: 'claude-3-sonnet-20240229', // Optional: Override default model
  maxTokens: 1000, // Optional: Override default max tokens
  temperature: 0.3, // Optional: Override default temperature
  system: 'You are an expert in financial analysis...', // Optional: System prompt
});

// Access the response content
console.log(response.content);

// Check token usage and cost
const usage = claudeClient.getUsage();
console.log(`Used ${usage.tokens.input} input tokens and ${usage.tokens.output} output tokens`);
console.log(`Total cost: ${usage.formattedCost}`);
```

## Available Models

The following Claude models are available:

| Model | Context Window | Input Cost | Output Cost | Strengths |
|-------|---------------|------------|------------|-----------|
| claude-3-opus-20240229 | 200K tokens | $15/million | $75/million | Most powerful, best for complex reasoning |
| claude-3-sonnet-20240229 | 180K tokens | $3/million | $15/million | Balanced intelligence and speed |
| claude-3-haiku-20240307 | 150K tokens | $0.25/million | $1.25/million | Fastest, good for quick responses |

## Configuration

All Claude client settings can be adjusted in `lib/ai/config.ts`.

The client includes:
- Rate limiting to prevent API throttling
- Retry logic with exponential backoff for transient errors
- Detailed error handling and classification
- Cost and token usage tracking

## Error Handling

The Claude client includes robust error handling:

```typescript
try {
  const response = await claudeClient.sendMessage([
    { role: 'user', content: 'Analyze this filing...' }
  ]);
  // Process response
} catch (error) {
  if (error instanceof ClaudeApiError) {
    console.error(`API Error (${error.status}): ${error.message}`);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## Best Practices

1. **Cost Management**:
   - Use the most appropriate model for your needs (Haiku for simple tasks, Opus for complex analysis)
   - Monitor costs using the `getUsage()` method
   - Set appropriate token limits

2. **Performance**:
   - Implement appropriate timeouts for user-facing requests
   - Consider background processing for large document analysis

3. **Prompting**:
   - Use specific, detailed prompts for better results
   - Include examples where helpful
   - Set the system prompt to provide context and constraints 