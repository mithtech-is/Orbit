import type { MobileSession, TokenStorage } from "./token-storage";

function blankSession(token: string): MobileSession {
  return {
    token,
    userId: "",
    organisationId: "",
    name: "",
    email: "",
    role: "",
    permissions: []
  };
}

export function createInMemoryTokenStore(initial: string | null = null): TokenStorage {
  let session: MobileSession | null = initial ? blankSession(initial) : null;
  return {
    async load() {
      return session?.token ?? null;
    },
    async save(token) {
      session = session ? { ...session, token } : blankSession(token);
    },
    async clear() {
      session = null;
    },
    async loadSession() {
      return session;
    },
    async saveSession(next) {
      session = next;
    }
  };
}
