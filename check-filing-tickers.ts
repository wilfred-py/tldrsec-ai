import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkFilingTickers() {
  try {
    console.log('Checking first 50 unprocessed filings tickers...\n');

    const unprocessedFilings = await prisma.secFiling.findMany({
      where: {
        summaries: {
          none: {}  // No summaries means unprocessed
        }
      },
      orderBy: {
        filingDate: 'desc',
      },
      take: 50,
      include: {
        ticker: {
          select: {
            symbol: true,
            companyName: true,
          },
        },
      },
    });

    console.log(`Found ${unprocessedFilings.length} unprocessed filings (showing first 50):\n`);

    // Group by ticker
    const tickerCounts: Record<string, number> = {};
    unprocessedFilings.forEach((filing) => {
      const symbol = filing.ticker.symbol;
      tickerCounts[symbol] = (tickerCounts[symbol] || 0) + 1;
    });

    console.log('Tickers in unprocessed filings:');
    Object.entries(tickerCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([symbol, count]) => {
        console.log(`  ${symbol}: ${count} filing(s)`);
      });

    // Check which tickers have user subscriptions
    console.log('\n\nUser subscriptions:');
    const users = await prisma.user.findMany({
      include: {
        tickers: {
          select: {
            symbol: true,
          },
        },
      },
    });

    users.forEach((user) => {
      console.log(`\n${user.email || user.id}: [${user.tickers.map(t => t.symbol).join(', ')}]`);
    });

    // Check for matches
    console.log('\n\nMatches between unprocessed filings and user subscriptions:');
    const userTickerSet = new Set(
      users.flatMap(u => u.tickers.map(t => t.symbol))
    );

    const matches = Object.keys(tickerCounts).filter(symbol => userTickerSet.has(symbol));
    if (matches.length > 0) {
      console.log(`✅ Found ${matches.length} matching tickers:`, matches);
    } else {
      console.log('❌ No matches found between unprocessed filings and user subscriptions');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkFilingTickers();
