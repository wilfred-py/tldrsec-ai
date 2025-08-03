import Link from "next/link";
import Script from "next/script";
import { ArrowRight, BarChart3, BookOpenText, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

// Force server component
export default function Home() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "tldrSEC",
    "applicationCategory": "FinanceApplication",
    "operatingSystem": "Web",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD"
    },
    "description": "AI-powered summaries of SEC filings to help investors make better decisions faster."
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Structured Data */}
      <Script id="structured-data" type="application/ld+json" 
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} 
      />
      
      {/* Navigation */}
      <header className="container z-40 bg-background">
        <div className="flex h-20 items-center justify-between py-6">
          <div className="flex gap-6 md:gap-10">
            <Link href="/" className="flex items-center space-x-2">
              <span className="font-bold text-2xl">tldrSEC</span>
            </Link>
          </div>
          <nav className="flex gap-6">
            <Link 
              href="/sign-up" 
              className="hover:text-primary text-muted-foreground transition-colors"
            >
              Sign Up
            </Link>
            <Link 
              href="/sign-in" 
              className="hover:text-primary text-muted-foreground transition-colors"
            >
              Sign In
            </Link>
          </nav>
        </div>
      </header>
      
      {/* Hero Section */}
      <section className="space-y-6 pb-8 pt-6 md:pb-12 md:pt-10 lg:py-32">
        <div className="container flex max-w-[64rem] flex-col items-center gap-4 text-center">
          <div className="rounded-full bg-muted px-4 py-1.5 text-sm font-medium">
            SEC filings, simplified
          </div>
          <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl md:text-6xl lg:text-7xl">
            Understanding SEC Filings <span className="text-primary">Made Simple</span>
          </h1>
          <p className="max-w-[42rem] leading-normal text-muted-foreground sm:text-xl sm:leading-8">
            Cut through complex financial statements with AI-powered insights. Get accurate, 
            concise summaries of US company filings delivered instantly.
          </p>
          <div className="space-x-4">
            <Button asChild size="lg" className="mt-4">
              <Link href="/sign-up">
                Get Started <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="mt-4">
              <Link href="#how-it-works">
                Learn More
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section 
        id="features" 
        className="container space-y-6 bg-slate-50 py-8 dark:bg-transparent md:py-12 lg:py-24"
      >
        <div className="mx-auto flex max-w-[58rem] flex-col items-center space-y-4 text-center">
          <h2 className="text-3xl font-bold leading-[1.1] sm:text-3xl md:text-5xl">
            Save Hours Analyzing Financial Documents
          </h2>
          <p className="max-w-[85%] leading-normal text-muted-foreground sm:text-lg sm:leading-7">
            Our AI-powered platform extracts key insights from complex SEC filings, delivering 
            clear, actionable summaries in seconds.
          </p>
        </div>
        <div className="mx-auto grid justify-center gap-4 sm:grid-cols-2 md:max-w-[64rem] md:grid-cols-3">
          <div className="relative overflow-hidden rounded-lg border bg-background p-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Search className="h-8 w-8 text-primary" />
            </div>
            <h3 className="mt-4 text-xl font-bold">Instant Analysis</h3>
            <p className="mt-2 text-muted-foreground">
              Get the key information from 10-K, 10-Q, and 8-K filings without reading hundreds of pages.
            </p>
          </div>
          <div className="relative overflow-hidden rounded-lg border bg-background p-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <BarChart3 className="h-8 w-8 text-primary" />
            </div>
            <h3 className="mt-4 text-xl font-bold">Financial Trends</h3>
            <p className="mt-2 text-muted-foreground">
              Track company performance over time with historical filing analysis and key metrics.
            </p>
          </div>
          <div className="relative overflow-hidden rounded-lg border bg-background p-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <BookOpenText className="h-8 w-8 text-primary" />
            </div>
            <h3 className="mt-4 text-xl font-bold">Simplified Insights</h3>
            <p className="mt-2 text-muted-foreground">
              Complex financial statements translated into clear, actionable insights.
            </p>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section 
        id="how-it-works" 
        className="container space-y-6 py-8 md:py-12 lg:py-24"
      >
        <div className="mx-auto flex max-w-[58rem] flex-col items-center space-y-4 text-center">
          <h2 className="text-3xl font-bold leading-[1.1] sm:text-3xl md:text-5xl">
            How It Works
          </h2>
          <p className="max-w-[85%] leading-normal text-muted-foreground sm:text-lg sm:leading-7">
            Three simple steps to transforming complex SEC documents into actionable insights
          </p>
        </div>
        <div className="mx-auto grid justify-center gap-8 sm:grid-cols-2 lg:grid-cols-3 md:max-w-[64rem]">
          <div className="flex flex-col items-center space-y-2 p-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white text-2xl font-bold">
              1
            </div>
            <h3 className="text-xl font-bold text-center">Add Your Tickers</h3>
            <p className="text-center text-muted-foreground">
              Simply add the company symbols you want to track. We&apos;ll monitor their SEC filings automatically.
            </p>
          </div>
          <div className="flex flex-col items-center space-y-2 p-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white text-2xl font-bold">
              2
            </div>
            <h3 className="text-xl font-bold text-center">Receive Summaries</h3>
            <p className="text-center text-muted-foreground">
              Our AI analyzes and summarizes new filings as they&apos;re published, highlighting key information.
            </p>
          </div>
          <div className="flex flex-col items-center space-y-2 p-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white text-2xl font-bold">
              3
            </div>
            <h3 className="text-xl font-bold text-center">Make Better Decisions</h3>
            <p className="text-center text-muted-foreground">
              Use the insights to inform your investment research and business decisions faster than ever.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container py-8 md:py-12 lg:py-24">
        <div className="mx-auto max-w-[58rem] flex flex-col items-center justify-center gap-6 rounded-lg bg-primary px-8 py-12 text-center text-white">
          <h2 className="text-3xl font-bold leading-[1.1] sm:text-3xl md:text-4xl">
            Start Understanding SEC Filings Today
          </h2>
          <p className="max-w-[85%] leading-normal sm:text-lg sm:leading-7">
            Join investors and analysts who save hours of research time with our AI-powered SEC filing summaries.
          </p>
          <Button asChild size="lg" variant="secondary" className="mt-4">
            <Link href="/sign-up">
              Create Your Free Account <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-slate-50 py-8 dark:bg-transparent">
        <div className="container flex flex-col items-center justify-between gap-4 md:flex-row">
          <p className="text-center text-sm leading-loose text-muted-foreground">
            &copy; {new Date().getFullYear()} tldrSEC. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="text-sm text-muted-foreground hover:text-primary">
              Privacy
            </Link>
            <Link href="/terms" className="text-sm text-muted-foreground hover:text-primary">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
