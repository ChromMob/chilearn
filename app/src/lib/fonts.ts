/** Verifies that Chinese characters actually render as glyphs (not empty boxes) with the bundled font. */
export const HANZI_FONT = 'Lu Kai';

function pixels(text: string, font: string): Uint8ClampedArray | null {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d'); if (!g) return null;
  g.fillStyle = '#000'; g.font = font; g.textBaseline = 'top'; g.fillText(text, 4, 4);
  return g.getImageData(0, 0, 64, 64).data;
}
const same = (a: Uint8ClampedArray, b: Uint8ClampedArray) => { for (let i = 3; i < a.length; i += 4) if (a[i] !== b[i]) return false; return true; };
const blank = (a: Uint8ClampedArray) => { for (let i = 3; i < a.length; i += 4) if (a[i]) return false; return true; };

export interface GlyphCheck { ok: boolean; bundled: boolean; detail: string }
export async function checkHanziRendering(): Promise<GlyphCheck> {
  let bundled = false;
  try {
    await Promise.race([document.fonts.load(`40px "${HANZI_FONT}"`, '你好学汉字'), new Promise(r => setTimeout(r, 6000))]);
    bundled = document.fonts.check(`40px "${HANZI_FONT}"`, '你');
  } catch { /* ignore */ }
  const font = `40px "${HANZI_FONT}", sans-serif`;
  const a = pixels('你', font), b = pixels('学', font), tofu = pixels('', font);
  if (!a || !b || !tofu) return { ok: true, bundled, detail: 'Canvas unavailable; assuming characters render.' };
  const ok = !blank(a) && !same(a, b) && !same(a, tofu);
  return { ok, bundled, detail: ok ? (bundled ? 'Using the course font.' : 'Using your system’s Chinese font.') : 'Chinese characters are not rendering on this device.' };
}
