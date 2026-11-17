import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from './ui/button';

export function Modal({ children, onClose, width = 460 }: { children: React.ReactNode; onClose: () => void; width?: number }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rounded-xl border border-border bg-panel p-5 shadow-2xl shadow-black/60" style={{ width }}>
        {children}
      </div>
    </div>
  );
}

export function ConfirmApply({ count, label, onConfirm, onCancel }: { count: number; label: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal onClose={onCancel}>
      <div className="flex gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-amber-500/15 text-amber-300">
          <AlertTriangle className="size-5" />
        </div>
        <div className="space-y-2">
          <h3 className="text-[14px] font-semibold text-zinc-100">Overwrite {count} file{count > 1 ? 's' : ''}?</h3>
          <p className="text-[12.5px] leading-relaxed text-zinc-400">{label} will replace the originals in <code className="text-zinc-300">Assets/</code>.</p>
          <ul className="space-y-1 text-[12px] text-zinc-400">
            <li className="flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-emerald-400" /> .meta GUIDs are preserved and verified after writing</li>
            <li className="flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-emerald-400" /> Originals are copied to <code className="text-zinc-300">ATS_Backup/</code> first</li>
            <li className="flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-emerald-400" /> Undo restores them byte-for-byte</li>
          </ul>
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="warning" onClick={onConfirm} autoFocus>Overwrite</Button>
      </div>
    </Modal>
  );
}
