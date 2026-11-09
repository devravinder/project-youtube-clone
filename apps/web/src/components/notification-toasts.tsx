import { X } from "lucide-react";
import { Link } from "react-router-dom";
import type { Toast } from "../hooks/use-notifications";

interface NotificationToastsProps {
  readonly toasts: readonly Toast[];
  readonly onDismiss: (id: number) => void;
}

// A live region, so screen readers announce new toasts without moving focus.
export function NotificationToasts({ toasts, onDismiss }: NotificationToastsProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed right-4 bottom-4 z-20 flex w-80 flex-col gap-2"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="flex items-start gap-2 rounded-md border border-border bg-card p-3 text-sm shadow-lg"
        >
          <Link
            to={`/watch/${toast.videoId}`}
            className="flex-1 font-medium text-foreground hover:underline"
            onClick={() => onDismiss(toast.id)}
          >
            {toast.text}
          </Link>
          <button
            type="button"
            aria-label="Dismiss notification"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => onDismiss(toast.id)}
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
