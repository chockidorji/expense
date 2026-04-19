"use client";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Fab({
  onClick,
  label = "Add",
  className,
}: {
  onClick: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "md:hidden fixed right-4 z-30 h-14 w-14 rounded-full",
        "bg-primary text-primary-foreground shadow-lg shadow-foreground/20",
        "flex items-center justify-center cursor-pointer transition-transform active:scale-95",
        "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/40",
        // Sit above the 64px bottom nav + safe-area
        "bottom-[calc(env(safe-area-inset-bottom)+5rem)]",
        className
      )}
    >
      <Plus className="h-6 w-6" strokeWidth={2.5} aria-hidden />
    </button>
  );
}
