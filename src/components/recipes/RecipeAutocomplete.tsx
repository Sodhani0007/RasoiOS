"use client";
import { useEffect, useId, useState } from "react";
import { api, ErrorBox } from "../ui/shared";
import type { Recipe } from "@/types";
export function RecipeAutocomplete({
  value,
  onChange,
  onSelect,
  onMissing,
  label = "Requested dish",
  required = true,
}: {
  value: string;
  onChange: (value: string) => void;
  onSelect: (recipe: Recipe) => void;
  onMissing?: (missing: boolean) => void;
  label?: string;
  required?: boolean;
}) {
  const id = useId();
  const [results, setResults] = useState<Recipe[]>([]);
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [active, setActive] = useState(-1),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setActive(-1);
    onMissing?.(false);
    if (value.trim().length < 2) {
      setResults([]);
      setBusy(false);
      return;
    }
    setBusy(true);
    const timer = setTimeout(() => {
      api<{ recipes: Recipe[] }>(
        `recipes/search?q=${encodeURIComponent(value)}&limit=8`,
      )
        .then((r) => {
          if (live) {
            setResults(r.recipes);
            setError("");
            onMissing?.(r.recipes.length === 0);
          }
        })
        .catch((e) => {
          if (live) {
            setError(e.message);
            setResults([]);
          }
        })
        .finally(() => {
          if (live) setBusy(false);
        });
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [value]);
  const choose = (recipe: Recipe) => {
    onSelect(recipe);
    setOpen(false);
    setActive(-1);
  };
  return (
    <div
      className="recipe-autocomplete"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <input
        required={required}
        autoComplete="off"
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={open && value.trim().length >= 2}
        aria-controls={`${id}-list`}
        aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined}
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            return;
          }
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
            setActive((i) =>
              !results.length
                ? -1
                : e.key === "ArrowDown"
                  ? (i + 1) % results.length
                  : (i - 1 + results.length) % results.length,
            );
          }
          if (e.key === "Enter" && open) {
            e.preventDefault();
            if (!busy && results[active]) choose(results[active]);
          }
        }}
        placeholder="Type a dish, e.g. paneer or dal"
      />
      {open && value.trim().length >= 2 && (
        <div className="autocomplete-menu">
          {busy ? (
            <p role="status">Searching recipes…</p>
          ) : (
            <>
              <ul
                id={`${id}-list`}
                role="listbox"
                aria-label="Recipe suggestions"
              >
                {results.map((r, i) => (
                  <li
                    role="option"
                    id={`${id}-${i}`}
                    aria-selected={active === i}
                    key={r.id}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(r)}
                  >
                    <strong>{r.name}</strong>
                    <small>{r.source.replaceAll("_", " ")}</small>
                  </li>
                ))}
              </ul>
              {!results.length && !error && (
                <p role="status">No matching recipe found.</p>
              )}
            </>
          )}
          <ErrorBox message={error} />
        </div>
      )}
    </div>
  );
}
