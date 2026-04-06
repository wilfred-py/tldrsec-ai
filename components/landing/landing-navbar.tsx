'use client';

import { useEffect, useState, RefObject } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Sheet, SheetTrigger, SheetContent } from '@/components/ui/sheet';
import { Menu, ArrowRight } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { Logo } from '@/components/ui/logo';

interface LandingNavbarProps {
  heroRef: RefObject<HTMLElement | null>;
}

/**
 * Scroll-aware Landing Navbar
 *
 * - Hidden when hero section is in viewport (for unauthenticated users)
 * - Always visible for authenticated users (sticky navigation)
 * - Visible (sticky) when user scrolls past hero section
 * - Shows different CTAs based on user state
 */
export function LandingNavbar({ heroRef }: LandingNavbarProps) {
  const { isSignedIn, isLoaded, isOnboarded } = useAuth();
  const [isVisible, setIsVisible] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Track hero section visibility with Intersection Observer
  useEffect(() => {
    // If user is authenticated, always show navbar
    if (isSignedIn) {
      setIsVisible(true);
      return; // Don't set up observer for authenticated users
    }

    // For unauthenticated users, use scroll-based visibility
    if (!heroRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Show navbar when hero is NOT intersecting (user scrolled past)
        setIsVisible(!entry.isIntersecting);
      },
      {
        threshold: 0,
        rootMargin: '-80px 0px 0px 0px', // Account for navbar height
      }
    );

    observer.observe(heroRef.current);

    return () => observer.disconnect();
  }, [heroRef, isSignedIn]); // Add isSignedIn to dependency array

  // Don't render until Clerk is loaded (prevents flash)
  if (!isLoaded) return null;

  const navLinks = [
    { label: 'Features', href: '#features' },
    { label: 'Pricing', href: '#pricing' },
  ];

  // 3-state CTA button logic
  const ctaButton = isOnboarded ? (
    // State 3: Authenticated AND onboarded → Dashboard
    <Link href="/dashboard">
      <Button className="landing-button-gradient">
        Go to Dashboard
        <ArrowRight className="w-4 h-4 ml-2" />
      </Button>
    </Link>
  ) : isSignedIn ? (
    // State 2: Authenticated but NOT onboarded → Onboarding
    <Link href="/onboarding">
      <Button className="landing-button-gradient">
        Complete Setup
        <ArrowRight className="w-4 h-4 ml-2" />
      </Button>
    </Link>
  ) : (
    // State 1: Unauthenticated → Sign Up
    <Link href="/sign-up">
      <Button className="landing-button-gradient">
        Get Started
        <ArrowRight className="w-4 h-4 ml-2" />
      </Button>
    </Link>
  );

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.nav
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-100 shadow-sm"
        >
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-between h-16">
              {/* Logo */}
              <Link href="/" className="flex items-center gap-2">
                <Logo variant="full" size={24} />
              </Link>

              {/* Desktop Navigation */}
              <div className="hidden md:flex items-center gap-8">
                {navLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    {link.label}
                  </a>
                ))}
              </div>

              {/* Desktop CTA */}
              <div className="hidden md:block">{ctaButton}</div>

              {/* Mobile Menu Button */}
              <div className="md:hidden">
                <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-10 w-10">
                      <Menu className="h-5 w-5" />
                      <span className="sr-only">Open menu</span>
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-[280px] sm:w-[350px]">
                    <div className="flex flex-col gap-6 mt-8">
                      {/* Mobile Nav Links */}
                      <div className="flex flex-col gap-4">
                        {navLinks.map((link) => (
                          <a
                            key={link.href}
                            href={link.href}
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="text-lg font-medium text-gray-700 hover:text-gray-900 transition-colors"
                          >
                            {link.label}
                          </a>
                        ))}
                      </div>

                      {/* Mobile CTA */}
                      <div className="pt-4 border-t border-gray-100">
                        <div onClick={() => setIsMobileMenuOpen(false)}>
                          {ctaButton}
                        </div>
                      </div>
                    </div>
                  </SheetContent>
                </Sheet>
              </div>
            </div>
          </div>
        </motion.nav>
      )}
    </AnimatePresence>
  );
}
