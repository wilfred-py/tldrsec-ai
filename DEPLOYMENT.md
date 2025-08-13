# Deployment Guide

## Environment Variable Configuration

### Critical Security Changes

As of PR #170, the admin authentication system has been updated for better security:

**⚠️ IMPORTANT: Remove `NEXT_PUBLIC_ADMIN_EMAIL` from all environments**

The previous implementation exposed admin email addresses in the client-side JavaScript bundle, which was a security vulnerability.

### Environment Variables

#### Required for Production

```bash
# Admin Configuration - Server-side only
ADMIN_EMAIL=admin@yourcompany.com

# Database
DATABASE_URL=postgresql://username:password@hostname:port/database_name

# Authentication (Clerk)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_your_clerk_key
CLERK_SECRET_KEY=sk_live_your_clerk_secret

# AI Services
ANTHROPIC_API_KEY=sk-ant-api03-your_key_here

# SEC EDGAR API
SEC_USER_AGENT=YourCompany contact@yourcompany.com

# Email Service
RESEND_API_KEY=re_your_resend_key
```

#### Optional Configuration

```bash
# Enhanced Processing
ENABLE_ENHANCED_SUMMARIZATION=true
ENHANCED_CHUNK_SIZE=50000
ENHANCED_MAX_CHUNKS=10
ENHANCED_MAX_RETRIES=3

# Rate Limiting
ENHANCED_CHUNKING_STRATEGY=CONSERVATIVE
ENHANCED_SINGLE_LIMIT=75000
```

### Admin Access Configuration

Admin access is now managed through:

1. **Server-side verification** using `ADMIN_EMAIL` environment variable
2. **Secure API endpoint** at `/api/user/admin-status`
3. **Audit logging** of all admin access attempts

#### Adding Admin Users

To grant admin access to a user:

1. Set `ADMIN_EMAIL` to the user's email address in your deployment environment
2. Restart the application to pick up the new configuration
3. The user will see admin navigation items on next login

#### Multiple Admin Users (Future)

Current implementation supports one admin user. For multiple admins, consider:

- Database-driven role management
- Clerk's built-in role system
- Comma-separated email list (requires code changes)

### Database Migration

Before deploying PR #170 changes, run the database migration:

```bash
# Apply the migration
npm run db:migrate

# Verify the migration
npm run db:studio
```

The migration updates:
- Status enum values (`RUNNING` → `STARTED`, `COMPLETED` → `SUCCESS`)
- Adds performance indexes for monitoring queries
- Ensures data integrity

### Deployment Checklist

- [ ] Remove `NEXT_PUBLIC_ADMIN_EMAIL` from environment variables
- [ ] Set `ADMIN_EMAIL` server-side environment variable
- [ ] Run database migration
- [ ] Test admin authentication flow
- [ ] Verify error handling for non-admin users
- [ ] Check monitoring dashboard functionality
- [ ] Validate audit logging is working

### Security Considerations

1. **Environment Variables**: Never expose admin emails in client-side variables
2. **Audit Logging**: All admin access attempts are logged for security
3. **Session Management**: Admin status is checked on each request
4. **Access Control**: Non-admin users are redirected with proper error messaging

### Troubleshooting

#### Admin User Cannot Access Monitoring

1. Verify `ADMIN_EMAIL` is set correctly in environment
2. Check that user email matches exactly (case-sensitive)
3. Restart application after environment changes
4. Check application logs for admin access attempts

#### Client-side Admin Check Fails

1. Ensure you're using `useAdminStatus()` hook instead of environment variables
2. Verify `/api/user/admin-status` endpoint is accessible
3. Check network requests in browser dev tools

#### Database Migration Issues

1. Back up database before migration
2. Check database connection and permissions
3. Verify Prisma schema is up to date
4. Run `npm run db:generate` if needed

### Monitoring

The admin access control system provides:

- **Access Logs**: All admin authentication attempts
- **Error Tracking**: Failed access attempts with user details
- **Performance Metrics**: Admin endpoint response times
- **Security Alerts**: Unusual admin access patterns (future enhancement)

For production monitoring, consider setting up alerts on:
- Failed admin authentication attempts
- Unusual admin access patterns
- High volume of access denied errors