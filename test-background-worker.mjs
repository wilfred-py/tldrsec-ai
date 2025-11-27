import crypto from 'crypto';

/**
 * Test the background worker endpoint that processes Phase 1 jobs
 * This mimics what the Cloudflare Worker does in Step 2
 */

const PRODUCTION_URL = 'https://tldrsec.app';
const ENDPOINT = '/api/cron/process-filing-queue';

// Read CRON_SECRET from environment
const CRON_SECRET = process.env.CRON_SECRET;
if (!CRON_SECRET) {
  console.error('❌ CRON_SECRET environment variable is required');
  process.exit(1);
}

/**
 * Generate HMAC signature (same as Cloudflare Worker and hmac-auth.ts)
 * Format: timestamp:METHOD:path
 */
function generateSignature(method, path) {
  const timestamp = Date.now();
  const payload = `${timestamp}:${method.toUpperCase()}:${path}`;
  const signatureHex = crypto
    .createHmac('sha256', CRON_SECRET)
    .update(payload)
    .digest('hex');

  return { signatureHex, timestamp };
}

async function testBackgroundWorker() {
  try {
    console.log('\n=== TESTING BACKGROUND WORKER ENDPOINT ===\n');

    const url = `${PRODUCTION_URL}${ENDPOINT}`;
    console.log(`Target URL: ${url}`);

    // Generate authentication signature using correct HMAC format
    const method = 'GET';
    const { signatureHex, timestamp } = generateSignature(method, ENDPOINT);

    console.log('\nAuthentication:');
    console.log(`  Method: ${method}`);
    console.log(`  Path: ${ENDPOINT}`);
    console.log(`  Timestamp: ${timestamp}`);
    console.log(`  Signature: ${signatureHex.substring(0, 20)}...`);

    // Make the request with correct HMAC headers
    console.log('\n🚀 Calling background worker endpoint...\n');

    const response = await fetch(url, {
      method,
      headers: {
        'x-hmac-signature': signatureHex,
        'x-hmac-timestamp': timestamp.toString(),
        'x-cron-source': 'test-script',
        'user-agent': 'test-background-worker-hmac/2.0',
      },
    });

    const responseText = await response.text();

    console.log('Response:');
    console.log(`  Status: ${response.status} ${response.statusText}`);
    console.log(`  Headers:`, Object.fromEntries(response.headers.entries()));

    if (response.ok) {
      try {
        const data = JSON.parse(responseText);
        console.log('\n✅ SUCCESS - Response data:');
        console.log(JSON.stringify(data, null, 2));
      } catch (e) {
        console.log('\n⚠️  Response body (not JSON):');
        console.log(responseText);
      }
    } else {
      console.log('\n❌ FAILED - Response body:');
      console.log(responseText);
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error);
  }
}

testBackgroundWorker().catch(console.error);
