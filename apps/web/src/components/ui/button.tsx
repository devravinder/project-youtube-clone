import type { ComponentProps } from "react";
import { tv, type VariantProps } from "tailwind-variants";

const button = tv({
  base: `
    inline-flex items-center justify-center gap-2 rounded-md px-4 py-2
    text-sm font-medium transition
    focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary
    disabled:pointer-events-none disabled:opacity-50
  `,
  variants: {
    variant: {
      primary: "bg-primary text-primary-foreground hover:opacity-90",
      outline: "border border-border bg-transparent hover:bg-muted",
      ghost: "bg-transparent hover:bg-muted",
    },
  },
  defaultVariants: { variant: "primary" },
});

type ButtonProps = ComponentProps<"button"> & VariantProps<typeof button>;

export function Button({ variant, className, ...props }: ButtonProps) {
  return <button className={button({ variant, className })} {...props} />;
}
