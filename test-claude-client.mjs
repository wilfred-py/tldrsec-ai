// Test script for Claude client
import { claudeClient } from './lib/ai/claude-client.js';

async function testClaudeClient() {
  console.log('Testing Claude client...');
  
  try {
    // Simple test prompt
    const prompt = 'Summarize the following text in 2-3 sentences: "The Securities and Exchange Commission (SEC) is a U.S. government agency that oversees securities markets and protects investors. It was created by the Securities Exchange Act of 1934 in response to the stock market crash of 1929. The SEC promotes full disclosure, protects investors against fraudulent practices, and monitors corporate takeovers in the United States."';
    
    // Log the client to check its structure
    console.log('Claude client:', claudeClient);
    
    // Test a simple completion
    console.log('Sending test request to Claude API...');
    const response = await claudeClient.completeChat({
      messages: [{
        role: 'user',
        content: prompt
      }],
      model: 'claude-3-haiku-20240307',
      max_tokens: 150,
      temperature: 0.7
    });
    
    console.log('Claude API response:');
    console.log(JSON.stringify(response, null, 2));
    
    console.log('Test completed successfully!');
  } catch (error) {
    console.error('Error testing Claude client:', error);
  }
}

// Run the test
testClaudeClient();
