// index.js - Cloudflare Worker for Cron Trigger

export default {
  async scheduled(event, env, ctx) {
    const url = `${env.PUBLIC_URL}/api/cron/unified`;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${env.CRON_SECRET}`,
          'Content-Type': 'application/json',
          'User-Agent': 'tldrSEC-AI Cloudflare Cron'
        }
      });
      if (!response.ok) throw new Error(`Failed: ${response.status}`);
      console.log('Pipeline triggered successfully');
    } catch (error) {
      console.error('Error:', error);
      throw error;
    }
  }
};
