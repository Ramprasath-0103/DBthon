import { useState } from "react";
import { useAuth } from "../auth";

export function AuthPanel({ onClose }: { onClose: () => void }) {
  const { signIn, register } = useAuth();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [gender, setGender] = useState("female");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "in") await signIn(email, password);
      else await register({ email, password, displayName, gender });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none";

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-950/70 p-4">
      <form
        onSubmit={submit}
        className="w-[380px] rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
      >
        <h2 className="text-lg font-semibold">{mode === "in" ? "Sign in" : "Create an account"}</h2>
        <p className="mt-1 text-xs text-slate-400">
          Anyone can read the map. Only accounts registered as female can post a review.
        </p>

        <div className="mt-4 space-y-3">
          {mode === "up" && (
            <input className={field} placeholder="Display name" value={displayName}
              onChange={(e) => setDisplayName(e.target.value)} required />
          )}
          <input className={field} type="email" placeholder="Email" value={email}
            onChange={(e) => setEmail(e.target.value)} required />
          <input className={field} type="password" placeholder="Password (8+ characters)"
            value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          {mode === "up" && (
            <div>
              <label className="mb-1 block text-xs text-slate-400">I am</label>
              <div className="flex gap-2">
                {["female", "male", "other"].map((g) => (
                  <button key={g} type="button" onClick={() => setGender(g)}
                    className={`flex-1 rounded-md border px-3 py-1.5 text-sm capitalize transition-colors ${
                      gender === g
                        ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
                        : "border-slate-700 text-slate-400 hover:border-slate-600"
                    }`}>
                    {g}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        <button type="submit" disabled={busy}
          className="mt-5 w-full rounded-md bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
          {busy ? "…" : mode === "in" ? "Sign in" : "Create account"}
        </button>

        <div className="mt-3 flex items-center justify-between text-xs">
          <button type="button" className="text-slate-400 hover:text-slate-200"
            onClick={() => { setMode(mode === "in" ? "up" : "in"); setError(null); }}>
            {mode === "in" ? "Need an account?" : "Already have one?"}
          </button>
          <button type="button" className="text-slate-500 hover:text-slate-300" onClick={onClose}>
            Cancel
          </button>
        </div>

        <p className="mt-4 border-t border-slate-800 pt-3 text-[11px] leading-relaxed text-slate-500">
          Demo accounts — <code className="text-slate-400">demo.female@safeway.test</code> and{" "}
          <code className="text-slate-400">demo.male@safeway.test</code>, password{" "}
          <code className="text-slate-400">demo1234</code>
        </p>
      </form>
    </div>
  );
}
