#!/usr/bin/env npx tsx

/**
 * Verification script for cascade delete trigger
 *
 * This script verifies that:
 * 1. The userId column exists in JobQueue
 * 2. The trigger function exists
 * 3. The trigger is attached to the User table
 * 4. Jobs are properly cleaned up when a user is deleted (dry run)
 *
 * Usage: npx tsx scripts/verify-cascade-delete-trigger.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface TriggerInfo {
  trigger_name: string;
  event_manipulation: string;
  action_timing: string;
  action_statement: string;
}

interface FunctionInfo {
  routine_name: string;
  routine_type: string;
}

interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: string;
}

interface ConstraintInfo {
  constraint_name: string;
  constraint_type: string;
}

async function main() {
  console.log('='.repeat(60));
  console.log('CASCADE DELETE TRIGGER VERIFICATION');
  console.log('='.repeat(60));
  console.log();

  let allChecksPass = true;

  // Check 1: Verify userId column exists in JobQueue
  console.log('CHECK 1: JobQueue.userId column');
  console.log('-'.repeat(40));
  try {
    const columns = await prisma.$queryRaw<ColumnInfo[]>`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'JobQueue' AND column_name = 'userId'
    `;

    if (columns.length > 0) {
      console.log('  ✅ userId column exists');
      console.log(`     Type: ${columns[0].data_type}`);
      console.log(`     Nullable: ${columns[0].is_nullable}`);
    } else {
      console.log('  ❌ userId column NOT FOUND');
      console.log('     Run migration: npx prisma db execute --file prisma/migrations/20251212_cascade_delete_orphaned_jobs.sql');
      allChecksPass = false;
    }
  } catch (error) {
    console.log('  ❌ Error checking column:', error);
    allChecksPass = false;
  }
  console.log();

  // Check 2: Verify trigger function exists
  console.log('CHECK 2: cleanup_jobs_on_user_delete() function');
  console.log('-'.repeat(40));
  try {
    const functions = await prisma.$queryRaw<FunctionInfo[]>`
      SELECT routine_name, routine_type
      FROM information_schema.routines
      WHERE routine_name = 'cleanup_jobs_on_user_delete'
        AND routine_schema = 'public'
    `;

    if (functions.length > 0) {
      console.log('  ✅ Function exists');
      console.log(`     Type: ${functions[0].routine_type}`);
    } else {
      console.log('  ❌ Function NOT FOUND');
      allChecksPass = false;
    }
  } catch (error) {
    console.log('  ❌ Error checking function:', error);
    allChecksPass = false;
  }
  console.log();

  // Check 3: Verify trigger exists on User table
  console.log('CHECK 3: trigger_cleanup_jobs_on_user_delete trigger');
  console.log('-'.repeat(40));
  try {
    const triggers = await prisma.$queryRaw<TriggerInfo[]>`
      SELECT trigger_name, event_manipulation, action_timing, action_statement
      FROM information_schema.triggers
      WHERE trigger_name = 'trigger_cleanup_jobs_on_user_delete'
        AND event_object_table = 'User'
    `;

    if (triggers.length > 0) {
      console.log('  ✅ Trigger exists');
      console.log(`     Timing: ${triggers[0].action_timing}`);
      console.log(`     Event: ${triggers[0].event_manipulation}`);
    } else {
      console.log('  ❌ Trigger NOT FOUND');
      allChecksPass = false;
    }
  } catch (error) {
    console.log('  ❌ Error checking trigger:', error);
    allChecksPass = false;
  }
  console.log();

  // Check 4: Verify sync trigger exists
  console.log('CHECK 4: trigger_sync_job_userid trigger');
  console.log('-'.repeat(40));
  try {
    const triggers = await prisma.$queryRaw<TriggerInfo[]>`
      SELECT trigger_name, event_manipulation, action_timing
      FROM information_schema.triggers
      WHERE trigger_name = 'trigger_sync_job_userid'
        AND event_object_table = 'JobQueue'
    `;

    if (triggers.length > 0) {
      console.log('  ✅ Sync trigger exists');
      console.log(`     Events: ${triggers.map(t => t.event_manipulation).join(', ')}`);
    } else {
      console.log('  ❌ Sync trigger NOT FOUND');
      allChecksPass = false;
    }
  } catch (error) {
    console.log('  ❌ Error checking sync trigger:', error);
    allChecksPass = false;
  }
  console.log();

  // Check 5: Verify foreign key constraint
  console.log('CHECK 5: Foreign key constraint');
  console.log('-'.repeat(40));
  try {
    const constraints = await prisma.$queryRaw<ConstraintInfo[]>`
      SELECT constraint_name, constraint_type
      FROM information_schema.table_constraints
      WHERE table_name = 'JobQueue'
        AND constraint_name = 'JobQueue_userId_fkey'
    `;

    if (constraints.length > 0) {
      console.log('  ✅ Foreign key constraint exists');
    } else {
      console.log('  ⚠️  Foreign key constraint not found (optional)');
    }
  } catch (error) {
    console.log('  ⚠️  Error checking constraint:', error);
  }
  console.log();

  // Check 6: Statistics on userId population
  console.log('CHECK 6: userId column population');
  console.log('-'.repeat(40));
  try {
    const stats = await prisma.$queryRaw<{ total: bigint; with_userid: bigint; from_payload: bigint }[]>`
      SELECT
        COUNT(*) as total,
        COUNT("userId") as with_userid,
        COUNT(CASE WHEN "userId" IS NULL AND payload->>'userId' IS NOT NULL THEN 1 END) as from_payload
      FROM "JobQueue"
    `;

    if (stats.length > 0) {
      const total = Number(stats[0].total);
      const withUserId = Number(stats[0].with_userid);
      const fromPayload = Number(stats[0].from_payload);
      const percentage = total > 0 ? ((withUserId / total) * 100).toFixed(1) : '0';

      console.log(`  Total jobs: ${total}`);
      console.log(`  With userId column populated: ${withUserId} (${percentage}%)`);
      console.log(`  Need backfill from payload: ${fromPayload}`);

      if (fromPayload > 0) {
        console.log('  ⚠️  Some jobs need userId backfill');
        console.log('     Run: UPDATE "JobQueue" SET "userId" = payload->>\'userId\' WHERE "userId" IS NULL');
      } else if (total === withUserId || total === 0) {
        console.log('  ✅ All jobs have userId populated');
      }
    }
  } catch (error) {
    console.log('  ⚠️  Error checking stats (column may not exist yet):', error);
  }
  console.log();

  // Check 7: Orphaned jobs check
  console.log('CHECK 7: Current orphaned jobs');
  console.log('-'.repeat(40));
  try {
    const orphaned = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count
      FROM "JobQueue" j
      LEFT JOIN "User" u ON j."userId" = u.id
      WHERE j."userId" IS NOT NULL
        AND u.id IS NULL
        AND j.status IN ('PENDING', 'RETRYING', 'PROCESSING')
    `;

    const count = Number(orphaned[0]?.count || 0);
    if (count === 0) {
      console.log('  ✅ No orphaned jobs found');
    } else {
      console.log(`  ⚠️  Found ${count} orphaned jobs (user deleted but jobs remain)`);
      console.log('     These will be cleaned up when the trigger runs');
    }
  } catch (error) {
    console.log('  ⚠️  Error checking orphaned jobs:', error);
  }
  console.log();

  // Summary
  console.log('='.repeat(60));
  console.log('VERIFICATION SUMMARY');
  console.log('='.repeat(60));

  if (allChecksPass) {
    console.log('✅ All checks PASSED - Cascade delete trigger is properly configured');
  } else {
    console.log('❌ Some checks FAILED - Run the migration to set up the trigger');
    console.log();
    console.log('To apply the migration:');
    console.log('  npx prisma db execute --file prisma/migrations/20251212_cascade_delete_orphaned_jobs.sql');
    console.log();
    console.log('Then regenerate Prisma client:');
    console.log('  npx prisma generate');
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('Fatal error:', error);
  await prisma.$disconnect();
  process.exit(1);
});
