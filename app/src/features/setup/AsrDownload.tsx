/** Download (once) and start the on-device speech checker, with progress and clear failure messages. */
import { useEffect } from 'react';
import { ASR_DOWNLOAD_MB, asrDownloaded, loadAsr } from '../../lib/asr';
import { useAsr } from '../../lib/asr/useAsr';
import { Icon } from '../../ui/Icon';

export function AsrDownload({ onReady, autoIfCached = true }: { onReady?: () => void; autoIfCached?: boolean }) {
  const { state, progress, error } = useAsr();
  useEffect(() => { if (state === 'ready') onReady?.(); }, [state]);
  useEffect(() => { if (autoIfCached && state === 'idle') asrDownloaded().then(c => { if (c) loadAsr(); }); }, []);
  if (state === 'ready') return null;
  if (state === 'loading') {
    const pct = progress.total ? Math.min(100, Math.round((progress.loaded / progress.total) * 100)) : 0;
    return (
      <div className="stack asr-dl" aria-live="polite">
        <div className="row"><div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Speech checker download"><i style={{ width: pct + '%' }} /></div><span className="small muted">{pct}%</span></div>
        <p className="small muted">{progress.stage === 'starting' ? 'Starting the speech checker…' : `Downloading the speech checker… ${Math.round(progress.loaded / 1e6)} of ${Math.round((progress.total || ASR_DOWNLOAD_MB * 1e6) / 1e6)} MB`}</p>
      </div>
    );
  }
  return (
    <div className="stack asr-dl">
      <button className="btn sm" type="button" onClick={() => loadAsr()}><Icon name="mic" />{state === 'error' ? 'Try again' : `Download speech checker (${ASR_DOWNLOAD_MB} MB, once)`}</button>
      {state === 'error' && <p className="small">The speech checker couldn’t start ({error}). Check your connection and try again.</p>}
    </div>
  );
}
