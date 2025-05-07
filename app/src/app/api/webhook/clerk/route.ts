import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { createUser, getUserByEmail, updateUser } from '@/lib/api/users';

// Webhook secret from Clerk Dashboard
const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

// Type for Clerk webhook events
type WebhookEvent = {
  data: any;
  object: string;
  type: string;
};

/**
 * Handle user.created event by creating a new user in our database
 */
async function handleUserCreated(user: any) {
  try {
    // Find primary email if available
    const email = user.email_addresses?.[0]?.email_address;
    if (!email) {
      console.warn('No email found for user creation webhook', user.id);
      return;
    }
    
    // Check if user already exists (handle potential duplicates)
    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      console.info(`User already exists, skipping creation: ${email}`);
      return;
    }
    
    // Create new user in database
    const name = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 
      email.split('@')[0]; // Use part of email as fallback
    
    await createUser({
      email,
      name,
      authProvider: 'clerk',
      authProviderId: user.id
    });
    
    console.info(`User created from webhook: ${email} (${user.id})`);
  } catch (error) {
    console.error('Error handling user.created webhook:', error);
  }
}

/**
 * Handle user.updated event by updating user details in our database
 */
async function handleUserUpdated(user: any) {
  try {
    // Find primary email if available
    const email = user.email_addresses?.[0]?.email_address;
    if (!email) {
      console.warn('No email found for user update webhook', user.id);
      return;
    }
    
    // Find existing user
    const existingUser = await getUserByEmail(email);
    if (!existingUser) {
      // If user doesn't exist, create them
      console.info(`User doesn't exist for update, creating: ${email}`);
      return handleUserCreated(user);
    }
    
    // Update user details
    const name = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 
      email.split('@')[0];
    
    await updateUser(existingUser.id, {
      name,
    });
    
    console.info(`User updated from webhook: ${email} (${user.id})`);
  } catch (error) {
    console.error('Error handling user.updated webhook:', error);
  }
}

/**
 * Webhook handler for Clerk events
 */
export async function POST(req: NextRequest) {
  try {
    // Get the headers
    const headersList = headers();
    const svix_id = headersList.get("svix-id");
    const svix_timestamp = headersList.get("svix-timestamp");
    const svix_signature = headersList.get("svix-signature");
    
    if (!svix_id || !svix_timestamp || !svix_signature || !WEBHOOK_SECRET) {
      console.error('Missing webhook verification headers');
      return NextResponse.json(
        { error: 'Missing webhook verification headers' },
        { status: 400 }
      );
    }
    
    const payload = await req.json();
    const body = JSON.stringify(payload);
    
    try {
      const webhook = new Webhook(WEBHOOK_SECRET);
      const event = webhook.verify(body, {
        'svix-id': svix_id,
        'svix-timestamp': svix_timestamp,
        'svix-signature': svix_signature,
      }) as WebhookEvent;
      
      // Log webhook event for debugging
      console.info(`Processing Clerk webhook event: ${event.type}`);
      
      // Handle different webhook events
      switch (event.type) {
        case 'user.created':
          await handleUserCreated(event.data);
          break;
        case 'user.updated':
          await handleUserUpdated(event.data);
          break;
        default:
          console.debug(`Unhandled webhook event type: ${event.type}`);
      }
      
      return NextResponse.json({ 
        success: true,
        message: `Webhook processed successfully: ${event.type}`
      });
    } catch (error) {
      console.error('Webhook verification failed:', error);
      return NextResponse.json(
        { error: 'Webhook verification failed' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic'; 