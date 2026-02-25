'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useAuthContext } from '@/lib/context/auth-context';

export function Navigation() {
  const { isAuthenticated, isLoading } = useAuthContext();
  const pathname = usePathname();

  const isAuthPage = pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up');

  return (
    <div className="sticky top-0 z-40 w-full bg-background/70 backdrop-blur-lg">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Link href="/" className="text-2xl font-bold text-foreground">
              tldrSEC
            </Link>
          </div>

          {!isAuthPage && (
            <nav className="hidden md:flex items-center space-x-1">
              <NavLink href="#features">Features</NavLink>
              <NavLink href="#pricing">Pricing</NavLink>
              <NavLink href="/changelog">Changelog</NavLink>
              <NavLink href="/contact">Contact</NavLink>
            </nav>
          )}

          <div className="flex items-center">
            {!isLoading && !isAuthPage && (
              isAuthenticated ? (
                <Link href="/dashboard">
                  <Button
                    className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-lg"
                  >
                    Dashboard
                  </Button>
                </Link>
              ) : (
                <Link href="/sign-up">
                  <Button
                    className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-lg"
                  >
                    Get Started
                  </Button>
                </Link>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link 
      href={href}
      className="px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
    >
      {children}
    </Link>
  );
} 