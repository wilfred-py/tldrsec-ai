/**
 * Mock for @anthropic-ai/sdk
 * This prevents the actual Anthropic client from being loaded in tests
 */

import { jest } from '@jest/globals';

const AnthropicMock = jest.fn().mockImplementation(() => {
  return {
    messages: {
      create: jest.fn().mockResolvedValue({
        id: 'msg_mock',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Mock response' }],
        model: 'claude-3-opus-20240229',
        usage: { input_tokens: 10, output_tokens: 20 }
      })
    }
  };
});

// Export both named and default export to support different import styles
export const Anthropic = AnthropicMock;
export default AnthropicMock;
