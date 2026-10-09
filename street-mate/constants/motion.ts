// One place for every animation timing in the app, so screens, buttons and map markers
// all move with the same feel. Tweak a number here and the whole app follows.

import { Easing } from 'react-native-reanimated';

export const Motion = {
  duration: {
    press: 90, // finger down on a button
    release: 200, // finger up
    fast: 160,
    base: 240, // colour / state changes
    slow: 360, // screens, sheets
  },
  // Gentle ease-out: quick start, soft landing. Feels natural for things appearing.
  easeOut: Easing.bezier(0.22, 1, 0.36, 1),
  // Ease-in-out for things that move from A to B on screen.
  easeInOut: Easing.bezier(0.65, 0, 0.35, 1),
  spring: {
    // Press release: settles quickly with a tiny bounce.
    press: { damping: 16, stiffness: 320, mass: 0.7 },
    // Map stops popping in or changing size: a soft overshoot.
    marker: { damping: 13, stiffness: 190, mass: 0.8 },
    // Panels and cards sliding in.
    panel: { damping: 20, stiffness: 220, mass: 0.9 },
  },
  // How far screens slide when pushed, and how much each list row waits after the one before.
  stagger: 28,
  maxStaggerSteps: 10,
} as const;

/** Delay for the n-th item of a list, capped so long lists never feel slow. */
export const staggerDelay = (index: number, step: number = Motion.stagger) =>
  Math.min(Math.max(index, 0), Motion.maxStaggerSteps) * step;
