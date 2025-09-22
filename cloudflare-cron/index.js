// index.js - Cloudflare Worker for Cron Trigger

export default {
  // Handle HTTP requests (required by Cloudflare Workers)
  async fetch(request, env, ctx) {
    return new Response('TLDRSEC Cron Worker - This endpoint is for scheduled execution only', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });
  },

  // Handle scheduled cron events
  async scheduled(event, env, ctx) {
    console.log('Starting TLDRSEC scheduled cron job execution');
    
    // DEBUG: Check secret availability and structure
    console.log('DEBUG: Checking environment secrets...');
    console.log(`CRON_SECRET defined: ${!!env.CRON_SECRET}`);
    console.log(`CRON_SECRET length: ${env.CRON_SECRET ? env.CRON_SECRET.length : 0}`);
    console.log(`CRON_SECRET first 4 chars: ${env.CRON_SECRET ? env.CRON_SECRET.substring(0, 4) + '...' : 'UNDEFINED'}`);
    console.log(`VERCEL_AUTOMATION_BYPASS_SECRET defined: ${!!env.VERCEL_AUTOMATION_BYPASS_SECRET}`);
    
    // Build URL for Vercel endpoint
    const url = `${env.PUBLIC_URL}/api/cron/tier-aware`;
    
    try {
      console.log(`Calling tier-aware endpoint: ${url}`);
      
      // Validate CRON_SECRET before proceeding
      if (!env.CRON_SECRET) {
        throw new Error('CRON_SECRET is not defined in Worker environment');
      }
      
      if (env.CRON_SECRET.length < 32) {
        throw new Error(`CRON_SECRET too short: ${env.CRON_SECRET.length} chars (minimum 32 required)`);
      }
      
      // Prepare headers with Vercel deployment protection bypass
      // Use X-Cron-Auth instead of Authorization to avoid Clerk JWT validation
      const headers = {
        'X-Cron-Auth': `Bearer ${env.CRON_SECRET}`,
        'Content-Type': 'application/json',
        'User-Agent': 'TLDRSEC-Cloudflare-Worker wilfredchen1@gmail.com',
        'X-Cloudflare-Worker': 'tldrsec-cron',
        'X-Cron-Source': 'cloudflare-worker'
      };
      
      // Add Vercel deployment protection bypass via HTTP headers if configured
      if (env.VERCEL_AUTOMATION_BYPASS_SECRET) {
        headers['x-vercel-protection-bypass'] = env.VERCEL_AUTOMATION_BYPASS_SECRET;
        headers['x-vercel-set-bypass-cookie'] = 'true';
        console.log('Request configured with deployment protection bypass');
      } else {
        console.log('No bypass secret available, continuing without bypass');
      }
      
      let response;
      let attempts = 0;
      const maxAttempts = 2; // Initial attempt + 1 retry
      
      while (attempts < maxAttempts) {
        attempts++;
        console.log(`Attempt ${attempts} to call endpoint`);
        
        response = await fetch(url, {
          method: 'GET',
          headers
        });
        
        if (response.status !== 401) {
          break;
        }
        
        console.warn(`Received 401 on attempt ${attempts}, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay before retry
      }
      
      if (!response) {
        throw new Error('Failed after maximum retry attempts');
      }
      
      const responseText = await response.text();
      console.log(`Response status: ${response.status}`);
      console.log(`Response body: ${responseText.substring(0, 500)}`);
      
      if (!response.ok) {
        throw new Error(`Failed: ${response.status} ${response.statusText} - ${responseText}`);
      }
      
      console.log('SEC filing pipeline triggered successfully from Cloudflare Worker');
      return responseText;
      
    } catch (error) {
      console.error('Cloudflare cron error:', error);
      throw error;
    }
  }
};
