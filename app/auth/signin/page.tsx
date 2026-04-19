"use client";
import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

const ERROR_MESSAGES: Record<string, string> = {
  OAuthSignin: "Problem starting Google sign-in. Try again.",
  OAuthCallback: "Google rejected the sign-in. Try again.",
  OAuthCreateAccount: "Could not create an account. Contact support.",
  OAuthAccountNotLinked: "This email is already linked to a different sign-in method.",
  AccessDenied: "Access denied. You may need to grant Gmail permission.",
  Configuration: "Server configuration error. Check Google OAuth setup.",
  Default: "Sign-in failed. Try again.",
};

function ErrorToast() {
  const params = useSearchParams();
  const error = params.get("error");

  useEffect(() => {
    if (error) toast.error(ERROR_MESSAGES[error] ?? ERROR_MESSAGES.Default);
  }, [error]);

  return null;
}

export default function SignInPage() {
  return (
    <main className="min-h-screen grid place-items-center p-6 pt-safe pb-[env(safe-area-inset-bottom)]">
      <Suspense fallback={null}>
        <ErrorToast />
      </Suspense>
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-foreground text-background grid place-items-center text-2xl font-semibold">
            ₹
          </div>
          <h1 className="text-xl font-semibold">Expense Tracker</h1>
          <p className="text-sm text-muted-foreground">Track your Indian bank transactions, one swipe away.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Connect your Google account to sync transaction emails.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full min-h-[44px]"
              onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
            >
              Continue with Google
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
