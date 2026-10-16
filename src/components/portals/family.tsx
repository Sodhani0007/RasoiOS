"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ErrorBox, Loading, Field, Badge, asList } from "../ui/shared";
import { RecipeAutocomplete } from "../recipes/RecipeAutocomplete";
import { RecipeGenerator } from "../recipes/RecipeGenerator";
import { RecipeAnalysis } from "../recipes/RecipeAnalysis";
import { TutorialLink } from "../recipes/TutorialLink";
import { RecipeDiscovery } from "../recipes/RecipeDiscovery";
import { FamilyCookUpdates } from "./family-updates";
import { mealTypes } from "@/lib/validation/planning";
import { diets } from "@/lib/validation";
import type { familyMeals } from "@/lib/coordination/service";
import type { Member, Serialized } from "@/types";
type Meals = Serialized<Awaited<ReturnType<typeof familyMeals>>>;
const emptyForm = {
  mealDate: "",
  mealType: "lunch" as (typeof mealTypes)[number],
  preferredTime: "13:00",
  attendance: "HOME",
  requestedDishName: "",
  recipeId: null as string | null,
  servings: 1,
  notes: "",
  status: "SUBMITTED",
};
export function FamilyPortal({ view }: { view: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    api<Member[]>("members")
      .then((rows) => {
        const active = rows.filter((m) => m.active);
        setMembers(active);
        const saved = sessionStorage.getItem("rasoi-member");
        const id =
          active.find((m) => m.id === saved)?.id || active[0]?.id || "";
        if (id) sessionStorage.setItem("rasoi-member", id);
        else sessionStorage.removeItem("rasoi-member");
        setSelected(id);
        setLoaded(true);
      })
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <ErrorBox message={error} />
      <div className="card profile-picker">
        <Field label="Whose meal are you choosing?">
          <select
            aria-label="Select family profile"
            value={selected}
            onChange={(e) => {
              sessionStorage.setItem("rasoi-member", e.target.value);
              setSelected(e.target.value);
            }}
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.relationship ? " - " + m.relationship : ""}
              </option>
            ))}
          </select>
        </Field>
        <p>Each profile keeps its own meal choices and dietary preferences.</p>
      </div>
      {selected ? (
        <SelectedFamily key={selected} view={view} />
      ) : loaded ? (
        <p className="card empty">
          No active profiles.{" "}
          <Link href="/household">Add a household member</Link> to choose meals.
        </p>
      ) : (
        <Loading />
      )}
    </>
  );
}
function SelectedFamily({ view }: { view: string }) {
  const [profile, setProfile] = useState<Member>();
  const [meals, setMeals] = useState<Meals>();
  const [date, setDate] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [basket, setBasket] = useState<
    { requestedDishName: string; recipeId: string | null; servings: number }[]
  >([]);
  const [baseServings, setBaseServings] = useState(1);
  const [missing, setMissing] = useState(false);
  const [editing, setEditing] = useState<string>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function load(selectedDate = date) {
    const [p, m] = await Promise.all([
      api<Member>("family/profile"),
      api<Meals>(`family/meals${selectedDate ? `?date=${selectedDate}` : ""}`),
    ]);
    setProfile(p);
    setMeals(m);
    if (!selectedDate) {
      setDate(m.today);
      setForm((f) => ({ ...f, mealDate: m.today }));
    }
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  async function act(fn: () => Promise<void>) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!profile || !meals)
    return (
      <>
        <ErrorBox message={error} />
        <Loading />
      </>
    );
  const generation = {
    memberIds: [profile.id],
    date: form.mealDate || date,
    mealType: form.mealType,
    servings: Math.ceil(form.servings),
    maxMinutes: 120,
    dishName: form.requestedDishName,
    cuisine: "Indian",
    preferredLanguage: profile.preferredLanguage,
  };
  const choosing =
    view === "choose-meal" ||
    !!editing ||
    (view === "recipes" && !!form.recipeId);
  const title =
    view === "dashboard"
      ? `Your kitchen, ${profile.name}`
      : view === "my-meals"
        ? "My meals"
        : view === "my-preferences"
          ? "My preferences"
          : view === "recipes"
            ? "Discover a new favourite"
            : "Choose my meal";
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR TASTES. YOUR PLACE AT THE TABLE.</div>
          <h1>{title}</h1>
          <p>
            {meals.today} · All meal dates and serving times use{" "}
            {meals.timezone}.
          </p>
        </div>
        <Link className="button primary" href="/family/choose-meal">
          Choose my meal
        </Link>
      </div>
      <ErrorBox message={error} />
      <FamilyCookUpdates
        key={date}
        date={date}
        profile={profile}
        onChange={load}
      />
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      {view === "my-preferences" ? (
        <Preferences
          profile={profile}
          onSave={async (patch) => {
            await act(async () => {
              await api("family/profile", "PATCH", patch);
              await load();
              setNotice(
                "Your preferences have been saved. Existing assignments need family review when restrictions change.",
              );
            });
          }}
          busy={busy}
        />
      ) : (
        <>
          {view === "dashboard" && (
            <div className="portal-summary">
              <div className="card">
                <span className="eyebrow">MY DIETARY PROFILE</span>
                <h2>{profile.dietaryPreference}</h2>
                <p>
                  {profile.fasting
                    ? "Fasting rules active"
                    : "Regular meal preferences"}
                </p>
                <p>
                  Allergies:{" "}
                  {asList(profile.allergies).join(", ") || "None recorded"}
                </p>
                <Link href="/family/my-preferences" className="text-button">
                  Update my preferences
                </Link>
              </div>
              <div className="card">
                <span className="eyebrow">TODAY AT THE TABLE</span>
                <h2>{meals.requests.length} meal choices</h2>
                <p>
                  {meals.assignments.length} approved dishes assigned to you.
                </p>
                <p>
                  Your choices stay separate from other family members’
                  requests.
                </p>
              </div>
            </div>
          )}
          {choosing && (
            <>
              <form
                className="card portal-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  act(async () => {
                    if (!editing && form.attendance === "HOME") {
                      const items = [
                        ...basket,
                        ...(form.requestedDishName.trim()
                          ? [
                              {
                                requestedDishName: form.requestedDishName,
                                recipeId: form.recipeId,
                                servings: form.servings,
                              },
                            ]
                          : []),
                      ];
                      await api("family/meal-selections", "POST", {
                        mealDate: form.mealDate,
                        mealType: form.mealType,
                        preferredTime: form.preferredTime,
                        notes: form.notes,
                        status: form.status,
                        items,
                      });
                    } else {
                      await api(
                        `family/meal-requests${editing ? `/${editing}` : ""}`,
                        editing ? "PATCH" : "POST",
                        form,
                      );
                    }
                    setBasket([]);
                    setMissing(false);
                    await load(form.mealDate);
                    setDate(form.mealDate);
                    setEditing(undefined);
                    setForm({
                      ...emptyForm,
                      mealDate: form.mealDate,
                      mealType: form.mealType,
                      preferredTime: form.preferredTime,
                    });
                    setNotice(
                      form.status === "DRAFT"
                        ? "Draft saved. Submit it when you are ready."
                        : "Meal request sent for household review.",
                    );
                  });
                }}
              >
                <h2>
                  {editing ? "Edit my request" : "What would you like to eat?"}
                </h2>
                <p className="muted">
                  Use Add Another Dish to build a meal with separate portions.
                  Editing an approved choice withdraws its cooking schedule for
                  fresh family review.
                </p>
                <div className="form-grid">
                  <Field label="Date">
                    <input
                      required
                      type="date"
                      value={form.mealDate}
                      onChange={(e) =>
                        setForm({ ...form, mealDate: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Meal">
                    <select
                      value={form.mealType}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          mealType: e.target.value as typeof form.mealType,
                        })
                      }
                    >
                      {mealTypes.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label={`Preferred serving time (${meals.timezone})`}>
                    <input
                      required
                      type="time"
                      value={form.preferredTime}
                      onChange={(e) =>
                        setForm({ ...form, preferredTime: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Eating plans">
                    <select
                      value={form.attendance}
                      onChange={(e) =>
                        setForm({ ...form, attendance: e.target.value })
                      }
                    >
                      <option value="HOME">Eating at home</option>
                      <option value="OUTSIDE">Eating outside</option>
                      <option value="SKIP">Skipping this meal</option>
                    </select>
                  </Field>
                  {form.attendance === "HOME" && (
                    <>
                      <Field label="Requested dish">
                        <RecipeAutocomplete
                          value={form.requestedDishName}
                          required={!basket.length}
                          onMissing={setMissing}
                          onChange={(name) =>
                            setForm((f) => ({
                              ...f,
                              requestedDishName: name,
                              recipeId: null,
                            }))
                          }
                          onSelect={(recipe) => {
                            setBaseServings(recipe.defaultServings);
                            setForm((f) => ({
                              ...f,
                              requestedDishName: recipe.name,
                              recipeId: recipe.id,
                            }));
                          }}
                        />
                      </Field>
                      <Field label="Portions">
                        <input
                          required
                          type="number"
                          min="0.25"
                          max="20"
                          step="0.25"
                          value={form.servings}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              servings: Number(e.target.value),
                            })
                          }
                        />
                      </Field>
                    </>
                  )}
                  <Field label="Notes" wide>
                    <textarea
                      maxLength={1000}
                      value={form.notes}
                      onChange={(e) =>
                        setForm({ ...form, notes: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Save as">
                    <select
                      value={form.status}
                      onChange={(e) =>
                        setForm({ ...form, status: e.target.value })
                      }
                    >
                      <option value="SUBMITTED">Submit for review</option>
                      <option value="DRAFT">Keep as draft</option>
                    </select>
                  </Field>
                </div>
                {form.recipeId && (
                  <p className="success">
                    Selected recipe: {form.requestedDishName}
                    <TutorialLink
                      name={form.requestedDishName}
                      language={profile.preferredLanguage}
                    />
                  </p>
                )}
                {!editing && form.attendance === "HOME" && (
                  <>
                    <div className="meal-basket" aria-label="Selected dishes">
                      {basket.map((dish, index) => (
                        <div
                          className="basket-item"
                          key={dish.recipeId || dish.requestedDishName}
                        >
                          <strong>{dish.requestedDishName}</strong>
                          <Field
                            label={"Portions for " + dish.requestedDishName}
                          >
                            <input
                              type="number"
                              min="0.25"
                              max="20"
                              step="0.25"
                              value={dish.servings}
                              onChange={(e) =>
                                setBasket((items) =>
                                  items.map((item, i) =>
                                    i === index
                                      ? {
                                          ...item,
                                          servings: Number(e.target.value),
                                        }
                                      : item,
                                  ),
                                )
                              }
                            />
                          </Field>
                          <button
                            type="button"
                            className="text-button danger-text"
                            aria-label={"Remove " + dish.requestedDishName}
                            onClick={() =>
                              setBasket((items) =>
                                items.filter((_, i) => i !== index),
                              )
                            }
                          >
                            Remove dish
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="button secondary"
                      disabled={
                        busy || form.requestedDishName.trim().length < 2
                      }
                      onClick={() => {
                        if (
                          basket.some(
                            (d) =>
                              (form.recipeId && d.recipeId === form.recipeId) ||
                              d.requestedDishName.toLowerCase() ===
                                form.requestedDishName.trim().toLowerCase(),
                          )
                        ) {
                          setError(
                            "This dish is already selected. Adjust its portions instead.",
                          );
                          return;
                        }
                        setBasket((items) => [
                          ...items,
                          {
                            requestedDishName: form.requestedDishName.trim(),
                            recipeId: form.recipeId,
                            servings: form.servings,
                          },
                        ]);
                        setForm((f) => ({
                          ...f,
                          requestedDishName: "",
                          recipeId: null,
                          servings: 1,
                        }));
                        setMissing(false);
                        setError("");
                      }}
                    >
                      Add Another Dish
                    </button>
                  </>
                )}
                <div className="modal-actions">
                  {editing && (
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => {
                        setEditing(undefined);
                        setForm({ ...emptyForm, mealDate: date });
                      }}
                    >
                      Stop editing
                    </button>
                  )}
                  <button className="button primary" disabled={busy}>
                    {busy
                      ? "Saving…"
                      : editing
                        ? "Save my changes"
                        : "Save meal selection"}
                  </button>
                </div>
              </form>
              {form.attendance === "HOME" && form.recipeId && (
                <RecipeAnalysis
                  key={JSON.stringify([
                    form.recipeId,
                    form.mealDate,
                    form.mealType,
                    form.servings,
                  ])}
                  recipeId={form.recipeId}
                  baseServings={baseServings}
                  context={{
                    memberIds: [profile.id],
                    date: form.mealDate,
                    mealType: form.mealType,
                    servings: form.servings,
                  }}
                />
              )}
              {form.attendance === "HOME" &&
                missing &&
                form.requestedDishName.trim().length >= 2 && (
                  <RecipeGenerator
                    key={form.requestedDishName}
                    request={generation}
                    onSaved={(recipe) => {
                      setMissing(false);
                      if (recipe) {
                        setForm((f) => ({
                          ...f,
                          requestedDishName: recipe.name,
                          recipeId: recipe.id,
                        }));
                        setBaseServings(recipe.defaultServings);
                      }
                      setNotice(
                        "Reviewed recipe selected. Save your meal when ready.",
                      );
                    }}
                  />
                )}
            </>
          )}
          {view === "recipes" && !choosing && (
            <RecipeDiscovery
              request={generation}
              analysisServings={form.servings}
              onSelect={(r) => {
                setForm((f) => ({
                  ...f,
                  recipeId: r.id,
                  requestedDishName: r.name,
                }));
                setNotice(
                  `${r.name} selected. Complete the meal form above to submit your request.`,
                );
              }}
            />
          )}
          {view !== "recipes" && (
            <section>
              <div className="section-heading">
                <h2>My choices and updates</h2>
                <label className="field">
                  <span>Show date</span>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);
                      load(e.target.value).catch((e) => setError(e.message));
                    }}
                  />
                </label>
              </div>
              <div className="portal-stack">
                {!meals.requests.length && (
                  <div className="card empty">
                    No requests for this date. Choose a meal or let your
                    household know you are eating outside.
                  </div>
                )}
                {meals.requests.map((r) => (
                  <article className="card request-card" key={r.id}>
                    <div className="section-heading">
                      <div>
                        <span className="eyebrow">
                          {r.mealType} · {r.preferredTime}
                        </span>
                        <h3>
                          {r.attendance === "HOME"
                            ? r.requestedDishName
                            : r.attendance === "SKIP"
                              ? "Skipping this meal"
                              : "Eating outside"}
                        </h3>
                      </div>
                      <Badge tone={r.status === "APPROVED" ? "green" : "amber"}>
                        {r.status.replaceAll("_", " ")}
                      </Badge>
                    </div>
                    <p>
                      {r.servings} portion(s) · {r.mealDate}
                    </p>
                    {r.reviewReason && (
                      <p
                        className={
                          r.status === "NEEDS_CHANGE" || r.status === "REJECTED"
                            ? "error"
                            : "notice"
                        }
                      >
                        {r.reviewReason}
                      </p>
                    )}
                    {r.notes && <p>{r.notes}</p>}
                    <p className="notice">
                      Dietary check:{" "}
                      {r.assessment.verification?.status ?? "Awaiting recipe"} -{" "}
                      {r.assessment.reason}
                    </p>
                    {
                      <div className="modal-actions">
                        <button
                          className="button secondary"
                          disabled={busy}
                          onClick={() => {
                            setBasket([]);
                            setMissing(false);
                            setEditing(r.id);
                            setForm({
                              mealDate: r.mealDate,
                              mealType: r.mealType as typeof form.mealType,
                              preferredTime: r.preferredTime,
                              attendance: r.attendance,
                              requestedDishName: r.requestedDishName,
                              recipeId: r.recipeId,
                              servings: r.servings,
                              notes: r.notes,
                              status: "SUBMITTED",
                            });
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          Edit / resubmit
                        </button>
                        {r.status !== "CANCELLED" && (
                          <button
                            className="text-button danger-text"
                            disabled={busy}
                            onClick={() =>
                              act(async () => {
                                await api(
                                  `family/meal-requests/${r.id}`,
                                  "DELETE",
                                );
                                await load();
                                setNotice("Request cancelled.");
                              })
                            }
                          >
                            Cancel request
                          </button>
                        )}
                      </div>
                    }
                  </article>
                ))}
              </div>
              <h2 className="form-section">My approved assignments</h2>
              {!meals.assignments.length && (
                <p className="muted">
                  Your approved dishes will appear here after the family
                  finalizes the schedule.
                </p>
              )}
              {meals.assignments.map((a, i) => (
                <div className="card" key={i}>
                  <h3>{(a.recipe as { name: string }).name}</h3>
                  <p>
                    {a.mealType} · {a.preferredTime} · {a.servings} portions ·{" "}
                    {a.preparationStatus}
                  </p>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </>
  );
}
function Preferences({
  profile,
  onSave,
  busy,
}: {
  profile: Member;
  onSave: (v: unknown) => Promise<void>;
  busy: boolean;
}) {
  const [diet, setDiet] = useState(profile.dietaryPreference);
  const [allergies, setAllergies] = useState(
    asList(profile.allergies).join(", "),
  );
  const [dislikes, setDislikes] = useState(asList(profile.dislikes).join(", "));
  const [language, setLanguage] = useState(profile.preferredLanguage);
  const [eggs, setEggs] = useState(profile.allowEggs);
  const [fasting, setFasting] = useState(profile.fasting);
  const [excluded, setExcluded] = useState(
    profile.dietaryRules
      .filter((r) => r.target === "INGREDIENT")
      .map((r) => r.value)
      .join(", "),
  );
  const [categories, setCategories] = useState(
    profile.dietaryRules
      .filter((r) => r.target === "CATEGORY")
      .map((r) => r.value)
      .join(", "),
  );
  const [allowed, setAllowed] = useState(
    asList(profile.fastingRule?.permittedIngredients).join(", "),
  );
  const [blocked, setBlocked] = useState(
    asList(profile.fastingRule?.prohibitedIngredients).join(", "),
  );
  const list = (s: string) =>
    s
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  return (
    <form
      className="card portal-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          dietaryPreference: diet,
          allergies: list(allergies),
          dislikes: list(dislikes),
          preferredLanguage: language,
          allowEggs: eggs,
          fasting,
          excludedIngredients: list(excluded),
          excludedCategories: list(categories),
          fastingRule: {
            permittedIngredients: list(allowed),
            prohibitedIngredients: list(blocked),
            permittedCategories: asList(
              profile.fastingRule?.permittedCategories,
            ),
            prohibitedCategories: asList(
              profile.fastingRule?.prohibitedCategories,
            ),
            notes: profile.fastingRule?.notes ?? "",
            startsOn: profile.fastingRule?.startsOn ?? null,
            endsOn: profile.fastingRule?.endsOn ?? null,
            mealType: profile.fastingRule?.mealType ?? null,
          },
        });
      }}
    >
      <h2>Food that works for me</h2>
      <div className="form-grid">
        <Field label="Dietary profile">
          <select value={diet} onChange={(e) => setDiet(e.target.value)}>
            {diets.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </Field>
        <Field label="Preferred language">
          <input
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          />
        </Field>
        <Field label="Allergies (comma separated)">
          <input
            value={allergies}
            onChange={(e) => setAllergies(e.target.value)}
          />
        </Field>
        <Field label="Dislikes (soft preferences)">
          <input
            value={dislikes}
            onChange={(e) => setDislikes(e.target.value)}
          />
        </Field>
        <Field label="Excluded ingredients">
          <input
            value={excluded}
            onChange={(e) => setExcluded(e.target.value)}
          />
        </Field>
        <Field label="Excluded categories">
          <input
            value={categories}
            onChange={(e) => setCategories(e.target.value)}
          />
        </Field>
        <label className="check">
          <input
            type="checkbox"
            checked={eggs}
            onChange={(e) => setEggs(e.target.checked)}
          />
          Allow eggs where my profile permits
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={fasting}
            onChange={(e) => setFasting(e.target.checked)}
          />
          Fasting rules active
        </label>
        <Field label="Fasting permitted ingredients">
          <input value={allowed} onChange={(e) => setAllowed(e.target.value)} />
        </Field>
        <Field label="Fasting prohibited ingredients">
          <input value={blocked} onChange={(e) => setBlocked(e.target.value)} />
        </Field>
      </div>
      <p className="muted">
        Fasting permits form a whitelist. Your existing date, meal and category
        rules remain in effect. Allergy constraints always take priority.
      </p>
      <button className="button primary" disabled={busy}>
        Save my preferences
      </button>
    </form>
  );
}
