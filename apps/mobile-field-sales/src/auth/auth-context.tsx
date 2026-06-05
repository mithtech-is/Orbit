import { createContext, useContext, useMemo, type JSX, type ReactNode } from "react";
import type { MobileSession } from "./token-storage";

/**
 * Permission check shared across the mobile app. Mirrors the web dashboard
 * helper in apps/web-dashboard/app/navigation.tsx so a nav item with the same
 * `requiredAnyOf` shows up consistently on both surfaces.
 *
 * `null` means "always shown" — for screens like sign-out or today's route that
 * every authenticated user must reach regardless of role.
 */
export function hasAnyPermission(
  permissions: string[] | undefined,
  required: string[] | null
): boolean {
  if (required === null) return true;
  if (!permissions || permissions.length === 0) return false;
  return required.some((p) => permissions.includes(p));
}

interface AuthContextValue {
  session: MobileSession | null;
  hasAny: (required: string[] | null) => boolean;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  // Default outside a provider: unauthenticated, so only `null` (always-shown)
  // nav items pass — never an admin link.
  hasAny: (required) => required === null
});

interface ProviderProps {
  session: MobileSession | null;
  children: ReactNode;
}

export function AuthProvider({ session, children }: ProviderProps): JSX.Element {
  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      hasAny: (required) => hasAnyPermission(session?.permissions, required)
    }),
    [session]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
