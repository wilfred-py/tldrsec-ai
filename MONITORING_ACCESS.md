# Monitoring System Access Control

The cron job monitoring dashboard is restricted to admin users only for security and operational purposes.

## Configuration

Set the following environment variables to enable admin access:

```bash
# Server-side admin email check (API routes and server components)
ADMIN_EMAIL="admin@yourcompany.com"

# Client-side admin email check (navigation and UI components)
NEXT_PUBLIC_ADMIN_EMAIL="admin@yourcompany.com"
```

## Access Control Implementation

### 1. Page-Level Protection
- `/app/dashboard/monitoring/page.tsx` - Checks user email against `ADMIN_EMAIL`
- Redirects non-admin users to `/dashboard`

### 2. API-Level Protection  
- `/app/api/monitoring/cron-status/route.ts` - Returns 403 Forbidden for non-admin users
- Prevents unauthorized access to monitoring data

### 3. Navigation Control
- `/components/layout/sidebar.tsx` - Only shows "Monitoring" link to admin users
- Uses `NEXT_PUBLIC_ADMIN_EMAIL` for client-side visibility control

## Usage

1. Set the environment variables with your admin email address
2. Users matching the admin email will see the "Monitoring" option in the sidebar
3. Non-admin users will not see the monitoring option and will be redirected if they try to access the URL directly

## Security Notes

- Only users with email addresses exactly matching the configured admin email can access monitoring features
- Both server-side and client-side checks are implemented for complete protection
- API endpoints return proper HTTP status codes (403 Forbidden) for unauthorized access attempts