#!/bin/bash

# Pre-commit hook to prevent dangerous Prisma imports
# This prevents the silent database failure bug that caused 400+ stuck jobs

echo "🔍 Checking for dangerous Prisma import patterns..."

# Check for direct prisma imports (dangerous pattern)
DIRECT_IMPORTS=$(git diff --cached --name-only | \
  grep -E '\.(ts|tsx|js|jsx)$' | \
  xargs grep -l "import.*{.*prisma.*}.*from.*['\"].*lib/db" 2>/dev/null || true)

if [ ! -z "$DIRECT_IMPORTS" ]; then
  echo "❌ ERROR: Found direct prisma imports (causes silent database failures):"
  echo "$DIRECT_IMPORTS"
  echo ""
  echo "⚠️  Use getPrismaClient() instead of direct prisma import:"
  echo "   ❌ import { prisma } from '@/lib/db/prisma';"
  echo "   ✅ import { getPrismaClient } from '@/lib/db/prisma';"
  echo ""
  echo "This pattern caused 400+ jobs to be stuck for days."
  exit 1
fi

# Check for incorrect path imports (non-existent path)
WRONG_PATH=$(git diff --cached --name-only | \
  grep -E '\.(ts|tsx|js|jsx)$' | \
  xargs grep -l "from.*['\"]@/lib/prisma['\"]" 2>/dev/null || true)

if [ ! -z "$WRONG_PATH" ]; then
  echo "❌ ERROR: Found imports from non-existent path '@/lib/prisma':"
  echo "$WRONG_PATH"
  echo ""
  echo "⚠️  The correct import path is:"
  echo "   ❌ import { getPrismaClient } from '@/lib/prisma';"
  echo "   ✅ import { getPrismaClient } from '@/lib/db/prisma';"
  echo ""
  exit 1
fi

echo "✅ No dangerous Prisma import patterns found"
exit 0