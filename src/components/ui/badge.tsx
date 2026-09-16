import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.12em]",
  {
    variants: {
      tone: {
        neutral: "bg-elevated text-muted",
        ok: "bg-verified/15 text-verified",
        deny: "bg-refused/15 text-refused",
        warn: "bg-pending/15 text-pending",
        ink: "bg-ink/8 text-ink-muted",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
