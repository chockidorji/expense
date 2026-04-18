"use client";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SignInPage() {
  return (
    <main className="min-h-screen grid place-items-center p-6">
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
