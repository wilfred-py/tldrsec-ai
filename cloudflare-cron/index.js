// index.js - Cloudflare Worker for Cron Trigger

export default {
  async scheduled(event, env, ctx) {
    // Point directly to tier-aware endpoint for Cloudflare Worker cron execution
    const url = `${env.PUBLIC_URL}/api/cron/tier-aware`;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${env.CRON_SECRET}`,
          'Content-Type': 'application/json',
          'User-Agent': 'TLDRSEC-Cloudflare-Worker wilfredchen1@gmail.com',
          'X-Cloudflare-Worker': 'tldrsec-cron',
          'X-Cron-Source': 'cloudflare-worker'
        }
      });
      if (!response.ok) throw new Error(`Failed: ${response.status} ${response.statusText}`);
      console.log('SEC filing pipeline triggered successfully from Cloudflare Worker');
    } catch (error) {
      console.error('Cloudflare cron error:', error);
      throw error;
    }
  }
};
