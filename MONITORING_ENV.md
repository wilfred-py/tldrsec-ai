# Monitoring Infrastructure Environment Variables

This document outlines the environment variables required for the monitoring and alerting infrastructure.

## Required Environment Variables

### Alert System Configuration

#### `ALERT_EMAIL_RECIPIENTS`
- **Description**: Comma-separated list of email addresses to receive system alerts
- **Format**: `email1@domain.com,email2@domain.com`
- **Required**: Yes
- **Example**: `admin@tldrsec.app,monitoring-team@tldrsec.app`

#### `ESCALATION_EMAIL_RECIPIENTS`
- **Description**: Comma-separated list of email addresses to receive escalated critical alerts
- **Format**: `email1@domain.com,email2@domain.com`
- **Required**: Yes (falls back to ALERT_EMAIL_RECIPIENTS if not set)
- **Example**: `critical-alerts@tldrsec.app,engineering-lead@tldrsec.app`

### External Service Configuration

#### `RESEND_API_KEY`
- **Description**: API key for Resend email service (used for alert notifications)
- **Required**: Yes
- **Format**: `re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

#### `DATABASE_URL`
- **Description**: PostgreSQL connection string for monitoring data storage
- **Required**: Yes
- **Format**: `postgresql://user:password@host:port/database`

## Optional Environment Variables

### Webhook Configuration

#### `MONITORING_WEBHOOK_URLS`
- **Description**: Comma-separated list of webhook URLs for alert notifications
- **Format**: `https://webhook1.com/alerts,https://webhook2.com/alerts`
- **Required**: No
- **Default**: None

### Monitoring Behavior Configuration

#### `MONITORING_INTERVAL_MINUTES`
- **Description**: Interval between monitoring cycles in minutes
- **Required**: No
- **Default**: `5`
- **Example**: `10`

#### `ALERT_DEDUPLICATION_WINDOW_MINUTES`
- **Description**: Time window for alert deduplication in minutes
- **Required**: No
- **Default**: `15`
- **Example**: `30`

#### `ALERT_ESCALATION_DELAY_MINUTES`
- **Description**: Time before unacknowledged critical alerts are escalated
- **Required**: No
- **Default**: `60`
- **Example**: `120`

### Threshold Overrides

#### `ERROR_RATE_WARNING_THRESHOLD`
- **Description**: Error rate percentage that triggers warning alerts
- **Required**: No
- **Default**: `5.0`
- **Example**: `10.0`

#### `ERROR_RATE_CRITICAL_THRESHOLD`
- **Description**: Error rate percentage that triggers critical alerts
- **Required**: No
- **Default**: `15.0`
- **Example**: `20.0`

#### `PROCESSING_LATENCY_WARNING_MS`
- **Description**: Processing latency in milliseconds that triggers warning alerts
- **Required**: No
- **Default**: `30000`
- **Example**: `60000`

#### `PROCESSING_LATENCY_CRITICAL_MS`
- **Description**: Processing latency in milliseconds that triggers critical alerts
- **Required**: No
- **Default**: `60000`
- **Example**: `120000`

#### `QUEUE_DEPTH_WARNING_THRESHOLD`
- **Description**: Queue depth that triggers warning alerts
- **Required**: No
- **Default**: `100`
- **Example**: `200`

#### `QUEUE_DEPTH_CRITICAL_THRESHOLD`
- **Description**: Queue depth that triggers critical alerts
- **Required**: No
- **Default**: `500`
- **Example**: `1000`

## Environment-Specific Configurations

### Development Environment
```bash
# Core monitoring (required)
DATABASE_URL=postgresql://localhost:5432/tldrsec_dev
RESEND_API_KEY=re_dev_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Alert recipients (development team)
ALERT_EMAIL_RECIPIENTS=dev-alerts@tldrsec.app
ESCALATION_EMAIL_RECIPIENTS=dev-team-lead@tldrsec.app

# Relaxed thresholds for development
ERROR_RATE_WARNING_THRESHOLD=10.0
ERROR_RATE_CRITICAL_THRESHOLD=25.0
MONITORING_INTERVAL_MINUTES=1
```

