import fetch from 'node-fetch';

async function testCronEndpoint() {
  console.log('🧪 Testing SEC Filing Cron Job Endpoint...\n');
  
  try {
    const cronSecret = process.env.CRON_SECRET || 'test-secret-key';
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'http://localhost:3000';
    
    console.log(`📡 Making request to: ${baseUrl}/api/cron/monitor-sec-filings`);
    console.log(`🔐 Using CRON_SECRET: ${cronSecret ? 'Set' : 'Not set'}\n`);
    
    const startTime = Date.now();
    
    const response = await fetch(`${baseUrl}/api/cron/monitor-sec-filings`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${cronSecret}`,
        'Content-Type': 'application/json'
      },
      timeout: 120000 // 2 minute timeout
    });
    
    const duration = Date.now() - startTime;
    const responseText = await response.text();
    
    console.log(`⏱️ Request completed in ${duration}ms`);
    console.log(`📊 Response Status: ${response.status} ${response.statusText}`);
    console.log(`📄 Response Headers:`, Object.fromEntries(response.headers));
    
    if (response.ok) {
      try {
        const data = JSON.parse(responseText);
        console.log('\n✅ Cron job executed successfully!');
        console.log(`🆔 Execution ID: ${data.executionId || 'N/A'}`);
        console.log(`⏱️ Duration: ${data.duration || duration}ms`);
        
        if (data.metrics) {
          console.log('\n📊 Job Metrics:');
          console.log(`   • Tickers Checked: ${data.metrics.tickersChecked || 0}`);
          console.log(`   • New Filings Found: ${data.metrics.newFilingsFound || 0}`);
          console.log(`   • Filings Processed: ${data.metrics.filingsProcessed || 0}`);
          console.log(`   • Users Notified: ${data.metrics.usersNotified || 0}`);
          console.log(`   • Emails Sent: ${data.metrics.emailsSent || 0}`);
          console.log(`   • Errors: ${data.metrics.errorCount || 0}`);
          console.log(`   • Total Cost: $${data.metrics.totalCostUSD || 0}`);
          console.log(`   • AI Cost: $${data.metrics.aiCostUSD || 0}`);
        }
        
      } catch (parseError) {
        console.log('\n✅ Cron job completed but response parsing failed');
        console.log('📄 Raw response:', responseText.substring(0, 500) + '...');
      }
    } else {
      console.log('\n❌ Cron job failed');
      console.log('📄 Response:', responseText);
      
      if (response.status === 401) {
        console.log('\n💡 This might be an authentication issue. Check your CRON_SECRET.');
      } else if (response.status === 500) {
        console.log('\n💡 This appears to be a server error. Check the application logs.');
      }
    }
    
    // Test monitoring API endpoint
    console.log('\n🔍 Testing monitoring API endpoint...');
    
    const monitoringResponse = await fetch(`${baseUrl}/api/monitoring/cron-status?days=1&limit=5`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (monitoringResponse.ok) {
      const monitoringData = await monitoringResponse.json();
      console.log('✅ Monitoring API working');
      console.log(`📊 Recent executions: ${monitoringData.data?.recentExecutions?.length || 0}`);
      console.log(`💚 System healthy: ${monitoringData.data?.currentStatus?.isHealthy ? 'Yes' : 'No'}`);
      
      if (monitoringData.data?.summary) {
        console.log('\n📈 Summary Statistics:');
        console.log(`   • Success Rate: ${monitoringData.data.summary.successRate}%`);
        console.log(`   • Total Executions: ${monitoringData.data.summary.totalExecutions}`);
        console.log(`   • Total Filings: ${monitoringData.data.summary.totalFilings}`);
        console.log(`   • Total Cost: $${monitoringData.data.summary.totalCost}`);
      }
      
    } else {
      console.log('⚠️ Monitoring API not accessible (this is normal if not authenticated)');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Connection refused - is your development server running?');
      console.log('   Try: npm run dev');
    } else if (error.name === 'AbortError') {
      console.log('\n💡 Request timed out - this might be normal for a long-running cron job');
    }
  }
  
  console.log('\n🏁 Cron endpoint test completed');
}

testCronEndpoint().catch(console.error);