"use client";
import { useState } from "react";
import { api, Badge, Field, ErrorBox } from "../ui/shared";
import { IngredientChecklist } from "../meals/IngredientChecklist";
import { TutorialLink } from "../recipes/TutorialLink";
import type { cookRequests } from "@/lib/coordination/service";
import type { Serialized } from "@/types";
export type CookRequests = Serialized<Awaited<ReturnType<typeof cookRequests>>>;
export function CookRequestCard({
  request: r,
}: {
  request: CookRequests[number];
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <article className="card request-card cook-choice">
      <div className="section-heading">
        <div>
          <div className="eyebrow">
            {r.member.name} · {r.mealType} · {r.mealDate}
          </div>
          <h3>
            {r.attendance === "HOME"
              ? r.requestedDishName
              : r.attendance === "SKIP"
                ? "Skipping meal"
                : "Eating outside"}
          </h3>
        </div>
        <Badge>{r.status.replaceAll("_", " ")}</Badge>
      </div>
      <p>
        Serve {r.preferredTime} · {r.servings} portions
      </p>
      {r.notes && <p>Family notes: {r.notes}</p>}
      <p className="notice">
        {r.assessment.reason}.{" "}
        {r.status !== "APPROVED"
          ? "Awaiting family approval; use approved assignments for cooking."
          : "Follow the approved schedule below."}
      </p>
      {r.assessment.verification && (
        <details>
          <summary>Dietary preparation checks</summary>
          <p>{r.assessment.verification.explanation}</p>
          {r.assessment.verification.violations.map((v, i) => (
            <p key={i}>{v.message}</p>
          ))}
          {r.assessment.verification.clarifications.map((v, i) => (
            <p key={i}>{v}</p>
          ))}
        </details>
      )}
      {r.assessment.recipe && (
        <details>
          <summary>Requested recipe and ingredient review</summary>
          <p>{r.assessment.recipe.advancePreparation}</p>
          <TutorialLink
            name={r.requestedDishName}
            language={r.assessment.recipe.preferredLanguage || "Hindi"}
          />
          <ol className="instructions">
            {r.assessment.recipe.instructions.map((s) => (
              <li key={s.id}>{s.text}</li>
            ))}
          </ol>
          {r.assessment.inventory && (
            <IngredientChecklist check={r.assessment.inventory} />
          )}
        </details>
      )}
      {r.attendance === "HOME" && (
        <details>
          <summary>Suggest an ingredient substitution</summary>
          <form
            className="portal-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                await api("cook/substitutions", "POST", {
                  requestId: r.id,
                  ingredientFrom: from,
                  ingredientTo: to,
                  message,
                });
                setNotice(
                  "Suggestion sent. The family must confirm a reviewed replacement; their choice is unchanged.",
                );
                setFrom("");
                setTo("");
                setMessage("");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <p>Send a suggestion for family review.</p>
            <Field label="Ingredient unavailable or unsuitable">
              <input
                required
                maxLength={120}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </Field>
            <Field label="Suggested ingredient">
              <input
                required
                maxLength={120}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </Field>
            <Field label="Reason and cooking details">
              <textarea
                required
                minLength={3}
                maxLength={2000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </Field>
            <button className="button secondary" disabled={busy}>
              Send substitution suggestion
            </button>
            <ErrorBox message={error} />
            {notice && <p role="status">{notice}</p>}
          </form>
        </details>
      )}
    </article>
  );
}