### Staging Environment
```bash
# Core monitoring (required)
DATABASE_URL=postgresql://staging-db:5432/tldrsec_staging
RESEND_API_KEY=re_staging_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Alert recipients (staging alerts)
ALERT_EMAIL_RECIPIENTS=staging-alerts@tldrsec.app,qa-team@tldrsec.app
ESCALATION_EMAIL_RECIPIENTS=staging-escalation@tldrsec.app

# Production-like thresholds
ERROR_RATE_WARNING_THRESHOLD=5.0
ERROR_RATE_CRITICAL_THRESHOLD=15.0
MONITORING_INTERVAL_MINUTES=5
```

### Production Environment
```bash
# Core monitoring (required)
DATABASE_URL=postgresql://prod-db:5432/tldrsec_production
RESEND_API_KEY=re_prod_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Alert recipients (production team)
ALERT_EMAIL_RECIPIENTS=prod-alerts@tldrsec.app,monitoring-team@tldrsec.app,engineering@tldrsec.app
ESCALATION_EMAIL_RECIPIENTS=critical-alerts@tldrsec.app,cto@tldrsec.app,engineering-lead@tldrsec.app

# Webhook integration
MONITORING_WEBHOOK_URLS=https://hooks.slack.com/alerts,https://pagerduty.com/webhook

# Strict production thresholds
ERROR_RATE_WARNING_THRESHOLD=5.0
ERROR_RATE_CRITICAL_THRESHOLD=15.0
PROCESSING_LATENCY_WARNING_MS=30000
PROCESSING_LATENCY_CRITICAL_MS=60000
QUEUE_DEPTH_WARNING_THRESHOLD=100
QUEUE_DEPTH_CRITICAL_THRESHOLD=500

# Production monitoring settings
MONITORING_INTERVAL_MINUTES=5
ALERT_DEDUPLICATION_WINDOW_MINUTES=15
ALERT_ESCALATION_DELAY_MINUTES=60
```

## Vercel Deployment Configuration

When deploying to Vercel, configure these environment variables in the Vercel dashboard:

1. Go to your project settings in Vercel
2. Navigate to Environment Variables
3. Add each required variable for the appropriate environments (Development, Preview, Production)

### Vercel Environment Variable Settings:

```
ALERT_EMAIL_RECIPIENTS
- Environment: Production, Preview
- Value: your-alert-emails@domain.com

ESCALATION_EMAIL_RECIPIENTS  
- Environment: Production, Preview
- Value: your-escalation-emails@domain.com

RESEND_API_KEY
- Environment: Production, Preview, Development
- Value: re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

DATABASE_URL
- Environment: Production, Preview, Development  
- Value: postgresql://user:password@host:port/database
```

## Security Considerations

1. **Never commit environment variables to version control**
2. **Use different API keys for different environments**
3. **Restrict email recipients to authorized personnel only**
4. **Regularly rotate API keys and access credentials**
5. **Use secure connection strings with proper SSL/TLS configuration**
6. **Monitor access to environment variable configurations**

## Validation

The monitoring system will validate environment variables on startup and log warnings for:
- Missing required variables
- Invalid email formats in recipient lists
- Malformed webhook URLs
- Invalid threshold values

## Troubleshooting

### Common Issues:

1. **Alerts not being sent**
   - Check `RESEND_API_KEY` is valid
   - Verify `ALERT_EMAIL_RECIPIENTS` contains valid email addresses
   - Check email service logs in the application

2. **Escalation not working**
   - Verify `ESCALATION_EMAIL_RECIPIENTS` is configured
   - Check `ALERT_ESCALATION_DELAY_MINUTES` setting
   - Review alert acknowledgment status

3. **Monitoring not running**
   - Check `DATABASE_URL` connectivity
   - Verify required environment variables are set
   - Review application logs for monitoring errors

4. **Threshold alerts not triggering**
   - Verify threshold environment variables are set correctly
   - Check that monitoring data is being collected
   - Review threshold configuration in database

For additional support, check the monitoring dashboard at `/monitoring/health` or review the application logs.