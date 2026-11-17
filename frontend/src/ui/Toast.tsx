import { CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { calm, DURATION, useLessMotion } from "./motion";

export type ToastTone = "success" | "info" | "error";

export interface ToastInput {
  message: string;
  tone?: ToastTone;
  /** Shows an "Undo" button; called if it is pressed before the toast goes. */
  onUndo?: () => void;
  /** Called when the toast goes without Undo (time out or closed). */
  onExpire?: () => void;
  durationMs?: number;
}

interface ToastItem extends Required<Pick<ToastInput, "message" | "tone">> {
  id: number;
  onUndo?: () => void;
  onExpire?: () => void;
  durationMs: number;
}

interface ToastApi {
  show: (toast: ToastInput) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Short confirmations ("Reminder added"), with Undo where an action can be taken back. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  // Outside a provider (a component rendered alone in a test) toasts are simply not shown.
  return api ?? { show: () => 0, dismiss: () => undefined };
}

const ICONS = { success: CircleCheck, info: Info, error: TriangleAlert } as const;
const TONES: Record<ToastTone, string> = {
  success: "text-success",
  info: "text-brand",
  error: "text-danger",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  // The live list, so callbacks run exactly once outside React's state updaters.
  const itemsRef = useRef<ToastItem[]>([]);
  const commit = useCallback((next: ToastItem[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const dismiss = useCallback(
    (id: number, undone = false) => {
      const item = itemsRef.current.find((t) => t.id === id);
      if (!item) return;
      commit(itemsRef.current.filter((t) => t.id !== id));
      if (!undone) item.onExpire?.();
    },
    [commit],
  );

  const show = useCallback((input: ToastInput) => {
    const id = nextId.current++;
    const item: ToastItem = {
      id,
      message: input.message,
      tone: input.tone ?? "success",
      onUndo: input.onUndo,
      onExpire: input.onExpire,
      durationMs: input.durationMs ?? (input.onUndo ? 7000 : input.tone === "error" ? 8000 : 4500),
    };
    // At most three at once; the oldest goes first (and counts as not undone).
    const current = itemsRef.current;
    const dropped = current.slice(0, Math.max(0, current.length - 2));
    commit([...current.slice(-2), item]);
    dropped.forEach((t) => t.onExpire?.());
    return id;
  }, [commit]);

  const api = useMemo<ToastApi>(() => ({ show, dismiss: (id) => dismiss(id) }), [show, dismiss]);

  // Anything still waiting for its Undo window is carried out if the page goes away.
  useEffect(() => {
    const flush = () => {
      const waiting = itemsRef.current;
      itemsRef.current = [];
      waiting.forEach((t) => t.onExpire?.());
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastRegion items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastRegion({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: number, undone?: boolean) => void }) {
  return (
    <div
      aria-live="polite"
      aria-relevant="additions"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:left-6 sm:right-auto sm:items-start"
    >
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <ToastView key={item.id} item={item} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number, undone?: boolean) => void }) {
  const less = useLessMotion();
  const [paused, setPaused] = useState(false);
  const Icon = ICONS[item.tone];

  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => onDismiss(item.id), item.durationMs);
    return () => clearTimeout(t);
  }, [paused, item.id, item.durationMs, onDismiss]);

  return (
    <motion.div
      layout={!less}
      role={item.tone === "error" ? "alert" : "status"}
      initial={less ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={less ? { opacity: 0 } : { opacity: 0, y: 8, transition: calm(DURATION.quick) }}
      transition={calm(DURATION.base)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="caregiver pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink shadow-toast"
    >
      <Icon aria-hidden="true" className={`size-5 shrink-0 ${TONES[item.tone]}`} />
      <p className="min-w-0 flex-1">{item.message}</p>
      {item.onUndo && (
        <button
          type="button"
          onClick={() => {
            item.onUndo?.();
            onDismiss(item.id, true);
          }}
          className="touch-manipulation rounded-md px-2 py-1 font-semibold text-brand-dark underline-offset-2 transition-colors hover:bg-brand-soft hover:underline"
        >
          Undo
        </button>
      )}
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label="Close message"
        className="rounded-md p-1 text-ink-muted transition-colors hover:bg-sunken hover:text-ink"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </motion.div>
  );
}
