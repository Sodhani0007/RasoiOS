import { z } from "zod";
import * as coordination from "./coordination/service";
import { reportShortage, shortageReports } from "./coordination/shortages";
import { interpretCommand } from "./ai/service";
import { db } from "./db";
import { householdId } from "./household-context";
import { searchRecipes } from "./recipes/resolver";
import { importDataset, importInput, parseDataset } from "./recipes/importer";
import { dateOnly } from "./validation/planning";
import { ApiError } from "./db/service";
export async function phase25Route(
  req: Request,
  path: string[],
  body: () => Promise<unknown>,
): Promise<{ data: unknown; status?: number } | null> {
  const key = path.join("/"),
    method = req.method;
  const date = () => {
    const d = new URL(req.url).searchParams.get("date");
    return d ? dateOnly.parse(d) : undefined;
  };
  if (key === "recipes/search" && method === "GET")
    return {
      data: await searchRecipes(
        z
          .string()
          .trim()
          .max(120)
          .parse(new URL(req.url).searchParams.get("q") ?? ""),
        z.coerce
          .number()
          .int()
          .min(1)
          .max(60)
          .parse(new URL(req.url).searchParams.get("limit") ?? 60),
      ),
    };
  if (key === "recipes/import" && method === "POST") {
    const v = importInput.parse(await body());
    return { data: await importDataset(parseDataset(v.csv)) };
  }
  if (key === "family/profile") {
    if (method === "GET") return { data: await coordination.personalProfile() };
    if (method === "PATCH")
      return { data: await coordination.updatePersonalProfile(await body()) };
  }
  if (key === "family/meals" && method === "GET")
    return { data: await coordination.familyMeals(date()) };
  if (key === "family/meal-selections" && method === "POST")
    return {
      data: await coordination.saveMealSelection(await body()),
      status: 201,
    };
  if (path[0] === "family" && path[1] === "meal-requests" && path.length <= 3) {
    if (method === "POST" && !path[2])
      return {
        data: await coordination.saveRequest(await body()),
        status: 201,
      };
    if (method === "PATCH" && path[2])
      return { data: await coordination.saveRequest(await body(), path[2]) };
    if (method === "DELETE" && path[2])
      return { data: await coordination.cancelRequest(path[2]) };
  }
  if (key === "admin/meal-requests" && method === "GET")
    return { data: await coordination.adminRequests(date()) };
  if (
    path[0] === "admin" &&
    path[1] === "meal-requests" &&
    path[3] === "status" &&
    method === "PATCH"
  )
    return { data: await coordination.reviewRequest(path[2], await body()) };
  if (key === "admin/meal-schedules") {
    if (method === "POST")
      return {
        data: await coordination.proposeSchedule(await body()),
        status: 201,
      };
    if (method === "GET") return { data: await coordination.schedules(date()) };
  }
  if (path[0] === "admin" && path[1] === "meal-schedules" && path[2]) {
    if (path[3] === "approve" && method === "POST")
      return {
        data: await coordination.approveSchedule(path[2], await body()),
      };
    if (path[3] === "withdraw" && method === "POST")
      return { data: await coordination.withdrawSchedule(path[2]) };
  }
  if (key === "admin/settings") {
    if (method === "GET")
      return {
        data: await db.household.findUniqueOrThrow({
          where: { id: householdId() },
          select: { name: true, timezone: true },
        }),
      };
    if (method === "PATCH") {
      const v = z
        .object({
          name: z.string().trim().min(1).max(100),
          timezone: z.string().refine((s) => {
            try {
              new Intl.DateTimeFormat("en", { timeZone: s });
              return true;
            } catch {
              return false;
            }
          }, "Use an IANA timezone"),
        })
        .strict()
        .parse(await body());
      if (
        await db.mealRequest.count({ where: { householdId: householdId() } })
      ) {
        const h = await db.household.findUniqueOrThrow({
          where: { id: householdId() },
        });
        if (h.timezone !== v.timezone)
          throw new ApiError(
            409,
            "Timezone cannot change after requests exist; this prevents reinterpreting saved serving times.",
          );
      }
      return {
        data: await db.household.update({
          where: { id: householdId() },
          data: { ...v, version: { increment: 1 } },
        }),
      };
    }
  }
  if (key === "family/cook-updates" && method === "GET")
    return { data: await coordination.familyCookUpdates(date()) };
  if (
    path[0] === "family" &&
    path[1] === "suggestions" &&
    path.length === 4 &&
    path[3] === "review" &&
    method === "POST"
  )
    return { data: await coordination.reviewSuggestion(path[2], await body()) };
  if (path[0] === "cook") {
    if (key === "cook/shortages" && method === "POST")
      return { data: await reportShortage(await body()), status: 201 };
    if (key === "cook/shortages" && method === "GET")
      return { data: await shortageReports(date()) };
    if (key === "cook/interpret" && method === "POST") {
      const v = z
        .object({ command: z.string().trim().min(3).max(500) })
        .strict()
        .parse(await body());
      return { data: await interpretCommand(v.command) };
    }
    if (key === "cook/requests" && method === "GET")
      return { data: await coordination.cookRequests(date()) };
    if (key === "cook/substitutions" && method === "POST")
      return {
        data: await coordination.suggestSubstitution(await body()),
        status: 201,
      };
    if (key === "cook/notes" && method === "POST")
      return {
        data: await coordination.addCookingNote(await body()),
        status: 201,
      };
    if (method === "GET" && ["cook/today", "cook/schedule"].includes(key)) {
      const h = await db.household.findUniqueOrThrow({
        where: { id: householdId() },
      });
      return {
        data: await coordination.schedules(
          date() ??
            (key === "cook/today"
              ? coordination.todayInTimezone(h.timezone)
              : undefined),
          undefined,
          true,
        ),
      };
    }
    if (method === "GET" && path[1] === "meals" && path[2] && path.length === 3)
      return { data: await coordination.schedules(undefined, path[2], true) };
    if (
      method === "PATCH" &&
      path[1] === "preparation" &&
      path[2] &&
      path.length === 3
    )
      return {
        data: await coordination.completePreparation(path[2], await body()),
      };
    if (method === "POST" && key === "cook/reports")
      return {
        data: await coordination.reportCookingIssue(await body()),
        status: 201,
      };
    if (method === "PATCH" && key === "cook/preferences") {
      const v = z
        .object({ preferredLanguage: z.string().trim().min(1).max(60) })
        .strict()
        .parse(await body());
      return {
        data: await db.household.update({
          where: { id: householdId() },
          data: { cookLanguage: v.preferredLanguage },
          select: { cookLanguage: true },
        }),
      };
    }
  }
  return null;
}
