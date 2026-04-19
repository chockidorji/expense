"use client";
import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const chipStyles = {
  default: "bg-muted text-foreground",
  outline: "border border-border bg-background text-foreground",
  primary: "bg-primary text-primary-foreground",
  success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  warning: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  danger: "bg-red-500/15 text-red-700 dark:text-red-400",
} as const;

export type ChipVariant = keyof typeof chipStyles;

export function Chip({
  children,
  variant = "default",
  onRemove,
  onClick,
  className,
  title,
}: {
  children: React.ReactNode;
  variant?: ChipVariant;
  onRemove?: () => void;
  onClick?: () => void;
  className?: string;
  title?: string;
}) {
  const base = cn(
    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors",
    chipStyles[variant],
    (onClick || onRemove) && "cursor-pointer",
    className
  );

  if (onRemove) {
    return (
      <span className={base} title={title}>
        <span onClick={onClick} className={cn(onClick && "cursor-pointer")}>{children}</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label="Remove filter"
          className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-foreground/10 cursor-pointer"
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      </span>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={base} title={title}>
        {children}
      </button>
    );
  }

  return (
    <span className={base} title={title}>
      {children}
    </span>
  );
}
