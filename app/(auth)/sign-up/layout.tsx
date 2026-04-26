import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign up',
  // Transactional page with no unique SEO content. Drop from Google's index
  // so content pages don't compete with it for crawl budget. Crawlable
  // (not in robots.txt disallow) so Google can discover the noindex directive.
  robots: {
    index: false,
    follow: true,
  },
};

export default function SignUpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
