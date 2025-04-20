import fetch from "node-fetch";
import { JSDOM } from "jsdom";
import { storage } from "../storage";
import { InsertFiling } from "@shared/schema";
import { summarizeFilingContent } from "./claude";
import { sendEmail } from "./email";

const SEC_FILINGS_URL = "https://www.sec.gov/cgi-bin/browse-edgar";

// Array of form types we're interested in
const FORM_TYPES = ["10-K", "10-Q", "8-K", "4"];

export async function monitorSECFilings(): Promise<InsertFiling[]> {
  try {
    const newFilings: InsertFiling[] = [];
    
    // For each form type, check recent filings
    for (const formType of FORM_TYPES) {
      const filings = await fetchLatestFilings(formType);
      
      for (const filing of filings) {
        // Check if this filing already exists in our database
        const existingFiling = await storage.getFilingByUrl(filing.url);
        
        if (!existingFiling) {
          // Add to database
          const savedFiling = await storage.createFiling(filing);
          newFilings.push(filing);
          
          // Process the filing content and generate a summary
          processFilingContent(savedFiling.id, filing.url, filing.formType);
        }
      }
    }
    
    return newFilings;
  } catch (error) {
    console.error("Error monitoring SEC filings:", error);
    return [];
  }
}

async function fetchLatestFilings(formType: string): Promise<InsertFiling[]> {
  try {
    // Use SEC's browse-edgar search to find latest filings of a specific type
    const response = await fetch(`${SEC_FILINGS_URL}?action=getcurrent&type=${formType}&count=100`);
    const html = await response.text();
    
    // Parse the HTML
    const dom = new JSDOM(html);
    const document = dom.window.document;
    
    // Find the table with search results
    const table = document.querySelector(".tableFile2");
    if (!table) return [];
    
    const rows = table.querySelectorAll("tr");
    const filings: InsertFiling[] = [];
    
    // Parse each row to extract filing information
    for (let i = 1; i < rows.length; i++) { // Skip header row
      const row = rows[i];
      const cells = row.querySelectorAll("td");
      
      if (cells.length >= 5) {
        const companyNameCell = cells[1];
        const formTypeCell = cells[2];
        const dateCell = cells[3];
        const linkCell = cells[4];
        
        const companyInfo = companyNameCell.textContent?.trim() || "";
        // Extract ticker from company info (format is often "Company Name (Ticker)")
        const tickerMatch = companyInfo.match(/\(([^)]+)\)/);
        const ticker = tickerMatch ? tickerMatch[1] : "UNKNOWN";
        
        const filingFormType = formTypeCell.textContent?.trim() || "";
        const dateText = dateCell.textContent?.trim() || "";
        const filingDate = new Date(dateText);
        
        // Get the direct link to the filing document
        const detailsLink = linkCell.querySelector("a")?.href;
        if (detailsLink) {
          const documentUrl = `https://www.sec.gov${detailsLink}`;
          
          filings.push({
            ticker,
            formType: filingFormType,
            url: documentUrl,
            filingDate,
          });
        }
      }
    }
    
    return filings;
  } catch (error) {
    console.error(`Error fetching ${formType} filings:`, error);
    return [];
  }
}

async function processFilingContent(filingId: number, url: string, formType: string): Promise<void> {
  try {
    // Update filing status to processing
    await storage.updateFilingStatus(filingId, "processing");
    
    // Fetch the filing document content
    const response = await fetch(url);
    const html = await response.text();
    
    // Extract text content from the HTML
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const textContent = document.body.textContent || "";
    
    // Generate a summary using Claude
    const summaryResult = await summarizeFilingContent(textContent, formType);
    
    if (summaryResult) {
      // Get the filing to access the ticker
      const filing = await storage.getFilingById(filingId);
      
      if (filing) {
        // Create summary in database
        const summary = await storage.createFilingSummary({
          filingId,
          ticker: filing.ticker,
          summary: summaryResult.summary,
          structuredData: summaryResult.structuredData,
        });
        
        // Update filing status to completed
        await storage.updateFilingStatus(filingId, "completed");
        
        // Send email notifications to users who track this ticker
        await sendNotificationsForFiling(filing.ticker, summary.summary, formType);
      }
    } else {
      // Update filing status to failed
      await storage.updateFilingStatus(filingId, "failed");
    }
  } catch (error) {
    console.error(`Error processing filing ${filingId}:`, error);
    // Update filing status to failed
    await storage.updateFilingStatus(filingId, "failed");
  }
}

async function sendNotificationsForFiling(ticker: string, summary: string, formType: string): Promise<void> {
  try {
    // This would be implemented to send notifications via email
    // using the email service

    // For now just log it
    console.log(`Would send notification for ${ticker} ${formType} filing`);
  } catch (error) {
    console.error(`Error sending notifications for ${ticker}:`, error);
  }
}
