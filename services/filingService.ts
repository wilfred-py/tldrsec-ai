import { FilingLog } from '@/types/filing';

// Mock filing data for demonstration
const mockFilings: FilingLog[] = [
  {
    id: '1',
    ticker: 'AAPL',
    company: 'Apple Inc.',
    filingName: 'Annual Report',
    filingCode: '10-K',
    filingDate: '2025-02-15',
    status: 'completed',
    details: {
      revenue: '$394.3B',
      operatingMargin: '30.3%',
      eps: '$6.14',
      yoy: {
        revenue: '+8.1%',
        margin: '+1.2%',
        eps: '+10.4%'
      },
      keyInsights: [
        'Record services revenue of $85.2B, up 17% year-over-year',
        'Returned over $110B to shareholders through dividends and share repurchases',
        'Announced new AI features across product lineup'
      ],
      riskFactors: [
        'Increasing regulatory scrutiny in key markets',
        'Supply chain constraints affecting product availability',
        'Intensifying competition in services segment'
      ]
    }
  },
  {
    id: '2',
    ticker: 'MSFT',
    company: 'Microsoft Corporation',
    filingName: 'Quarterly Report',
    filingCode: '10-Q',
    filingDate: '2025-04-28',
    status: 'completed',
    details: {
      revenue: '$52.7B',
      operatingMargin: '42.1%',
      eps: '$2.45',
      yoy: {
        revenue: '+12.3%',
        margin: '+2.5%',
        eps: '+14.0%'
      },
      keyInsights: [
        'Azure revenue growth accelerated to 31% year-over-year',
        'AI-powered Copilot services driving new commercial bookings',
        'Operating margins expanded across all business segments'
      ],
      riskFactors: [
        'Potential economic slowdown affecting enterprise spending',
        'Cybersecurity threats targeting cloud infrastructure',
        'Increasing competition in AI services'
      ]
    }
  },
  {
    id: '3',
    ticker: 'AMZN',
    company: 'Amazon.com Inc.',
    filingName: 'Current Report',
    filingCode: '8-K',
    filingDate: '2025-05-10',
    status: 'completed'
  },
  {
    id: '4',
    ticker: 'GOOGL',
    company: 'Alphabet Inc.',
    filingName: 'Quarterly Report',
    filingCode: '10-Q',
    filingDate: '2025-05-02',
    status: 'started'
  },
  {
    id: '5',
    ticker: 'META',
    company: 'Meta Platforms Inc.',
    filingName: 'Annual Report',
    filingCode: '10-K',
    filingDate: '2025-03-20',
    status: 'failed'
  }
];

const filingService = {
  // Get all filing logs
  getFilingLogs: async () => {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 500));
    return { data: mockFilings };
  },
  
  // Get filing details by ID
  getFilingById: async (id: string) => {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 300));
    const filing = mockFilings.find(f => f.id === id);
    return { data: filing };
  },
  
  // Send an email summary of the latest filings
  sendEmailSummary: async () => {
    try {
      const response = await fetch('/api/email/summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send email summary');
      }

      return {
        success: true,
        message: data.message || 'Email summary sent successfully!'
      };
    } catch (error) {
      console.error('Error sending email summary:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send email summary'
      };
    }
  }
};

export default filingService;
