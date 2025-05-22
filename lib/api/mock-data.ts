import { Company, TickerSearchResult, FilingLog } from './types';

// Mock companies data
export const MOCK_COMPANIES: Company[] = [
  { 
    id: '1',
    symbol: "AAPL", 
    name: "Apple Inc.", 
    lastFiling: "2 days ago",
    preferences: { tenK: true, tenQ: true, eightK: true, form4: true, other: false }
  },
  { 
    id: '2',
    symbol: "MSFT", 
    name: "Microsoft Corp.", 
    lastFiling: "1 week ago",
    preferences: { tenK: true, tenQ: true, eightK: true, form4: false, other: false }
  },
  { 
    id: '3',
    symbol: "GOOGL", 
    name: "Alphabet Inc.", 
    lastFiling: "3 days ago",
    preferences: { tenK: true, tenQ: true, eightK: true, form4: true, other: false }
  },
  { 
    id: '4',
    symbol: "AMZN", 
    name: "Amazon.com Inc.", 
    lastFiling: "1 day ago",
    preferences: { tenK: true, tenQ: true, eightK: true, form4: true, other: true }
  },
  { 
    id: '5',
    symbol: "META", 
    name: "Meta Platforms Inc.", 
    lastFiling: "2 weeks ago",
    preferences: { tenK: true, tenQ: true, eightK: true, form4: false, other: false }
  },
  { 
    id: '6',
    symbol: "TSLA", 
    name: "Tesla, Inc.", 
    lastFiling: "5 days ago",
    preferences: { tenK: true, tenQ: true, eightK: true, form4: true, other: false }
  },
  { 
    id: '7',
    symbol: "NVDA", 
    name: "NVIDIA Corporation", 
    lastFiling: "1 week ago",
    preferences: { tenK: true, tenQ: true, eightK: false, form4: false, other: false }
  },
  { 
    id: '8',
    symbol: "AMD", 
    name: "Advanced Micro Devices, Inc.", 
    lastFiling: "3 weeks ago",
    preferences: { tenK: true, tenQ: true, eightK: true, form4: false, other: false }
  },
  { 
    id: '9',
    symbol: "INTC", 
    name: "Intel Corporation", 
    lastFiling: "2 weeks ago",
    preferences: { tenK: true, tenQ: true, eightK: true, form4: false, other: false }
  },
];

// More comprehensive list of available tickers for search
export const AVAILABLE_TICKERS: TickerSearchResult[] = [
  { symbol: "WMT", name: "Walmart Inc." },
  { symbol: "TGT", name: "Target Corporation" },
  { symbol: "COST", name: "Costco Wholesale Corp." },
  { symbol: "HD", name: "Home Depot Inc." },
  { symbol: "LOW", name: "Lowe's Companies Inc." },
  { symbol: "SBUX", name: "Starbucks Corporation" },
  { symbol: "MCD", name: "McDonald's Corporation" },
  { symbol: "DIS", name: "The Walt Disney Company" },
  { symbol: "NFLX", name: "Netflix Inc." },
  { symbol: "JPM", name: "JPMorgan Chase & Co." },
  { symbol: "BAC", name: "Bank of America Corp." },
  { symbol: "WFC", name: "Wells Fargo & Co." },
  { symbol: "C", name: "Citigroup Inc." },
  { symbol: "GS", name: "Goldman Sachs Group Inc." },
  { symbol: "V", name: "Visa Inc." },
  { symbol: "MA", name: "Mastercard Inc." },
  { symbol: "PYPL", name: "PayPal Holdings Inc." },
  { symbol: "SQ", name: "Block Inc." },
  { symbol: "ADBE", name: "Adobe Inc." },
  { symbol: "CRM", name: "Salesforce Inc." },
  { symbol: "IBM", name: "International Business Machines Corp." },
  { symbol: "ORCL", name: "Oracle Corporation" },
  { symbol: "CSCO", name: "Cisco Systems Inc." },
  { symbol: "QCOM", name: "Qualcomm Inc." },
  { symbol: "TMO", name: "Thermo Fisher Scientific Inc." },
  { symbol: "DHR", name: "Danaher Corporation" },
  { symbol: "JNJ", name: "Johnson & Johnson" },
  { symbol: "PFE", name: "Pfizer Inc." },
  { symbol: "MRK", name: "Merck & Co. Inc." },
  { symbol: "ABBV", name: "AbbVie Inc." },
  { symbol: "LLY", name: "Eli Lilly and Company" },
  { symbol: "PG", name: "Procter & Gamble Co." },
  { symbol: "KO", name: "Coca-Cola Company" },
  { symbol: "PEP", name: "PepsiCo Inc." },
  { symbol: "MDLZ", name: "Mondelez International Inc." },
  { symbol: "NKE", name: "Nike Inc." },
  { symbol: "ABNB", name: "Airbnb Inc." }
];

