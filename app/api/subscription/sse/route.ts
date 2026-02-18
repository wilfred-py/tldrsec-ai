import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getPrismaClient } from '@/lib/db/prisma';
import { SSEUpdateSchema } from '@/lib/validation/subscription-schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Connection limits for DoS protection
const MAX_CONNECTIONS_PER_USER = 3;
const MAX_CONNECTIONS_GLOBAL = 500;

// Keep track of connected clients with connection count
const clients = new Map<string, WritableStreamDefaultWriter[]>();

/**
 * Get connection count for a user
 */
function getUserConnectionCount(userId: string): number {
  return clients.get(userId)?.length || 0;
}

/**
 * Get total global connection count
 */
function getGlobalConnectionCount(): number {
  let total = 0;
  for (const writers of clients.values()) {
    total += writers.length;
  }
  return total;
}

/**
 * Add client connection with limits enforcement
 */
function addClient(userId: string, writer: WritableStreamDefaultWriter): boolean {
  // Check per-user limit
  if (getUserConnectionCount(userId) >= MAX_CONNECTIONS_PER_USER) {
    return false;
  }

  // Check global limit
  if (getGlobalConnectionCount() >= MAX_CONNECTIONS_GLOBAL) {
    return false;
  }

  const existingWriters = clients.get(userId) || [];
  clients.set(userId, [...existingWriters, writer]);
  return true;
}

/**
 * Remove client connection
 */
function removeClient(userId: string, writer: WritableStreamDefaultWriter): void {
  const existingWriters = clients.get(userId) || [];
  const filteredWriters = existingWriters.filter((w) => w !== writer);

  if (filteredWriters.length === 0) {
    clients.delete(userId);
  } else {
    clients.set(userId, filteredWriters);
  }
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Check connection limits
  if (getUserConnectionCount(userId) >= MAX_CONNECTIONS_PER_USER) {
    return new Response(
      'Connection limit exceeded. Maximum 3 connections per user.',
      { status: 429 }
    );
  }

  if (getGlobalConnectionCount() >= MAX_CONNECTIONS_GLOBAL) {
    return new Response(
      'Server connection limit exceeded. Please try again later.',
      { status: 503 }
    );
  }

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  // Store client connection
  if (!addClient(userId, writer)) {
    return new Response('Failed to establish connection', { status: 500 });
  }

  let interval: NodeJS.Timeout | null = null;

  try {
    // Send initial connection message
    await writer.write(
      encoder.encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`)
    );

    // Check subscription every minute for trial users
    interval = setInterval(async () => {
      try {
        const prisma = getPrismaClient();
        const user = await prisma.user.findUnique({
          where: { authProviderId: userId },
          select: {
            authProviderId: true, // Send authProviderId instead of id
            planType: true,
            isActive: true,
            isTrialing: true,
            trialEndsAt: true,
            daysRemaining: true,
            isGrandfathered: true,
          },
        });

        if (user && user.isTrialing && user.daysRemaining < 1) {
          // Validate data before sending to prevent XSS
          const validatedData = SSEUpdateSchema.parse({
            authProviderId: user.authProviderId,
            subscription: {
              planType: user.planType,
              isActive: user.isActive,
              isTrialing: user.isTrialing,
              daysRemaining: user.daysRemaining,
              trialEndsAt: user.trialEndsAt,
              isGrandfathered: user.isGrandfathered,
            },
            timestamp: new Date().toISOString(),
          });

          await writer.write(
            encoder.encode(`data: ${JSON.stringify(validatedData)}\n\n`)
          );
        }
      } catch (error) {
        console.error('SSE update error:', error);
        // Clear interval on persistent errors to prevent zombie intervals
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
      }
    }, 60000); // Check every minute

    // Cleanup on disconnect
    req.signal.addEventListener('abort', () => {
      if (interval) {
        clearInterval(interval);
      }
      removeClient(userId, writer);
      writer.close().catch(console.error);
    });
  } catch (error) {
    console.error('SSE setup error:', error);
    if (interval) {
      clearInterval(interval);
    }
    removeClient(userId, writer);
    throw error;
  }

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}
