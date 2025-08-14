# Railway Environment Variables Setup Guide

This guide provides detailed instructions for configuring environment variables in Railway for your tldrsec-ai application.

## Environment Variable Management in Railway

Railway provides several ways to manage environment variables:

### 1. Railway Dashboard (Recommended)
- Most user-friendly approach
- Visual interface for managing variables
- Per-service configuration
- Environment-specific settings

### 2. Railway CLI
- Command-line management
- Bulk import/export capabilities
- Scriptable deployment

### 3. Railway API
- Programmatic access
- Integration with CI/CD pipelines

## Step-by-Step Setup

### Method 1: Railway Dashboard

1. **Access Your Project**
   ```
   1. Go to https://railway.app
   2. Sign in to your account
   3. Select your project
   ```

2. **Configure Main Application Service**
   ```
   1. Click on your main service (tldrsec-ai-main)
   2. Go to "Variables" tab
   3. Add each variable below
   ```

3. **Configure Cron Services**
   ```
   1. Click on each cron service
   2. Go to "Variables" tab  
   3. Add required variables for cron jobs
   ```

### Method 2: Railway CLI

1. **Install Railway CLI**
   ```bash
   npm install -g @railway/cli
   # or
   curl -fsSL https://railway.app/install.sh | sh
   ```

2. **Login and Link Project**
   ```bash
   railway login
   railway link
   ```

3. **Set Variables via CLI**
   ```bash
   # For main service
   railway variables set DATABASE_URL="your_database_url"
   railway variables set ANTHROPIC_API_KEY="your_anthropic_key"
   
   # For specific service
   railway variables set CRON_SECRET="your_cron_secret" --service cron-monitor-sec-filings
   ```

## Required Environment Variables

### 🔑 Core Application Variables

#### Database Configuration
```bash
DATABASE_URL=postgresql://username:password@hostname:port/database
```
**Where to get**: Copy from your current Neon database or create new Railway PostgreSQL

#### Authentication (Clerk)
```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```
**Where to get**: Clerk Dashboard → Your App → API Keys

#### AI Service (Anthropic)
```bash
ANTHROPIC_API_KEY=sk-ant-api03-...
ANTHROPIC_MODEL=claude-sonnet-4-20250514
```
**Where to get**: Anthropic Console → API Keys

#### Email Service (Resend)
```bash
RESEND_API_KEY=re_...
```
**Where to get**: Resend Dashboard → API Keys

### 🛡️ Security & Admin
```bash
ADMIN_EMAIL=your-admin-email@domain.com
CRON_SECRET=generate-secure-random-string
```

**Generate CRON_SECRET**:
```bash
# Option 1: OpenSSL
openssl rand -hex 32

# Option 2: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Option 3: Railway CLI
railway variables set CRON_SECRET="$(openssl rand -hex 32)"
```

### 📧 SEC Configuration
```bash
SEC_USER_AGENT=YourCompany contact@yourcompany.com
```

### ⚡ Enhanced Features (Optional)
```bash
ENABLE_ENHANCED_SUMMARIZATION=true
ENHANCED_CHUNK_SIZE=50000
ENHANCED_MAX_CHUNKS=10
ENHANCED_MAX_RETRIES=3
ENHANCED_CHUNKING_STRATEGY=CONSERVATIVE
ENHANCED_SINGLE_LIMIT=75000
```

### 🚂 Railway-Specific Variables

These are automatically set by Railway:
```bash
RAILWAY_ENVIRONMENT=production
RAILWAY_PUBLIC_DOMAIN=your-app-name.railway.app
NODE_ENV=production
```

## Service-Specific Variable Configuration

### Main Application Service
**Service Name**: `tldrsec-ai-main`

Required variables:
- All core application variables above
- Database credentials
- API keys for external services

### SEC Filing Monitor Cron Service
**Service Name**: `cron-monitor-sec-filings`

Required variables:
```bash
CRON_SECRET=your-secure-secret
RAILWAY_PUBLIC_DOMAIN=your-app.railway.app  # Auto-set
DATABASE_URL=postgresql://...               # Same as main app
ANTHROPIC_API_KEY=sk-ant-api03-...          # For AI processing
RESEND_API_KEY=re_...                       # For email notifications
```

### Job Processor Cron Service  
**Service Name**: `cron-process-jobs`

Required variables:
```bash
CRON_SECRET=your-secure-secret
RAILWAY_PUBLIC_DOMAIN=your-app.railway.app  # Auto-set
DATABASE_URL=postgresql://...               # Same as main app
```

## Variable Import Methods

### Option 1: Manual Entry via Dashboard
1. Copy variables from your `.env.local`
2. Paste into Railway dashboard
3. Adjust any Vercel-specific values for Railway

### Option 2: Bulk Import via CLI
Create a `.env.railway` file:
```bash
# Copy your current .env.local
cp .env.local .env.railway

# Edit for Railway (add CRON_SECRET, etc.)
nano .env.railway

# Import all variables
railway variables set --from-file .env.railway
```

### Option 3: Environment-Specific Import
```bash
# Production variables
railway variables set DATABASE_URL="production-db-url" --environment production

# Development variables  
railway variables set DATABASE_URL="dev-db-url" --environment development
```

## Security Best Practices

### 🔒 Secret Management
- Use strong, unique secrets for `CRON_SECRET`
- Rotate API keys regularly
- Never commit secrets to version control
- Use Railway's secret management features

### 🚫 Variables to NEVER Set
These are handled automatically by Railway:
- `PORT` (Railway manages this)
- `HOST` (Railway manages this)
- Railway deployment variables

### ✅ Verification Steps

1. **Test Database Connection**
   ```bash
   railway run npx prisma db push
   ```

2. **Verify API Keys**
   ```bash
   railway run npm run test:env
   ```

3. **Test Cron Authentication**
   ```bash
   railway run npm run test:cron
   ```

## Troubleshooting

### Common Issues

#### Database Connection Errors
- Verify `DATABASE_URL` format
- Check firewall/IP restrictions
- Ensure SSL mode is correct

#### Authentication Failures
- Verify Clerk keys are from correct environment
- Check domain configuration in Clerk dashboard

#### Cron Job Authentication
- Ensure `CRON_SECRET` is set identically across all services
- Verify variable is accessible to cron services

#### Missing Variables
```bash
# List all variables for a service
railway variables

# Check specific variable
railway variables get ANTHROPIC_API_KEY
```

## Variable Validation Script

Create a validation script to check all required variables:

```bash
# Check if all required variables are set
railway run node -e "
const required = [
  'DATABASE_URL',
  'ANTHROPIC_API_KEY', 
  'CLERK_SECRET_KEY',
  'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'CRON_SECRET'
];

const missing = required.filter(key => !process.env[key]);
if (missing.length) {
  console.error('Missing variables:', missing);
  process.exit(1);
} else {
  console.log('✅ All required variables set');
}
"
```

## Cost Optimization Tips

- Group related variables to avoid duplication
- Use Railway's shared variables for common settings
- Remove unused environment-specific variables
- Monitor variable usage in Railway analytics