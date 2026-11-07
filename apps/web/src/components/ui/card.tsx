import type { ComponentProps } from "react";
import { tv } from "tailwind-variants";

const card = tv({
  base: "rounded-md border border-border bg-background p-4 shadow-sm",
});

const badge = tv({
  base: `
    inline-flex items-center rounded-full bg-muted px-2 py-0.5
    text-xs font-medium text-muted-foreground
  `,
});

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={card({ className })} {...props} />;
}

export function Badge({ className, ...props }: ComponentProps<"span">) {
  return <span className={badge({ className })} {...props} />;
}
