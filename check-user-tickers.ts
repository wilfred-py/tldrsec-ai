import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkUserTickers() {
  try {
    console.log('Checking user ticker subscriptions...\n');

    const users = await prisma.user.findMany({
      include: {
        tickers: {
          select: {
            symbol: true,
            companyName: true,
          },
        },
      },
    });

    console.log(`Found ${users.length} users in database\n`);

    users.forEach((user, index) => {
      console.log(`\n${index + 1}. User: ${user.email || user.id}`);
      console.log(`   Tier: ${user.subscriptionTier}`);
      console.log(`   Tickers: ${user.tickers.length} subscribed`);
      if (user.tickers.length > 0) {
        user.tickers.forEach((ticker) => {
          console.log(`     - ${ticker.symbol} (${ticker.companyName})`);
        });
      }
    });

    // Also check first 5 unprocessed filings
    console.log('\n\nChecking first 5 unprocessed filings...\n');

    const unprocessedFilings = await prisma.secFiling.findMany({
      where: {
        processedAt: null,
      },
      orderBy: {
        filingDate: 'desc',
      },
      take: 5,
      include: {
        ticker: {
          select: {
            symbol: true,
            companyName: true,
          },
        },
      },
    });

    console.log(`Found ${unprocessedFilings.length} unprocessed filings (showing first 5):\n`);

    unprocessedFilings.forEach((filing, index) => {
      console.log(`${index + 1}. ${filing.ticker.symbol} - ${filing.formType}`);
      console.log(`   Filing Date: ${filing.filingDate}`);
      console.log(`   Accession: ${filing.accessionNumber}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUserTickers();
