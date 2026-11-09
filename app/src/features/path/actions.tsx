/** Starting lessons, reviews, tests and placement. */
import type { Lesson, Level, LevelKey } from '../../lib/types';
import { buildLesson, buildLevelTest, buildReview, buildUnitTest, completeUpTo, levelOf, levelPool, levels, path, unitOf } from '../../lib/course';
import { loadLevel, loadLevelsUpTo } from '../../lib/data';
import { LEVEL_ORDER } from '../../lib/course';
import { dueWords, weakWords, useProgress } from '../../state/progress';
import { startSession } from '../player/session';
import { toast } from '../../ui/toast';
import { confirmDialog, openSheet } from '../../ui/Primitives';

export function startLesson(l: Lesson) {
  const u = unitOf(l);
  startSession({ title: l.title, mode: l.test ? 'test' : 'lesson', lessonId: l.id, passMark: l.test ? 0.8 : undefined, load: () => buildLesson(l), retry: () => startLesson(l),
    resultNote: () => (l.test ? `${u.title} complete. Its words are now in your review queue.` : '') });
}
export function startReview(limit = 20) {
  const due = dueWords(limit);
  if (!due.length) { toast('Nothing is due. Nice work!'); return; }
  startSession({ title: 'Review', mode: 'review', load: () => buildReview(due) });
}
export function startWeak() {
  const weak = weakWords(15);
  if (weak.length < 3) { toast('Learn a few lessons first.'); return; }
  startSession({ title: 'Weak words', mode: 'practice', load: () => buildReview(weak) });
}
export function testOutUnit(l: Lesson) {
  const u = unitOf(l); const last = u.lessons[u.lessons.length - 1];
  if (l.level === '0') {
    confirmDialog('Skip the pinyin stage?', 'If you can already read pinyin and hear the four tones, skip straight to HSK 1. You can come back any time.', 'Skip to HSK 1', async () => {
      const first = path().find(x => x.level !== '0')!; await completeUpTo(first.pos, useProgress.getState()); toast('Pinyin stage skipped');
    }, false);
    return;
  }
  confirmDialog(`Jump ahead to “${u.title}”?`, `Take this unit’s test. Score 80% or more and everything up to and including this unit is marked complete, and its words join your review queue.`, 'Start test', () => {
    startSession({ title: 'Test out', mode: 'test', passMark: 0.8, load: async () => { await loadLevelsUpTo(l.level, LEVEL_ORDER); const L = await loadLevel(l.level); return buildUnitTest(L!.units.find(x => x.id === u.id)!, l.level, levelPool(l.level), 16); },
      retry: () => testOutUnit(l),
      onDone: async r => { if (r?.pass) { const n = await completeUpTo(last.pos + 1, useProgress.getState()); toast(`Unlocked. ${n} words added to your reviews.`); } } });
  }, false);
}
export function testOutLevel(L: Level) {
  startSession({ title: 'Test out of ' + L.name, mode: 'test', passMark: 0.8, load: () => buildLevelTest(L.key, 20),
    onDone: async r => { if (r?.pass) { const u = L.units[L.units.length - 1]; const n = await completeUpTo(u.lessons[u.lessons.length - 1].pos + 1, useProgress.getState()); toast(`${L.name} complete. ${n} words added to your reviews.`); } } });
}
/** Placement: one short test per level until one is failed. */
export function runPlacement() {
  const order = (['1', '2', '3', '4', '5', '6'] as LevelKey[]).filter(k => !levelOf(k).pending);
  const passed: LevelKey[] = [];
  const done = async () => {
    if (passed.length) {
      const L = levelOf(passed[passed.length - 1]); const u = L.units[L.units.length - 1];
      const n = await completeUpTo(u.lessons[u.lessons.length - 1].pos + 1, useProgress.getState());
      toast(`Placed after ${L.name}. ${n} words added to your reviews.`, 4500);
    } else toast('Starting from the beginning. That’s the best foundation.', 3500);
  };
  const runLevel = (i: number) => {
    if (i >= order.length) { done(); return; }
    const L = levelOf(order[i]);
    startSession({ title: 'Placement · ' + L.name, mode: 'placement', passMark: 0.75, load: () => buildLevelTest(L.key, 12),
      resultNote: r => (r.pass ? `You know ${L.name}.${order[i + 1] ? ` Next: ${levelOf(order[i + 1]).name}.` : ''}` : ''),
      onDone: r => { if (r?.pass) { passed.push(L.key); setTimeout(() => runLevel(i + 1), 50); } else done(); }, onExit: () => done() });
  };
  runLevel(0);
}
export const allLevels = () => levels();
