// Force dynamic rendering to prevent static generation during build
export const dynamic = 'force-dynamic';

import { ForgotPasswordClient } from './client';

export default function ForgotPasswordPage() {
  return <ForgotPasswordClient />;
} 