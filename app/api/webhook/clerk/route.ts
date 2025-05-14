import { headers } from 'next/headers';
import { WebhookEvent } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

// This endpoint handles Clerk webhook events
// See https://clerk.com/docs/integration/webhooks for more information
export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    throw new Error('Please add CLERK_WEBHOOK_SECRET from Clerk Dashboard to .env or .env.local');
  }

  // Get the headers
  const headerPayload = await headers();
  const svix_id = headerPayload.get('svix-id');
  const svix_timestamp = headerPayload.get('svix-timestamp');
  const svix_signature = headerPayload.get('svix-signature');

  // If there are no headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response('Error missing Svix headers', {
      status: 400,
    });
  }

  // Get the body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  // Create a new Svix instance with our secret
  const { Webhook } = await import('svix');
  const wh = new Webhook(WEBHOOK_SECRET);

  let evt: WebhookEvent;

  // Verify the payload with the headers
  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error('Error verifying webhook:', err);
    return new Response('Error verifying webhook', {
      status: 400,
    });
  }

  // Handle the webhook event based on the type
  const eventType = evt.type;
  console.log(`Webhook event type: ${eventType}`);

  switch (eventType) {
    case 'user.created':
      // Handle user creation event
      // e.g. Create a new user in your database
      console.log('User created:', evt.data);
      break;
    case 'user.updated':
      // Handle user update event
      console.log('User updated:', evt.data);
      break;
    case 'user.deleted':
      // Handle user deletion event
      console.log('User deleted:', evt.data);
      break;
    // Add other event types as needed
    default:
      console.log('Unhandled webhook event type:', eventType);
  }

  return NextResponse.json({ success: true });
} 