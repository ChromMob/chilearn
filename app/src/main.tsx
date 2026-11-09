import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/bricolage-grotesque/latin-500.css';
import '@fontsource/bricolage-grotesque/latin-700.css';
import '@fontsource/bricolage-grotesque/latin-800.css';
import '@fontsource/noto-sans/latin-400.css';
import '@fontsource/noto-sans/latin-ext-400.css';
import '@fontsource/noto-sans/latin-600.css';
import '@fontsource/noto-sans/latin-ext-600.css';
import '@fontsource/noto-sans/latin-700.css';
import '@fontsource/noto-sans/latin-ext-700.css';
import './styles/app.css';
import { App } from './App';

// Offline support on real hosts only (service workers are unavailable inside embedded viewers).
if ('serviceWorker' in navigator && location.protocol === 'https:' && window.top === window.self && import.meta.env.PROD) {
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true })).catch(() => {});
}
window.addEventListener('unhandledrejection', e => console.warn('unhandled', e.reason));
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
