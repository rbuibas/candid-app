import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import type { PromptPushPayload } from './payload';

/**
 * Tiny pub/sub for the in-app foreground banner. Push handlers publish a
 * parsed payload; the banner subscribes and renders. React context is plenty
 * for a single-banner use case — Zustand isn't installed yet and pulling it
 * in just for this would be over-reach.
 */
type Value = {
  current: PromptPushPayload | null;
  show: (p: PromptPushPayload) => void;
  dismiss: () => void;
};

const Ctx = createContext<Value | null>(null);

export function ForegroundPushProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<PromptPushPayload | null>(null);
  const show = useCallback((p: PromptPushPayload) => setCurrent(p), []);
  const dismiss = useCallback(() => setCurrent(null), []);
  const value = useMemo(() => ({ current, show, dismiss }), [current, show, dismiss]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useForegroundPush(): Value {
  const v = useContext(Ctx);
  if (!v) throw new Error('useForegroundPush() must be called inside <ForegroundPushProvider>');
  return v;
}
