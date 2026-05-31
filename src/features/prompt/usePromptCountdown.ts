import { useEffect, useRef, useState } from 'react';

/**
 * Pure display helper. Takes the server-supplied on-time and late deadlines
 * and ticks the visible "seconds remaining" string. CRITICALLY: this hook
 * does NOT infer state ('active'|'late'|'missed') — that's the server's job
 * (CLAUDE.md non-negotiable #4). All it does is count down.
 *
 * When a deadline is crossed it fires `onBoundaryCross` so the screen can
 * refetch the PromptView and pick up the server's recomputed `state`. The
 * UI then re-renders from the new state, never from local arithmetic.
 *
 * Tick interval is 250ms — fine-grained enough that a "1s left" display
 * doesn't visibly skip, cheap enough not to matter.
 */
export function usePromptCountdown({
  onTimeDeadline,
  lateDeadline,
  onBoundaryCross,
}: {
  onTimeDeadline: string;
  lateDeadline: string;
  onBoundaryCross?: () => void;
}): {
  secondsToOnTime: number;
  secondsToLate: number;
  crossedOnTime: boolean;
  crossedLate: boolean;
} {
  const [now, setNow] = useState(() => Date.now());
  const onTimeMs = useRef(new Date(onTimeDeadline).getTime());
  const lateMs = useRef(new Date(lateDeadline).getTime());
  const crossedOnTimeRef = useRef(false);
  const crossedLateRef = useRef(false);

  // Re-baseline if the deadlines change (e.g., after a refetch following a
  // boundary cross — the prompt itself is immutable but useEffect's deps
  // catch any swap to a new prompt id).
  useEffect(() => {
    onTimeMs.current = new Date(onTimeDeadline).getTime();
    lateMs.current = new Date(lateDeadline).getTime();
    crossedOnTimeRef.current = Date.now() >= onTimeMs.current;
    crossedLateRef.current = Date.now() >= lateMs.current;
  }, [onTimeDeadline, lateDeadline]);

  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (!crossedOnTimeRef.current && t >= onTimeMs.current) {
        crossedOnTimeRef.current = true;
        onBoundaryCross?.();
      }
      if (!crossedLateRef.current && t >= lateMs.current) {
        crossedLateRef.current = true;
        onBoundaryCross?.();
      }
    }, 250);
    return () => clearInterval(id);
  }, [onBoundaryCross]);

  const secondsToOnTime = Math.max(0, Math.ceil((onTimeMs.current - now) / 1000));
  const secondsToLate = Math.max(0, Math.ceil((lateMs.current - now) / 1000));

  return {
    secondsToOnTime,
    secondsToLate,
    crossedOnTime: now >= onTimeMs.current,
    crossedLate: now >= lateMs.current,
  };
}
