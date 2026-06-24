import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/AuthShell";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { getSafeRedirect } from "@/lib/redirects";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Create a host account",
  description: "Register a Cypher host account.",
};

type RegisterPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const redirectTo = getSafeRedirect((await searchParams).next);
  if (await getCurrentUser()) redirect(redirectTo);

  return (
    <AuthShell
      eyebrow="Host the next signal"
      title={
        <>
          Build your <span className="text-gradient">identity</span>
        </>
      }
      description="Start with a secure account, create rooms, and carry your identity into every channel you join."
    >
      <RegisterForm redirectTo={redirectTo} />
    </AuthShell>
  );
}
