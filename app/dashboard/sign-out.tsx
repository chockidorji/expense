"use client";
import { Button } from "@/components/ui/button";
import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <Button
      variant="outline"
      className="min-h-[44px] md:min-h-0"
      onClick={() => signOut({ callbackUrl: "/auth/signin" })}
    >
      Sign out
    </Button>
  );
}
