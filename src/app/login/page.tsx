import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { googleAuthEnabled } from "@/auth";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";
import { getSafeRedirect } from "@/lib/redirects";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your Cypher host workspace.",
};

type LoginPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const redirectTo = getSafeRedirect((await searchParams).next);
  if (await getCurrentUser()) redirect(redirectTo);

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
      <LoginForm googleEnabled={googleAuthEnabled} redirectTo={redirectTo} />
    </AuthShell>
  );
}
