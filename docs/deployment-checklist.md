# Production Deployment Checklist

## Pre-Deployment

- [ ] All tests pass locally: `npm run test`
- [ ] E2E tests pass: `npm run test:e2e`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`

## Environment Variables

### Required Supabase Variables
- [ ] `NEXT_PUBLIC_SUPABASE_URL` set in Vercel (Production)
- [ ] `SUPABASE_SECRET_KEY` set in Vercel (Production) — service-role key, server-side only

### Required Email Variables
- [ ] `RESEND_API_KEY` set in Vercel (Production)

### Required Auth Variables
- [ ] `CLERK_SECRET_KEY` set in Vercel (Production)
- [ ] `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` set in Vercel (Production)

### Required AI Variables
- [ ] `ANTHROPIC_API_KEY` set in Vercel (Production)

### Required Database Variables
- [ ] `DATABASE_URL` set in Vercel (Production)

## Supabase Configuration

- [ ] RLS policies updated for `page_analytics` table
- [ ] Service role key has not expired
- [ ] Supabase project is active (not paused)

## Post-Deployment Verification

### Automated Tests
```bash
npm run test:production-waitlist
```

### Manual Browser Tests

1. **Waitlist Form Submission**:
   - Visit: https://tldrsec.app
   - Scroll to waitlist form
   - Enter a valid email address
   - Click "Join Waitlist" or "Get Early Access"
   - Verify success message appears
   - Check email inbox for confirmation

2. **Analytics Tracking** (Chrome DevTools):
   - Open DevTools → Network tab
   - Visit https://tldrsec.app
   - Submit waitlist form
   - Filter network requests for "supabase"
   - Verify page_analytics INSERT requests return 201 (not 401)

3. **Error Handling**:
   - Visit https://tldrsec.app
   - Submit same email twice
   - Verify "already subscribed" message appears
   - Open DevTools → Console
   - Verify no JavaScript errors

### Supabase Dashboard Verification

1. Navigate to: https://app.supabase.com/project/ipwlykhekrjfvejduotm
2. Check **newsletter_subscribers** table:
   - Recent entries exist
   - Emails are correctly formatted
   - Source and UTM parameters captured
3. Check **page_analytics** table:
   - Recent 'signup_attempt' and 'signup_success' actions
   - Visitor IDs are consistent per session
   - User agents and referrers captured

### Rollback Procedure

If issues are detected post-deployment:

1. **Immediate rollback via Vercel**:
   ```bash
   vercel rollback
   ```

2. **Revert RLS policy changes** (if analytics still failing):
   - Log into Supabase dashboard
   - Navigate to Database → Policies → page_analytics
   - Temporarily disable new policies
   - Re-enable old policy or create restrictive policy

3. **Verify environment variables**:
   ```bash
   vercel env ls
   # Check all SUPABASE_* variables
   ```

4. **Monitor error logs**:
   - Vercel Dashboard → Logs
   - Filter for 401 and 500 errors
   - Check Supabase Dashboard → Logs
