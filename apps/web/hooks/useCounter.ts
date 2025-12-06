import { useState, useEffect } from 'react';

/**
 * Animated counter hook for smooth number transitions
 * @param end - Target number to count to
 * @param duration - Animation duration in milliseconds (default: 2000ms)
 * @param startCounting - Boolean to trigger the animation
 * @returns Current count value
 */
export function useCounter(end: number, duration: number = 2000, startCounting: boolean = false): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!startCounting) return;

    let startTime: number;
    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      setCount(Math.floor(progress * end));
      if (progress < 1) {
        requestAnimationFrame(step);
      }
    };
    requestAnimationFrame(step);
  }, [end, duration, startCounting]);

  return count;
}
