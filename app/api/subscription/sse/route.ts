import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getPrismaClient } from '@/lib/db/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Keep track of connected clients
const clients = new Map<string, WritableStreamDefaultWriter>();

export async function GET(req: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  // Store client connection
  clients.set(userId, writer);

  // Send initial connection message
  await writer.write(
    encoder.encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`)
  );

  // Check subscription every minute for trial users
  const interval = setInterval(async () => {
    try {
      const prisma = getPrismaClient();
      const user = await prisma.user.findUnique({
        where: { authProviderId: userId },
        select: {
          planType: true,
          isActive: true,
          isTrialing: true,
          trialEndsAt: true,
          daysRemaining: true,
          isGrandfathered: true,
        },
      });

      if (user && user.isTrialing && user.daysRemaining < 1) {
        await writer.write(
          encoder.encode(
            `data: ${JSON.stringify({
              userId,
              subscription: user,
              timestamp: new Date().toISOString()
            })}\n\n`
          )
        );
      }
    } catch (error) {
      console.error('SSE update error:', error);
    }
  }, 60000); // Check every minute

  // Cleanup on disconnect
  req.signal.addEventListener('abort', () => {
    clearInterval(interval);
    clients.delete(userId);
    writer.close();
  });

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
