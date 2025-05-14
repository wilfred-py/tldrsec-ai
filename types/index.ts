// User Types
export interface User {
  id: string;
  email: string;
  name?: string;
  imageUrl?: string;
}

// SEC Filing Types
export interface Filing {
  id: string;
  companyName: string;
  ticker: string;
  formType: string; // 10-K, 10-Q, 8-K, etc.
  filingDate: Date;
  reportDate?: Date;
  url: string;
  processed: boolean;
}

// Summary Types
export interface Summary {
  id: string;
  filingId: string;
  ticker: string;
  title: string;
  content: string;
  highlights: string[];
  risksAndChallenges: string[];
  opportunities: string[];
  createdAt: Date;
}

// Ticker Types
export interface Ticker {
  id: string;
  symbol: string;
  companyName: string;
  userId: string;
  createdAt: Date;
  lastUpdated: Date;
} 