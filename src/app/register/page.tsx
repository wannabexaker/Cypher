import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/AuthShell";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Create a host account",
  description: "Register a Cypher host account.",
};

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <AuthShell
      eyebrow="Host the next signal"
      title={
        <>
          Build your <span className="text-gradient">identity</span>
        </>
      }
      description="Start with a secure host account. The room code, submissions, and crowd mechanics arrive next."
    >
      <RegisterForm />
    </AuthShell>
  );
}
