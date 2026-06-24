"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SignOutButtonProps = {
  className?: string;
  compact?: boolean;
};

export function SignOutButton({
  className,
  compact = false,
}: SignOutButtonProps) {
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    setPending(true);
    await signOut({ redirectTo: "/" });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size={compact ? "sm" : "default"}
      className={cn(className)}
      disabled={pending}
      onClick={handleSignOut}
    >
      <LogOut />
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
