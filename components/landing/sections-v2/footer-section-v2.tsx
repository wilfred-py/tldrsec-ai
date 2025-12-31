import Link from 'next/link';
import { FileText } from 'lucide-react';

/**
 * Product navigation links
 */
const productLinks = [
  { label: 'Pricing', href: '#pricing' },
  { label: 'Sign Up', href: '/sign-up' },
  { label: 'Sign In', href: '/sign-in' },
];

/**
 * Legal navigation links
 */
const legalLinks = [
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Terms of Service', href: '/terms' },
];

/**
 * Footer Section V2 Component
 *
 * Light theme footer with:
 * - Brand logo and tagline
 * - Product links
 * - Legal links
 * - Copyright notice
 * - SEC disclaimer
 */
export function FooterSectionV2() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="py-12 bg-white border-t" style={{ borderColor: 'var(--landing-border)' }}>
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-6 h-6 text-[var(--landing-primary)]" />
              <span className="text-xl font-bold" style={{ color: 'var(--landing-secondary)' }}>
                tldrsec
              </span>
            </div>
            <p className="landing-caption max-w-sm">
              AI-powered SEC filing analysis for modern investors.
              Save hours every week with intelligent summaries.
            </p>
          </div>

          {/* Product Links */}
          <div>
            <h4 className="font-semibold mb-4" style={{ color: 'var(--landing-secondary)' }}>
              Product
            </h4>
            <ul className="space-y-2">
              {productLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="landing-caption hover:text-[var(--landing-primary)] transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal Links */}
          <div>
            <h4 className="font-semibold mb-4" style={{ color: 'var(--landing-secondary)' }}>
              Legal
            </h4>
            <ul className="space-y-2">
              {legalLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="landing-caption hover:text-[var(--landing-primary)] transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t" style={{ borderColor: 'var(--landing-border)' }}>
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="landing-caption">
              © {currentYear} tldrsec. All rights reserved.
            </p>
            <p className="landing-caption text-center md:text-right max-w-md">
              This service provides summaries for informational purposes only and is not investment advice.
              Always consult original SEC filings for complete information.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
