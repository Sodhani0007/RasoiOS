"use client";
import { useEffect, useState } from "react";
import { History } from "lucide-react";
import type { Activity as ActivityType } from "@/types";
import { api, Loading, ErrorBox, Badge, Empty } from "./ui/shared";
export function Activity() {
  const [items, setItems] = useState<ActivityType[]>();
  const [error, setError] = useState("");
  useEffect(() => {
    api<ActivityType[]>("activity")
      .then(setItems)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            THE SMALL CHANGES THAT KEEP THINGS MOVING.
          </div>
          <h1>Activity history</h1>
          <p>Your household’s memory, one update at a time.</p>
        </div>
        <History size={28} />
      </div>
      <ErrorBox message={error} />
      <section className="card">
        {!items ? (
          <Loading />
        ) : !items.length ? (
          <Empty>No activity yet.</Empty>
        ) : (
          items.map((a) => (
            <div className="history-row" key={a.id}>
              <span className="timeline-dot" />
              <div className="grow">
                <Badge tone="neutral">{a.type.replaceAll("_", " ")}</Badge>
                <p>{a.description}</p>
                <small>
                  {new Date(a.createdAt).toLocaleString("en-IN")} · Entity{" "}
                  {a.entityId}
                </small>
              </div>
              <span className="version">v{a.stateVersion}</span>
            </div>
          ))
        )}
      </section>
      <p className="page-note">
        Showing the latest 200 events. Each saved change advances the household
        state version.
      </p>
    </>
  );
}
