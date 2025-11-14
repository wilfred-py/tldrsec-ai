# Supabase RLS Policy Update Guide

## Summary of Test Results

Based on your browser console test, the current state is:

- ❌ **INSERT**: FAILED (400 Bad Request) - Tried to use non-existent `metadata` column
- ❌ **SELECT**: FAILED (200 OK) - Anonymous users can read data (security issue!)
- ❌ **UPDATE**: FAILED (400 Bad Request) - Schema error
- ❌ **DELETE**: FAILED (200 OK) - Anonymous users can delete data (security issue!)

## Root Cause

The Supabase database RLS policies have NOT been updated yet. The current policies either:
1. Allow all operations (insecure)
2. Block all operations (too restrictive)

We need to configure the policies to:
- ✅ Allow anonymous INSERT (for analytics tracking)
- ❌ Block anonymous SELECT (prevent data reading)
- ❌ Block anonymous UPDATE (prevent data modification)
- ❌ Block anonymous DELETE (prevent data deletion)
- ✅ Allow service_role full access (for admin dashboards)

---

## Step-by-Step Instructions

### Step 1: Access Supabase Dashboard

1. Open browser and go to: **https://app.supabase.com**
2. Log in with your credentials
3. Select project: **ipwlykhekrjfvejduotm** (tldrsec-ai)

### Step 2: Navigate to RLS Policies

1. In the left sidebar, click **Database**
2. Click **Policies** (in the Database submenu)
3. You should see a list of tables with their policies

### Step 3: Locate page_analytics Table

1. Scroll down or use search to find: **page_analytics**
2. Click on **page_analytics** to expand its policies
3. You'll see existing policies (if any)

### Step 4: Delete ALL Existing Policies

**IMPORTANT**: Delete all existing policies on `page_analytics` first:

1. For each policy listed:
   - Click the **three dots** (⋯) menu on the right
   - Select **Delete policy**
   - Confirm deletion
2. Verify the table shows "No policies" or empty state

### Step 5: Create Policy #1 - Allow Anonymous Inserts

This policy allows anyone to INSERT analytics data:

1. Click **New Policy** button (or **Create policy**)
2. Choose **Create a policy from scratch** (not a template)
3. Fill in the form:

   **Policy Name**: `Allow anonymous inserts`

   **Policy Command**: Select **INSERT** from dropdown

   **Target Roles**:
   - Check ✅ **public** (this includes anon and authenticated)
   - OR check both ✅ **anon** and ✅ **authenticated**

   **USING expression**: Leave empty (not used for INSERT)

   **WITH CHECK expression**:
   ```sql
   true
   ```

4. Click **Review** and then **Save policy**
5. Verify the policy appears in the list and is **Enabled** (toggle should be ON)

### Step 6: Create Policy #2 - Service Role Full Access

This policy allows admin/backend full access:

1. Click **New Policy** button again
2. Choose **Create a policy from scratch**
3. Fill in the form:

   **Policy Name**: `Service role full access`

   **Policy Command**: Select **ALL** from dropdown

   **Target Roles**:
   - Check ✅ **service_role**
   - Uncheck everything else

   **USING expression**:
   ```sql
   (auth.role() = 'service_role')
   ```

   **WITH CHECK expression**:
   ```sql
   (auth.role() = 'service_role')
   ```

4. Click **Review** and then **Save policy**
5. Verify the policy appears in the list and is **Enabled**

### Step 7: Verify Policies Are Active

You should now see TWO policies for `page_analytics`:

| Policy Name | Command | Enabled |
|------------|---------|---------|
| Allow anonymous inserts | INSERT | ✅ ON |
| Service role full access | ALL | ✅ ON |

---

## Step 8: Test the Policies

Now run the CORRECTED test in your browser console:

### Open Console Test

1. Visit **https://tldrsec.app**
2. Press **F12** (Windows/Linux) or **Cmd+Opt+J** (Mac)
3. Copy and paste this script:

