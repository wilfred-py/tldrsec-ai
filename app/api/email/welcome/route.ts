import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db/prisma';
import { sendEmail } from '@/lib/email';
import { getEmailTemplate } from '@/lib/email/templates';
import { EmailType } from '@/lib/email/types';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * API endpoint to send a welcome email to the user
 * POST /api/email/welcome
 */
export async function POST(req: NextRequest) {
  try {
    // Verify authentication
    const authResult = await auth();
    if (!authResult || !authResult.userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const userId = authResult.userId;

    // Get the user's details from database
    const user = await prisma.user.findFirst({
      where: { 
        authProviderId: userId 
      }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found in database' },
        { status: 404 }
      );
    }

    // Get user's email from Clerk
    const { data: userData } = await req.json();
    const email = userData?.email;

    if (!email) {
      return NextResponse.json(
        { error: 'Email not provided' },
        { status: 400 }
      );
    }

    // Generate welcome email content
    const { html, text } = getEmailTemplate(EmailType.WELCOME, {
      recipientName: user.name || 'there',
      recipientEmail: email,
      dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
      unsubscribeUrl: `${process.env.NEXT_PUBLIC_APP_URL}/settings/notifications`,
      preferencesUrl: `${process.env.NEXT_PUBLIC_APP_URL}/settings`
    });

    // Send the welcome email
    const result = await sendEmail({
      to: email,
      subject: 'Welcome to TLDR SEC',
      html,
      text,
      tags: [
        'type:welcome',
        'content:onboarding'
      ],
      metadata: {
        userId: user.id,
        type: 'welcome-email'
      }
    });

    if (!result.success) {
      logger.error('Failed to send welcome email', {
        userId: user.id,
        error: result.error
      });
      
      return NextResponse.json(
        { error: 'Failed to send welcome email' },
        { status: 500 }
      );
    }

    logger.info('Sent welcome email', {
      userId: user.id,
      emailId: result.id
    });

    return NextResponse.json({
      success: true,
      message: 'Welcome email sent successfully'
    });
  } catch (error) {
    console.error('Error sending welcome email:', error);
    return NextResponse.json(
      { error: 'Failed to send welcome email' },
      { status: 500 }
    );
  }
}
