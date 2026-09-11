import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import confetti from 'canvas-confetti';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Whether the user has requested reduced motion at the OS level. Framer
 * Motion animations are already covered app-wide by <MotionConfig
 * reducedMotion="user"> (see main.tsx) and CSS transitions/animations are
 * covered by the global prefers-reduced-motion media query in index.css -
 * but canvas-drawn effects like canvas-confetti aren't CSS or Motion, so
 * they need an explicit check. This app is aimed at people recovering from
 * burnout/anxiety, where uncontrolled motion is a real accessibility concern,
 * not just a nicety.
 */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Fires a canvas-confetti burst, unless the user has asked for reduced motion. */
export function fireConfetti(options?: Parameters<typeof confetti>[0]) {
  if (prefersReducedMotion()) return;
  confetti(options);
}
