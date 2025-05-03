#!/bin/bash

# fix-security-breach.sh
# This script helps fix the security breach by removing sensitive files from git history
# while keeping them locally, and updating the .gitignore file.

echo "🔒 SECInsightAI Security Breach Fix Script 🔒"
echo "==================================================="
echo "This script will help you remove sensitive files from Git history."
echo "IMPORTANT: After running this script, you will need to:"
echo "  1. Rotate all exposed credentials (PostgreSQL username & password)"
echo "  2. Update your local .env files with the new credentials"
echo "  3. Regenerate Prisma client with the new credentials"
echo "==================================================="
echo ""

# Ensure we have the correct .gitignore
echo "Step 1: Verifying .gitignore file..."
if ! grep -q "*.env" .gitignore || ! grep -q "**/generated/prisma/**" .gitignore; then
  echo "Updating .gitignore file with rules for sensitive files..."
  cat >> .gitignore << EOF

# Environment variables (added by security fix)
.env
.env.local
.env.development
.env.test
.env.production
*.env

# Prisma generated files that might contain credentials (added by security fix)
**/generated/prisma/**
**/generated/client/**
EOF
  git add .gitignore
  git commit -m "chore: Update .gitignore to protect sensitive files"
fi

# Remove sensitive files from git but keep them locally
echo "Step 2: Removing sensitive files from Git history..."
git rm --cached app/.env
git rm --cached app/.env.local
git rm --cached app/src/generated/prisma/edge.js
git rm --cached app/src/generated/prisma/index.js

# Commit the changes
echo "Step 3: Committing changes..."
git commit -m "security: Remove sensitive files from Git history"

echo ""
echo "Step 4: Next steps (IMPORTANT)"
echo "---------------------------------------------------"
echo "1. Rotate your PostgreSQL credentials immediately at:"
echo "   https://console.neon.tech"
echo ""
echo "2. Update your local .env and .env.local files with new credentials"
echo ""
echo "3. Regenerate Prisma client:"
echo "   cd app"
echo "   npm run prisma:generate"
echo ""
echo "Security breach fix initiated! Remember to complete all steps above."
echo "===================================================" 