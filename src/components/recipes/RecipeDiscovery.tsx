"use client";
import { TutorialLink } from "./TutorialLink";
import { useEffect, useState } from "react";
import type { Recipe } from "@/types";
import type { GenerationRequest } from "@/lib/validation/planning";
import { api, ErrorBox, Badge } from "../ui/shared";
import { RecipeGenerator } from "./RecipeGenerator";
import { RecipeAnalysis } from "./RecipeAnalysis";
export function RecipeDiscovery({
  request,
  onSelect,
  onQueryChange,
  analysisServings = request.servings,
}: {
  request: GenerationRequest;
  onSelect?: (r: Recipe) => void;
  onQueryChange?: (query: string) => void;
  analysisServings?: number;
}) {
  const [searchQuery, setSearchQuery] = useState(request.dishName);
  // Meal forms control their dish name; the general library keeps its own search.
  const query = onQueryChange ? request.dishName : searchQuery;
  const [result, setResult] = useState<{
    recipes: Recipe[];
    canGenerate: boolean;
    exactCount: number;
  }>();
  const [selected, setSelected] = useState<Recipe>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    setBusy(true);
    const timer = setTimeout(() => {
      api<{ recipes: Recipe[]; canGenerate: boolean; exactCount: number }>(
        `recipes/search?q=${encodeURIComponent(query)}`,
      )
        .then((v) => {
          if (live) {
            setResult(v);
            setError("");
          }
        })
        .catch((e) => {
          if (live) setError(e.message);
        })
        .finally(() => {
          if (live) setBusy(false);
        });
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, revision]);
  return (
    <section className="card discovery">
      <h2>Find a dish you’ll enjoy</h2>
      <label className="field">
        <span>Search your household and dataset recipes</span>
        <input
          value={query}
          onChange={(e) => {
            if (onQueryChange) onQueryChange(e.target.value);
            else setSearchQuery(e.target.value);
            setSelected(undefined);
          }}
          placeholder="Try paneer, chicken curry, or a new dish"
        />
      </label>
      <ErrorBox message={error} />
      {busy ? (
        <p role="status">Searching recipes…</p>
      ) : (
        <>
          <div className="search-results">
            {result?.recipes.map((r) => (
              <button
                type="button"
                key={r.id}
                className={
                  selected?.id === r.id
                    ? "recipe-result selected"
                    : "recipe-result"
                }
                onClick={() => {
                  setSelected(r);
                  onSelect?.(r);
                }}
              >
                <strong>{r.name}</strong>
                <span>
                  {r.source.replaceAll("_", " ")} · {r.defaultServings} source
                  servings
                </span>
                {r.importRecord && (
                  <small>
                    {r.importRecord.cuisine} · quantities may need review
                  </small>
                )}
              </button>
            ))}
          </div>
          {!result?.recipes.length && (
            <p>No local matches. Try another name or generate a draft below.</p>
          )}
          {result?.canGenerate && query.trim().length >= 2 && (
            <RecipeGenerator
              key={query}
              request={{ ...request, dishName: query }}
              onSaved={() => setRevision((n) => n + 1)}
            />
          )}
        </>
      )}
      {selected && (!onQueryChange || selected.name === request.dishName) && (
        <article className="recipe-preview">
          <Badge>{selected.source.replaceAll("_", " ")}</Badge>
          <h3>{selected.name}</h3>
          <TutorialLink
            name={selected.name}
            language={request.preferredLanguage}
          />
          <p>{selected.description}</p>
          {selected.importRecord && (
            <p>
              Source:{" "}
              <a
                href="https://data.mendeley.com/datasets/xsphgmmh7b/1"
                target="_blank"
                rel="noreferrer"
              >
                Kanishka Jain · Mendeley · CC BY 4.0
              </a>
              . Original recipe:{" "}
              {selected.importRecord.originalUrl && (
                <a
                  href={selected.importRecord.originalUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Archana’s Kitchen
                </a>
              )}
              . Dataset labels are not dietary verification.
            </p>
          )}
          <div className="recipe-ingredients">
            {selected.ingredients.map((i) => (
              <div key={i.id}>
                <span>
                  {i.ingredient.name}
                  <small>{i.rawText}</small>
                </span>
                <strong>
                  {i.quantity ?? "Unknown"} {i.unit}
                </strong>
              </div>
            ))}
          </div>
          <p className="muted">
            Instructions: {selected.preferredLanguage ?? "English"}
          </p>
          <ol className="instructions">
            {selected.instructions.map((i) => (
              <li key={i.id}>{i.text}</li>
            ))}
          </ol>
          <RecipeAnalysis
            key={JSON.stringify([
              selected.id,
              request.memberIds,
              request.date,
              request.mealType,
              analysisServings,
            ])}
            recipeId={selected.id}
            baseServings={selected.defaultServings}
            context={{
              memberIds: request.memberIds,
              date: request.date,
              mealType: request.mealType,
              servings: analysisServings,
            }}
          />
        </article>
      )}
    </section>
  );
}
