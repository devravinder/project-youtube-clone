import type { ComponentProps } from "react";
import { tv } from "tailwind-variants";

const label = tv({ base: "text-sm font-medium" });

const field = tv({
  base: `
    w-full rounded-md border border-border bg-background px-3 py-2 text-sm
    placeholder:text-muted-foreground
    focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary
    disabled:opacity-50
  `,
});

const textarea = tv({ extend: field, base: "min-h-24" });

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={label({ className })} {...props} />;
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={field({ className })} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={textarea({ className })} {...props} />;
}
