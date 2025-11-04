'use client';

export function CompanyPreview() {
  const companies = [
    { symbol: 'AAPL', name: 'Apple' },
    { symbol: 'MSFT', name: 'Microsoft' },
    { symbol: 'GOOGL', name: 'Google' },
    { symbol: 'AMZN', name: 'Amazon' },
    { symbol: 'NVDA', name: 'NVIDIA' },
    { symbol: 'META', name: 'Meta' },
    { symbol: 'TSLA', name: 'Tesla' },
    { symbol: 'JPM', name: 'JPMorgan' },
  ];

  return (
    <div className="py-16 bg-white">
      <div className="container px-4 mx-auto">
        <h2 className="text-3xl font-bold text-center mb-12">
          Coverage of Fortune 500 Companies
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
          {companies.map((company) => (
            <div
              key={company.symbol}
              className="flex flex-col items-center p-6 bg-gray-50 rounded-lg hover:bg-violet-50 transition-colors"
            >
              <span className="text-2xl font-bold text-violet-600">{company.symbol}</span>
              <span className="text-sm text-gray-600 mt-1">{company.name}</span>
            </div>
          ))}
        </div>
        <p className="text-center mt-8 text-gray-600">
          Plus 492 more companies tracked and summarized weekly
        </p>
      </div>
    </div>
  );
}