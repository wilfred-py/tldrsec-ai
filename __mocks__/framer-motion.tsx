import React from 'react';

/**
 * Jest mock for framer-motion
 * Renders motion.* components as their plain HTML equivalents without animation.
 */

const motion = new Proxy(
  {},
  {
    get: (_target, prop: string) => {
      return React.forwardRef(
        ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>, ref: React.Ref<HTMLElement>) => {
          // Filter out framer-motion-specific props
          const htmlProps: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(props)) {
            if (
              !key.startsWith('animate') &&
              !key.startsWith('initial') &&
              !key.startsWith('exit') &&
              !key.startsWith('transition') &&
              !key.startsWith('variants') &&
              !key.startsWith('whileHover') &&
              !key.startsWith('whileInView') &&
              !key.startsWith('whileTap') &&
              !key.startsWith('whileFocus') &&
              !key.startsWith('whileDrag') &&
              !key.startsWith('viewport') &&
              !key.startsWith('layout') &&
              !key.startsWith('drag') &&
              key !== 'onAnimationComplete' &&
              key !== 'onAnimationStart'
            ) {
              htmlProps[key] = value;
            }
          }
          return React.createElement(prop, { ...htmlProps, ref }, children);
        }
      );
    },
  }
);

function AnimatePresence({ children }: React.PropsWithChildren<Record<string, unknown>>) {
  return <>{children}</>;
}

function useReducedMotion() {
  return false;
}

export { motion, AnimatePresence, useReducedMotion };
export default { motion, AnimatePresence, useReducedMotion };
