import { create } from 'zustand';
import type { SessionOpts } from './types';
export const useSession = create<{ s: SessionOpts | null; key: number; start: (o: SessionOpts) => void; end: () => void }>(set => ({
  s: null, key: 0,
  start: o => set(st => ({ s: o, key: st.key + 1 })),
  end: () => set({ s: null }),
}));
export const startSession = (o: SessionOpts) => useSession.getState().start(o);
export const sessionActive = () => !!useSession.getState().s;

// test hook: end-to-end tests start a session with known items (e.g. a speaking item matching a test recording)
if (typeof window !== 'undefined') (window as any).__lxStartSession = startSession;
