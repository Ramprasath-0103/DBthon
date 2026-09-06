import { createContext, useContext, useState, type ReactNode } from "react";

export type Me = {
  id: number;
  email: string;
  displayName: string;
  gender: "female" | "male" | "other";
  canReview: boolean;
};

type AuthState = {
  token: string | null;
  user: Me | null;
  signIn: (email: string, password: string) => Promise<void>;
  register: (input: { email: string; password: string; displayName: string; gender: string }) => Promise<void>;
  signOut: () => void;
};

const Ctx = createContext<AuthState | null>(null);
const STORAGE_KEY = "safeway.auth";

// localStorage rather than an httpOnly cookie: this is a local-only laptop demo, and
// a cookie would need SameSite/CORS handling that adds nothing here.
function load(): { token: string; user: Me } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState(load);

  async function post(path: string, payload: unknown) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? "Something went wrong.");
    const next = { token: data.token as string, user: data.user as Me };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSession(next);
  }

  const value: AuthState = {
    token: session?.token ?? null,
    user: session?.user ?? null,
    signIn: (email, password) => post("/api/auth/login", { email, password }),
    register: (input) => post("/api/auth/register", input),
    signOut: () => {
      localStorage.removeItem(STORAGE_KEY);
      setSession(null);
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
