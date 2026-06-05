"use client";

import type { JSX } from "react";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getImpersonation, loadSession, stopImpersonation } from "./api-service";

export function ImpersonationBanner(): JSX.Element | null {
  const pathname = usePathname();
  const [info, setInfo] = useState({ active: false, adminName: undefined as string | undefined });
  const [currentName, setCurrentName] = useState<string | null>(null);

  useEffect(() => {
    const imp = getImpersonation();
    setInfo({ active: imp.active, adminName: imp.adminName });
    setCurrentName(loadSession()?.name ?? null);
  }, [pathname]);

  if (!info.active) return null;

  return (
    <div className="impersonationBanner" role="status">
      <span>
        Signed in as <strong>{currentName ?? "another user"}</strong> on behalf of{" "}
        <strong>{info.adminName ?? "an admin"}</strong>. Actions are recorded as this user.
      </span>
      <button onClick={() => stopImpersonation()}>Switch back</button>
    </div>
  );
}
