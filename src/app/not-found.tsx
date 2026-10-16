import Link from "next/link";
export default function NotFound() {
  return (
    <div className="empty">
      <h1>This shelf is empty.</h1>
      <p>The page you requested could not be found.</p>
      <Link href="/dashboard" className="button primary">
        Back to your kitchen
      </Link>
    </div>
  );
}
