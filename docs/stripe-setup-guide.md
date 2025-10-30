# Stripe Dashboard Configuration Guide

This guide walks you through setting up Stripe for the tldrsec-ai subscription system.

## Prerequisites

- Stripe account (create at https://stripe.com)
- Access to your Stripe dashboard
- Admin access to your deployment environment (Vercel, Railway, etc.)

## Step 1: Create Stripe Account and Get API Keys

1. **Sign up/Login to Stripe**
   - Go to https://dashboard.stripe.com
   - Create account or log in

2. **Get Test API Keys** (for development)
   - Navigate to "Developers" > "API keys"
   - Copy the "Publishable key" (pk_test_...)
   - Copy the "Secret key" (sk_test_...)
   - Note: Keep secret keys secure and never commit them to code

3. **Enable Live Mode** (for production)
   - Complete Stripe account verification
   - Add business details and banking information
   - Get live API keys (pk_live_... and sk_live_...)

## Step 2: Create Products and Pricing

### Create Products

1. **Navigate to Products**
   - Go to "Products" in the Stripe dashboard
   - Click "Add product"

2. **Create Basic Plan**
   - Name: "Basic Plan"
   - Description: "Basic filing summaries with standard AI analysis"
   - Unit label: "subscription"
   - Image: (optional)

3. **Create Professional Plan**
   - Name: "Professional Plan"
   - Description: "Enhanced filing summaries with advanced AI analysis"
   - Unit label: "subscription"

4. **Create Premium Plan**
   - Name: "Premium Plan"
   - Description: "Premium filing summaries with maximum context preservation"
   - Unit label: "subscription"

### Set Up Pricing

For each product, create monthly recurring pricing:

1. **Basic Plan Pricing**
   - Pricing model: "Standard pricing"
   - Price: $9.00 USD
   - Billing period: Monthly
   - Copy the Price ID (price_...)

2. **Professional Plan Pricing**
   - Pricing model: "Standard pricing"
   - Price: $29.00 USD
   - Billing period: Monthly
   - Copy the Price ID (price_...)

3. **Premium Plan Pricing**
   - Pricing model: "Standard pricing"
   - Price: $99.00 USD
   - Billing period: Monthly
   - Copy the Price ID (price_...)

## Step 3: Configure Webhooks

1. **Create Webhook Endpoint**
   - Go to "Developers" > "Webhooks"
   - Click "Add endpoint"
   - Endpoint URL: `https://your-domain.com/api/webhook/stripe`
   - Description: "tldrsec-ai subscription events"

2. **Select Events to Listen For**
   ```
   checkout.session.completed
   customer.subscription.created
   customer.subscription.updated
   customer.subscription.deleted
   invoice.payment_succeeded
   invoice.payment_failed
   ```

3. **Get Webhook Secret**
   - After creating the webhook, click on it
   - Copy the "Signing secret" (whsec_...)

## Step 4: Configure Customer Portal

1. **Enable Customer Portal**
   - Go to "Settings" > "Billing" > "Customer portal"
   - Toggle "Activate test link" (for test mode)

2. **Configure Portal Settings**
   - **Business Information**: Add your business name and contact details
   - **Privacy Policy**: Add link to your privacy policy
   - **Terms of Service**: Add link to your terms of service
   - **Features**: Enable/disable features customers can manage:
     - ✅ Update payment methods
     - ✅ Update billing address
     - ✅ View billing history
     - ✅ Download invoices
     - ✅ Cancel subscriptions
     - ❌ Update subscriptions (we'll handle upgrades/downgrades in our app)

3. **Customize Appearance** (optional)
   - Upload logo
   - Set brand colors
   - Customize messaging

## Step 5: Environment Variables

Add these environment variables to your deployment:

### Required Variables
```bash
# Stripe API Keys
STRIPE_SECRET_KEY=sk_test_... # (or sk_live_... for production)
STRIPE_WEBHOOK_SECRET=whsec_...

# Price IDs
STRIPE_BASIC_PRICE_ID=price_...
STRIPE_PROFESSIONAL_PRICE_ID=price_...
STRIPE_PREMIUM_PRICE_ID=price_...

# App URL (for redirects)
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

### For Vercel
1. Go to Vercel dashboard > Your project > Settings > Environment Variables
2. Add each variable for Production, Preview, and Development environments

### For Railway
1. Go to Railway dashboard > Your project > Variables
2. Add each environment variable

## Step 6: Test the Integration

### Test Mode Testing

1. **Use Test Cards**
   - Successful payment: `4242 4242 4242 4242`
   - Declined payment: `4000 0000 0000 0002`
   - Requires authentication: `4000 0025 0000 3155`

2. **Test Subscription Flow**
   - Create a test user account
   - Try subscribing to each plan
   - Verify webhook events are received
   - Check database records are created

3. **Test Customer Portal**
   - Access billing portal from your app
   - Try updating payment method
   - Test subscription cancellation

### Webhook Testing

1. **Use Stripe CLI** (recommended)
   ```bash
   # Install Stripe CLI
   npm install -g stripe-cli
   
   # Login to Stripe
   stripe login
   
   # Forward events to local webhook
   stripe listen --forward-to localhost:3000/api/webhook/stripe
   ```

2. **Check Webhook Logs**
   - Go to "Developers" > "Webhooks" in Stripe dashboard
   - Click on your webhook endpoint
   - View "Recent deliveries" for any failures

## Step 7: Production Checklist

Before going live:

- [ ] Complete Stripe account verification
- [ ] Set up live payment methods
- [ ] Switch to live API keys
- [ ] Test with real (small amount) transactions
- [ ] Set up monitoring for webhook failures
- [ ] Configure email notifications for failed payments
- [ ] Set up proper error logging
- [ ] Review and test subscription cancellation flow
- [ ] Verify tax settings (if applicable)
- [ ] Set up proper customer support processes

## Step 8: Monitoring and Maintenance

### Key Metrics to Monitor

1. **Subscription Metrics**
   - New subscriptions
   - Cancellations
   - Failed payments
   - Revenue

2. **Technical Metrics**
   - Webhook delivery success rate
   - API error rates
   - Database sync accuracy

### Stripe Dashboard Areas to Monitor

- **Home**: Overview of payments and revenue
- **Payments**: Payment success/failure rates
- **Subscriptions**: Active subscriptions and churn
- **Customers**: Customer management
- **Disputes**: Handle any payment disputes
- **Logs**: API request logs for debugging

## Troubleshooting

### Common Issues

1. **Webhook Not Receiving Events**
   - Check webhook URL is correct and accessible
   - Verify signing secret matches
   - Check webhook event selection
   - Look at webhook delivery logs in Stripe

2. **Subscription Not Activating**
   - Check `checkout.session.completed` webhook is enabled
   - Verify metadata is passed correctly
   - Check database connection and permissions

3. **Customer Portal Not Working**
   - Ensure customer has `stripeCustomerId` in database
   - Verify portal is enabled in Stripe settings
   - Check API keys are correct

4. **Test Cards Not Working**
   - Ensure you're in test mode
   - Use exact test card numbers from Stripe docs
   - Check for country/region restrictions

### Getting Help

- **Stripe Documentation**: https://stripe.com/docs
- **Stripe Support**: Available in dashboard under "Help"
- **Community**: Stack Overflow with `stripe` tag

## Security Best Practices

1. **Never expose secret keys** in client-side code
2. **Always verify webhook signatures** before processing
3. **Use HTTPS** for all webhook endpoints
4. **Regularly rotate API keys** for production
5. **Monitor for suspicious activity** in Stripe dashboard
6. **Implement proper error handling** for all Stripe operations
7. **Use environment variables** for all sensitive configuration

## Next Steps

After completing this setup:

1. Test the entire subscription flow end-to-end
2. Set up monitoring and alerting
3. Create customer support processes
4. Plan for subscription analytics and reporting
5. Consider implementing usage-based billing features