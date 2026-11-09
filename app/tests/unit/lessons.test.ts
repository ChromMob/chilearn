import { describe, it, expect, beforeAll, vi } from 'vitest';
import fs from 'node:fs';
import type { Item } from '../../src/lib/types';

// Serve ./data/* from public/data so the real loaders run under test.
beforeAll(() => {
  vi.stubGlobal('fetch', async (url: string) => {
    const p = 'public/data/' + String(url).split('/data/')[1];
    return { ok: fs.existsSync(p), status: fs.existsSync(p) ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(p, 'utf8')) } as any;
  });
});

describe('every lesson in the course', () => {
  it('builds valid, answerable exercises', async () => {
    const { initData } = await import('../../src/lib/data');
    const course = await import('../../src/lib/course');
    course.buildCourse(await initData());
    const lessons = course.path();
    expect(lessons.length).toBeGreaterThan(1000);
    const problems: string[] = []; let items = 0;
    for (const l of lessons) {
      const list: Item[] = await course.buildLesson(l);
      if (!list.length) problems.push(`${l.id}: empty`);
      if (!l.kind.startsWith('p-tones-intro') && !list.some(i => !i.intro)) problems.push(`${l.id}: nothing graded`);
      for (const it of list) {
        items++;
        const where = `${l.id} ${it.type}`;
        if (it.options && ['mc_meaning', 'mc_hanzi', 'listen_pick'].includes(it.type) && !it.options.some((o: any) => o.zh === it.w)) problems.push(`${where}: answer missing from options`);
        if (it.type === 'mc_translate' && !it.options!.includes(it.s!.en)) problems.push(`${where}: translation missing`);
        if (it.type === 'fill') {
          if (!it.options!.includes(it.s!.t[it.idx!])) problems.push(`${where}: blank answer missing`);
          if (new Set(it.options).size !== it.options!.length) problems.push(`${where}: duplicate options`);
        }
        if ((it.type === 'build' || it.type === 'listen_build') && it.s!.t.filter(t => !/^[\p{P}\p{S}]+$/u.test(t)).length < 2) problems.push(`${where}: too short to build`);
        if (it.type === 'question' && !(it.q!.answer >= 0 && it.q!.answer < it.q!.options.length)) problems.push(`${where}: bad answer index`);
        if (it.type === 'match' && new Set(it.pairs!.map(p => p.g)).size !== it.pairs!.length) problems.push(`${where}: ambiguous match glosses`);
      }
    }
    console.log(`${lessons.length} lessons, ${items} exercises`);
    expect(problems.slice(0, 20)).toEqual([]);
  }, 300000);
});
