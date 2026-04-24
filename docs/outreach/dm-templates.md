# Outreach DM Templates

**Date:** 2026-04-17
**Goal:** 50 DMs over 5 business days. Track response rate, trial signups (via UTM), paid conversions.

---

## Three rules (read before sending)

1. **T1 is a REPLY, not a cold message.** Only use T1 when someone is already complaining about filing complexity in a thread. Cold-DMing strangers on Reddit is how accounts get auto-banned.
2. **Always personalize the first line.** Templates are skeletons, not scripts. If you can't find something specific about the prospect, skip them.
3. **Track every send** in `.claude/outreach/prospect-list.md` (gitignored). If it's not tracked, it didn't happen.

---

## Pain-language bank (verbatim from research)

Use the prospect's own words when you see them. If they haven't said it, borrow from the list:

- "patience-testing, eye-glazing, data drudgery"
- "300 pages" / "150+ pages"
- "days, if not weeks" (to analyze a filing)
- "difficult for retail investors to understand at first blush"
- "dry and less appealing for the general public"
- "hard to keep up with multiple stocks and SEC filings in their portfolios"

Source: `.claude/analysis/user-pain-points-and-quotes.md`, `.claude/analysis/reddit-sec-filing-pain-points-research.md`.

---

## T1 — Reddit reply

**Where:** r/investing, r/stocks, r/SecurityAnalysis
**When:** someone is complaining about filing complexity, length, or time burden. Not general investing chat.

### Template

> [Acknowledge their specific pain using their own words — 1 sentence. If they said "300 pages", repeat "300 pages".]
>
> Built tldrSEC for exactly this. Summarizes [10-K / 10-Q / 8-K / Form 4 — pick whichever they're stuck on] and emails the material bits. 7-day free trial, no card required.
>
> [UTM URL — see below]
>
> Happy to answer questions if useful.

### UTM URL (T1)

```
https://tldrsec.app/?utm_source=reddit&utm_medium=dm&utm_campaign=outreach&utm_content=t1-{threadslug}
```

Replace `{threadslug}` with a short identifier for the thread (e.g., `t1-10k-tesla-q3`). Per-thread content tags let you see which threads actually converted.

### Anti-ban checklist (Reddit specific)

- Account age: at least 30 days old, some karma in finance subs
- Never post the same link in 2+ threads within 24h
- If auto-moderator removes your comment, do not repost — try a different thread
- Space replies: max 3 per day across all subs

---

## T2 — Twitter / X DM

**Where:** finance Twitter / FinTwit
**When:** account has posted something specific about a filing you can reference — not general market commentary.

### Template

> Saw your [tweet / thread] on [specific filing or company they referenced]. That kind of close-read is exactly what most retail investors skip because 10-Ks run [150+ pages / are jargon-heavy — pick what matches their content].
>
> Built a tool that auto-summarizes filings and emails them. Sending trials to a small cohort this week — want one?
>
> [UTM URL — see below]

### UTM URL (T2)

```
https://tldrsec.app/?utm_source=twitter&utm_medium=dm&utm_campaign=outreach&utm_content=t2
```

### Anti-ban checklist (Twitter/X specific)

- Don't DM locked accounts or accounts you don't follow
- Don't DM 10+ strangers in the same hour
- If they don't follow back within 48h, don't send follow-up (see follow-up rules below)

---

## T3 — LinkedIn DM

**Where:** LinkedIn
**When:** equity research associates, junior analysts, buy-side associates at mid-cap firms. Professional framing, no emoji.

### Template

> [Their firm] + [specific workflow they'd recognize] opener. Example: "Saw you're covering industrials at [firm] — the earnings-season filing volume on that sector is brutal."
>
> Built tldrSEC to cut the "days, if not weeks" problem analysts hit reading filings across coverage. Retail-priced but the output is the same AI-summarized filings the big tools produce — just without the $10K/year platform fee.
>
> Trial link if it saves you even one long read:
>
> [UTM URL — see below]

### UTM URL (T3)

```
https://tldrsec.app/?utm_source=linkedin&utm_medium=dm&utm_campaign=outreach&utm_content=t3
```

### Anti-ban checklist (LinkedIn specific)

- Connection request first (with a short note) is higher-converting than InMail
- Don't pitch in the connection note — pitch after they accept
- Skip anyone more senior than VP — DMs to senior folks get ignored, not banned

---

## Follow-up (send ONCE, 4 days later, no reply)

**Rule:** One follow-up. Never two. If they ignored the first and the follow-up, move on.

### Template

> Quick follow-up on the [tldrSEC / SEC summaries] note — no pressure, just didn't want it to get buried.
>
> Link still works: [same UTM URL as the original message]

That's it. No new pitch. No "just checking in." No emoji.

---

## Daily cadence

- 10 DMs/day × 5 business days = 50 total
- Space sends ~45 min apart
- Track each send immediately in `.claude/outreach/prospect-list.md`
- End each day: update response column on yesterday's sends

---

## Pre-registered failure mode

If 50 DMs produce zero responses, the message-market fit is wrong. **Don't scale.** Revisit T1/T2/T3 copy against pain quotes, try a different hook, send another 10, re-evaluate. Do not send 100 more of the same thing.

---

## Attribution verification

After a DM batch:

1. Check Supabase `page_analytics` table for rows with `utm_campaign='outreach'`
2. Rows should appear within minutes of a landing page visit
3. Match `utm_content` back to the prospect list to attribute conversions

Future: PostHog funnel (from W2) will link UTM visits → trial signups → paid conversions automatically.
