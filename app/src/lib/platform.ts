/** Platform detection used for setup instructions. */
export type Platform = 'ios' | 'android' | 'mac' | 'windows' | 'linux' | 'other';
export type Browser = 'chrome' | 'edge' | 'safari' | 'firefox' | 'samsung' | 'other';
export function platform(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Mac OS X/.test(ua)) return 'mac';
  if (/Windows/.test(ua)) return 'windows';
  if (/Linux/.test(ua)) return 'linux';
  return 'other';
}
export function browser(): Browser {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'edge';
  if (/SamsungBrowser/.test(ua)) return 'samsung';
  if (/Firefox|FxiOS/.test(ua)) return 'firefox';
  if (/Chrome|CriOS/.test(ua)) return 'chrome';
  if (/Safari/.test(ua)) return 'safari';
  return 'other';
}
/** True inside the Claude artifact viewer (framed with the claude runtime). */
export const inClaudeViewer = () => typeof window !== 'undefined' && !!(window as any).claude && window.top !== window.self;

export function voiceInstallHelp(): string {
  switch (platform()) {
    case 'ios': return 'Settings → Accessibility → Spoken Content → Voices → Chinese (China mainland) → download a voice such as Tingting or Yu-shu.';
    case 'mac': return 'System Settings → Accessibility → Spoken Content → System voice → Manage Voices → add a Chinese (China mainland) voice.';
    case 'android': return 'Settings → Accessibility → Text-to-speech → Google Speech Services → install Chinese (Mandarin) voice data.';
    case 'windows': return 'Settings → Time & language → Speech → Add voices → Chinese (Simplified, China). Or use Microsoft Edge, which includes natural Chinese voices.';
    default: return 'Use Chrome or Edge, which include a Mandarin voice, or install a Chinese (Mandarin) voice for your system.';
  }
}
export function micPermissionHelp(): string {
  switch (browser()) {
    case 'safari': return platform() === 'ios' ? 'Settings → Safari → Microphone → Allow, then reload this page.' : 'Safari → Settings for This Website → Microphone → Allow, then reload.';
    case 'firefox': return 'Click the microphone icon in the address bar and allow access, then reload.';
    default: return 'Click the lock or tune icon at the left of the address bar → Site settings → Microphone → Allow, then reload.';
  }
}
export function recognitionHelp(): string {
  const b = browser(), p = platform();
  if (b === 'firefox') return 'Firefox can’t transcribe speech. Use Chrome, Edge or Safari for spoken-sentence checking. Tone checking still works here.';
  if (p === 'ios' || b === 'safari') return 'Safari uses Apple dictation: turn on Settings → General → Keyboard → Enable Dictation (and Siri if asked), then try again.';
  return 'Speech recognition in Chrome and Edge uses an online service: check your internet connection and that no extension blocks it.';
}
