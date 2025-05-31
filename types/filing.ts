export interface FilingLog {
  id: string;
  ticker: string;
  company: string;
  filingName: string;
  filingCode: string;
  filingDate: string;
  status: string;
  details?: {
    revenue?: string;
    operatingMargin?: string;
    eps?: string;
    yoy?: {
      revenue?: string;
      margin?: string;
      eps?: string;
    };
    keyInsights?: string[];
    riskFactors?: string[];
  };
}
