import type { ComponentProps } from "react";
import { tv, type VariantProps } from "tailwind-variants";

const card = tv({
  base: "rounded-md border border-border bg-card p-4 text-card-foreground",
});

const badge = tv({
  base: "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
  variants: {
    tone: {
      neutral: "bg-muted text-muted-foreground",
      success: "bg-success/15 text-success",
      danger: "bg-destructive/15 text-destructive",
    },
  },
  defaultVariants: { tone: "neutral" },
});

type BadgeProps = ComponentProps<"span"> & VariantProps<typeof badge>;

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={card({ className })} {...props} />;
}

export function Badge({ tone, className, ...props }: BadgeProps) {
  return <span className={badge({ tone, className })} {...props} />;
}
