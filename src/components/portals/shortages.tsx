"use client";
import { useEffect, useState } from "react";
import { api, ErrorBox, Field } from "../ui/shared";
import { normalizeIngredient } from "@/lib/recipes/aliases";
import type { Inventory, Serialized } from "@/types";
import type {
  reportShortage,
  shortageReports,
} from "@/lib/coordination/shortages";
type ReportResult = Serialized<Awaited<ReturnType<typeof reportShortage>>>;
type Reports = Serialized<Awaited<ReturnType<typeof shortageReports>>>;
export function ShortagePanel({
  date,
  onChange,
}: {
  date: string;
  onChange: () => Promise<void>;
}) {
  const [stock, setStock] = useState<Inventory[]>([]),
    [reports, setReports] = useState<Reports>([]);
  const [ingredient, setIngredient] = useState(""),
    [mealType, setMealType] = useState("lunch"),
    [note, setNote] = useState(""),
    [command, setCommand] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function load() {
    const [s, r] = await Promise.all([
      api<Inventory[]>("inventory"),
      api<Reports>(`cook/shortages?date=${date}`),
    ]);
    setStock(s);
    setReports(r);
  }
  useEffect(() => {
    if (date) load().catch((e) => setError(e.message));
  }, [date]);
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card portal-form shortage-panel">
      <h2>Report an unavailable ingredient</h2>
      <p>
        Find affected dishes and send available alternatives for family review.
      </p>
      <ErrorBox message={error} />
      <div className="form-grid">
        <Field label="Kitchen command (optional)">
          <input
            placeholder="Aaj paneer nahi hai."
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            maxLength={500}
          />
        </Field>
        <button
          type="button"
          className="button secondary"
          disabled={busy || command.trim().length < 3}
          onClick={() =>
            act(async () => {
              const r = await api<{
                data: { action: string; ingredient: string };
                provider: string;
                model: string;
                fallbackUsed: boolean;
              }>("cook/interpret", "POST", { command });
              if (r.data.action !== "REPORT_INGREDIENT_UNAVAILABLE") {
                setNotice(
                  "No shortage understood. Use the manual ingredient selector below.",
                );
                return;
              }
              const found = stock.find(
                (s) =>
                  normalizeIngredient(s.ingredientId) ===
                  normalizeIngredient(r.data.ingredient),
              );
              if (!found) {
                setNotice(
                  `Understood ${r.data.ingredient}, but it is not recorded in inventory. Add its inventory details first.`,
                );
                return;
              }
              setIngredient(found.ingredientId);
              setConfirmed(false);
              setNotice(
                `Understood ${found.ingredient.name} is unavailable (${r.provider}). Review and confirm below. Inventory has not changed.`,
              );
            })
          }
        >
          {busy ? "Working…" : "Interpret command"}
        </button>
      </div>
      <form
        className="portal-form"
        onSubmit={(e) => {
          e.preventDefault();
          act(async () => {
            const result = await api<ReportResult>("cook/shortages", "POST", {
              ingredient,
              mealDate: date,
              mealType,
              note,
              confirmed,
            });
            setNotice(
              `${result.message} ${result.affected.length} affected dishes.`,
            );
            setConfirmed(false);
            await load();
            await onChange();
          });
        }}
      >
        <div className="form-grid">
          <Field label="Unavailable ingredient">
            <select
              required
              value={ingredient}
              onChange={(e) => {
                setIngredient(e.target.value);
                setConfirmed(false);
              }}
            >
              <option value="">Choose ingredient</option>
              {stock.map((i) => (
                <option key={i.id} value={i.ingredientId}>
                  {i.ingredient.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Affected meal">
            <select
              value={mealType}
              onChange={(e) => setMealType(e.target.value)}
            >
              {["breakfast", "lunch", "snack", "dinner"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Shortage note" wide>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
            />
          </Field>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          I confirm this ingredient is unavailable and will update inventory
          status.
        </label>
        <button
          className="button primary"
          disabled={busy || !ingredient || !confirmed}
        >
          {busy ? "Reporting…" : "Report shortage for family review"}
        </button>
      </form>
      {notice && (
        <p role="status" className="success">
          {notice}
        </p>
      )}
      {reports.map((r) => (
        <article key={r.id} className="notice">
          <strong>
            {r.ingredientId} unavailable · {r.mealType} · {r.mealDate}
          </strong>
          <p>{r.note}</p>
          <p>Affected dishes:</p>
          {(r.affectedRequests as unknown as ReportResult["affected"])
            .length ? (
            <ul>
              {(r.affectedRequests as unknown as ReportResult["affected"]).map(
                (a) => (
                  <li key={a.requestId}>
                    {a.memberName}: {a.dish} · {a.alternatives.length} known
                    alternatives proposed
                  </li>
                ),
              )}
            </ul>
          ) : (
            <p>No matching active dish for this meal.</p>
          )}
          <small>
            Report records the choices at reporting time. Current choices appear
            below.
          </small>
        </article>
      ))}
    </section>
  );
}
