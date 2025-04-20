import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { insertTrackedTickerSchema, insertUserSchema, insertUserSettingsSchema } from "@shared/schema";
import { monitorSECFilings } from "./services/sec";
import { sendEmail } from "./services/email";
import { summarizeFilingContent } from "./services/claude";
import { createPaymentIntent, getOrCreateSubscription, cancelSubscription } from "./services/stripe";
import session from "express-session";
import passport from "passport";
import memorystore from "memorystore";
import * as crypto from "crypto";

const MemoryStore = memorystore(session);

// Auth middleware
const requireAuth = (req: Request, res: Response, next: Function) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
};

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up session and auth
  app.use(
    session({
      cookie: { maxAge: 86400000 }, // 24 hours
      store: new MemoryStore({
        checkPeriod: 86400000 // prune expired entries every 24h
      }),
      resave: false,
      saveUninitialized: false,
      secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex")
    })
  );

  // Auth routes
  app.post("/api/auth/register", async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      
      // Check if user already exists
      const existingUser = await storage.getUserByEmail(userData.email);
      if (existingUser) {
        return res.status(400).json({ message: "User with this email already exists" });
      }

      const newUser = await storage.createUser(userData);
      
      // Create default settings
      await storage.createOrUpdateUserSettings({
        userId: newUser.id,
        emailDigestFrequency: "daily",
        emailNotificationsEnabled: true
      });
      
      // Set session
      req.session.userId = newUser.id;
      
      // Remove password from response
      const { password, ...userWithoutPassword } = newUser;
      
      res.status(201).json(userWithoutPassword);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Error creating user" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password required" });
      }
      
      const user = await storage.getUserByEmail(email);
      
      if (!user || user.password !== password) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      
      // Set session
      req.session.userId = user.id;
      
      // Remove password from response
      const { password: _, ...userWithoutPassword } = user;
      
      res.json(userWithoutPassword);
    } catch (error) {
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/auth/oauth", async (req, res) => {
    try {
      const { provider, providerId, email, username } = req.body;
      
      if (!provider || !providerId || !email) {
        return res.status(400).json({ message: "Provider, providerId, and email required" });
      }
      
      // Check if user exists with this provider
      let user = await storage.getUserByProvider(provider, providerId);
      
      // If not, check by email
      if (!user) {
        user = await storage.getUserByEmail(email);
        
        // If still not, create a new user
        if (!user) {
          user = await storage.createUser({
            username: username || email.split('@')[0],
            email,
            provider,
            providerId,
            password: null,
          });
          
          // Create default settings
          await storage.createOrUpdateUserSettings({
            userId: user.id,
            emailDigestFrequency: "daily",
            emailNotificationsEnabled: true
          });
        }
      }
      
      // Set session
      req.session.userId = user.id;
      
      res.json({ 
        id: user.id, 
        username: user.username, 
        email: user.email,
        darkMode: user.darkMode
      });
    } catch (error) {
      res.status(500).json({ message: "OAuth login failed" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    try {
      const user = await storage.getUser(req.session.userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Remove password from response
      const { password, ...userWithoutPassword } = user;
      
      res.json(userWithoutPassword);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // User settings routes
  app.get("/api/settings", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId as number;
      const settings = await storage.getUserSettings(userId);
      
      if (!settings) {
        // Create default settings if not found
        const newSettings = await storage.createOrUpdateUserSettings({
          userId,
          emailDigestFrequency: "daily",
          emailNotificationsEnabled: true
        });
        return res.json(newSettings);
      }
      
      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch settings" });
    }
  });

  app.post("/api/settings", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId as number;
      const settingsData = insertUserSettingsSchema.parse({
        ...req.body,
        userId
      });
      
      const settings = await storage.createOrUpdateUserSettings(settingsData);
      res.json(settings);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update settings" });
    }
  });

  app.post("/api/settings/dark-mode", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId as number;
      const { darkMode } = req.body;
      
      if (typeof darkMode !== 'boolean') {
        return res.status(400).json({ message: "darkMode must be a boolean" });
      }
      
      const user = await storage.updateUserDarkMode(userId, darkMode);
      
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      res.status(500).json({ message: "Failed to update dark mode setting" });
    }
  });

  // Tickers routes
  app.get("/api/tickers", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId as number;
      const tickers = await storage.getTrackedTickers(userId);
      res.json(tickers);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch tickers" });
    }
  });

  app.post("/api/tickers", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId as number;
      
      const tickerData = insertTrackedTickerSchema.parse({
        ...req.body,
        userId
      });
      
      // Check if ticker is already tracked by this user
      const existingTicker = await storage.getTrackedTickersByTicker(userId, tickerData.ticker);
      
      if (existingTicker) {
        return res.status(400).json({ message: "Ticker already tracked" });
      }
      
      const ticker = await storage.addTrackedTicker(tickerData);
      res.status(201).json(ticker);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to add ticker" });
    }
  });

  app.delete("/api/tickers/:id", requireAuth, async (req, res) => {
    try {
      const tickerId = parseInt(req.params.id);
      
      if (isNaN(tickerId)) {
        return res.status(400).json({ message: "Invalid ticker ID" });
      }
      
      await storage.removeTrackedTicker(tickerId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to remove ticker" });
    }
  });

  // Filings and summaries routes
  app.get("/api/filings", requireAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = parseInt(req.query.offset as string) || 0;
      
      const filings = await storage.getFilings(limit, offset);
      res.json(filings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch filings" });
    }
  });

  app.get("/api/filings/:ticker", requireAuth, async (req, res) => {
    try {
      const ticker = req.params.ticker;
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = parseInt(req.query.offset as string) || 0;
      
      const filings = await storage.getFilingsByTicker(ticker, limit, offset);
      res.json(filings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch filings for ticker" });
    }
  });

  app.get("/api/summaries", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId as number;
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = parseInt(req.query.offset as string) || 0;
      
      const summaries = await storage.getFilingSummaries(userId, limit, offset);
      res.json(summaries);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch summaries" });
    }
  });

  app.get("/api/summaries/:filingId", requireAuth, async (req, res) => {
    try {
      const filingId = parseInt(req.params.filingId);
      
      if (isNaN(filingId)) {
        return res.status(400).json({ message: "Invalid filing ID" });
      }
      
      const summary = await storage.getFilingSummary(filingId);
      
      if (!summary) {
        return res.status(404).json({ message: "Summary not found" });
      }
      
      res.json(summary);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch summary" });
    }
  });

  // Search for tickers - simulated for now, would connect to a real API
  app.get("/api/search/tickers", async (req, res) => {
    try {
      const query = (req.query.q as string || "").toUpperCase();
      
      // Return empty array if query is too short
      if (query.length < 2) {
        return res.json([]);
      }
      
      // Mock ticker data based on common US stocks
      const mockTickers = [
        { ticker: "AAPL", companyName: "Apple Inc." },
        { ticker: "MSFT", companyName: "Microsoft Corporation" },
        { ticker: "GOOGL", companyName: "Alphabet Inc." },
        { ticker: "AMZN", companyName: "Amazon.com Inc." },
        { ticker: "TSLA", companyName: "Tesla Inc." },
        { ticker: "META", companyName: "Meta Platforms Inc." },
        { ticker: "NVDA", companyName: "NVIDIA Corporation" },
        { ticker: "JPM", companyName: "JPMorgan Chase & Co." },
        { ticker: "V", companyName: "Visa Inc." },
        { ticker: "WMT", companyName: "Walmart Inc." }
      ];
      
      // Filter based on query
      const results = mockTickers.filter(
        t => t.ticker.includes(query) || t.companyName.toUpperCase().includes(query)
      );
      
      res.json(results);
    } catch (error) {
      res.status(500).json({ message: "Search failed" });
    }
  });

  // Stats routes
  app.get("/api/stats", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId as number;
      
      // Get ticker count
      const tickers = await storage.getTrackedTickers(userId);
      
      // Get user settings for email digest frequency
      const settings = await storage.getUserSettings(userId);
      
      // Get count of new summaries (just for UI purposes, simulated)
      // In a real app, we would track which summaries the user has viewed
      
      res.json({
        trackedTickers: tickers.length,
        newSummaries: Math.min(tickers.length * 2, 10), // Just simulated data
        emailDigests: settings?.emailDigestFrequency || "daily"
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  // Manual cron endpoint for testing the SEC monitoring
  app.post("/api/cron/monitor-sec", async (req, res) => {
    try {
      const newFilings = await monitorSECFilings();
      res.json({ message: `Processed ${newFilings.length} new filings` });
    } catch (error) {
      res.status(500).json({ message: "Failed to run SEC monitoring job" });
    }
  });

  // Stripe payment routes
  app.post("/api/create-payment-intent", requireAuth, async (req, res) => {
    try {
      const { amount } = req.body;
      
      if (!amount || typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ message: "Valid amount is required" });
      }
      
      const result = await createPaymentIntent(amount);
      
      if (!result.clientSecret) {
        return res.status(500).json({ message: "Failed to create payment intent" });
      }
      
      res.json({ clientSecret: result.clientSecret });
    } catch (error) {
      console.error("Payment intent error:", error);
      res.status(500).json({ message: "Error creating payment intent" });
    }
  });
  
  app.post("/api/subscriptions", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId as number;
      const result = await getOrCreateSubscription(userId);
      
      if (!result.clientSecret) {
        return res.status(500).json({ message: "Failed to create subscription" });
      }
      
      res.json({
        subscriptionId: result.subscriptionId,
        clientSecret: result.clientSecret
      });
    } catch (error) {
      console.error("Subscription error:", error);
      res.status(500).json({ message: "Error creating subscription" });
    }
  });
  
  app.delete("/api/subscriptions", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId as number;
      const success = await cancelSubscription(userId);
      
      if (!success) {
        return res.status(500).json({ message: "Failed to cancel subscription" });
      }
      
      res.json({ message: "Subscription cancelled successfully" });
    } catch (error) {
      console.error("Subscription cancellation error:", error);
      res.status(500).json({ message: "Error cancelling subscription" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
