/** App shell: boot (data, course, font check), navigation, screens, overlays. */
import { useEffect, useState } from 'react';
import { initData, loadLevel } from './lib/data';
import { buildCourse } from './lib/course';
import { configureAudio, unlockAudio, loadAudioIndex } from './lib/audio';
import { checkHanziRendering } from './lib/fonts';
import { useProgress, dueCount, streakNow, todayStat, Cloud } from './state/progress';
import { useRoute, go, type Route } from './state/router';
import { useNow } from './state/hooks';
import { Icon } from './ui/Icon';
import { SheetHost, Toaster, Banner } from './ui/Primitives';
import { GlossPopover } from './ui/Hanzi';
import { Player } from './features/player/Player';
import { useSession } from './features/player/session';
import { Onboarding } from './features/onboarding/Onboarding';
import { LearnScreen } from './features/path/LearnScreen';
import { ReviewScreen } from './features/review/ReviewScreen';
import { PracticeScreen } from './features/practice/PracticeScreen';
import { WordsScreen } from './features/words/WordsScreen';
import { ProfileScreen } from './features/profile/ProfileScreen';
import { openSetup } from './features/setup/openSetup';
import { ErrorBoundary } from './ui/ErrorBoundary';

const NAV: { id: Route; label: string; icon: string }[] = [
  { id: 'learn', label: 'Learn', icon: 'path' }, { id: 'review', label: 'Review', icon: 'review' }, { id: 'practice', label: 'Practice', icon: 'practice' },
  { id: 'words', label: 'Words', icon: 'words' }, { id: 'profile', label: 'Profile', icon: 'me' },
];

export function App() {
  const [boot, setBoot] = useState<'loading' | 'ready' | 'error'>('loading');
  const [glyphsOk, setGlyphsOk] = useState(true);
  const onboarded = useProgress(s => s.onboarded);
  const theme = useProgress(s => s.settings.theme);
  const settings = useProgress(s => s.settings);
  const session = useSession();

  async function start() {
    setBoot('loading');
    try {
      loadAudioIndex('shared');
      const core = await initData();
      buildCourse(core);
      setBoot('ready');
      loadLevel('1').catch(() => {});
      Cloud.init();
      checkHanziRendering().then(r => setGlyphsOk(r.ok));
    } catch (e) { console.error(e); setBoot('error'); }
  }
  useEffect(() => { start(); }, []);
  useEffect(() => { configureAudio({ voice: settings.voice, rate: settings.rate, sound: settings.sound, source: settings.audio || 'course' }); }, [settings.voice, settings.rate, settings.sound, settings.audio]);
  useEffect(() => {
    const root = document.documentElement; const host = (window as any).__hostTheme ??= root.getAttribute('data-theme');
    if (theme) root.setAttribute('data-theme', theme); else if (host) root.setAttribute('data-theme', host); else root.removeAttribute('data-theme');
  }, [theme]);
  useEffect(() => { const f = () => unlockAudio(); window.addEventListener('pointerdown', f, { once: true }); return () => window.removeEventListener('pointerdown', f); }, []);

  if (boot === 'loading') return <div className="boot"><div className="seal" aria-hidden="true">路</div><p>Loading your course…</p></div>;
  if (boot === 'error') return (
    <div className="boot"><div className="seal" aria-hidden="true">路</div><p>The course couldn’t be loaded. Check your connection and try again.</p><button className="btn primary" type="button" onClick={start}>Try again</button></div>
  );
  return (
    <>
      <ErrorBoundary fallback={reset => <div className="boot"><div className="seal" aria-hidden="true">路</div><p>Something went wrong on this screen. Your progress is safe.</p><div className="row center"><button className="btn" type="button" onClick={() => { location.hash = '#learn'; reset(); }}>Go to Learn</button><button className="btn primary" type="button" onClick={() => location.reload()}>Reload</button></div></div>}>
        {!onboarded ? <Onboarding /> : <Shell glyphsOk={glyphsOk} />}
      </ErrorBoundary>
      {session.s && <Player key={session.key} opts={session.s} />}
      <SheetHost />
      <GlossPopover />
      <Toaster />
    </>
  );
}

function Shell({ glyphsOk }: { glyphsOk: boolean }) {
  const route = useRoute();
  useProgress(s => s.srs); useProgress(s => s.days); useNow(60000);
  const due = dueCount(); const st = streakNow(); const t = todayStat(); const goal = useProgress(s => s.settings.goal);
  const nav = NAV.map(n => (
    <button key={n.id} className="navbtn" type="button" aria-current={route === n.id ? 'page' : undefined} onClick={() => go(n.id)}>
      <Icon name={n.icon} /><span>{n.label}</span>{n.id === 'review' && due > 0 && <span className="badge tnum">{due > 99 ? '99+' : due}</span>}
    </button>
  ));
  return (
    <div className="shell">
      <nav className="rail" aria-label="Main"><div className="brand"><div className="seal" aria-hidden="true">路</div>Lùxiàn</div>{nav}</nav>
      <main className="main">
        <div className="main-inner">
          <header className="topbar">
            <div className="brand"><div className="seal" aria-hidden="true">路</div><span>Lùxiàn</span></div>
            <span className={'chip-stat streak' + (st ? '' : ' cold')} title="Day streak"><Icon name="flame" /><span className="tnum">{st}</span><span className="sr">day streak</span></span>
            <span className="chip-stat xp" title="XP today"><Icon name="bolt" /><span className="tnum">{t.xp}/{goal}</span><span className="sr">XP today</span></span>
          </header>
          {!glyphsOk && <Banner tone="warn" icon="alert"><p><b>Chinese characters aren’t displaying correctly on this device.</b> Update your browser or try Chrome, Edge or Safari.</p><button className="btn sm" type="button" onClick={openSetup}>Run the setup check</button></Banner>}
          {route === 'learn' && <LearnScreen />}
          {route === 'review' && <ReviewScreen />}
          {route === 'practice' && <PracticeScreen />}
          {route === 'words' && <WordsScreen />}
          {route === 'profile' && <ProfileScreen />}
        </div>
      </main>
      <nav className="bottomnav" aria-label="Main">{nav}</nav>
    </div>
  );
}