// Sample filing logs data
export const MOCK_FILING_LOGS: FilingLog[] = [
  {
    id: "log-1",
    ticker: "AAPL",
    company: "Apple Inc.",
    filingCode: "10-K",
    filingName: "Annual Report",
    filingDate: "Dec 12, 2023",
    jobStart: "Dec 12, 2023, 4:30 PM",
    jobCompleted: "Dec 12, 2023, 4:35 PM",
    emailSent: "Dec 12, 2023, 4:36 PM",
    status: "Completed",
    details: {
      revenue: "$394.3 billion",
      netIncome: "$96.9 billion",
      eps: "$6.14",
      cashFlow: "$114.5 billion",
      assets: "$335.1 billion",
      keyInsights: [
        "iPhone sales increased by 4% year-over-year",
        "Services revenue reached an all-time high of $85.2 billion",
        "Operating margin improved to 30.4%",
        "Share repurchases of $90.2 billion during fiscal 2023"
      ],
      riskFactors: [
        "Increasing competition in smartphone market",
        "Supply chain constraints and component shortages",
        "Regulatory challenges in multiple markets",
        "Foreign exchange volatility impact on international sales"
      ]
    }
  },
  {
    id: "log-2",
    ticker: "MSFT",
    company: "Microsoft Corp.",
    filingCode: "10-Q",
    filingName: "Quarterly Report",
    filingDate: "Nov 28, 2023",
    jobStart: "Nov 28, 2023, 2:15 PM",
    jobCompleted: "Nov 28, 2023, 2:18 PM",
    emailSent: "Nov 28, 2023, 2:19 PM",
    status: "Completed",
    details: {
      revenue: "$56.5 billion",
      netIncome: "$22.3 billion",
      eps: "$2.99",
      yoy: {
        revenue: "+12.8%",
        margin: "+2.1%",
        eps: "+27.3%"
      },
      keyInsights: [
        "Azure cloud revenue grew 29% year-over-year",
        "Commercial bookings increased 17%",
        "AI services driving new customer acquisition",
        "Operating expenses decreased 2% sequentially"
      ]
    }
  },
  {
    id: "log-3",
    ticker: "GOOGL",
    company: "Alphabet Inc.",
    filingCode: "8-K",
    filingName: "Current Report",
    filingDate: "Dec 5, 2023",
    jobStart: "Dec 5, 2023, 10:30 AM",
    jobCompleted: "Dec 5, 2023, 10:32 AM",
    emailSent: "Dec 5, 2023, 10:33 AM",
    status: "Completed"
  },
  {
    id: "log-4",
    ticker: "AMZN",
    company: "Amazon.com Inc.",
    filingCode: "FORM 4",
    filingName: "Statement of Changes in Beneficial Ownership",
    filingDate: "Dec 1, 2023",
    jobStart: "Dec 1, 2023, 9:15 AM",
    jobCompleted: "Dec 1, 2023, 9:16 AM",
    emailSent: "Dec 1, 2023, 9:17 AM",
    status: "Completed"
  },
  {
    id: "log-5",
    ticker: "TSLA",
    company: "Tesla, Inc.",
    filingCode: "10-K",
    filingName: "Annual Report",
    filingDate: "Nov 15, 2023",
    jobStart: "Nov 15, 2023, 3:45 PM",
    jobCompleted: "Nov 15, 2023, 3:50 PM",
    emailSent: "Nov 15, 2023, 3:51 PM",
    status: "Completed"
  },
  {
    id: "log-6",
    ticker: "META",
    company: "Meta Platforms Inc.",
    filingCode: "10-Q",
    filingName: "Quarterly Report",
    filingDate: "Nov 10, 2023",
    jobStart: "Nov 10, 2023, 1:30 PM",
    jobCompleted: "Nov 10, 2023, 1:33 PM",
    emailSent: "Nov 10, 2023, 1:34 PM",
    status: "Completed"
  },
  {
    id: "log-7",
    ticker: "NVDA",
    company: "NVIDIA Corporation",
    filingCode: "8-K",
    filingName: "Current Report",
    filingDate: "Nov 8, 2023",
    jobStart: "Nov 8, 2023, 11:20 AM",
    jobCompleted: "Nov 8, 2023, 11:22 AM",
    emailSent: "Nov 8, 2023, 11:23 AM",
    status: "Completed"
  },
  {
    id: "log-8",
    ticker: "JNJ",
    company: "Johnson & Johnson",
    filingCode: "10-K",
    filingName: "Annual Report",
    filingDate: "Nov 2, 2023",
    jobStart: "Nov 2, 2023, 2:10 PM",
    jobCompleted: "Error",
    emailSent: "—",
    status: "Failed"
  },
  {
    id: "log-9",
    ticker: "PG",
    company: "Procter & Gamble Co.",
    filingCode: "FORM 4",
    filingName: "Statement of Changes in Beneficial Ownership",
    filingDate: "Oct 29, 2023",
    jobStart: "Oct 29, 2023, 10:05 AM",
    jobCompleted: "Oct 29, 2023, 10:06 AM",
    emailSent: "Oct 29, 2023, 10:07 AM",
    status: "Completed"
  },
  {
    id: "log-10",
    ticker: "AMZN",
    company: "Amazon.com Inc.",
    filingCode: "10-Q",
    filingName: "Quarterly Report",
    filingDate: "Oct 25, 2023",
    jobStart: "Oct 25, 2023, 4:15 PM",
    jobCompleted: "Oct 25, 2023, 4:20 PM",
    emailSent: "Oct 25, 2023, 4:21 PM",
    status: "Completed"
  }
]; 