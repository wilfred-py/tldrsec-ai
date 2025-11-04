'use client';

export function SampleDigest() {
  return (
    <div className="py-16 bg-gray-50">
      <div className="container px-4 mx-auto">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            Sample Weekly Digest
          </h2>
          
          <div className="bg-white rounded-xl shadow-lg p-8">
            <div className="border-b pb-4 mb-6">
              <h3 className="text-xl font-semibold mb-2">This Week&apos;s Key Filings</h3>
              <p className="text-gray-600">5 major announcements from tech giants</p>
            </div>

            <div className="space-y-6">
              <div className="border-l-4 border-violet-600 pl-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="font-semibold">Apple Inc.</span>
                    <span className="ml-2 text-sm bg-gray-100 px-2 py-1 rounded">10-Q</span>
                  </div>
                  <span className="text-violet-600 font-medium">AAPL</span>
                </div>
                <h4 className="font-medium mb-1">Record Q4 Revenue Driven by iPhone Sales</h4>
                <p className="text-gray-600 text-sm">
                  Apple reported $89.5B in quarterly revenue, up 8% YoY, with strong iPhone 15 demand 
                  offsetting weakness in China. Services revenue hit all-time high at $22.3B.
                </p>
              </div>

              <div className="border-l-4 border-violet-600 pl-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="font-semibold">NVIDIA Corporation</span>
                    <span className="ml-2 text-sm bg-gray-100 px-2 py-1 rounded">8-K</span>
                  </div>
                  <span className="text-violet-600 font-medium">NVDA</span>
                </div>
                <h4 className="font-medium mb-1">New AI Chip Announcement Exceeds Expectations</h4>
                <p className="text-gray-600 text-sm">
                  NVIDIA unveiled H200 GPU with 141GB HBM3e memory, promising 90% performance 
                  improvement for LLM inference. Production begins Q2 2024.
                </p>
              </div>

              <div className="border-l-4 border-violet-600 pl-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="font-semibold">Tesla Inc.</span>
                    <span className="ml-2 text-sm bg-gray-100 px-2 py-1 rounded">Form 4</span>
                  </div>
                  <span className="text-violet-600 font-medium">TSLA</span>
                </div>
                <h4 className="font-medium mb-1">CEO Musk Exercises Options Worth $2.3B</h4>
                <p className="text-gray-600 text-sm">
                  Elon Musk exercised 10.7M stock options at $6.24 per share, immediately selling 
                  6.4M shares to cover tax obligations. Retains 13.4% ownership stake.
                </p>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t text-center">
              <p className="text-gray-600 mb-4">Want to see the full digest?</p>
              <span className="text-violet-600 font-medium">Subscribe above to get weekly summaries</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}