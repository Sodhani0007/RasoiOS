"use client";
import { useEffect, useState } from "react";
import { api, ErrorBox, Field, Loading } from "../ui/shared";
import { CookRequestCard, type CookRequests } from "./cook-requests";
import { ScheduleCard, type ScheduleResponse } from "./schedules";
import { ShortagePanel } from "./shortages";
export function CookPortal({ view, id }: { view: string; id?: string }) {
  const [requests, setRequests] = useState<CookRequests>([]);
  const [data, setData] = useState<ScheduleResponse>();
  const [date, setDate] = useState("");
  const [error, setError] = useState("");
  const [language, setLanguage] = useState("English");
  const [notice, setNotice] = useState("");
  async function load(day = date) {
    const d = await api<ScheduleResponse>(
      id ? `cook/meals/${id}` : `cook/today${day ? `?date=${day}` : ""}`,
    );
    const choices = await api<CookRequests>(
      `cook/requests?date=${day || d.today}`,
    );
    setRequests(choices);
    setData(d);
    if (!day) setDate(d.today);
    setLanguage(d.preferredLanguage);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [id]);
  return (
    <div className="cook-portal">
      <div className="page-heading">
        <div>
          <div className="eyebrow">READY WHEN THE FAMILY IS</div>
          <h1>
            {view === "ingredients"
              ? "Ingredient checklist"
              : view === "preparation"
                ? "Preparation board"
                : "Your cooking schedule"}
          </h1>
          <p>
            Family choices and approved assignments ·{" "}
            {data?.timezone ?? "Household local time"}
          </p>
        </div>
        <Field label="Show date">
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              load(e.target.value).catch((e) => setError(e.message));
            }}
          />
        </Field>
      </div>
      <ErrorBox message={error} />
      {!data ? (
        <Loading />
      ) : (
        <>
          <div className="card cook-language">
            <Field label="Preferred instruction language">
              <input
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              />
            </Field>
            <button
              className="button secondary"
              onClick={async () => {
                try {
                  await api("cook/preferences", "PATCH", {
                    preferredLanguage: language,
                  });
                  setNotice(
                    "Language preference saved. Original instructions are shown when no verified translation exists.",
                  );
                  await load();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Save language
            </button>
            {notice && <p role="status">{notice}</p>}
          </div>
          <section className="portal-stack">
            <ShortagePanel date={date} onChange={load} />
            <h2>Family meal choices</h2>
            <p className="muted">
              Read-only choices. Preparation progress, reports and suggestions
              are recorded separately.
            </p>
            {requests.length ? (
              requests.map((r) => <CookRequestCard key={r.id} request={r} />)
            ) : (
              <p>No family choices for this date.</p>
            )}
          </section>
          {!data.schedules.length && (
            <div className="card empty">
              <h2>No approved meals for this date</h2>
              <p>
                Household requests appear here after the family approves a
                cooking schedule.
              </p>
            </div>
          )}
          {["breakfast", "lunch", "snack", "dinner"].map((type) => (
            <section key={type}>
              <h2 className="form-section">
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </h2>
              {data.schedules.filter((s) => s.mealType === type).length ===
              0 ? (
                <p className="muted">No approved assignment.</p>
              ) : (
                data.schedules
                  .filter((s) => s.mealType === type)
                  .map((s) => (
                    <ScheduleCard
                      key={s.id}
                      schedule={s}
                      cook
                      language={data.preferredLanguage}
                      onChange={load}
                    />
                  ))
              )}
            </section>
          ))}
        </>
      )}
    </div>
  );
}
