"use client";
import { useState } from "react";
import type { schedules, ScheduleSnapshot } from "@/lib/coordination/service";
import type { Serialized } from "@/types";
import { api, ErrorBox, Field, Badge } from "../ui/shared";
import { IngredientChecklist } from "../meals/IngredientChecklist";
import { TutorialLink } from "../recipes/TutorialLink";
export type ScheduleResponse = Serialized<
  Awaited<ReturnType<typeof schedules>>
>;
export function ScheduleCard({
  schedule,
  cook = false,
  language = "English",
  onChange,
}: {
  schedule: ScheduleResponse["schedules"][number];
  cook?: boolean;
  language?: string;
  onChange: () => Promise<void>;
}) {
  const snapshot = schedule.snapshot as unknown as ScheduleSnapshot;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ack, setAck] = useState(false);
  const [report, setReport] = useState("");
  const [reportType, setReportType] = useState("UNAVAILABLE_INGREDIENT");
  const [notice, setNotice] = useState("");
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="card schedule-card">
      <div className="section-heading">
        <div>
          <div className="eyebrow">
            {schedule.mealDate} · {schedule.mealType} · {schedule.timezone}
          </div>
          <h2>
            {snapshot.dishes.length} dishes · {snapshot.workload} minutes
          </h2>
        </div>
        <Badge tone={schedule.status === "APPROVED" ? "green" : "amber"}>
          {schedule.status}
        </Badge>
      </div>
      <ErrorBox message={error} />
      {schedule.needsRecheck && (
        <p className="notice">
          Household information changed since this schedule was created. Ask the
          family to review the current ingredients and restrictions before
          preparing.
        </p>
      )}
      {snapshot.issues.length > 0 && (
        <div className="error">
          <strong>Review required</strong>
          {snapshot.issues.map((s, i) => (
            <p key={i}>{s}</p>
          ))}
        </div>
      )}
      {!snapshot.dishes.length && (
        <p>
          No cooking assignments. Members may be eating outside, skipping, or
          waiting for a recipe to be verified.
        </p>
      )}
      {schedule.dishes.map((d) => {
        const dish =
          d.recipeSnapshot as unknown as ScheduleSnapshot["dishes"][number];
        return (
          <section className="cook-dish" key={d.id}>
            <div className="section-heading">
              <div>
                <h3>{dish.name}</h3>
                <TutorialLink name={dish.name} language={language} />
                <p>
                  <strong>{d.servings} portions</strong> · Prep{" "}
                  {dish.prepMinutes} min · Cook {dish.cookMinutes} min
                </p>
                <p>
                  Suggested start: <strong>{dish.startTime}</strong>
                </p>
              </div>
              <Badge>{d.preparationStatus.replaceAll("_", " ")}</Badge>
            </div>
            <div className="participant-brief">
              {dish.participants.map((p, index) => (
                <div key={`${p.memberId}-${index}`}>
                  <strong>
                    {p.name} · {p.servings} portions · serve {p.preferredTime}
                  </strong>
                  <p>{p.preparationRules.join(". ")}</p>
                </div>
              ))}
            </div>
            {dish.advancePreparation && (
              <p className="notice">
                <strong>Prepare ahead:</strong> {dish.advancePreparation}
              </p>
            )}
            <p className="muted">
              Instructions: {dish.language}.{" "}
              {dish.language !== language
                ? `A verified ${language} translation is not available; showing the original instructions.`
                : ""}
            </p>
            <details open={cook}>
              <summary>
                Ingredients for this dish ({dish.servings} portions)
              </summary>
              <div className="recipe-ingredients">
                {dish.ingredients.map((i) => (
                  <div key={i.ingredientId}>
                    <span>{i.name}</span>
                    <strong>
                      {i.quantity ?? "Unknown"} {i.unit}
                    </strong>
                  </div>
                ))}
              </div>
            </details>
            <ol className="instructions">
              {dish.instructions.map((s, i) => (
                <li key={i}>{s.text}</li>
              ))}
            </ol>
            {cook && (
              <div className="cook-actions">
                {["PENDING", "PREPARING", "COOKING", "READY", "COMPLETED"].map(
                  (status) => (
                    <button
                      className={
                        d.preparationStatus === status
                          ? "button primary"
                          : "button secondary"
                      }
                      disabled={busy || d.preparationStatus === status}
                      key={status}
                      onClick={() =>
                        action(async () => {
                          await api(`cook/preparation/${d.id}`, "PATCH", {
                            status,
                          });
                        })
                      }
                    >
                      {status === "PENDING"
                        ? "Not started"
                        : status === "PREPARING"
                          ? "Start preparation"
                          : status === "COOKING"
                            ? "Mark cooking"
                            : status === "READY"
                              ? "Mark ready"
                              : "Mark completed"}
                    </button>
                  ),
                )}
              </div>
            )}
          </section>
        );
      })}
      <IngredientChecklist check={snapshot.inventory} />
      <p className="muted">{snapshot.notice}</p>
      {!cook && schedule.status === "PROPOSED" && (
        <>
          <label className="check">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            I reviewed the shortages and unknown stock. The cook must confirm
            supplies before preparation.
          </label>
          <button
            className="button primary"
            disabled={busy || snapshot.issues.length > 0}
            onClick={() =>
              action(async () => {
                await api(
                  `admin/meal-schedules/${schedule.id}/approve`,
                  "POST",
                  { confirmed: true, acknowledgeShortages: ack },
                );
              })
            }
          >
            Approve this cooking schedule
          </button>
        </>
      )}
      {!cook && schedule.status === "APPROVED" && (
        <button
          className="button secondary"
          disabled={busy}
          onClick={() =>
            action(async () => {
              await api(
                `admin/meal-schedules/${schedule.id}/withdraw`,
                "POST",
                {},
              );
            })
          }
        >
          Withdraw for review
        </button>
      )}
      {cook && (
        <form
          className="cook-report"
          onSubmit={(e) => {
            e.preventDefault();
            action(async () => {
              await api(
                reportType === "COOKING_NOTE" ? "cook/notes" : "cook/reports",
                "POST",
                {
                  scheduleId: schedule.id,
                  ...(reportType !== "COOKING_NOTE"
                    ? { type: reportType }
                    : {}),
                  message: report,
                },
              );
              setReport("");
              setNotice("Report sent to the family for review.");
            });
          }}
        >
          <h3>Something needs attention?</h3>
          <Field label="Report type">
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
            >
              <option value="UNAVAILABLE_INGREDIENT">
                Ingredient unavailable
              </option>
              <option value="COOKING_NOTE">Cooking note</option>
              <option value="RECIPE_CORRECTION">
                Suggest a recipe correction
              </option>
            </select>
          </Field>
          <Field label="What should the family know?">
            <textarea
              required
              minLength={3}
              maxLength={2000}
              value={report}
              onChange={(e) => setReport(e.target.value)}
            />
          </Field>
          <button className="button secondary" disabled={busy}>
            Send report
          </button>
          {notice && <p role="status">{notice}</p>}
        </form>
      )}
      {schedule.reports.length > 0 && (
        <div className="notice">
          <h3>Cook reports</h3>
          {schedule.reports.map((r) => (
            <p key={r.id}>
              <strong>{r.type.replaceAll("_", " ")}:</strong> {r.message}
            </p>
          ))}
        </div>
      )}
    </article>
  );
}
