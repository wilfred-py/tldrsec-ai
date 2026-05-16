import { Variants, Transition } from 'framer-motion';

/**
 * Landing Page V2 Animation Primitives
 *
 * GPU-accelerated animations using transform and opacity only.
 * Includes reduced motion support for accessibility.
 */

// Base transition config
export const defaultTransition: Transition = {
  duration: 0.5,
  ease: [0.25, 0.1, 0.25, 1], // Smooth ease-out
};

/**
 * Fade up animation (most common)
 * Elements fade in while moving up 20px
 */
export const fadeUpVariant: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: defaultTransition,
  },
};

/**
 * Fade in animation (no movement)
 * Simple opacity fade for subtle elements
 */
export const fadeInVariant: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: 0.4 },
  },
};

/**
 * Scale up animation (for cards on hover)
 * Subtle scale increase on hover state
 */
export const scaleUpVariant: Variants = {
  initial: { scale: 1 },
  hover: {
    scale: 1.02,
    transition: { duration: 0.2 },
  },
};

/**
 * Stagger container for lists/grids
 * Parent container that staggers children animations
 */
export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

/**
 * Stagger item (child of staggerContainer)
 * Individual items in a staggered animation group
 */
export const staggerItem: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: defaultTransition,
  },
};

/**
 * Reduced motion support
 * Creates variants that respect user's motion preferences
 */
interface MotionState {
  opacity?: number;
  y?: number;
  x?: number;
  scale?: number;
  transition?: {
    duration?: number;
  };
}

interface ReducedMotionResult {
  standard: Variants;
  reducedMotion: {
    initial: MotionState;
    animate: MotionState;
  };
}

export function getReducedMotionVariant(
  initial: MotionState,
  animate: MotionState
): ReducedMotionResult {
  // For reduced motion, only animate opacity (no transforms)
  const reducedInitial: MotionState = { opacity: initial.opacity ?? 0 };
  const reducedAnimate: MotionState = { opacity: animate.opacity ?? 1, transition: { duration: 0.2 } };

  return {
    standard: {
      initial,
      animate: { ...animate, transition: defaultTransition },
    },
    reducedMotion: {
      initial: reducedInitial,
      animate: reducedAnimate,
    },
  };
}

/**
 * Viewport trigger settings
 * Consistent settings for whileInView animations
 */
export const viewportOnce = {
  once: true,
  margin: '-100px',
};

/**
 * Counter animation for trust metrics
 * Spring-based animation for number displays
 */
export const counterVariant = {
  initial: { opacity: 0, scale: 0.5 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 200,
      damping: 15,
    },
  },
};

/**
 * Gradient text animation
 * Continuous gradient position animation
 */
export const gradientTextVariant: Variants = {
  initial: { backgroundPosition: '0% 50%' },
  animate: {
    backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
    transition: {
      duration: 5,
      repeat: Infinity,
      ease: 'linear',
    },
  },
};

/**
 * Mesh gradient background style (CSS-based, not WebGL)
 * Stripe-inspired multi-layered radial gradients
 * Gradient extends fully to bottom, blending with white sections below
 */
export const meshGradientStyle = {
  background: `
    radial-gradient(ellipse 80% 50% at 40% 20%, rgba(0, 121, 242, 0.12) 0%, transparent 100%),
    radial-gradient(ellipse 60% 40% at 80% 10%, rgba(139, 92, 246, 0.08) 0%, transparent 100%),
    radial-gradient(ellipse 70% 50% at 10% 60%, rgba(0, 121, 242, 0.06) 0%, transparent 100%),
    radial-gradient(ellipse 50% 40% at 90% 70%, rgba(139, 92, 246, 0.05) 0%, transparent 100%),
    linear-gradient(180deg, rgba(240, 247, 255, 0.8) 0%, rgba(248, 250, 252, 0.4) 50%, #FFFFFF 100%)
  `,
  backgroundSize: '100% 100%',
};

/**
 * Editorial background style (landing hero v3) — solid warm bone.
 * Replaces the multi-layered mesh gradient with a single flat color so the
 * serif display headline and inbox widget can breathe.
 */
export const editorialBgStyle = {
  background: 'var(--editorial-bg, #F8F6F2)',
};

/**
 * Animated mesh gradient (subtle movement)
 * For background animations with subtle position changes
 */
export const animatedMeshGradient = {
  initial: {
    backgroundPosition: '0% 0%',
  },
  animate: {
    backgroundPosition: ['0% 0%', '100% 100%', '0% 0%'],
    transition: {
      duration: 20,
      repeat: Infinity,
      ease: 'linear',
    },
  },
};

/**
 * Slide in from right animation
 * For elements like filing cards that enter from the side
 */
export const slideInRightVariant: Variants = {
  initial: { opacity: 0, x: 40 },
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.6, delay: 0.4 },
  },
};

/**
 * Hover lift animation
 * Subtle y-translation on hover for cards
 */
export const hoverLiftVariant: Variants = {
  initial: { y: 0 },
  hover: {
    y: -4,
    transition: { duration: 0.2 },
  },
};
