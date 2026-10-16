"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Badge, ErrorBox } from "../ui/shared";
import { RecipeDiscovery } from "../recipes/RecipeDiscovery";
import type { familyCookUpdates } from "@/lib/coordination/service";
import type { Member, Serialized } from "@/types";
import type { mealTypes } from "@/lib/validation/planning";
type Updates = Serialized<Awaited<ReturnType<typeof familyCookUpdates>>>;
export function FamilyCookUpdates({
  date,
  profile,
  onChange,
}: {
  date: string;
  profile: Member;
  onChange: () => Promise<void>;
}) {
  const [data, setData] = useState<Updates>();
  const [error, setError] = useState("");
  const [reviewing, setReviewing] = useState("");
  const [replacement, setReplacement] = useState<{
    id: string;
    name: string;
  }>();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = async () =>
    setData(await api<Updates>(`family/cook-updates?date=${date}`));
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [date]);
  async function review(id: string, accept: boolean) {
    setBusy(true);
    setError("");
    try {
      await api(`family/suggestions/${id}/review`, "POST", {
        action: accept ? "ACCEPT" : "REJECT",
        confirmed: true,
        ...(accept ? { recipeId: replacement?.id } : {}),
      });
      setReviewing("");
      setReplacement(undefined);
      setConfirmed(false);
      await load();
      await onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!data?.reports.length && !data?.suggestions.length && !error) return null;
  return (
    <section className="card portal-form">
      <h2>Updates from the cook</h2>
      <ErrorBox message={error} />
      {data?.reports.map((r) => (
        <div className="notice" key={r.id}>
          <strong>
            {r.type.replaceAll("_", " ")} · {r.schedule.mealType}
          </strong>
          <p>{r.message}</p>
          <small>Your meal choice is unchanged.</small>
        </div>
      ))}
      {data?.suggestions.map((s) => (
        <article className="cook-dish" key={s.id}>
          <Badge>{s.status}</Badge>
          <h3>
            {s.request.requestedDishName}: {s.ingredientFrom} → {s.ingredientTo}
          </h3>
          <p>{s.message}</p>
          {s.status === "PENDING" && (
            <>
              <p>
                The cook's suggestion has not changed your meal. A replacement
                needs your review and confirmation.
              </p>
              <div className="modal-actions">
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => {
                    setReviewing(s.id);
                    setReplacement(undefined);
                    setConfirmed(false);
                  }}
                >
                  Review suggestion
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => review(s.id, false)}
                >
                  Decline suggestion
                </button>
              </div>
              {reviewing === s.id && (
                <>
                  {s.unavailableIngredientId && (
                    <div className="portal-form">
                      <h4>Available alternatives for your portions</h4>
                      <p>
                        Dietary rules and inventory are checked again when you
                        confirm.
                      </p>
                      {s.alternatives.length ? (
                        s.alternatives.map((r) => (
                          <button
                            type="button"
                            key={r.id}
                            className={
                              replacement?.id === r.id
                                ? "button primary"
                                : "button secondary"
                            }
                            onClick={() => {
                              setReplacement(r);
                              setConfirmed(false);
                            }}
                          >
                            {r.name}
                          </button>
                        ))
                      ) : (
                        <p>
                          No known alternative has confirmed ingredients. Keep
                          your original choice, update stock, or choose another
                          reviewed dish below.
                        </p>
                      )}
                    </div>
                  )}
                  <p>
                    Select a reviewed replacement below. For an ingredient
                    substitution, first{" "}
                    <Link href="/recipes" className="text-button">
                      create a household recipe copy
                    </Link>{" "}
                    with the exact ingredients and instructions.
                  </p>
                  <RecipeDiscovery
                    analysisServings={s.request.servings}
                    request={{
                      memberIds: [profile.id],
                      date: s.request.mealDate,
                      mealType: s.request
                        .mealType as (typeof mealTypes)[number],
                      servings: Math.ceil(s.request.servings),
                      maxMinutes: 120,
                      dishName: "",
                      cuisine: "Indian",
                      preferredLanguage: profile.preferredLanguage,
                    }}
                    onSelect={(r) => {
                      setReplacement({ id: r.id, name: r.name });
                      setConfirmed(false);
                    }}
                  />
                  {replacement && (
                    <p className="notice">
                      Replace {s.request.requestedDishName} with{" "}
                      <strong>{replacement.name}</strong>. The schedule will
                      need fresh approval.
                    </p>
                  )}
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    I reviewed this replacement and confirm the change to my
                    meal.
                  </label>
                  <button
                    className="button primary"
                    disabled={busy || !replacement || !confirmed}
                    onClick={() => review(s.id, true)}
                  >
                    Confirm replacement and resubmit
                  </button>
                </>
              )}
            </>
          )}
        </article>
      ))}
    </section>
  );
}
