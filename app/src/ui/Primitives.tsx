/** Shared UI primitives: sheet/dialog, confirm, toast, switch, segmented control, spinner, banner, progress ring. */
import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import { useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { Icon } from './Icon';
import { useToast } from './toast';

export function Sheet({ open, onOpenChange, title, children, footer, wide }: { open: boolean; onOpenChange: (v: boolean) => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div className="sheet-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount aria-describedby={undefined}>
              <motion.div className={'sheet' + (wide ? ' wide' : '')} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} transition={{ type: 'spring', damping: 30, stiffness: 380 }}>
                <div className="sheet-head">
                  <Dialog.Title className="sheet-title">{title}</Dialog.Title>
                  <Dialog.Close className="iconbtn" aria-label="Close"><Icon name="close" /></Dialog.Close>
                </div>
                <div className="sheet-body">{children}</div>
                {footer && <div className="sheet-foot">{footer}</div>}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

/** Imperative sheets/confirm dialogs, rendered by <SheetHost/>. */
interface SheetReq { id: number; title: ReactNode; body: (close: () => void) => ReactNode; footer?: (close: () => void) => ReactNode; wide?: boolean }
const useSheets = create<{ list: SheetReq[]; open: (r: Omit<SheetReq, 'id'>) => void; close: (id: number) => void }>(set => ({
  list: [],
  open: r => set(s => ({ list: [...s.list, { ...r, id: Date.now() + Math.random() }] })),
  close: id => set(s => ({ list: s.list.filter(x => x.id !== id) })),
}));
export const openSheet = (r: Omit<SheetReq, 'id'>) => useSheets.getState().open(r);
export function confirmDialog(title: string, text: string, okLabel: string, onOk: () => void, danger = true) {
  openSheet({ title, body: () => <p>{text}</p>, footer: close => (<><button className="btn" type="button" onClick={close}>Cancel</button><button className={'btn ' + (danger ? 'danger' : 'primary')} type="button" onClick={() => { close(); onOk(); }}>{okLabel}</button></>) });
}
export function SheetHost() {
  const { list, close } = useSheets();
  return <>{list.map(r => <HostedSheet key={r.id} r={r} close={() => close(r.id)} />)}</>;
}
function HostedSheet({ r, close }: { r: SheetReq; close: () => void }) {
  const [open, setOpen] = useState(true);
  const doClose = () => { setOpen(false); setTimeout(close, 220); };
  return <Sheet open={open} onOpenChange={v => !v && doClose()} title={r.title} wide={r.wide} footer={r.footer?.(doClose)}>{r.body(doClose)}</Sheet>;
}
export const anySheetOpen = () => useSheets.getState().list.length > 0 || !!document.querySelector('.sheet');

export function Toaster() {
  const { msg, id } = useToast();
  return (
    <div className="toast-wrap" role="status" aria-live="polite">
      <AnimatePresence>{msg && <motion.div key={id} className="toast" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 10, opacity: 0 }}>{msg}</motion.div>}</AnimatePresence>
    </div>
  );
}
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button className="switch" type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />;
}
export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(o => <button key={String(o.v)} type="button" role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)}>{o.label}</button>)}
    </div>
  );
}
export const Spinner = () => <div className="spinner" aria-hidden="true" />;
export function Banner({ tone = 'info', icon = 'info', children }: { tone?: 'info' | 'warn' | 'ok'; icon?: string; children: ReactNode }) {
  return <div className={'banner ' + tone}><Icon name={icon} /><div className="banner-body">{children}</div></div>;
}
export function Ring({ pct, size = 44 }: { pct: number; size?: number }) {
  return <div className="ring" style={{ ['--p' as any]: pct, width: size, height: size }}><span className="tnum">{pct}%</span></div>;
}
