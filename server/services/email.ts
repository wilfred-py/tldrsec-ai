import nodemailer from 'nodemailer';
import { createTransport } from 'nodemailer';
import { storage } from '../storage';

// Initialize email transporter
// For development, we'll just use a mock transporter
const transporter = process.env.NODE_ENV === 'production'
  ? createTransport({
      host: process.env.EMAIL_HOST || 'smtp.example.com',
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    })
  : {
      sendMail: async (options: any) => {
        console.log('Email sent:', options);
        return { messageId: 'mock-message-id' };
      },
    };

type EmailOptions = {
  to: string;
  subject: string;
  html: string;
};

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'tldrSEC <noreply@tldrsec.com>',
      ...options,
    });
    
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}

export async function sendSummaryEmail(
  userEmail: string,
  ticker: string,
  companyName: string,
  formType: string,
  summary: string
): Promise<boolean> {
  const subject = `tldrSEC: New ${formType} Summary for ${ticker}`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #3b82f6; color: white; padding: 20px; text-align: center;">
        <h1 style="margin: 0;">tldrSEC</h1>
        <p style="margin: 5px 0 0;">AI-Powered SEC Filings Summarizer</p>
      </div>
      
      <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none;">
        <h2>New ${formType} Filing Summary</h2>
        <p>Company: <strong>${ticker} - ${companyName}</strong></p>
        
        <div style="margin-top: 20px; padding: 15px; background-color: #f3f4f6; border-radius: 5px;">
          <h3>Summary:</h3>
          <div>${summary}</div>
        </div>
        
        <div style="margin-top: 30px; text-align: center;">
          <a href="https://tldrsec.com/dashboard" 
             style="background-color: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
            View on Dashboard
          </a>
        </div>
        
        <p style="margin-top: 30px; font-size: 12px; color: #6b7280; text-align: center;">
          You received this email because you're tracking ${ticker} on tldrSEC.<br>
          To update your preferences, visit your <a href="https://tldrsec.com/settings" style="color: #3b82f6;">settings page</a>.
        </p>
      </div>
    </div>
  `;
  
  return sendEmail({
    to: userEmail,
    subject,
    html,
  });
}

export async function sendFilingDigestEmail(
  userEmail: string,
  summaries: { ticker: string; formType: string; summary: string }[]
): Promise<boolean> {
  const subject = `tldrSEC: Your SEC Filings Digest`;
  
  const summariesHtml = summaries.map(s => `
    <div style="margin-bottom: 25px; padding: 15px; background-color: #f3f4f6; border-radius: 5px;">
      <h3>${s.ticker} - ${s.formType}</h3>
      <div>${s.summary}</div>
    </div>
  `).join('');
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #3b82f6; color: white; padding: 20px; text-align: center;">
        <h1 style="margin: 0;">tldrSEC</h1>
        <p style="margin: 5px 0 0;">Your SEC Filings Digest</p>
      </div>
      
      <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none;">
        <h2>Recent Filing Summaries</h2>
        
        ${summariesHtml}
        
        <div style="margin-top: 30px; text-align: center;">
          <a href="https://tldrsec.com/dashboard" 
             style="background-color: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
            View All on Dashboard
          </a>
        </div>
        
        <p style="margin-top: 30px; font-size: 12px; color: #6b7280; text-align: center;">
          You received this digest email based on your notification preferences.<br>
          To update your preferences, visit your <a href="https://tldrsec.com/settings" style="color: #3b82f6;">settings page</a>.
        </p>
      </div>
    </div>
  `;
  
  return sendEmail({
    to: userEmail,
    subject,
    html,
  });
}
