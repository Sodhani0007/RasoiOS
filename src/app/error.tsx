"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="empty">
      <h1>We couldn’t open your kitchen.</h1>
      <p>
        Please check that the database migration and seed have run, then try
        again.
      </p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
