// index.js - Cloudflare Worker for Cron Trigger

export default {
  async scheduled(event, env, ctx) {
    // Point directly to tier-aware endpoint (bypassing unified router since Railway has single cron limitation)
    const url = `${env.PUBLIC_URL}/api/cron/tier-aware`;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${env.CRON_SECRET}`,
          'Content-Type': 'application/json',
          'User-Agent': 'TLDRSEC wilfred.chen.python@gmail.com'
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
