import { NextRequest, NextResponse } from 'next/server';
import { generateCSRFToken, setCSRFTokenCookie } from '@/lib/middleware/csrf';

export async function GET(request: NextRequest) {
  const token = generateCSRFToken();
  
  const response = NextResponse.json({ token });
  
  // Set CSRF token cookie
  setCSRFTokenCookie(response);
  
  return response;
}