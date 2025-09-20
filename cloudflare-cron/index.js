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
    
    // Build URL for Vercel endpoint
    const url = `${env.PUBLIC_URL}/api/cron/tier-aware`;
    
    try {
      console.log(`Calling tier-aware endpoint: ${url}`);
      
      // Prepare headers with Vercel deployment protection bypass
      const headers = {
        'Authorization': `Bearer ${env.CRON_SECRET}`,
        'Content-Type': 'application/json',
        'User-Agent': 'TLDRSEC-Cloudflare-Worker wilfredchen1@gmail.com',
        'X-Cloudflare-Worker': 'tldrsec-cron',
        'X-Cron-Source': 'cloudflare-worker'
      };
      
      console.log('Bypass secret value: ' + (env.VERCEL_AUTOMATION_BYPASS_SECRET ? '[REDACTED]' : 'UNDEFINED'));

      // Add Vercel deployment protection bypass via HTTP headers if configured
      if (env.VERCEL_AUTOMATION_BYPASS_SECRET) {
        headers['x-vercel-protection-bypass'] = env.VERCEL_AUTOMATION_BYPASS_SECRET;
        headers['x-vercel-set-bypass-cookie'] = 'true';
        console.log('Added Vercel deployment protection bypass via HTTP headers');
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
