import { create } from 'zustand';
interface ToastState { msg: string; id: number; show: (msg: string, ms?: number) => void; hide: () => void }
let timer: ReturnType<typeof setTimeout> | undefined;
export const useToast = create<ToastState>(set => ({
  msg: '', id: 0,
  show: (msg, ms = 2800) => { clearTimeout(timer); set(s => ({ msg, id: s.id + 1 })); timer = setTimeout(() => set({ msg: '' }), ms); },
  hide: () => set({ msg: '' }),
}));
export const toast = (msg: string, ms?: number) => useToast.getState().show(msg, ms);
