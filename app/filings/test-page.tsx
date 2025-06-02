'use client';

import { useState, useEffect } from 'react';
import { FilingType } from '@/lib/sec-edgar/types';
import { getFormsByCategory, getHighImportanceForms } from '@/lib/sec-edgar/form-registry';

// Filing summary result interface
interface FilingSummaryResult {
  ticker: string;
  companyName: string;
  filingType: FilingType;
  filingDate: string;
  accessionNumber: string;
  summaryText: string;
  keyPoints: string[];
  url: string; // SEC HTML viewer URL
  filingUrl?: string; // Kept for backward compatibility
}

// Component to display a filing summary
const FilingSummary = ({ summary }: { summary: FilingSummaryResult }) => {
  return (
    <div className="border rounded-lg p-4 mb-4 bg-white shadow-sm">
      <h3 className="text-lg font-semibold mb-2">
        {summary.companyName} ({summary.ticker}) - {summary.filingType}
      </h3>
      <p className="text-sm text-gray-500 mb-2">Filed on: {summary.filingDate}</p>
      <p className="mb-3">{summary.summaryText}</p>
      
      <div className="bg-gray-50 p-3 rounded border-l-4 border-blue-500">
        <h4 className="font-medium mb-2">Key Points</h4>
        <ul className="list-disc pl-5 space-y-1">
          {summary.keyPoints.map((point, index) => (
            <li key={index} className="text-sm">{point}</li>
          ))}
        </ul>
      </div>
      
      <a 
        href={summary.url || summary.filingUrl} 
        target="_blank" 
        rel="noopener noreferrer"
        className="inline-block mt-3 text-blue-600 hover:underline text-sm"
      >
        View Original Filing
      </a>
    </div>
  );
};

// Main test page component
export default function TestPage() {
  const [ticker, setTicker] = useState('AAPL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<FilingSummaryResult[]>([]);
  const [selectedFormType, setSelectedFormType] = useState<FilingType>('10-K');
  
  // Get form categories for the form selector
  const financialForms = getFormsByCategory('annual');
  const eventForms = getFormsByCategory('current');
  const ownershipForms = getFormsByCategory('insider');
  const registrationForms = getFormsByCategory('registration');
  
  // Function to fetch a filing summary
  const fetchFilingSummary = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/filings/summary?ticker=${ticker}&formType=${selectedFormType}&skipAuth=true`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch filing summary');
      }
      
      if (data.success && data.data) {
        setSummaries([data.data]);
      } else {
        setError('No filing data found');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };
  
  // Function to fetch multiple filing types
  const fetchMultipleFilings = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/filings/test-multi?ticker=${ticker}&skipAuth=true`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch filing summaries');
      }
      
      if (data.success && data.data) {
        const allSummaries = data.data.summaries.map((item: any) => item.summary);
        setSummaries(allSummaries);
        
        if (data.data.errors.length > 0) {
          console.warn('Some filings could not be fetched:', data.data.errors);
        }
      } else {
        setError('No filing data found');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">SEC Filing Multi-Form Test Page</h1>
      
      <div className="bg-gray-50 p-4 rounded-lg mb-6">
        <div className="flex flex-wrap gap-4 mb-4">
          <div className="flex-1">
            <label htmlFor="ticker" className="block text-sm font-medium text-gray-700 mb-1">
              Ticker Symbol
            </label>
            <input
              type="text"
              id="ticker"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              className="w-full p-2 border rounded"
              placeholder="e.g. AAPL"
            />
          </div>
          
          <div className="flex-1">
            <label htmlFor="formType" className="block text-sm font-medium text-gray-700 mb-1">
              Form Type
            </label>
            <select
              id="formType"
              value={selectedFormType}
              onChange={(e) => setSelectedFormType(e.target.value as FilingType)}
              className="w-full p-2 border rounded"
            >
              <optgroup label="Financial Reports">
                {financialForms.map(form => (
                  <option key={form.id} value={form.id}>
                    {form.displayName}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Event Filings">
                {eventForms.map(form => (
                  <option key={form.id} value={form.id}>
                    {form.displayName}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Ownership Filings">
                {ownershipForms.map(form => (
                  <option key={form.id} value={form.id}>
                    {form.displayName}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Registration Filings">
                {registrationForms.map(form => (
                  <option key={form.id} value={form.id}>
                    {form.displayName}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
        </div>
        
        <div className="flex gap-4">
          <button
            onClick={fetchFilingSummary}
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:bg-blue-300"
          >
            {loading ? 'Loading...' : 'Get Single Filing'}
          </button>
          
          <button
            onClick={fetchMultipleFilings}
            disabled={loading}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:bg-green-300"
          >
            {loading ? 'Loading...' : 'Get Multiple Filings'}
          </button>
        </div>
      </div>
      
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
          <p className="text-red-700">{error}</p>
        </div>
      )}
      
      {summaries.length > 0 ? (
        <div>
          <h2 className="text-xl font-semibold mb-4">Filing Summaries</h2>
          {summaries.map((summary, index) => (
            <FilingSummary key={index} summary={summary} />
          ))}
        </div>
      ) : !loading && !error && (
        <div className="text-center py-8 text-gray-500">
          <p>No filing summaries to display. Use the form above to fetch SEC filings.</p>
        </div>
      )}
    </div>
  );
}
