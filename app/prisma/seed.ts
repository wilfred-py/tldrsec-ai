import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting seeding...');

  // Create a sample user
  const user = await prisma.user.upsert({
    where: { email: 'demo@tldrsec.com' },
    update: {},
    create: {
      email: 'demo@tldrsec.com',
      name: 'Demo User',
      authProvider: 'demo',
      authProviderId: 'demo-user-id',
      notificationPreference: 'immediate',
      theme: 'light',
    },
  });

  console.log(`Created user: ${user.name} (${user.email})`);

  // Create some sample tickers
  const tickers = [
    { symbol: 'AAPL', companyName: 'Apple Inc.' },
    { symbol: 'MSFT', companyName: 'Microsoft Corporation' },
    { symbol: 'AMZN', companyName: 'Amazon.com, Inc.' },
    { symbol: 'GOOG', companyName: 'Alphabet Inc.' },
    { symbol: 'META', companyName: 'Meta Platforms, Inc.' },
  ];

  for (const ticker of tickers) {
    const createdTicker = await prisma.ticker.upsert({
      where: { 
        userId_symbol: {
          userId: user.id,
          symbol: ticker.symbol,
        }
      },
      update: {},
      create: {
        symbol: ticker.symbol,
        companyName: ticker.companyName,
        userId: user.id,
      },
    });

    console.log(`Created ticker: ${createdTicker.symbol}`);

    // Create a sample summary for each ticker
    const summary = await prisma.summary.create({
      data: {
        tickerId: createdTicker.id,
        filingType: '10-Q',
        filingDate: new Date('2023-01-15'),
        filingUrl: `https://www.sec.gov/Archives/edgar/data/${ticker.symbol}/000000000000000000/form10q.htm`,
        summaryText: `This is a sample summary for ${ticker.companyName}'s quarterly report. The company reported strong growth in all segments, with revenue up 15% year-over-year. Expenses were well-controlled, leading to higher profit margins. Management is optimistic about future prospects despite market uncertainties.`,
        summaryJSON: {
          company: ticker.companyName,
          period: 'Q4 2022',
          financials: [
            { label: 'Revenue', value: '$100B', growth: '+15%', unit: '% YoY' },
            { label: 'Operating Margin', value: '25%', growth: '+2%', unit: '% YoY' },
            { label: 'EPS', value: '$1.50', growth: '+18%', unit: '% YoY' },
          ],
          insights: [
            'Product innovation driving growth in key markets',
            'Cost control measures yielding better margins',
            'International expansion progressing ahead of schedule',
          ],
          risks: [
            'Supply chain disruptions could impact future quarters',
            'Increasing regulatory scrutiny in European markets',
            'Growing competition in the core business segment',
          ],
        },
        sentToUser: true,
      },
    });

    console.log(`Created summary for ${ticker.symbol}: ${summary.id}`);
  }

  console.log('Seeding completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 