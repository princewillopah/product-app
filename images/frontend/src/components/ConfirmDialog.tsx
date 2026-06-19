import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Delete',
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  loading?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-md">
      <div className="flex gap-4">
        <div className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-rose-50 text-rose-600">
          <AlertTriangle size={20} />
        </div>
        <p className="pt-1.5 text-sm leading-relaxed text-slate-600">{message}</p>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button className="btn-ghost" onClick={onClose} disabled={loading}>
          Cancel
        </button>
        <button className="btn-danger" onClick={onConfirm} disabled={loading}>
          {loading ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
