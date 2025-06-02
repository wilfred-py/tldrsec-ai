import { NextApiRequest, NextApiResponse } from 'next';
import filingService from '../../../services/filingService';

/**
 * Debug endpoint for testing email summaries
 * This endpoint is for development/testing only and should be protected in production
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Allow both GET and POST requests
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Handle both query parameters (GET) and request body (POST)
    let email: string;
    let tickers: string[];
    
    if (req.method === 'GET') {
      // For GET requests, extract from query parameters
      email = req.query.email as string;
      // Handle tickers as comma-separated string or as an array
      const tickersParam = req.query.tickers;
      tickers = Array.isArray(tickersParam) 
        ? tickersParam 
        : (tickersParam as string)?.split(',') || [];
    } else {
      // For POST requests, extract from request body
      ({ email, tickers } = req.body);
    }

    // Validate input
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
      return res.status(400).json({ error: 'Tickers array is required' });
    }

    console.log(`[DEBUG] Testing email summary for ${email} with tickers: ${tickers.join(', ')}`);
    
    // Call the sendEmailSummary function
    const result = await filingService.sendEmailSummary(email, tickers);
    
    // Return the result
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in debug/email-summary API route:', error);
    return res.status(500).json({ 
      error: 'Internal server error', 
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
