/**
 * Validates Stripe configuration at startup
 */
export function validateStripeConfig(): void {
  const required = [
    'STRIPE_SECRET_KEY',
    'STRIPE_PRICE_ID_PRO', 
    'STRIPE_PRICE_ID_MAX',
    'STRIPE_WEBHOOK_SECRET'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('[Stripe Config] Missing required environment variables:', missing);
    throw new Error(`Missing required Stripe configuration: ${missing.join(', ')}`);
  }
  
  // Validate format
  if (!process.env.STRIPE_SECRET_KEY!.startsWith('sk_')) {
    throw new Error('Invalid STRIPE_SECRET_KEY format');
  }
  
  if (!process.env.STRIPE_PRICE_ID_PRO!.startsWith('price_')) {
    throw new Error('Invalid STRIPE_PRICE_ID_PRO format');
  }
  
  if (!process.env.STRIPE_PRICE_ID_MAX!.startsWith('price_')) {
    throw new Error('Invalid STRIPE_PRICE_ID_MAX format');
  }
  
  if (!process.env.STRIPE_WEBHOOK_SECRET!.startsWith('whsec_')) {
    throw new Error('Invalid STRIPE_WEBHOOK_SECRET format');
  }
  
  console.log('[Stripe Config] Configuration validated successfully');
}