```javascript
(async function testSupabaseRLS() {
  const SUPABASE_URL = 'https://ipwlykhekrjfvejduotm.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlwd2x5a2hla3JqZnZlamR1b3RtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxNzc0NjcsImV4cCI6MjA3Nzc1MzQ2N30.iaUCubLO0PeJoPsO9h59ZfotFDraygpU0PqDi6KOw5I';

  const supabaseRequest = async (method, path, body = null) => {
    const options = {
      method,
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(`${SUPABASE_URL}/rest/v1${path}`, options);
    const data = await response.json().catch(() => null);
    return { status: response.status, ok: response.ok, data };
  };

  console.log('Testing RLS Policies...\n');

  // Test 1: INSERT (should succeed)
  const insertResult = await supabaseRequest('POST', '/page_analytics', {
    page_variant: 'test',
    action: 'rls_test',
    visitor_id: `test-${Date.now()}`,
    user_agent: navigator.userAgent,
    referrer: 'manual_test'
  });
  console.log(`1. INSERT: ${insertResult.status === 201 ? '✅ PASS' : '❌ FAIL'} (${insertResult.status})`);

  // Test 2: SELECT (should fail)
  const selectResult = await supabaseRequest('GET', '/page_analytics?limit=1');
  console.log(`2. SELECT: ${!selectResult.ok ? '✅ PASS' : '❌ FAIL'} (${selectResult.status})`);

  // Test 3: UPDATE (should fail)
  const updateResult = await supabaseRequest('PATCH', '/page_analytics?id=eq.test', { action: 'updated' });
  console.log(`3. UPDATE: ${!updateResult.ok ? '✅ PASS' : '❌ FAIL'} (${updateResult.status})`);

  // Test 4: DELETE (should fail)
  const deleteResult = await supabaseRequest('DELETE', '/page_analytics?id=eq.test');
  console.log(`4. DELETE: ${!deleteResult.ok ? '✅ PASS' : '❌ FAIL'} (${deleteResult.status})`);

  const allPass = insertResult.status === 201 && !selectResult.ok && !updateResult.ok && !deleteResult.ok;
  console.log(`\n${allPass ? '🎉 ALL TESTS PASSED!' : '⚠️ SOME TESTS FAILED'}`);

  return { insertResult, selectResult, updateResult, deleteResult };
})();
```

4. Press **Enter** to run
5. Review results

### Expected Results

```
Testing RLS Policies...

1. INSERT: ✅ PASS (201)
2. SELECT: ✅ PASS (401 or 403)
3. UPDATE: ✅ PASS (401 or 403)
4. DELETE: ✅ PASS (401 or 403)

🎉 ALL TESTS PASSED!
```

---

## Troubleshooting

### Issue: INSERT still returns 400

**Cause**: Schema mismatch or old test data

**Solution**:
- Make sure test uses correct columns (no `metadata` field)
- Check Supabase table schema matches expected structure

### Issue: SELECT/UPDATE/DELETE still return 200

**Cause**: Policies not applied or not enabled

**Solution**:
1. Go back to Database → Policies
2. Verify policies show as **Enabled** (toggle is ON)
3. Try clicking the toggle OFF then ON again
4. Wait 10-30 seconds for policy cache to refresh
5. Re-run test

### Issue: INSERT returns 401/403

**Cause**: Policy not allowing anonymous inserts

**Solution**:
1. Check the "Allow anonymous inserts" policy
2. Verify **Target Roles** includes **public** or **anon**
3. Verify **WITH CHECK** is set to `true`
4. Make sure policy **Command** is set to **INSERT** (not ALL)

---

## Verification Checklist

After completing all steps, verify:

- [ ] All old policies deleted from `page_analytics` table
- [ ] "Allow anonymous inserts" policy created and enabled
- [ ] "Service role full access" policy created and enabled
- [ ] Browser console test shows all 4 tests passing
- [ ] INSERT returns 201 status
- [ ] SELECT/UPDATE/DELETE return 401 or 403 status

---

## Next Steps

Once all tests pass:

1. ✅ Mark Phase 1 as complete in the implementation plan
2. Proceed to **Phase 2**: Verify production environment variables
3. Test the actual waitlist form on https://tldrsec.app
4. Check Supabase dashboard for new analytics entries

---

## Reference

- **Implementation Plan**: [docs/plans/2025-11-14-fix-waitlist-production-errors.md](./plans/2025-11-14-fix-waitlist-production-errors.md)
- **Supabase Project**: https://app.supabase.com/project/ipwlykhekrjfvejduotm
- **Production Site**: https://tldrsec.app
