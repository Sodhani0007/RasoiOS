"use client";
import { useEffect, useState } from "react";
import { api, ErrorBox, Field, Badge } from "../ui/shared";
import { mealTypes } from "@/lib/validation/planning";
import type { adminRequests } from "@/lib/coordination/service";
import type { Member, Serialized } from "@/types";
import { ScheduleCard, type ScheduleResponse } from "./schedules";
import { DietaryCompatibility } from "../meals/DietaryCompatibility";
import { IngredientChecklist } from "../meals/IngredientChecklist";
type Requests = Serialized<Awaited<ReturnType<typeof adminRequests>>>;
export function AdminRequests() {
  const [date, setDate] = useState("");
  const [mealType, setMealType] = useState("lunch");
  const [minutes, setMinutes] = useState(120);
  const [requests, setRequests] = useState<Requests>([]);
  const [schedules, setSchedules] = useState<ScheduleResponse>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load(day = date) {
    const [r, s] = await Promise.all([
      api<Requests>(`admin/meal-requests${day ? `?date=${day}` : ""}`),
      api<ScheduleResponse>(`admin/meal-schedules${day ? `?date=${day}` : ""}`),
    ]);
    setRequests(r);
    setSchedules(s);
    if (!day) setDate(s.today);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">A SEAT FOR EVERYONE</div>
          <h1>Household meal requests</h1>
          <p>
            Review individual choices, then approve a cooking schedule. Times
            use {schedules?.timezone ?? "the household timezone"}.
          </p>
        </div>
      </div>
      <ErrorBox message={error} />
      <div className="card portal-form">
        <div className="form-grid">
          <Field label="Meal date">
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                load(e.target.value).catch((e) => setError(e.message));
              }}
            />
          </Field>
          <Field label="Meal">
            <select
              value={mealType}
              onChange={(e) => setMealType(e.target.value)}
            >
              {mealTypes.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Available sequential cooking minutes">
            <input
              type="number"
              min="1"
              max="1440"
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            />
          </Field>
        </div>
        <button
          className="button primary"
          disabled={busy || !date}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await api("admin/meal-schedules", "POST", {
                mealDate: date,
                mealType,
                maxMinutes: minutes,
              });
              await load();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Coordinating…" : "Create proposed schedule"}
        </button>
        <p className="muted">
          Combines only matching recipes. Different dishes and preferred serving
          times stay separate.
        </p>
      </div>
      <div className="portal-stack">
        {requests
          .filter((r) => r.mealDate === date && r.mealType === mealType)
          .map((r) => (
            <RequestReview
              key={`${r.id}-${r.revision}`}
              request={r}
              onChange={load}
            />
          ))}
        {!requests.some(
          (r) => r.mealDate === date && r.mealType === mealType,
        ) && <div className="card empty">No requests for this meal yet.</div>}
      </div>
      <h2 className="form-section">Cooking schedules</h2>
      <div className="portal-stack">
        {schedules?.schedules
          .filter((s) => s.mealDate === date && s.mealType === mealType)
          .map((s) => (
            <ScheduleCard key={s.id} schedule={s} onChange={load} />
          ))}
      </div>
    </>
  );
}
function RequestReview({
  request: r,
  onChange,
}: {
  request: Requests[number];
  onChange: () => Promise<void>;
}) {
  const [status, setStatus] = useState("UNDER_REVIEW");
  const [reason, setReason] = useState(r.reviewReason);
  const [ack, setAck] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <article className="card request-card">
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            {r.member.name} · {r.preferredTime} · {r.servings} portions
          </span>
          <h2>
            {r.attendance === "HOME"
              ? r.requestedDishName
              : r.attendance.replaceAll("_", " ")}
          </h2>
        </div>
        <Badge tone={r.status === "APPROVED" ? "green" : "amber"}>
          {r.status.replaceAll("_", " ")}
        </Badge>
      </div>
      {r.notes && <p>Member note: {r.notes}</p>}
      <p>{r.assessment.reason}</p>
      {r.assessment.verification && (
        <DietaryCompatibility result={r.assessment.verification} />
      )}
      <details>
        <summary>Ingredient availability and grocery requirements</summary>
        {r.assessment.inventory ? (
          <IngredientChecklist check={r.assessment.inventory} />
        ) : (
          <p>No ingredient calculation available until a recipe is selected.</p>
        )}
      </details>
      <ErrorBox message={error} />
      {!["DRAFT", "CANCELLED"].includes(r.status) && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api(`admin/meal-requests/${r.id}/status`, "PATCH", {
                status,
                reason,
                acknowledgeShortages: ack,
              });
              await onChange();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="form-grid">
            <Field label="Review decision">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {["UNDER_REVIEW", "APPROVED", "NEEDS_CHANGE", "REJECTED"].map(
                  (s) => (
                    <option key={s} value={s}>
                      {s.replaceAll("_", " ")}
                    </option>
                  ),
                )}
              </select>
            </Field>
            <Field label="Explanation / alternatives">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain a shortage, restriction, or suggested alternative"
                required={["NEEDS_CHANGE", "REJECTED"].includes(status)}
              />
            </Field>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            I reviewed the grocery and stock confirmation requirements.
          </label>
          <button className="button secondary" disabled={busy}>
            Save review
          </button>
        </form>
      )}
      <details>
        <summary>Status history</summary>
        {r.history.map((h) => (
          <p key={h.id}>
            {h.status} · {h.reason}
          </p>
        ))}
      </details>
    </article>
  );
}
export function AdminSettings() {
  const [settings, setSettings] = useState({
    name: "",
    timezone: "Asia/Calcutta",
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    setSettings(await api<typeof settings>("admin/settings"));
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
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
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">FAMILY COORDINATION</div>
          <h1>Household settings</h1>
          <p>Manage your shared kitchen and recipe sources.</p>
        </div>
      </div>
      <ErrorBox message={error} />
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      <div className="portal-summary">
        <form
          className="card portal-form"
          onSubmit={(e) => {
            e.preventDefault();
            action(async () => {
              await api("admin/settings", "PATCH", settings);
              setNotice("Household settings saved.");
            });
          }}
        >
          <h2>Your household</h2>
          <Field label="Household name">
            <input
              required
              value={settings.name}
              onChange={(e) =>
                setSettings({ ...settings, name: e.target.value })
              }
            />
          </Field>
          <Field label="IANA timezone">
            <input
              required
              value={settings.timezone}
              onChange={(e) =>
                setSettings({ ...settings, timezone: e.target.value })
              }
            />
          </Field>
          <p>
            Serving times are local wall-clock times in this timezone. The
            timezone is locked once requests exist.
          </p>
          <button className="button secondary" disabled={busy}>
            Save settings
          </button>
        </form>
      </div>
      <DatasetImport />
    </>
  );
}
function DatasetImport() {
  const [file, setFile] = useState<File>();
  const [ack, setAck] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="card portal-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!file) return;
        setBusy(true);
        setError("");
        try {
          const r = await api<{
            imported: number;
            duplicates: number;
            skipped: number;
            totalImported: number;
          }>("recipes/import", "POST", {
            csv: await file.text(),
            confirmAttribution: true,
          });
          setResult(
            `${r.imported} imported, ${r.duplicates} duplicates, ${r.skipped} skipped. ${r.totalImported} dataset recipes stored.`,
          );
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Import Mendeley recipes</h2>
      <p>
        Kanishka Jain · 10.17632/xsphgmmh7b.1 · CC BY 4.0. Keep third-party
        source attribution; review source rights before public redistribution.
      </p>
      <Field label="Dataset CSV (up to 30 MB)">
        <input
          required
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setFile(e.target.files?.[0])}
        />
      </Field>
      <label className="check">
        <input
          type="checkbox"
          checked={ack}
          onChange={(e) => setAck(e.target.checked)}
        />
        I will retain attribution and source-content restrictions.
      </label>
      <button className="button secondary" disabled={busy || !file || !ack}>
        {busy ? "Importing…" : "Import without replacing existing recipes"}
      </button>
      <ErrorBox message={error} />
      {result && <p role="status">{result}</p>}
    </form>
  );
}
