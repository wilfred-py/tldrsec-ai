import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createTestFiling() {
  try {
    // Find TSLA ticker
    const tslaTicker = await prisma.ticker.findFirst({
      where: {
        symbol: 'TSLA'
      }
    });

    if (!tslaTicker) {
      console.error('❌ TSLA ticker not found in database');
      return;
    }

    console.log('✅ Found TSLA ticker:', tslaTicker.id);

    // Create a test SEC filing for TSLA that is unprocessed
    const filing = await prisma.secFiling.create({
      data: {
        tickerId: tslaTicker.id,
        formType: '10-Q',
        filingDate: new Date('2025-01-15'),
        secUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001318605&type=10-Q&dateb=&owner=exclude&count=100',
        accessionNumber: `0001318605-25-TEST-${Date.now()}`,
        companyName: tslaTicker.companyName || 'Tesla, Inc.',
        cik: tslaTicker.cik || '0001318605',
      }
    });

    console.log('\n✅ Created test filing for TSLA:');
    console.log('   Filing ID:', filing.id);
    console.log('   Form Type:', filing.formType);
    console.log('   Accession Number:', filing.accessionNumber);
    console.log('   Filing Date:', filing.filingDate.toISOString());
    console.log('\n📊 This filing has no summaries, so it should be picked up as unprocessed');

    // Verify it has no summaries
    const summaryCount = await prisma.summary.count({
      where: {
        secFilingId: filing.id
      }
    });

    console.log(`   Summaries: ${summaryCount} (should be 0)`);

    // Check if user is subscribed to TSLA
    const userSubscribed = await prisma.user.findFirst({
      where: {
        tickers: {
          some: {
            symbol: 'TSLA'
          }
        }
      },
      include: {
        tickers: {
          where: {
            symbol: 'TSLA'
          }
        }
      }
    });

    if (userSubscribed) {
      console.log(`\n✅ User subscribed to TSLA: ${userSubscribed.email}`);
      console.log(`   User ID: ${userSubscribed.id}`);
      console.log(`   Tier: ${userSubscribed.subscriptionTier}`);
      console.log('\n🎯 This filing should be queued for this user when cron runs!');
    } else {
      console.log('\n⚠️  No users subscribed to TSLA');
    }

  } catch (error) {
    console.error('Error creating test filing:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestFiling();
