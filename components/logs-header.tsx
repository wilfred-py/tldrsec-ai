"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmailSummaryButton } from "@/components/email-summary-button";
import { Heading } from "@/components/ui/heading";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Header component for the logs page with email summary functionality
 */
export function LogsHeader() {
  return (
    <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
      <div>
        <Heading title="SEC Filing Logs" description="View and manage your SEC filing summaries" />
      </div>
      <div className="flex items-center gap-2">
        <EmailSummaryButton />
      </div>
    </div>
  );
}

/**
 * Tabs component for the logs page
 */
export function LogsTabs({ 
  defaultTab = "all",
  onTabChange
}: { 
  defaultTab?: string;
  onTabChange?: (value: string) => void;
}) {
  return (
    <Tabs defaultValue={defaultTab} className="w-full" onValueChange={onTabChange}>
      <TabsList className="grid w-full grid-cols-4 md:w-auto">
        <TabsTrigger value="all">All Filings</TabsTrigger>
        <TabsTrigger value="10k">10-K</TabsTrigger>
        <TabsTrigger value="10q">10-Q</TabsTrigger>
        <TabsTrigger value="8k">8-K</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
