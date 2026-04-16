import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import * as fs from 'fs';
import * as path from 'path';

// Test 1: Color tokens exist in globals.css
describe('Design System - Colors', () => {
  let globalsContent: string;

  beforeAll(() => {
    // Read the globals.css file to verify CSS variables are defined
    const globalsPath = path.join(process.cwd(), 'app/globals.css');
    globalsContent = fs.readFileSync(globalsPath, 'utf-8');
  });

  it('should have light theme primary blue defined in globals.css', () => {
    expect(globalsContent).toContain('--brand-primary:');
    expect(globalsContent).toContain('#0079F2');
  });

  it('should have trust metric colors defined in globals.css', () => {
    expect(globalsContent).toContain('--brand-success:');
    expect(globalsContent).toContain('--brand-accent:');
    expect(globalsContent).toContain('#10B981'); // success green
    expect(globalsContent).toContain('#8B5CF6'); // accent purple
  });

  it('should have all required landing color tokens', () => {
    const requiredTokens = [
      '--brand-primary',
      '--brand-primary-hover',
      '--brand-primary-light',
      '--brand-secondary',
      '--brand-text',
      '--brand-text-muted',
      '--brand-bg',
      '--brand-bg-subtle',
      '--brand-border',
      '--brand-success',
      '--brand-accent',
    ];

    requiredTokens.forEach((token) => {
      expect(globalsContent).toContain(`${token}:`);
    });
  });

  it('should use raw HSL channel values, not oklch (Tailwind v3 compatibility)', () => {
    // Tailwind v3 wraps variables in hsl(). If globals.css uses oklch() values,
    // the compiled CSS produces invalid hsl(oklch(...)) — breaking all theme colors.
    // This guard catches regressions from shadcn CLI updates that generate oklch format.
    const themeVars = [
      '--background', '--foreground', '--card', '--popover', '--primary',
      '--secondary', '--muted', '--accent', '--destructive', '--border',
      '--input', '--ring', '--sidebar',
      '--fintech-primary', '--fintech-secondary', '--fintech-accent',
      '--fintech-success', '--fintech-bg-subtle', '--fintech-text-primary', '--fintech-text-secondary',
    ];
    for (const token of themeVars) {
      const regex = new RegExp(`${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*oklch`);
      expect(globalsContent).not.toMatch(regex);
    }
  });
});

// Test 2: Animation primitives work correctly
describe('Design System - Animations', () => {
  it('should export fadeUpVariant animation config', async () => {
    const { fadeUpVariant } = await import('@/lib/animations/landing-animations');
    expect(fadeUpVariant).toHaveProperty('initial');
    expect(fadeUpVariant).toHaveProperty('animate');
    expect(fadeUpVariant.initial).toEqual({ opacity: 0, y: 20 });
  });

  it('should export staggerContainer animation config', async () => {
    const { staggerContainer } = await import('@/lib/animations/landing-animations');
    expect(staggerContainer).toHaveProperty('animate');
    expect(staggerContainer.animate).toHaveProperty('transition');
  });

  it('should respect reduced motion preference', async () => {
    const { getReducedMotionVariant } = await import('@/lib/animations/landing-animations');
    const variant = getReducedMotionVariant({ opacity: 0, y: 20 }, { opacity: 1, y: 0 });
    // When reduced motion is preferred, y should not animate (only opacity)
    expect(variant.reducedMotion.initial).toEqual({ opacity: 0 });
    // The animate state includes transition config
    expect(variant.reducedMotion.animate).toHaveProperty('opacity', 1);
    expect(variant.reducedMotion.animate).not.toHaveProperty('y');
  });

  it('should export meshGradientStyle for hero background', async () => {
    const { meshGradientStyle } = await import('@/lib/animations/landing-animations');
    expect(meshGradientStyle).toHaveProperty('background');
    expect(meshGradientStyle).toHaveProperty('backgroundSize');
    expect(meshGradientStyle.background).toContain('radial-gradient');
  });

  it('should export viewportOnce settings for whileInView', async () => {
    const { viewportOnce } = await import('@/lib/animations/landing-animations');
    expect(viewportOnce).toHaveProperty('once', true);
    expect(viewportOnce).toHaveProperty('margin');
  });
});

// Test 3: Typography classes are defined in globals.css
describe('Design System - Typography', () => {
  let globalsContent: string;

  beforeAll(() => {
    const globalsPath = path.join(process.cwd(), 'app/globals.css');
    globalsContent = fs.readFileSync(globalsPath, 'utf-8');
  });

  it('should have display heading class defined', () => {
    expect(globalsContent).toContain('.brand-display');
  });

  it('should have all required typography classes', () => {
    const requiredClasses = [
      '.brand-display',
      '.brand-heading',
      '.brand-subheading',
      '.brand-body',
      '.brand-body-large',
      '.brand-caption',
      '.brand-gradient-text',
    ];

    requiredClasses.forEach((className) => {
      expect(globalsContent).toContain(className);
    });
  });

  it('should have button styles defined', () => {
    expect(globalsContent).toContain('.brand-button-primary');
    expect(globalsContent).toContain('.brand-button-secondary');
  });

  it('should have card and badge styles defined', () => {
    expect(globalsContent).toContain('.brand-card');
    expect(globalsContent).toContain('.brand-badge');
  });

  it('should render elements with landing classes correctly', () => {
    render(<h1 className="brand-display">Test</h1>);
    const heading = screen.getByText('Test');
    expect(heading).toHaveClass('brand-display');
  });
});
