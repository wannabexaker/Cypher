import type { ReactNode } from "react";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { requireUser } from "@/lib/session";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser();

  return <DashboardShell user={user}>{children}</DashboardShell>;
}

