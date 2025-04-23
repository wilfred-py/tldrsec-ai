import { 
  users, type User, type InsertUser, 
  trackedTickers, type TrackedTicker, type InsertTrackedTicker,
  filings, type Filing, type InsertFiling,
  filingSummaries, type FilingSummary, type InsertFilingSummary,
  userSettings, type UserSettings, type InsertUserSettings
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql } from "drizzle-orm";

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByProvider(provider: string, providerId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserDarkMode(userId: number, darkMode: boolean): Promise<User>;
  updateLastLoginAt(userId: number, lastLoginAt: string): Promise<User>;
  updateStripeCustomerId(userId: number, customerId: string | null): Promise<User>;
  updateStripeSubscriptionId(userId: number, subscriptionId: string | null): Promise<User>;
  updateSubscriptionStatus(userId: number, status: string): Promise<User>;

  // Tracked tickers methods
  getTrackedTickers(userId: number): Promise<TrackedTicker[]>;
  getTrackedTickersByTicker(userId: number, ticker: string): Promise<TrackedTicker | undefined>;
  addTrackedTicker(trackedTicker: InsertTrackedTicker): Promise<TrackedTicker>;
  removeTrackedTicker(id: number): Promise<void>;
  
  // Filings methods
  getFilings(limit?: number, offset?: number): Promise<Filing[]>;
  getFilingsByTicker(ticker: string, limit?: number, offset?: number): Promise<Filing[]>;
  getFilingById(id: number): Promise<Filing | undefined>;
  getFilingByUrl(url: string): Promise<Filing | undefined>;
  createFiling(filing: InsertFiling): Promise<Filing>;
  updateFilingStatus(id: number, status: string): Promise<Filing>;
  
  // Filing summaries methods
  getFilingSummary(filingId: number): Promise<FilingSummary | undefined>;
  getFilingSummaries(userId: number, limit?: number, offset?: number): Promise<FilingSummary[]>;
  createFilingSummary(summary: InsertFilingSummary): Promise<FilingSummary>;
  
  // User settings methods
  getUserSettings(userId: number): Promise<UserSettings | undefined>;
  createOrUpdateUserSettings(settings: InsertUserSettings): Promise<UserSettings>;
}

export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByProvider(provider: string, providerId: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.provider, provider), eq(users.providerId, providerId)));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async updateUserDarkMode(userId: number, darkMode: boolean): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ darkMode })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }
  
  async updateLastLoginAt(userId: number, lastLoginAt: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ lastLoginAt })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }
  
  async updateStripeCustomerId(userId: number, customerId: string | null): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ stripeCustomerId: customerId })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }
  
  async updateStripeSubscriptionId(userId: number, subscriptionId: string | null): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ 
        stripeSubscriptionId: subscriptionId,
        // Update subscription status based on presence of subscription ID
        subscriptionStatus: subscriptionId ? 'premium' : 'free'
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }
  
  async updateSubscriptionStatus(userId: number, status: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ subscriptionStatus: status })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  // Tracked tickers methods
  async getTrackedTickers(userId: number): Promise<TrackedTicker[]> {
    return db
      .select()
      .from(trackedTickers)
      .where(eq(trackedTickers.userId, userId))
      .orderBy(desc(trackedTickers.createdAt));
  }

  async getTrackedTickersByTicker(userId: number, ticker: string): Promise<TrackedTicker | undefined> {
    const [result] = await db
      .select()
      .from(trackedTickers)
      .where(and(eq(trackedTickers.userId, userId), eq(trackedTickers.ticker, ticker)));
    return result;
  }

  async addTrackedTicker(insertTrackedTicker: InsertTrackedTicker): Promise<TrackedTicker> {
    const [trackedTicker] = await db
      .insert(trackedTickers)
      .values(insertTrackedTicker)
      .returning();
    return trackedTicker;
  }

  async removeTrackedTicker(id: number): Promise<void> {
    await db.delete(trackedTickers).where(eq(trackedTickers.id, id));
  }

  // Filings methods
  async getFilings(limit = 10, offset = 0): Promise<Filing[]> {
    return db
      .select()
      .from(filings)
      .orderBy(desc(filings.filingDate))
      .limit(limit)
      .offset(offset);
  }

  async getFilingsByTicker(ticker: string, limit = 10, offset = 0): Promise<Filing[]> {
    return db
      .select()
      .from(filings)
      .where(eq(filings.ticker, ticker))
      .orderBy(desc(filings.filingDate))
      .limit(limit)
      .offset(offset);
  }

  async getFilingById(id: number): Promise<Filing | undefined> {
    const [filing] = await db.select().from(filings).where(eq(filings.id, id));
    return filing;
  }

  async getFilingByUrl(url: string): Promise<Filing | undefined> {
    const [filing] = await db.select().from(filings).where(eq(filings.url, url));
    return filing;
  }

  async createFiling(insertFiling: InsertFiling): Promise<Filing> {
    const [filing] = await db
      .insert(filings)
      .values(insertFiling)
      .returning();
    return filing;
  }

  async updateFilingStatus(id: number, status: string): Promise<Filing> {
    const [filing] = await db
      .update(filings)
      .set({ processingStatus: status })
      .where(eq(filings.id, id))
      .returning();
    return filing;
  }

  // Filing summaries methods
  async getFilingSummary(filingId: number): Promise<FilingSummary | undefined> {
    const [summary] = await db
      .select()
      .from(filingSummaries)
      .where(eq(filingSummaries.filingId, filingId));
    return summary;
  }

  async getFilingSummaries(userId: number, limit = 10, offset = 0): Promise<FilingSummary[]> {
    const userTickersList = await db.select({ ticker: trackedTickers.ticker })
      .from(trackedTickers)
      .where(eq(trackedTickers.userId, userId));
    
    const tickers = userTickersList.map(t => t.ticker);
    
    if (tickers.length === 0) {
      return [];
    }
    
    return db
      .select()
      .from(filingSummaries)
      .where(sql`${filingSummaries.ticker} IN ${tickers}`)
      .orderBy(desc(filingSummaries.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async createFilingSummary(insertSummary: InsertFilingSummary): Promise<FilingSummary> {
    const [summary] = await db
      .insert(filingSummaries)
      .values(insertSummary)
      .returning();
    return summary;
  }

  // User settings methods
  async getUserSettings(userId: number): Promise<UserSettings | undefined> {
    const [settings] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId));
    return settings;
  }

  async createOrUpdateUserSettings(settings: InsertUserSettings): Promise<UserSettings> {
    const existing = await this.getUserSettings(settings.userId);
    
    if (existing) {
      const [updated] = await db
        .update(userSettings)
        .set(settings)
        .where(eq(userSettings.userId, settings.userId))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(userSettings)
        .values(settings)
        .returning();
      return created;
    }
  }
}

export const storage = new DatabaseStorage();
