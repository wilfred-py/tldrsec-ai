/**
 * Create a mock Request object for testing API routes
 */
export function mockRequest(options: {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: any;
}) {
  const { url, method = 'GET', headers = {}, body = undefined } = options;
  
  return new Request(url, {
    method,
    headers: new Headers(headers),
    ...(body ? { body: JSON.stringify(body) } : {})
  });
} 