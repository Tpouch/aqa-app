import {
  CheckCircleIcon, CircleNotchIcon, WarningIcon, XCircleIcon, XIcon,
} from "@phosphor-icons/react";
import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
  type ButtonHTMLAttributes, type ReactNode,
} from "react";

// ---------------------------------------------------------------- Button

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "danger" | "ghost" | "default";
  size?: "sm" | "md";
  icon?: ReactNode;
  iconOnly?: boolean;
  loading?: boolean;
};

export function Button({ variant = "default", size = "md", icon, iconOnly, loading, children, className, disabled, ...rest }: ButtonProps) {
  const cls = ["btn", variant !== "default" && variant, size === "sm" && "sm", iconOnly && "icon", className]
    .filter(Boolean).join(" ");
  return (
    <button className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <CircleNotchIcon className="spin" size={16} aria-hidden /> : icon}
      {iconOnly ? <span className="sr-only">{children}</span> : children}
    </button>
  );
}

// ---------------------------------------------------------------- Field

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {error ? <small className="field-error" role="alert">{error}</small> : hint ? <small className="hint">{hint}</small> : null}
    </label>
  );
}

// ---------------------------------------------------------------- Badge

export function Badge({ tone, dot, live, children, title }: { tone?: "good" | "warn" | "bad" | "info"; dot?: boolean; live?: boolean; children: ReactNode; title?: string }) {
  return (
    <span className={["badge", tone, live && "live"].filter(Boolean).join(" ")} title={title}>
      {dot && <span className="dot" aria-hidden />}
      {children}
    </span>
  );
}

export function OnlineBadge({ online }: { online: boolean }) {
  return <Badge tone={online ? "good" : "bad"} dot live={online}>{online ? "En ligne" : "Hors ligne"}</Badge>;
}

export const Skeleton = ({ height, width = "100%" }: { height: number | string; width?: number | string }) =>
  <div className="skeleton" style={{ height, width }} aria-hidden />;

// ---------------------------------------------------------------- Toasts

interface Toast { id: number; tone: "good" | "bad"; text: string }
const ToastContext = createContext<(tone: Toast["tone"], text: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((tone: Toast["tone"], text: string) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-3), { id, tone, text }]);
    // Errors stay a little longer: they usually need reading.
    setTimeout(() => dismiss(id), tone === "bad" ? 7000 : 4000);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            {t.tone === "good" ? <CheckCircleIcon size={20} weight="fill" aria-hidden /> : <XCircleIcon size={20} weight="fill" aria-hidden />}
            <span>{t.text}</span>
            <Button variant="ghost" size="sm" iconOnly icon={<XIcon size={16} aria-hidden />} onClick={() => dismiss(t.id)}>Fermer</Button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ---------------------------------------------------------------- Dialog

// Native <dialog>: focus trap, Escape and inert background come for free.
export function Modal({ open, onClose, children, labelledBy }: { open: boolean; onClose: () => void; children: ReactNode; labelledBy: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="modal" aria-labelledby={labelledBy} onClose={onClose}
            onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      {open && children}
    </dialog>
  );
}

interface ConfirmOptions {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
}
const ConfirmContext = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(ConfirmContext);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...o, resolve })), []);
  const close = (value: boolean) => {
    pending?.resolve(value);
    setPending(null);
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal open={pending !== null} onClose={() => close(false)} labelledBy="confirm-title">
        {pending && (
          <>
            <div className="modal-body">
              <h2 id="confirm-title">
                {pending.danger && <WarningIcon className="danger-icon" size={22} weight="fill" aria-hidden />}
                {pending.title}
              </h2>
              <p>{pending.body}</p>
            </div>
            <div className="modal-actions">
              <Button autoFocus onClick={() => close(false)}>Annuler</Button>
              <Button variant={pending.danger ? "danger" : "primary"} onClick={() => close(true)}>{pending.confirmLabel}</Button>
            </div>
          </>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
}
