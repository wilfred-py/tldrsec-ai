import Link from "next/link";
import { Button } from "@/components/ui/button";
import Image from "next/image";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-4 md:p-24">
      <div className="max-w-4xl w-full mx-auto text-center space-y-8">
        <h1 className="text-4xl md:text-6xl font-bold text-primary">
          tldrSEC
        </h1>
        <p className="text-xl md:text-2xl text-muted-foreground">
          AI-Powered SEC Filings Summarizer
        </p>
        
        <div className="my-8">
          <h2 className="text-2xl md:text-3xl font-semibold mb-4">
            Never miss critical financial insights again
          </h2>
          <p className="text-lg mb-6">
            Automatically monitor, parse, and summarize SEC filings for your tracked companies.
            Get concise, actionable insights delivered directly to your inbox.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
            <Button asChild size="lg" className="text-lg">
              <Link href="/sign-up">
                Get Started
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="text-lg">
              <Link href="/sign-in">
                Sign In
              </Link>
            </Button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16">
          <div className="p-6 border rounded-lg bg-card">
            <h3 className="font-semibold text-xl mb-2">Real-time Monitoring</h3>
            <p>Hourly checks for new SEC filings matching your tracked companies</p>
          </div>
          
          <div className="p-6 border rounded-lg bg-card">
            <h3 className="font-semibold text-xl mb-2">AI-Powered Insights</h3>
            <p>Advanced AI summarizes complex filings into actionable information</p>
          </div>
          
          <div className="p-6 border rounded-lg bg-card">
            <h3 className="font-semibold text-xl mb-2">Instant Notifications</h3>
            <p>Get immediate alerts or daily digests based on your preferences</p>
          </div>
        </div>
      </div>
    </main>
  );
}
