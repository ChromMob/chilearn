import { useEffect, useState } from 'react';
import { asrError, asrProgress, asrState, onAsrChange } from './index';
/** Live state of the on-device speech checker (download progress, ready, error). */
export function useAsr() {
  const read = () => ({ state: asrState(), progress: asrProgress(), error: asrError() });
  const [s, set] = useState(read);
  useEffect(() => onAsrChange(() => set(read())), []);
  return s;
}
