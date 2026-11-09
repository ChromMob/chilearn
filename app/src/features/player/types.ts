import type { ReactNode } from 'react';
import type { Item } from '../../lib/types';
export interface CheckResult { ok: boolean; grade?: 0 | 1 | 2; answer?: ReactNode; note?: string; given?: string | null; self?: boolean; canAppeal?: boolean; onAppeal?: () => void; say?: string }
export interface ExCtl {
  /** enable/disable the Check button */ ready(v: boolean): void;
  /** check now (used by auto-checking exercises) */ submit(): void;
  /** drop this exercise without penalty */ skip(msg?: string): void;
  /** register the function that grades the current answer */ onCheck(fn: () => CheckResult): void;
  /** register number-key option selection */ onOptions(n: number, choose: (i: number) => void): void;
}
export interface ExProps { item: Item; ctl: ExCtl; revealed: boolean; result: CheckResult | null }
export interface SessionOpts {
  title: string; mode: 'lesson' | 'test' | 'review' | 'practice' | 'placement';
  load: () => Promise<Item[]>; lessonId?: string; passMark?: number;
  onDone?: (r: SessionResult | null) => void; retry?: () => void; resultNote?: (r: SessionResult) => string; onExit?: () => void;
}
export interface SessionResult { acc: number; pass: boolean; xp: number; secs: number; words: number; selfGraded: number }
