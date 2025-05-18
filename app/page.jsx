import Link from "next/link";
import { SignUpButton } from "@/components/auth";
import { Button } from "@/components/ui";
export default function Home() {
    return (<div className="flex flex-col items-center">
      <section className="w-full py-12 md:py-24 lg:py-32">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl lg:text-6xl">
              AI-Powered Summaries for SEC Filings
            </h1>
            <p className="max-w-[700px] text-gray-500 dark:text-gray-400 md:text-xl">
              Never miss important insights from SEC filings again. Get concise, AI-generated summaries for your tracked tickers.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <SignUpButton />
              <Button variant="outline" asChild>
                <Link href="/about">Learn More</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
      
      <section className="w-full py-12 md:py-24 lg:py-32 bg-gray-50 dark:bg-gray-900">
        <div className="container px-4 md:px-6">
          <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-3">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="rounded-full bg-primary p-2 text-primary-foreground">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
              </div>
              <h3 className="text-xl font-bold">SEC Filing Monitoring</h3>
              <p className="text-gray-500 dark:text-gray-400">
                Automatically track and monitor new SEC filings for your watchlist.
              </p>
            </div>
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="rounded-full bg-primary p-2 text-primary-foreground">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                  <circle cx="12" cy="12" r="10"/>
                  <polygon points="10 8 16 12 10 16 10 8"/>
                </svg>
              </div>
              <h3 className="text-xl font-bold">AI Summarization</h3>
              <p className="text-gray-500 dark:text-gray-400">
                Claude AI distills lengthy filings into concise, actionable summaries.
              </p>
            </div>
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="rounded-full bg-primary p-2 text-primary-foreground">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
              </div>
              <h3 className="text-xl font-bold">Email Notifications</h3>
              <p className="text-gray-500 dark:text-gray-400">
                Get instant or digest notifications when important filings are summarized.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>);
}
