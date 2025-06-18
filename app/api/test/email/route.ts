import { NextResponse } from 'next/server';
import { emailClient } from '@/lib/email';

export async function GET() {
  try {
    console.log('Testing email sending with fixed tag format...');
    
    const testEmail = process.env.TEST_EMAIL || 'test@example.com';
    console.log(`Using test email: ${testEmail}`);
    
    // Create email parameters first, similar to filingService.sendEmailSummary
    const emailParams = {
      to: testEmail, // Using TEST_EMAIL from environment or fallback
      from: process.env.EMAIL_DEFAULT_FROM || 'tldrSEC <notifications@tldrsec.app>',
      subject: 'Test Email with Fixed Tags',
      html: '<h1>Test Email</h1><p>This is a test email to verify tag format fix.</p>',
      text: 'Test Email\n\nThis is a test email to verify tag format fix.',
      // Using object tags as per the updated EmailMessage interface
      tags: [
        { name: 'test-email' },
        { name: 'type-verification' }
      ],
      replyTo: 'no-reply@tldrsec.app'
    };
    
    console.log('Email parameters:', JSON.stringify(emailParams, null, 2));
    
    // Send email using the parameters object
    const result = await emailClient.sendEmail(emailParams);
    
    // Log the full API response for debugging
    console.log('Email send result:', JSON.stringify(result, null, 2));
    
    return NextResponse.json({ 
      success: true, 
      message: 'Email test completed successfully!',
      result 
    });
  } catch (error: any) {
    console.error('Error sending test email:', error);
    
    return NextResponse.json({ 
      success: false, 
      error: error.message,
      details: error.response?.data || {} 
    }, { status: 500 });
  }
}
