// Whether the visitor asked for less motion, as a store React can subscribe to
const MOTION = '(prefers-reduced-motion: reduce)';

export const prefersStill = () => window.matchMedia(MOTION).matches;

export const onMotionChange = (notify: () => void) => {
  const query = window.matchMedia(MOTION);
  query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
};
