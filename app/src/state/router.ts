/** Hash routing with plain #names (works on static hosts and inside the Claude viewer). */
import { useSyncExternalStore } from 'react';
export type Route = 'learn' | 'review' | 'practice' | 'words' | 'profile';
const ROUTES: Route[] = ['learn', 'review', 'practice', 'words', 'profile'];
const current = (): Route => { const h = location.hash.slice(1) as Route; return ROUTES.includes(h) ? h : 'learn'; };
export function useRoute(): Route { return useSyncExternalStore(cb => { window.addEventListener('hashchange', cb); return () => window.removeEventListener('hashchange', cb); }, current, () => 'learn'); }
export function go(r: Route) { if (current() !== r) { history.replaceState(null, '', '#' + r); window.dispatchEvent(new HashChangeEvent('hashchange')); } window.scrollTo(0, 0); }
