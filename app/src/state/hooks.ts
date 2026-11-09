/** Small React hooks bridging non-React services. */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { onVoicesChanged, audioAvailable } from '../lib/audio';
import { Cloud } from './progress';

export function useAudioReady(): boolean {
  return useSyncExternalStore(cb => { const off = onVoicesChanged(cb); return () => { off(); }; }, audioAvailable, () => false);
}
export function useCloudStatus() {
  return useSyncExternalStore(cb => { Cloud.listeners.add(cb); return () => { Cloud.listeners.delete(cb); }; }, () => Cloud.status, () => 'local');
}
export function useNow(intervalMs = 60000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(t); }, [intervalMs]);
  return now;
}
export function useMedia(q: string) {
  const [m, setM] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(q).matches);
  useEffect(() => { const mq = matchMedia(q); const f = () => setM(mq.matches); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f); }, [q]);
  return m;
}
