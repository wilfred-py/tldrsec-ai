import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, createHash } from 'crypto';

export interface CSRFConfig {
  cookieName?: string;
  headerName?: string;
  secret: string;
}

const defaultConfig: Required<CSRFConfig> = {
  cookieName: 'csrf-token',
  headerName: 'x-csrf-token',
  secret: process.env.CSRF_SECRET || 'default-csrf-secret-change-in-production',
};

export function generateCSRFToken(config: CSRFConfig = defaultConfig): string {
  const mergedConfig = { ...defaultConfig, ...config };
  const token = randomBytes(32).toString('hex');
  const hash = createHash('sha256')
    .update(token + mergedConfig.secret)
    .digest('hex');
  
  return `${token}.${hash}`;
}

export function validateCSRFToken(
  token: string,
  config: CSRFConfig = defaultConfig
): boolean {
  const mergedConfig = { ...defaultConfig, ...config };
  const [tokenPart, hashPart] = token.split('.');
  
  if (!tokenPart || !hashPart) {
    return false;
  }
  
  const expectedHash = createHash('sha256')
    .update(tokenPart + mergedConfig.secret)
    .digest('hex');
  
  return hashPart === expectedHash;
}

export function csrfProtection(config: CSRFConfig = defaultConfig) {
  return async function csrfMiddleware(
    request: NextRequest,
    handler: (request: NextRequest) => Promise<NextResponse>
  ): Promise<NextResponse> {
    const mergedConfig = { ...defaultConfig, ...config };
    
    // Only protect non-GET requests
    if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') {
      return handler(request);
    }
    
    // Get CSRF token from header
    const tokenFromHeader = request.headers.get(mergedConfig.headerName);
    
    // Get CSRF token from cookie
    const tokenFromCookie = request.cookies.get(mergedConfig.cookieName)?.value;
    
    // Validate tokens exist and match
    if (!tokenFromHeader || !tokenFromCookie || tokenFromHeader !== tokenFromCookie) {
      return NextResponse.json(
        { error: 'Invalid CSRF token' },
        { status: 403 }
      );
    }
    
    // Validate token format and signature
    if (!validateCSRFToken(tokenFromHeader, mergedConfig)) {
      return NextResponse.json(
        { error: 'Invalid CSRF token signature' },
        { status: 403 }
      );
    }
    
    return handler(request);
  };
}

// Helper function to set CSRF token in response
export function setCSRFTokenCookie(
  response: NextResponse,
  config: CSRFConfig = defaultConfig
): NextResponse {
  const mergedConfig = { ...defaultConfig, ...config };
  const token = generateCSRFToken(mergedConfig);
  
  response.cookies.set(mergedConfig.cookieName, token, {
    httpOnly: false, // Must be accessible by JavaScript for headers
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24, // 24 hours
    path: '/',
  });
  
  return response;
}