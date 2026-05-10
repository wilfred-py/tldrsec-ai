#!/usr/bin/env bash
# Vercel build entry point.
#
# Vercel runs `vercel-build` (this script via package.json) instead of `build`
# when present. We split production deploys from preview deploys so a feature
# branch with a destructive migration can't corrupt the prod schema before its
# PR is reviewed and merged. Both environments hit the same Supabase database
# (single DATABASE_URL), so without this gate every preview build would race
# `prisma migrate deploy` against prod.
#
# Production:  prisma migrate deploy → prisma generate → next build
# Preview:                              prisma generate → next build
#
# `prisma migrate deploy` is a no-op once all migrations on disk are recorded
# applied in `_prisma_migrations` (baselined 2026-05-10 to clear historical
# `db push` drift). New migrations land here automatically on the first prod
# build after merge.
#
# To opt out for a one-off prod deploy (e.g. rolling back a bad migration),
# set `SKIP_PRISMA_MIGRATE=1` in the Vercel build environment for that deploy.
set -euo pipefail

if [ "${VERCEL_ENV:-}" = "production" ] && [ "${SKIP_PRISMA_MIGRATE:-0}" != "1" ]; then
  echo "vercel-build: VERCEL_ENV=production → running prisma migrate deploy"
  npx prisma migrate deploy
else
  if [ "${SKIP_PRISMA_MIGRATE:-0}" = "1" ]; then
    echo "vercel-build: SKIP_PRISMA_MIGRATE=1 → skipping prisma migrate deploy"
  else
    echo "vercel-build: VERCEL_ENV=${VERCEL_ENV:-unset} → skipping prisma migrate deploy"
  fi
fi

npx prisma generate
npx next build
