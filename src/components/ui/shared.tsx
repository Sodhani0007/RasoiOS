"use client";
import {
  useEffect,
  useRef,
  useId,
  cloneElement,
  isValidElement,
  type ReactElement,
} from "react";
import { X, LoaderCircle } from "lucide-react";
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      "x-rasoi-household":
        typeof window !== "undefined"
          ? sessionStorage.getItem("rasoi-household") || "demo-household"
          : "demo-household",
      // Freely selected profile; this header is not an authentication credential.
      ...(typeof window !== "undefined" &&
      sessionStorage.getItem("rasoi-member") &&
      [
        "family/profile",
        "family/meals",
        "family/meal-requests",
        "family/meal-selections",
        "family/cook-updates",
        "family/suggestions",
        "recipes/generate",
        "recipes/generated",
      ].some((prefix) => path.startsWith(prefix))
        ? { "x-rasoi-member": sessionStorage.getItem("rasoi-member")! }
        : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) {
    const fields = json.error?.details?.fieldErrors;
    throw new Error(
      json.error?.message +
        (fields
          ? " — " +
            Object.entries(fields)
              .map(([k, v]) => `${k}: ${(v as string[]).join(", ")}`)
              .join("; ")
          : ""),
    );
  }
  return json.data;
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="modal-head">
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={wide ? "field wide" : "field"}>
      <span>{label}</span>
      {isValidElement(children) && typeof children.type === "string"
        ? cloneElement(children as ReactElement<{ "aria-label"?: string }>, {
            "aria-label":
              (children.props as { "aria-label"?: string })["aria-label"] ||
              label,
          })
        : children}
    </label>
  );
}
export function Badge({
  children,
  tone = "green",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Loading() {
  return (
    <div className="empty">
      <LoaderCircle className="spin" /> Getting your kitchen ready…
    </div>
  );
}
export function ErrorBox({ message }: { message: string }) {
  return message ? (
    <div className="error" role="alert">
      {message}
    </div>
  ) : null;
}
export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}
export const split = (text: string) =>
  text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
export const asList = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(String) : [];
export const formatDate = (date: string) =>
  new Date(date).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
