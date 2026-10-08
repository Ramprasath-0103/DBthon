import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { z } from "zod";

/** The LLM side lives in ai/ (Python + LangChain). This only runs it and reads the verdict. */
const AI_DIR = resolve(import.meta.dirname, "../../ai");
const PYTHON = process.env.REVIEW_CHECK_PYTHON ?? resolve(AI_DIR, ".venv/bin/python");
const SCRIPT = resolve(AI_DIR, "check_review.py");

/** Mirrors ai/verdict.schema.json. Anything else coming back is treated as no verdict. */
const Verdict = z.object({ good_to_go: z.boolean(), reason: z.string() });
export type ReviewVerdict = z.infer<typeof Verdict>;
export type PlaceContext = { name: string; category: string; address: string };

/**
 * null means "could not check" — no key, script failed, timed out, or bad output.
 * Callers accept the review then: this is a spam filter, and an outage must not
 * stop women posting safety reports.
 */
export type ReviewChecker = (place: PlaceContext, note: string) => Promise<ReviewVerdict | null>;

export const checkWithPython: ReviewChecker = (place, note) => {
  if (!process.env.REVIEW_CHECK_API_KEY) return Promise.resolve(null);

  return new Promise((done) => {
    const fail = (why: string) => {
      console.warn(`Review check unavailable (${why}), accepting`);
      done(null);
    };
    const child = spawn(PYTHON, [SCRIPT], { timeout: 30_000 });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => fail(e.message));
    child.on("close", (code) => {
      if (code !== 0) return fail(err.trim().split("\n").at(-1) ?? `exit ${code}`);
      try {
        const verdict = Verdict.safeParse(JSON.parse(out));
        if (!verdict.success) return fail("verdict did not match the schema");
        done(verdict.data);
      } catch {
        fail("output was not JSON");
      }
    });
    child.stdin.end(JSON.stringify({ place, note }));
  });
};
