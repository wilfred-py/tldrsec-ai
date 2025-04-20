import { pgTable, text, serial, integer, boolean, timestamp, jsonb, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";
import { z } from "zod";

// Users
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password"),
  provider: text("provider"),
  providerId: text("provider_id"),
  darkMode: boolean("dark_mode").default(false),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionStatus: text("subscription_status").default("free"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  trackedTickers: many(trackedTickers),
}));

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

// Tracked Tickers
export const trackedTickers = pgTable("tracked_tickers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  ticker: text("ticker").notNull(),
  companyName: text("company_name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const trackedTickersRelations = relations(trackedTickers, ({ one }) => ({
  user: one(users, {
    fields: [trackedTickers.userId],
    references: [users.id],
  }),
}));

export const insertTrackedTickerSchema = createInsertSchema(trackedTickers).omit({
  id: true,
  createdAt: true,
});

// SEC Filings
export const filings = pgTable("filings", {
  id: serial("id").primaryKey(),
  ticker: text("ticker").notNull(),
  formType: text("form_type").notNull(),
  url: text("url").notNull().unique(),
  filingDate: timestamp("filing_date").notNull(),
  processingStatus: text("processing_status").notNull().default("queued"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFilingSchema = createInsertSchema(filings).omit({
  id: true,
  processingStatus: true,
  createdAt: true,
});

// Filing Summaries
export const filingSummaries = pgTable("filing_summaries", {
  id: serial("id").primaryKey(),
  filingId: integer("filing_id").notNull().references(() => filings.id, { onDelete: "cascade" }),
  ticker: text("ticker").notNull(),
  summary: text("summary").notNull(),
  structuredData: jsonb("structured_data"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const filingSummariesRelations = relations(filingSummaries, ({ one }) => ({
  filing: one(filings, {
    fields: [filingSummaries.filingId],
    references: [filings.id],
  }),
}));

export const insertFilingSummarySchema = createInsertSchema(filingSummaries).omit({
  id: true,
  createdAt: true,
});

// User Settings
export const userSettings = pgTable("user_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  emailDigestFrequency: varchar("email_digest_frequency", { length: 20 }).notNull().default("daily"),
  emailNotificationsEnabled: boolean("email_notifications_enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userSettingsRelations = relations(userSettings, ({ one }) => ({
  user: one(users, {
    fields: [userSettings.userId],
    references: [users.id],
  }),
}));

export const insertUserSettingsSchema = createInsertSchema(userSettings).omit({
  id: true,
  createdAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type TrackedTicker = typeof trackedTickers.$inferSelect;
export type InsertTrackedTicker = z.infer<typeof insertTrackedTickerSchema>;

export type Filing = typeof filings.$inferSelect;
export type InsertFiling = z.infer<typeof insertFilingSchema>;

export type FilingSummary = typeof filingSummaries.$inferSelect;
export type InsertFilingSummary = z.infer<typeof insertFilingSummarySchema>;

export type UserSettings = typeof userSettings.$inferSelect;
export type InsertUserSettings = z.infer<typeof insertUserSettingsSchema>;
