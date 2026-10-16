import { afterEach, expect, it, vi } from "vitest";
import { api } from "../src/components/ui/shared";
afterEach(() => vi.unstubAllGlobals());
it("submits a family choice for this tab's profile even when another tab selects a different household/member", async () => {
  vi.stubGlobal("window", {});
  const tab = new Map([
    ["rasoi-household", "family-a"],
    ["rasoi-member", "mother"],
  ]);
  const otherTab = new Map([
    ["rasoi-household", "family-b"],
    ["rasoi-member", "father"],
  ]);
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => tab.get(key) ?? null,
  });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => otherTab.get(key) ?? null,
  });
  const fetcher = vi.fn(
    async () =>
      new Response(JSON.stringify({ data: { id: "saved" }, error: null })),
  );
  vi.stubGlobal("fetch", fetcher);
  const choice = { requestedDishName: "Roti", servings: 1.25 };
  await api("family/meal-requests", "POST", choice);
  const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  const headers = new Headers(init.headers);
  expect(headers.get("x-rasoi-household")).toBe("family-a");
  expect(headers.get("x-rasoi-member")).toBe("mother");
  expect(JSON.parse(String(init.body))).toEqual(choice);
});
it("keeps cook operations independent of the selected family profile", async () => {
  vi.stubGlobal("window", {});
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) =>
      key === "rasoi-household" ? "family-a" : "mother",
  });
  const fetcher = vi.fn(
    async () =>
      new Response(JSON.stringify({ data: { id: "report" }, error: null })),
  );
  vi.stubGlobal("fetch", fetcher);
  await api("cook/reports", "POST", {
    scheduleId: "s",
    type: "UNAVAILABLE_INGREDIENT",
    message: "Paneer is unavailable",
  });
  const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(new Headers(init.headers).get("x-rasoi-household")).toBe("family-a");
  expect(new Headers(init.headers).has("x-rasoi-member")).toBe(false);
});
