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
    <main className="min-h-screen grid place-items-center p-6">
      <Suspense fallback={null}>
        <ErrorToast />
      </Suspense>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Expense Tracker</CardTitle>
          <CardDescription>Sign in with your Google account to get started.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" onClick={() => signIn("google", { callbackUrl: "/dashboard" })}>
            Continue with Google
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
