import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { googleAuthEnabled } from "@/auth";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your Cypher host workspace.",
};

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <AuthShell
      eyebrow="Back on the mic"
      title={
        <>
          Enter the <span className="text-gradient">control room</span>
        </>
      }
      description="Your host identity is the key to every room you create, moderate, and carry through the bracket."
    >
      <LoginForm googleEnabled={googleAuthEnabled} />
    </AuthShell>
  );
}
