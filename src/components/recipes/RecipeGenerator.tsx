"use client";
import { useState } from "react";
import type { GenerationRequest } from "@/lib/validation/planning";
import type { RecipeDraft } from "@/lib/recipes/generator";
import type { GeneratedRecipe } from "@/lib/ai/recipe-schema";
import { normalizeIngredient } from "@/lib/recipes/aliases";
import { units } from "@/lib/validation";
import { api, ErrorBox, Badge, Field } from "../ui/shared";
import { DietaryCompatibility } from "../meals/DietaryCompatibility";
export function RecipeGenerator({
  request,
  onSaved,
}: {
  request: GenerationRequest;
  onSaved: (recipe?: {
    id: string;
    name: string;
    defaultServings: number;
  }) => void;
}) {
  const [draft, setDraft] = useState<RecipeDraft>();
  const [edited, setEdited] = useState<GeneratedRecipe>();
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [ack, setAck] = useState(false);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function edit(patch: Partial<GeneratedRecipe>) {
    setEdited((r) => (r ? { ...r, ...patch } : r));
    setDirty(true);
  }
  return (
    <section className="card ai-panel">
      <h2>Recipe not found locally — generate with AI</h2>
      <p>
        Generate “{request.dishName}” for {request.servings} servings. Review
        ingredients and instructions before saving. Dietary rule values and
        pantry ingredients are sent to the configured AI provider; member names
        are omitted.
      </p>
      <ErrorBox message={error} />
      {notice && <p role="status">{notice}</p>}
      {!draft || !edited ? (
        <button
          className="button primary"
          disabled={busy || !request.memberIds.length}
          onClick={() =>
            action(async () => {
              const result = await api<{
                draft: RecipeDraft | null;
                existingRecipe: unknown;
              }>("recipes/generate", "POST", request);
              if (result.draft) {
                setDraft(result.draft);
                setEdited(result.draft.recipe);
                setDirty(false);
              } else {
                setNotice(
                  "A local matching recipe is available. Select it from the search results.",
                );
                onSaved();
              }
            })
          }
        >
          {busy ? "Generating draft…" : "Generate Recipe with AI"}
        </button>
      ) : (
        <>
          <Badge tone="amber">AI-GENERATED · REVIEW BEFORE SAVING</Badge>
          <div className="form-grid">
            <Field label="Recipe name">
              <input
                value={edited.name}
                onChange={(e) => edit({ name: e.target.value })}
              />
            </Field>
            <Field label="Source servings">
              <input
                type="number"
                min="1"
                max="100"
                value={edited.defaultServings}
                onChange={(e) =>
                  edit({ defaultServings: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Preparation minutes">
              <input
                type="number"
                min="0"
                value={edited.prepMinutes}
                onChange={(e) => edit({ prepMinutes: Number(e.target.value) })}
              />
            </Field>
            <Field label="Cooking minutes">
              <input
                type="number"
                min="0"
                value={edited.cookMinutes}
                onChange={(e) => edit({ cookMinutes: Number(e.target.value) })}
              />
            </Field>
            <Field label="Description" wide>
              <textarea
                value={edited.description}
                onChange={(e) => edit({ description: e.target.value })}
              />
            </Field>
          </div>
          <h3>Review every ingredient</h3>
          {edited.ingredients.map((i, index) => (
            <div key={index} className="draft-ingredient">
              <label>
                Ingredient
                <input
                  value={i.name}
                  onChange={(e) =>
                    edit({
                      ingredients: edited.ingredients.map((v, k) =>
                        k === index
                          ? {
                              ...v,
                              name: e.target.value,
                              ingredientId: normalizeIngredient(e.target.value),
                            }
                          : v,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Quantity
                <input
                  type="number"
                  min="0.001"
                  step="any"
                  value={i.quantity ?? ""}
                  placeholder="Unknown"
                  onChange={(e) =>
                    edit({
                      ingredients: edited.ingredients.map((v, k) =>
                        k === index
                          ? {
                              ...v,
                              quantity: e.target.value
                                ? Number(e.target.value)
                                : null,
                            }
                          : v,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Unit
                <select
                  value={i.unit}
                  onChange={(e) =>
                    edit({
                      ingredients: edited.ingredients.map((v, k) =>
                        k === index
                          ? { ...v, unit: e.target.value as typeof i.unit }
                          : v,
                      ),
                    })
                  }
                >
                  {units.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={i.uncertain}
                  onChange={(e) =>
                    edit({
                      ingredients: edited.ingredients.map((v, k) =>
                        k === index ? { ...v, uncertain: e.target.checked } : v,
                      ),
                    })
                  }
                />
                Needs review
              </label>
              <button
                className="text-button danger-text"
                onClick={() =>
                  edit({
                    ingredients: edited.ingredients.filter(
                      (_, k) => k !== index,
                    ),
                  })
                }
              >
                Remove
              </button>
            </div>
          ))}
          <button
            className="text-button"
            onClick={() =>
              edit({
                ingredients: [
                  ...edited.ingredients,
                  {
                    name: "",
                    ingredientId: "ingredient",
                    quantity: null,
                    unit: "g",
                    uncertain: true,
                    note: "Added during review",
                  },
                ],
              })
            }
          >
            Add ingredient
          </button>
          <Field label="Cooking instructions (one step per line)" wide>
            <textarea
              rows={7}
              value={edited.instructions.join("\n")}
              onChange={(e) =>
                edit({ instructions: e.target.value.split("\n") })
              }
            />
          </Field>
          <Field label="Advance preparation" wide>
            <textarea
              value={edited.advancePreparation}
              onChange={(e) => edit({ advancePreparation: e.target.value })}
            />
          </Field>
          <DietaryCompatibility result={draft.verification} />
          {draft.warnings.length > 0 && (
            <div className="notice">
              {draft.warnings.map((w, i) => (
                <p key={i}>{w}</p>
              ))}
            </div>
          )}
          {dirty && (
            <p role="status">
              Edits need a fresh server-side dietary check before saving.
            </p>
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            Keep unresolved details visibly flagged in the library. This does
            not approve the recipe for a meal.
          </label>
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() =>
                action(async () => {
                  await api("recipes/generated/discard", "POST", {
                    token: draft.token,
                  });
                  setDraft(undefined);
                  setEdited(undefined);
                })
              }
            >
              Discard
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() =>
                action(async () => {
                  const d = await api<RecipeDraft>(
                    "recipes/generated/update",
                    "POST",
                    { token: draft.token, recipe: edited },
                  );
                  setDraft(d);
                  setEdited(d.recipe);
                  setDirty(false);
                })
              }
            >
              Recheck my edits
            </button>
            <button
              className="button primary"
              disabled={
                busy ||
                dirty ||
                draft.verification.status === "REJECTED" ||
                (!ack &&
                  (draft.verification.status !== "VERIFIED" ||
                    draft.warnings.length > 0))
              }
              onClick={() =>
                action(async () => {
                  const saved = await api<{
                    id: string;
                    name: string;
                    defaultServings: number;
                  }>("recipes/generated/save", "POST", {
                    token: draft.token,
                    confirmed: true,
                    acknowledgeUncertainty: ack,
                  });
                  setDraft(undefined);
                  setEdited(undefined);
                  setNotice(
                    "Reviewed recipe saved to your household library. Search results have been refreshed.",
                  );
                  onSaved(saved);
                })
              }
            >
              I reviewed this recipe — save
            </button>
          </div>
        </>
      )}
    </section>
  );
}
