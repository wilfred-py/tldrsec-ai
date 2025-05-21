import { Resend } from 'resend';

const resend = new Resend('re_test');

// Check types
async function test() {
  try {
    const result = await resend.emails.send({
      from: 'test@example.com',
      to: 'recipient@example.com',
      subject: 'Test email',
      html: '<p>Test</p>'
    });
    
    console.log(result);
    // Check what properties exist on result
    console.log(Object.keys(result));
  } catch (error) {
    console.error(error);
  }
}

// Explicitly log the types
type EmailResponse = Awaited<ReturnType<typeof resend.emails.send>>;
type EmailOptions = Parameters<typeof resend.emails.send>[0];

// Log structure
const responseStructure: EmailResponse = {
  id: '',
  // Check other properties that might exist
};

const optionsStructure: EmailOptions = {
  from: '',
  to: '',
  subject: '',
  html: '',
  // Check other properties
}; 