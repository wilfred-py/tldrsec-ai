import { NextResponse } from 'next/server';
import { emailClient } from '@/lib/email';

export async function GET() {
  try {
    console.log('Testing email sending with fixed tag format...');
    
    const result = await emailClient.sendEmail({
      to: 'test@example.com', // Replace with a test email if you want to actually send
      subject: 'Test Email with Fixed Tags',
      html: '<h1>Test Email</h1><p>This is a test email to verify tag format fix.</p>',
      text: 'Test Email\n\nThis is a test email to verify tag format fix.',
      tags: ['test:email', 'type:verification'],
      replyTo: 'no-reply@tldrsec.app'
    });
    
    console.log('Email send result:', result);
    
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
