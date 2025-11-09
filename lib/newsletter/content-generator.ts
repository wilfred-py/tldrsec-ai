import { FORTUNE_500_FOCUS, NEWSLETTER_CONFIG, NewsletterDigest, NewsletterSection } from './company-config';
import { getPrismaClient } from '@/lib/db/connection';

type SummaryWithRelations = {
  id: string;
  content: string | null;
  summaryData: string | null;
  qualityScore: number | null;
  processingStatus: string;
  createdAt: Date;
  ticker: {
    symbol: string;
  };
  secFiling: {
    formType: string;
    filedAt: Date;
  };
};

export class NewsletterContentGenerator {
  async generateWeeklyDigest(): Promise<NewsletterDigest> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - NEWSLETTER_CONFIG.lookbackDays * 24 * 60 * 60 * 1000);
    
    // Get recent filings for Fortune 500 companies
    const prisma = getPrismaClient();
    const targetSymbols = FORTUNE_500_FOCUS.map(c => c.symbol);
    
    const recentSummaries = await prisma.summary.findMany({
      where: {
        ticker: {
          symbol: { in: targetSymbols }
        },
        createdAt: {
          gte: startDate,
          lte: endDate
        },
        processingStatus: 'COMPLETED',
        qualityScore: {
          gte: NEWSLETTER_CONFIG.minQualityScore
        }
      },
      include: {
        ticker: true,
        secFiling: true
      },
      orderBy: [
        { secFiling: { filedAt: 'desc' } },
        { qualityScore: 'desc' }
      ]
    });

    // Group by company and limit filings
    const companySummaries = this.groupAndLimitSummaries(recentSummaries);
    
    // Generate newsletter sections
    const digest: NewsletterDigest = {
      week: this.getWeekRange(startDate, endDate),
      sections: [
        this.createHighlightsSection(companySummaries),
        this.createByCompanySection(companySummaries),
        this.createUpgradeSection()
      ],
      totalFilings: recentSummaries.length,
      companiesCovered: new Set(recentSummaries.map(s => s.ticker.symbol)).size,
      generatedAt: new Date().toISOString()
    };

    return digest;
  }

  private groupAndLimitSummaries(summaries: SummaryWithRelations[]) {
    const grouped = new Map();
    
    for (const summary of summaries) {
      const symbol = summary.ticker.symbol;
      if (!grouped.has(symbol)) {
        grouped.set(symbol, []);
      }
      
      const companySummaries = grouped.get(symbol);
      if (companySummaries.length < NEWSLETTER_CONFIG.maxFilingsPerCompany) {
        companySummaries.push(summary);
      }
    }
    
    return grouped;
  }

  private createHighlightsSection(companySummaries: Map<string, SummaryWithRelations[]>): NewsletterSection {
    const highlights = [];
    
    for (const [symbol, summaries] of companySummaries) {
      const company = FORTUNE_500_FOCUS.find(c => c.symbol === symbol);
      for (const summary of summaries.slice(0, 1)) { // Top 1 per company for highlights
        // Prioritize by form type and quality score
        const priority = NEWSLETTER_CONFIG.priorityForms.indexOf(summary.secFiling.formType);
        const formPriority = priority >= 0 ? priority : 999;
        
        highlights.push({
          company: company?.name || symbol,
          symbol,
          sector: company?.sector || 'Other',
          filingType: summary.secFiling.formType,
          headline: this.extractHeadline(summary),
          summary: this.extractTldr(summary),
          url: `https://tldrsec.app/summary/${summary.id}?utm_source=newsletter&utm_medium=email&utm_campaign=weekly_digest`,
          priority: formPriority,
          qualityScore: summary.qualityScore || 0,
          filedAt: summary.secFiling.filedAt
        });
      }
    }

    // Sort by priority, then quality score, then filing date
    highlights.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.qualityScore !== b.qualityScore) return b.qualityScore - a.qualityScore;
      return new Date(b.filedAt).getTime() - new Date(a.filedAt).getTime();
    });

    return {
      title: 'This Week\'s Key Filings',
      items: highlights.slice(0, 5) // Top 5 highlights
    };
  }

  private createByCompanySection(companySummaries: Map<string, SummaryWithRelations[]>): NewsletterSection {
    const companyItems = [];

    for (const [symbol, summaries] of companySummaries) {
      const company = FORTUNE_500_FOCUS.find(c => c.symbol === symbol);
      companyItems.push({
        company: company?.name || symbol,
        symbol,
        sector: company?.sector || 'Other',
        filings: summaries.map(summary => ({
          type: summary.secFiling.formType,
          summary: this.extractTldr(summary),
          url: `https://tldrsec.app/summary/${summary.id}?utm_source=newsletter&utm_medium=email&utm_campaign=weekly_digest`,
          filedAt: summary.secFiling.filedAt,
          qualityScore: summary.qualityScore
        })).sort((a, b) => new Date(b.filedAt).getTime() - new Date(a.filedAt).getTime())
      });
    }

    // Sort companies by sector, then by name
    companyItems.sort((a, b) => {
      if (a.sector !== b.sector) return a.sector.localeCompare(b.sector);
      return a.company.localeCompare(b.company);
    });

    return {
      title: 'By Company',
      items: companyItems
    };
  }

  private createUpgradeSection(): NewsletterSection {
    return {
      title: 'Want Real-Time Alerts?',
      items: [{
        headline: 'Upgrade to full access for instant notifications',
        description: 'Get real-time alerts for any company, access our complete archive, and customize your preferences.',
        features: [
          'Real-time SEC filing alerts',
          'Custom company tracking',
          'Advanced search & filtering',
          'Historical filing archive',
          'Mobile app access',
          'Priority customer support'
        ],
        cta: 'Upgrade Now',
        url: 'https://tldrsec.app/sign-up?utm_source=newsletter&utm_medium=email&utm_campaign=upgrade_cta'
      }]
    };
  }

  private extractHeadline(summary: SummaryWithRelations): string {
    // Extract compelling headline from summary data
    if (summary.summaryData) {
      try {
        const data = JSON.parse(summary.summaryData);
        if (data.headline) return data.headline;
        if (data.keyHighlights && data.keyHighlights.length > 0) {
          return data.keyHighlights[0];
        }
        if (data.executiveSummary) {
          // Extract first sentence as headline
          const firstSentence = data.executiveSummary.split('.')[0];
          if (firstSentence.length < 120) return firstSentence + '.';
        }
      } catch {
        // Fall through to default
      }
    }
    
    // Generate headline based on form type
    const formType = summary.secFiling.formType;
    const company = summary.ticker.symbol;
    
    switch (formType) {
      case '10-K':
        return `${company} releases annual 10-K filing with key business updates`;
      case '10-Q':
        return `${company} quarterly 10-Q reveals financial performance trends`;
      case '8-K':
        return `${company} announces material events in 8-K filing`;
      case 'Form 4':
        return `${company} insider trading activity reported in Form 4`;
      default:
        return `${company} files ${formType} with SEC`;
    }
  }

  private extractTldr(summary: SummaryWithRelations): string {
    if (summary.summaryData) {
      try {
        const data = JSON.parse(summary.summaryData);
        if (data.tldr) return data.tldr;
        if (data.executiveSummary) {
          const truncated = data.executiveSummary.substring(0, 250);
          return truncated + (data.executiveSummary.length > 250 ? '...' : '');
        }
        if (data.keyHighlights && data.keyHighlights.length > 0) {
          return data.keyHighlights.slice(0, 2).join('. ') + '.';
        }
      } catch {
        // Fall through to content
      }
    }
    
    if (summary.content) {
      const truncated = summary.content.substring(0, 250);
      return truncated + (summary.content.length > 250 ? '...' : '');
    }
    
    return `SEC filing summary for ${summary.ticker.symbol} - ${summary.secFiling.formType}`;
  }

  private getWeekRange(start: Date, end: Date): string {
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    const startStr = start.toLocaleDateString('en-US', options);
    const endStr = end.toLocaleDateString('en-US', options);
    
    // Add year if different or if we're in a new year
    const currentYear = new Date().getFullYear();
    const startYear = start.getFullYear();
    const endYear = end.getFullYear();
    
    if (startYear !== currentYear || endYear !== currentYear || startYear !== endYear) {
      return `${startStr}, ${startYear} - ${endStr}, ${endYear}`;
    }
    
    return `${startStr} - ${endStr}`;
  }

  // Helper method for testing
  async getRecentFilingsCount(): Promise<number> {
    const prisma = getPrismaClient();
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - NEWSLETTER_CONFIG.lookbackDays * 24 * 60 * 60 * 1000);
    
    const count = await prisma.summary.count({
      where: {
        ticker: {
          symbol: { in: FORTUNE_500_FOCUS.map(c => c.symbol) }
        },
        createdAt: {
          gte: startDate,
          lte: endDate
        },
        processingStatus: 'COMPLETED'
      }
    });
    
    return count;
  }
}