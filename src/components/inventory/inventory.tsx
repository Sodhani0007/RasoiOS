"use client";
import { useEffect, useState } from "react";
import { Plus, Search, Pencil, Trash2, Package } from "lucide-react";
import { z } from "zod";
import type { Inventory, Ingredient } from "@/types";
import { inventorySchema, units, statuses } from "@/lib/validation";
import { convertQuantity, expiryState } from "@/lib/inventory/units";
import {
  api,
  Modal,
  Field,
  Badge,
  Loading,
  ErrorBox,
  Empty,
  formatDate,
} from "../ui/shared";
type Form = z.infer<typeof inventorySchema>;
function Editor({
  item,
  ingredients,
  onClose,
  onSave,
}: {
  item: Inventory | null;
  ingredients: Ingredient[];
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  const [form, setForm] = useState<Form>(
    item
      ? {
          ingredientName: item.ingredient.name,
          category: item.ingredient.category,
          quantity: item.quantity,
          unit: item.unit as Form["unit"],
          availability: item.availability as Form["availability"],
          purchaseDate: item.purchaseDate?.slice(0, 10) ?? null,
          expiryDate: item.expiryDate?.slice(0, 10) ?? null,
          notes: item.notes,
        }
      : {
          ingredientName: "",
          category: "Vegetables",
          quantity: null,
          unit: "g",
          availability: "UNKNOWN",
          purchaseDate: null,
          expiryDate: null,
          notes: "",
        },
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  return (
    <Modal
      title={item ? "Update ingredient" : "Add to your kitchen"}
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setBusy(true);
          try {
            await api(
              `inventory${item ? "/" + item.id : ""}`,
              item ? "PATCH" : "POST",
              form,
            );
            await onSave();
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <Field label="Ingredient name">
            <input
              required
              value={form.ingredientName}
              list="ingredient-names"
              onChange={(e) => {
                const known = ingredients.find(
                  (i) => i.name.toLowerCase() === e.target.value.toLowerCase(),
                );
                setForm((f) => ({
                  ...f,
                  ingredientName: e.target.value,
                  category: known?.category ?? f.category,
                }));
              }}
            />
            <datalist id="ingredient-names">
              {ingredients.map((i) => (
                <option key={i.id}>{i.name}</option>
              ))}
            </datalist>
          </Field>
          <Field label="Category">
            <input
              required
              list="categories"
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
            />
            <datalist id="categories">
              {Array.from(new Set(ingredients.map((i) => i.category))).map(
                (c) => (
                  <option key={c}>{c}</option>
                ),
              )}
            </datalist>
          </Field>
          <Field label="Quantity (leave blank if unknown)">
            <input
              type="number"
              min="0"
              step="any"
              value={form.quantity ?? ""}
              onChange={(e) =>
                set(
                  "quantity",
                  e.target.value === "" ? null : Number(e.target.value),
                )
              }
            />
          </Field>
          <Field label="Unit">
            <select
              value={form.unit}
              onChange={(e) => {
                const unit = e.target.value as Form["unit"];
                try {
                  const quantity = item
                    ? convertQuantity(form.quantity, form.unit, unit)
                    : form.quantity;
                  setForm((f) => ({ ...f, quantity, unit }));
                  setError("");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              {units.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </Field>
          <Field label="Availability" wide>
            <select
              value={form.availability}
              onChange={(e) =>
                set("availability", e.target.value as Form["availability"])
              }
            >
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {s === "AVAILABLE"
                    ? "Confirmed available"
                    : s === "UNAVAILABLE"
                      ? "Confirmed unavailable"
                      : "Unknown availability"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Purchase date (optional)">
            <input
              type="date"
              value={form.purchaseDate ?? ""}
              onChange={(e) => set("purchaseDate", e.target.value || null)}
            />
          </Field>
          <Field label="Use-by date (optional)">
            <input
              type="date"
              value={form.expiryDate ?? ""}
              onChange={(e) => set("expiryDate", e.target.value || null)}
            />
          </Field>
          <Field label="Notes" wide>
            <textarea
              value={form.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
            />
          </Field>
          <div className="info-strip wide">
            Unknown quantity stays unknown. Unit conversions use 1 cup = 240 ml,
            1 tbsp = 15 ml and 1 tsp = 5 ml. Mass and volume cannot be
            interchanged.
          </div>
        </div>
        <ErrorBox message={error} />
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button disabled={busy} className="button primary">
            {busy ? "Saving…" : "Save ingredient"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function KitchenInventory() {
  const [items, setItems] = useState<Inventory[]>();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<Inventory | null | undefined>();
  const [deleting, setDeleting] = useState<Inventory>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    const [i, c] = await Promise.all([
      api<Inventory[]>("inventory"),
      api<Ingredient[]>("ingredients"),
    ]);
    setItems(i);
    setIngredients(c);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  const shown = items?.filter(
    (i) =>
      i.ingredient.name.toLowerCase().includes(query.toLowerCase()) &&
      (!category || i.ingredient.category === category) &&
      (!status || i.availability === status),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">KNOW WHAT’S IN. USE WHAT YOU HAVE.</div>
          <h1>Kitchen inventory</h1>
          <p>Your pantry, without the guesswork.</p>
        </div>
        <button className="button primary" onClick={() => setEditing(null)}>
          <Plus size={17} /> Add ingredient
        </button>
      </div>
      <ErrorBox message={error} />
      <div className="inventory-summary">
        <div>
          <Package size={21} />
          <strong>{items?.length ?? 0}</strong> pantry items
        </div>
        <div>
          <span className="status-dot" />
          {items?.filter((i) => i.availability === "AVAILABLE").length ??
            0}{" "}
          confirmed available
        </div>
        <div className="amber-text">
          {items?.filter(
            (i) =>
              i.availability !== "UNAVAILABLE" && expiryState(i.expiryDate),
          ).length ?? 0}{" "}
          use-by dates to review
        </div>
      </div>
      <section className="card inventory-card">
        <div className="toolbar">
          <div className="search">
            <Search size={18} />
            <input
              aria-label="Search inventory"
              placeholder="Find an ingredient…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            aria-label="Filter by category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {Array.from(new Set(items?.map((i) => i.ingredient.category)))
              .sort()
              .map((c) => (
                <option key={c}>{c}</option>
              ))}
          </select>
          <select
            aria-label="Filter by availability"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All availability</option>
            {statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        {!items ? (
          <Loading />
        ) : !shown?.length ? (
          <Empty>
            No ingredients found. Add an ingredient or adjust your filters.
          </Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Ingredient</th>
                  <th>Quantity</th>
                  <th>Availability</th>
                  <th>Use by</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <strong>{i.ingredient.name}</strong>
                      <small>{i.ingredient.category}</small>
                      {i.notes && <small>{i.notes}</small>}
                    </td>
                    <td>
                      {i.quantity === null ? (
                        <span className="muted">Unknown</span>
                      ) : (
                        <strong>
                          {i.quantity} <span className="muted">{i.unit}</span>
                        </strong>
                      )}
                    </td>
                    <td>
                      <Badge
                        tone={
                          i.availability === "AVAILABLE"
                            ? "green"
                            : i.availability === "UNAVAILABLE"
                              ? "rose"
                              : "neutral"
                        }
                      >
                        {i.availability === "AVAILABLE"
                          ? "Available"
                          : i.availability === "UNAVAILABLE"
                            ? "Unavailable"
                            : "Unknown"}
                      </Badge>
                    </td>
                    <td>
                      {i.expiryDate ? (
                        <>
                          <span>{formatDate(i.expiryDate)}</span>
                          {expiryState(i.expiryDate) && (
                            <small className="amber-text">
                              {expiryState(i.expiryDate)}
                            </small>
                          )}
                        </>
                      ) : (
                        <span className="muted">Not set</span>
                      )}
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="icon-button"
                          aria-label={`Edit ${i.ingredient.name}`}
                          onClick={() => setEditing(i)}
                        >
                          <Pencil size={16} />
                        </button>
                        {i.availability !== "UNAVAILABLE" && (
                          <button
                            className="text-button"
                            disabled={busy}
                            onClick={async () => {
                              setBusy(true);
                              try {
                                await api(`inventory/${i.id}`, "PATCH", {
                                  availability: "UNAVAILABLE",
                                });
                                await load();
                              } catch (e) {
                                setError((e as Error).message);
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            Mark unavailable
                          </button>
                        )}
                        <button
                          className="icon-button danger-text"
                          aria-label={`Remove ${i.ingredient.name}`}
                          onClick={() => setDeleting(i)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="page-note">
        Availability and quantity are separate facts. An unknown amount is never
        assumed to be sufficient.
      </p>
      {editing !== undefined && (
        <Editor
          item={editing}
          ingredients={ingredients}
          onClose={() => setEditing(undefined)}
          onSave={load}
        />
      )}{" "}
      {deleting && (
        <Modal
          title={`Remove ${deleting.ingredient.name}?`}
          onClose={() => setDeleting(undefined)}
        >
          <p>
            This removes the item from your inventory. Its activity history will
            be preserved.
          </p>
          <ErrorBox message={error} />
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setDeleting(undefined)}
            >
              Cancel
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api(`inventory/${deleting.id}`, "DELETE");
                  await load();
                  setDeleting(undefined);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Remove ingredient
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
