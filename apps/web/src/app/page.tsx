"use client";

import type { AuditResult, Finding, ProgressEvent } from "@sera/core";
import { useCallback, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

const STAGE_LABEL: Record<string, string> = {
  queued: "Queued",
  parsing: "Reading the bill",
  checking: "Checking for errors",
  scoring: "Scoring findings",
  done: "Done",
  error: "Error",
};

type Phase = "idle" | "running" | "done" | "error";

export default function Home() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<string>("queued");
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<Pick<
    AuditResult,
    "findings" | "totalOvercharge"
  > | null>(null);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const reset = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    setPhase("idle");
    setProgress(0);
    setStage("queued");
    setLog([]);
    setResult(null);
    setError(null);
  }, []);

  const start = useCallback(async () => {
    reset();
    setPhase("running");
    try {
      const res = await fetch(`${API}/api/audits`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: "sample" }),
      });
      const { jobId } = (await res.json()) as { jobId: string };

      const es = new EventSource(`${API}/api/audits/${jobId}/stream`);
      esRef.current = es;

      es.addEventListener("progress", (e) => {
        const evt = JSON.parse((e as MessageEvent).data) as ProgressEvent;
        setStage(evt.stage);
        setProgress(evt.progress);
        setLog((prev) =>
          prev[prev.length - 1] === evt.message ? prev : [...prev, evt.message],
        );

        if (evt.stage === "done") {
          void fetch(`${API}/api/audits/${jobId}`)
            .then((r) => r.json())
            .then((row: { findings: Finding[]; totalOvercharge: number }) => {
              setResult({
                findings: row.findings,
                totalOvercharge: row.totalOvercharge,
              });
              setPhase("done");
            });
          es.close();
        } else if (evt.stage === "error") {
          setError(evt.message);
          setPhase("error");
          es.close();
        }
      });

      es.addEventListener("end", () => es.close());
      es.onerror = () => es.close();
    } catch {
      setError("Could not reach the audit API. Is it running on :8787?");
      setPhase("error");
    }
  }, [reset]);

  const usd = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD" });

  return (
    <main className="min-h-full bg-neutral-950 text-neutral-100">
      <div className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-16">
        <header className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400" />
            <span className="font-mono text-sm tracking-widest text-emerald-400 uppercase">
              Sera
            </span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Find the errors in your medical bill.
          </h1>
          <p className="max-w-prose text-neutral-400">
            Upload an itemized bill and Sera extracts every line item, checks it
            for overcharges and duplicates, and drafts an appeal. This is a live
            skeleton — the analysis below is simulated end-to-end.
          </p>
        </header>

        {phase === "idle" && (
          <button
            onClick={() => void start()}
            className="w-fit rounded-lg bg-emerald-500 px-5 py-3 font-medium text-emerald-950 transition hover:bg-emerald-400"
          >
            Audit sample bill →
          </button>
        )}

        {(phase === "running" || phase === "done" || phase === "error") && (
          <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono text-xs tracking-wide text-neutral-400 uppercase">
                {STAGE_LABEL[stage] ?? stage}
              </span>
              <span className="font-mono text-xs text-neutral-500">
                {Math.round(progress * 100)}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <ul className="mt-4 space-y-1 font-mono text-xs text-neutral-400">
              {log.map((line, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-neutral-600">›</span>
                  {line}
                </li>
              ))}
            </ul>
          </section>
        )}

        {phase === "error" && error && (
          <p className="rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        )}

        {phase === "done" && result && (
          <section className="flex flex-col gap-4">
            <div className="rounded-xl border border-emerald-800/60 bg-emerald-950/30 p-6">
              <p className="text-sm text-emerald-300">Potential overcharges</p>
              <p className="mt-1 text-4xl font-semibold text-emerald-100">
                {usd(result.totalOvercharge)}
              </p>
              <p className="mt-1 text-sm text-emerald-400/80">
                across {result.findings.length} issues
              </p>
            </div>

            <ul className="flex flex-col gap-3">
              {result.findings.map((f) => (
                <li
                  key={f.id}
                  className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="font-medium text-neutral-100">{f.title}</h3>
                    <span className="shrink-0 font-mono text-sm text-emerald-400">
                      {usd(f.estimatedOvercharge)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-neutral-400">
                    {f.explanation}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Badge>{f.type.replaceAll("_", " ")}</Badge>
                    <Badge>{f.source === "rule" ? "rule engine" : "AI"}</Badge>
                    <Badge>{Math.round(f.confidence * 100)}% confidence</Badge>
                  </div>
                </li>
              ))}
            </ul>

            <button
              onClick={reset}
              className="w-fit text-sm text-neutral-400 underline underline-offset-4 hover:text-neutral-200"
            >
              Run again
            </button>
          </section>
        )}
      </div>
    </main>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-neutral-700 bg-neutral-800/60 px-2.5 py-0.5 font-mono text-[11px] tracking-wide text-neutral-300 lowercase">
      {children}
    </span>
  );
}
