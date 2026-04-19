"use client";
import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function BottomSheet({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="bottom-sheet" {...props} />;
}

function BottomSheetTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="bottom-sheet-trigger" {...props} />;
}

function BottomSheetClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="bottom-sheet-close" {...props} />;
}

function BottomSheetContent({
  className,
  children,
  title,
  showCloseButton = true,
}: {
  className?: string;
  children: React.ReactNode;
  title?: string;
  showCloseButton?: boolean;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        className={cn(
          "fixed inset-0 z-50 bg-black/40 duration-150",
          "data-open:animate-in data-open:fade-in-0",
          "data-closed:animate-out data-closed:fade-out-0"
        )}
      />
      <DialogPrimitive.Popup
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 flex max-h-[90vh] flex-col",
          "rounded-t-2xl bg-popover text-popover-foreground ring-1 ring-foreground/10",
          "pb-[env(safe-area-inset-bottom)]",
          "duration-200 data-open:animate-in data-open:slide-in-from-bottom data-closed:animate-out data-closed:slide-out-to-bottom",
          "md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-md md:rounded-2xl md:pb-0",
          className
        )}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-muted-foreground/30 md:hidden" aria-hidden />
        {title && (
          <div className="flex items-center justify-between px-5 pt-3 pb-2">
            <DialogPrimitive.Title className="text-base font-semibold">{title}</DialogPrimitive.Title>
            {showCloseButton && (
              <DialogPrimitive.Close
                render={<Button variant="ghost" size="icon-sm" aria-label="Close" />}
              >
                <XIcon className="h-4 w-4" />
              </DialogPrimitive.Close>
            )}
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 pb-5">{children}</div>
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

function BottomSheetFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "sticky bottom-0 -mx-5 flex gap-2 border-t bg-background px-5 py-3 [&>*]:flex-1",
        className
      )}
    >
      {children}
    </div>
  );
}

export {
  BottomSheet,
  BottomSheetTrigger,
  BottomSheetContent,
  BottomSheetClose,
  BottomSheetFooter,
};
