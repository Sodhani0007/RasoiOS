import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { householdId, selectedMemberId } from "../household-context";
import {
  ApiError,
  log,
  recipeInclude,
  recipeScope,
  saveMember,
  getMember,
} from "../db/service";
import { dateOnly, mealTypes } from "../validation/planning";
import { verifyRecipe } from "../dietary/verifier";
import { scaleRecipe } from "../recipes/scaler";
import { aggregateRequirements } from "../groceries/aggregator";
import { compareInventory } from "../inventory/availability";
import { resolveFromRecipes } from "../recipes/resolver";
import { normalizeDish, normalizeIngredient } from "../recipes/aliases";
import { fitsMealCategory } from "../recipes/category";
export const requestSchema = z
  .object({
    mealDate: dateOnly,
    mealType: z.enum(mealTypes),
    preferredTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    attendance: z.enum(["HOME", "SKIP", "OUTSIDE"]).default("HOME"),
    requestedDishName: z.string().trim().max(120).default(""),
    recipeId: z.string().max(128).nullable().optional(),
    servings: z.number().positive().max(20),
    notes: z.string().trim().max(1000).default(""),
    status: z.enum(["DRAFT", "SUBMITTED"]).default("SUBMITTED"),
  })
  .strict()
  .refine(
    (v) => v.attendance !== "HOME" || v.requestedDishName.length > 1,
    "Enter the dish you want to eat",
  );
const memberInclude = { dietaryRules: true, fastingRule: true } as const;
const json = (value: unknown) => JSON.parse(JSON.stringify(value));
async function familySelection() {
  const memberId = selectedMemberId();
  if (!memberId)
    throw new ApiError(422, "Select a household member profile first");
  const member = await db.householdMember.findFirst({
    where: { id: memberId, householdId: householdId(), active: true },
  });
  if (!member)
    throw new ApiError(422, "Select an active profile in this household");
  return { memberId, id: `family:${memberId}` };
}
async function invalidateSchedules(
  tx: Prisma.TransactionClient,
  meal: { mealDate: string; mealType: string },
  reason: string,
) {
  const changed = await tx.mealSchedule.updateMany({
    where: {
      householdId: householdId(),
      mealDate: meal.mealDate,
      mealType: meal.mealType,
      status: "APPROVED",
    },
    data: { status: "WITHDRAWN" },
  });
  if (changed.count) {
    const requests = await tx.mealRequest.findMany({
      where: {
        householdId: householdId(),
        mealDate: meal.mealDate,
        mealType: meal.mealType,
        status: "APPROVED",
      },
    });
    for (const r of requests) {
      await tx.mealRequest.update({
        where: { id: r.id },
        data: {
          status: "UNDER_REVIEW",
          reviewReason: reason,
          revision: { increment: 1 },
        },
      });
      await tx.mealRequestStatusHistory.create({
        data: {
          requestId: r.id,
          status: "UNDER_REVIEW",
          reason,
          actorId: "family:review",
        },
      });
      // Schedule withdrawal changes review state, not the dish being suggested.
      await tx.cookSuggestion.updateMany({
        where: {
          requestId: r.id,
          status: "PENDING",
          requestRevision: r.revision,
        },
        data: { requestRevision: { increment: 1 } },
      });
    }
  }
}
async function requestedRecipe(
  tx: Prisma.TransactionClient,
  name: string,
  id?: string | null,
) {
  if (id)
    return tx.recipe.findFirst({
      where: { id, ...recipeScope() },
      include: recipeInclude,
    });
  const key = normalizeDish(name);
  const candidates = await tx.recipe.findMany({
    where: {
      AND: [
        recipeScope(),
        {
          OR: [
            { name: { contains: name } },
            { id: key },
            { aliases: { some: { name: key } } },
            { generation: { requestedDish: key } },
            {
              custom: {
                originalRecipe: {
                  OR: [
                    { name: { contains: name } },
                    { id: key },
                    { aliases: { some: { name: key } } },
                  ],
                },
              },
            },
          ],
        },
      ],
    },
    include: recipeInclude,
    take: 100,
  });
  return resolveFromRecipes(name, candidates);
}
export function todayInTimezone(timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export async function personalProfile() {
  const user = await familySelection();
  if (!user.memberId) throw new ApiError(403, "No linked member profile");
  return getMember(user.memberId);
}
export async function updatePersonalProfile(input: unknown) {
  const user = await familySelection();
  const v = z
    .object({
      dietaryPreference: z.string().optional(),
      allergies: z.array(z.string()).optional(),
      dislikes: z.array(z.string()).optional(),
      preferredLanguage: z.string().optional(),
      fasting: z.boolean().optional(),
      allowEggs: z.boolean().optional(),
      excludedIngredients: z.array(z.string()).optional(),
      excludedCategories: z.array(z.string()).optional(),
      fastingRule: z.unknown().optional(),
    })
    .strict()
    .parse(input);
  return saveMember(v, user.memberId!);
}
export async function familyMeals(date?: string) {
  const user = await familySelection();
  const household = await db.household.findUniqueOrThrow({
    where: { id: householdId() },
  });
  const selectedDate = date ?? todayInTimezone(household.timezone);
  const requests = await db.mealRequest.findMany({
    where: {
      householdId: householdId(),
      memberId: user.memberId!,
      mealDate: selectedDate,
    },
    orderBy: { preferredTime: "asc" },
  });
  const schedules = await db.mealSchedule.findMany({
    where: {
      householdId: householdId(),
      mealDate: selectedDate,
      status: "APPROVED",
    },
    include: { dishes: true },
  });
  // Family responses contain only this member's assigned portions, never other profiles.
  const assignments = schedules.flatMap((s) =>
    s.dishes.flatMap((d) => {
      const participants = d.participants as {
        memberId: string;
        servings: number;
        preferredTime: string;
      }[];
      return participants
        .filter((p) => p.memberId === user.memberId)
        .map((own) => ({
          scheduleId: s.id,
          mealDate: s.mealDate,
          mealType: s.mealType,
          timezone: s.timezone,
          recipe: {
            name: (
              d.recipeSnapshot as unknown as ScheduleSnapshot["dishes"][number]
            ).name,
            instructions: (
              d.recipeSnapshot as unknown as ScheduleSnapshot["dishes"][number]
            ).instructions,
          },
          servings: own.servings,
          preferredTime: own.preferredTime,
          preparationStatus: d.preparationStatus,
        }));
    }),
  );
  return {
    timezone: household.timezone,
    today: todayInTimezone(household.timezone),
    requests: await Promise.all(
      requests.map(async (r) => ({
        ...r,
        assessment: await inspectRequest(db, r),
      })),
    ),
    assignments,
  };
}
export async function saveRequest(input: unknown, id?: string) {
  const user = await familySelection();
  const v = requestSchema.parse(input);
  return db.$transaction((tx) => writeRequest(tx, user, v, id));
}
export async function saveMealSelection(input: unknown) {
  const user = await familySelection();
  const v = z
    .object({
      mealDate: dateOnly,
      mealType: z.enum(mealTypes),
      preferredTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      notes: z.string().trim().max(1000).default(""),
      status: z.enum(["DRAFT", "SUBMITTED"]).default("SUBMITTED"),
      items: z
        .array(
          z
            .object({
              requestedDishName: z.string().trim().min(2).max(120),
              recipeId: z.string().max(128).nullable(),
              servings: z.number().positive().max(20),
            })
            .strict(),
        )
        .min(1)
        .max(12),
    })
    .strict()
    .parse(input);
  const keys = v.items.map(
    (i) => i.recipeId || normalizeDish(i.requestedDishName),
  );
  if (new Set(keys).size !== keys.length)
    throw new ApiError(
      422,
      "This meal contains the same dish twice; adjust its portions instead.",
    );
  return db.$transaction(
    async (tx) => {
      const saved = [];
      for (const item of v.items) {
        const duplicate = await tx.mealRequest.findFirst({
          where: {
            householdId: householdId(),
            memberId: user.memberId,
            mealDate: v.mealDate,
            mealType: v.mealType,
            status: { notIn: ["CANCELLED", "REJECTED"] },
            OR: [
              { requestedDishName: item.requestedDishName },
              ...(item.recipeId ? [{ recipeId: item.recipeId }] : []),
            ],
          },
        });
        if (duplicate)
          throw new ApiError(
            409,
            item.requestedDishName +
              " is already selected for this meal. Edit its portions instead.",
          );
        saved.push(
          await writeRequest(
            tx,
            user,
            requestSchema.parse({
              ...item,
              mealDate: v.mealDate,
              mealType: v.mealType,
              preferredTime: v.preferredTime,
              notes: v.notes,
              status: v.status,
            }),
          ),
        );
      }
      return { requests: saved };
    },
    { timeout: 30000 },
  );
}
async function writeRequest(
  tx: Prisma.TransactionClient,
  user: { id: string; memberId: string },
  v: z.infer<typeof requestSchema>,
  id?: string,
) {
  const old = id
    ? await tx.mealRequest.findFirst({
        where: { id, householdId: householdId(), memberId: user.memberId! },
      })
    : null;
  if (id && !old) throw new ApiError(404, "Meal request not found");
  const conflicting = await tx.mealRequest.findFirst({
    where: {
      householdId: householdId(),
      memberId: user.memberId,
      mealDate: v.mealDate,
      mealType: v.mealType,
      status: { notIn: ["CANCELLED", "REJECTED"] },
      ...(id ? { id: { not: id } } : {}),
      ...(v.attendance === "HOME" ? { attendance: { not: "HOME" } } : {}),
    },
  });
  if (conflicting)
    throw new ApiError(
      409,
      "Cancel other choices for this meal before marking it skipped or outside, or change the existing attendance choice.",
    );
  if (old) await invalidateSchedules(tx, old, "Family edited a meal choice");
  await invalidateSchedules(
    tx,
    { ...v },
    "Family added or moved a meal choice",
  );
  let recipeId: string | null = null;
  if (v.attendance === "HOME") {
    const selected = await requestedRecipe(tx, v.requestedDishName, v.recipeId);
    if (v.recipeId && !selected)
      throw new ApiError(404, "Recipe not found in this household");
    if (
      v.recipeId &&
      selected &&
      ![
        selected.name,
        ...selected.aliases.map((a) => a.name),
        selected.generation?.requestedDish ?? "",
      ].some(
        (name) => normalizeDish(name) === normalizeDish(v.requestedDishName),
      )
    )
      throw new ApiError(
        422,
        "The dish name does not match the selected recipe. Select the intended dish again.",
      );
    recipeId = selected?.id ?? null;
  }
  const data = { ...v, recipeId, reviewReason: "" };
  const request = old
    ? await tx.mealRequest.update({
        where: { id },
        data: { ...data, revision: { increment: 1 } },
      })
    : await tx.mealRequest.create({
        data: {
          ...data,
          householdId: householdId(),
          memberId: user.memberId!,
        },
      });
  await tx.mealRequestStatusHistory.create({
    data: {
      requestId: request.id,
      status: request.status,
      reason: old ? "Member edited request" : "Member submitted request",
      actorId: user.id,
    },
  });
  await log(
    tx,
    "MEAL_REQUEST_UPDATED",
    request.id,
    `${v.mealType} request for ${v.mealDate} updated.`,
  );
  return request;
}

export async function cancelRequest(id: string) {
  const user = await familySelection();
  return db.$transaction(async (tx) => {
    const request = await tx.mealRequest.findFirst({
      where: { id, householdId: householdId(), memberId: user.memberId! },
    });
    if (!request) throw new ApiError(404, "Meal request not found");
    await invalidateSchedules(tx, request, "Family cancelled a meal choice");
    const result = await tx.mealRequest.update({
      where: { id },
      data: { status: "CANCELLED", revision: { increment: 1 } },
    });
    await tx.mealRequestStatusHistory.create({
      data: {
        requestId: id,
        status: "CANCELLED",
        reason: "Cancelled by member",
        actorId: user.id,
      },
    });
    await log(
      tx,
      "MEAL_REQUEST_CANCELLED",
      id,
      "Member cancelled a meal request.",
    );
    return result;
  });
}
async function inspectRequest(
  tx: Prisma.TransactionClient,
  r: Awaited<ReturnType<typeof db.mealRequest.findMany>>[number],
) {
  if (r.attendance !== "HOME")
    return {
      recipe: null,
      verification: null,
      inventory: null,
      reason: "Not eating at home",
    };
  const member = await tx.householdMember.findFirst({
    where: { id: r.memberId, householdId: householdId(), active: true },
    include: memberInclude,
  });
  const recipe = await requestedRecipe(tx, r.requestedDishName, r.recipeId);
  if (!member || !recipe)
    return {
      recipe: null,
      verification: null,
      inventory: null,
      reason: !member
        ? "Member is inactive"
        : "Recipe not found locally. The member can generate and review an AI draft, or select a known recipe.",
    };
  const verification = verifyRecipe(recipe, [member], {
    date: r.mealDate,
    mealType: r.mealType,
  });
  const stock = await tx.inventoryItem.findMany({
    where: { householdId: householdId() },
  });
  const inventory = compareInventory(
    aggregateRequirements(scaleRecipe(recipe, r.servings)),
    stock,
    r.mealDate,
  );
  return {
    recipe,
    verification,
    inventory,
    reason:
      verification.status !== "VERIFIED"
        ? verification.explanation
        : inventory.status === "READY"
          ? "Ready for review"
          : "Review ingredient shortages and unknown quantities before approval",
  };
}
export async function adminRequests(date?: string) {
  return db.$transaction(
    async (tx) => {
      const requests = await tx.mealRequest.findMany({
        where: {
          householdId: householdId(),
          ...(date ? { mealDate: date } : {}),
        },
        include: {
          member: { select: { name: true } },
          history: { orderBy: { createdAt: "desc" } },
        },
        orderBy: [{ mealDate: "desc" }, { preferredTime: "asc" }],
        take: 200,
      });
      const results = [];
      for (const r of requests)
        results.push({ ...r, assessment: await inspectRequest(tx, r) });
      return results;
    },
    { timeout: 30000 },
  );
}
export async function reviewRequest(id: string, input: unknown) {
  const user = { id: "family:review" };
  const v = z
    .object({
      status: z.enum(["UNDER_REVIEW", "APPROVED", "NEEDS_CHANGE", "REJECTED"]),
      reason: z.string().trim().max(1000).default(""),
      acknowledgeShortages: z.boolean().default(false),
    })
    .strict()
    .parse(input);
  if (["NEEDS_CHANGE", "REJECTED"].includes(v.status) && !v.reason)
    throw new ApiError(422, "Explain why the request needs to change");
  return db.$transaction(
    async (tx) => {
      const r = await tx.mealRequest.findFirst({
        where: { id, householdId: householdId() },
      });
      if (!r) throw new ApiError(404, "Request not found");
      if (["DRAFT", "CANCELLED"].includes(r.status))
        throw new ApiError(409, "Only submitted requests can be reviewed");
      const schedules = await tx.mealSchedule.findMany({
        where: {
          householdId: householdId(),
          mealDate: r.mealDate,
          mealType: r.mealType,
          status: "APPROVED",
        },
      });
      if (schedules.length)
        throw new ApiError(
          409,
          "Withdraw the approved schedule before changing this request",
        );
      const a = await inspectRequest(tx, r);
      if (v.status === "APPROVED" && r.attendance === "HOME") {
        if (a.verification?.status !== "VERIFIED")
          throw new ApiError(422, "Cannot approve: " + a.reason);
        if (a.inventory?.status !== "READY" && !v.acknowledgeShortages)
          throw new ApiError(
            422,
            "Acknowledge the ingredient requirements before approving",
          );
      }
      const result = await tx.mealRequest.update({
        where: { id },
        data: {
          status: v.status,
          reviewReason: v.reason,
          revision: { increment: 1 },
        },
      });
      await tx.mealRequestStatusHistory.create({
        data: {
          requestId: id,
          status: v.status,
          reason: v.reason,
          actorId: user.id,
        },
      });
      await log(
        tx,
        "MEAL_REQUEST_REVIEWED",
        id,
        `Request ${v.status.toLowerCase()}.`,
      );
      return result;
    },
    { timeout: 30000 },
  );
}
const scheduleSchema = z
  .object({
    mealDate: dateOnly,
    mealType: z.enum(mealTypes),
    maxMinutes: z.number().int().min(1).max(1440).default(120),
  })
  .strict();
async function coordinate(
  tx: Prisma.TransactionClient,
  v: z.infer<typeof scheduleSchema>,
) {
  const household = await tx.household.findUniqueOrThrow({
    where: { id: householdId() },
  });
  const requests = await tx.mealRequest.findMany({
    where: {
      householdId: householdId(),
      mealDate: v.mealDate,
      mealType: v.mealType,
      status: { in: ["SUBMITTED", "UNDER_REVIEW", "APPROVED"] },
    },
    include: { member: { include: memberInclude } },
    orderBy: [{ preferredTime: "asc" }, { id: "asc" }],
  });
  const dishes = new Map<
    string,
    {
      recipe: NonNullable<Awaited<ReturnType<typeof inspectRequest>>["recipe"]>;
      servings: number;
      participants: {
        memberId: string;
        name: string;
        servings: number;
        preferredTime: string;
        preparationRules: string[];
      }[];
    }
  >();
  const issues: string[] = [];
  for (const r of requests) {
    if (r.attendance !== "HOME") continue;
    const a = await inspectRequest(tx, r);
    if (!a.recipe || a.verification?.status !== "VERIFIED") {
      issues.push(
        `${r.member.name}: ${a.reason} ${a.verification?.violations.map((x) => x.message).join("; ") ?? ""} ${a.verification?.clarifications.join("; ") ?? ""}`,
      );
      continue;
    }
    const d = dishes.get(a.recipe.id) ?? {
      recipe: a.recipe,
      servings: 0,
      participants: [],
    };
    d.servings += r.servings;
    d.participants.push({
      memberId: r.memberId,
      name: r.member.name,
      servings: r.servings,
      preferredTime: r.preferredTime,
      preparationRules: [
        r.member.dietaryPreference,
        ...(r.member.allergies as string[]).map(
          (a) => `Allergy: ${a}; check labels and prevent cross-contact`,
        ),
        ...r.member.dietaryRules.map((rule) => `${rule.action}: ${rule.value}`),
        ...(r.member.fasting
          ? ["Fasting: use only the verified recipe ingredients"]
          : []),
      ],
    });
    dishes.set(a.recipe.id, d);
  }
  const list = [...dishes.values()];
  const workload = list.reduce(
    (sum, d) => sum + d.recipe.prepMinutes + d.recipe.cookMinutes,
    0,
  );
  if (workload > v.maxMinutes)
    issues.push(
      `Sequential workload ${workload} minutes exceeds the ${v.maxMinutes}-minute cooking window.`,
    );
  for (const d of list)
    if (
      d.recipe.importRecord &&
      (d.recipe.importRecord.warnings as string[]).some((w) =>
        /servings|time/i.test(w),
      )
    )
      issues.push(
        `${d.recipe.name}: confirm source servings and timing in a household copy.`,
      );
  const inventory = compareInventory(
    aggregateRequirements(
      list.flatMap((d) => scaleRecipe(d.recipe, d.servings)),
    ),
    await tx.inventoryItem.findMany({ where: { householdId: householdId() } }),
    v.mealDate,
  );
  let remaining = workload;
  const earliest =
    requests
      .filter((r) => r.attendance === "HOME")
      .map((r) => r.preferredTime)
      .sort()[0] ?? "12:00";
  const target = Number(earliest.slice(0, 2)) * 60 + Number(earliest.slice(3));
  const schedule = list.map((d) => {
    const start = target - remaining;
    remaining -= d.recipe.prepMinutes + d.recipe.cookMinutes;
    return {
      recipeId: d.recipe.id,
      name: d.recipe.name,
      servings: d.servings,
      participants: d.participants,
      startTime:
        start < 0
          ? "Previous day: review timing"
          : `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`,
      prepMinutes: d.recipe.prepMinutes,
      cookMinutes: d.recipe.cookMinutes,
      advancePreparation: d.recipe.advancePreparation,
      language:
        d.recipe.source === "LOCAL"
          ? "English"
          : (d.recipe.preferredLanguage ?? "Original language (unverified)"),
      instructions: d.recipe.instructions,
      ingredients: scaleRecipe(d.recipe, d.servings),
      source: d.recipe.source,
    };
  });
  return {
    timezone: household.timezone,
    stateVersion: household.version,
    requestVersions: requests.map((r) => ({ id: r.id, revision: r.revision })),
    workload,
    issues,
    inventory,
    dishes: schedule,
    notice:
      "Sequential estimate; preserve each serving time. Review holding/reheating between different serving times. Preparation completion never deducts stock.",
  };
}
export async function proposeSchedule(input: unknown) {
  const v = scheduleSchema.parse(input);
  return db.$transaction(
    async (tx) => {
      const snapshot = await coordinate(tx, v);
      if (!snapshot.requestVersions.length)
        throw new ApiError(422, "No submitted requests for this meal");
      return tx.mealSchedule.create({
        data: {
          householdId: householdId(),
          ...v,
          timezone: snapshot.timezone,
          stateVersion: snapshot.stateVersion,
          snapshot: json(snapshot),
          dishes: {
            create: snapshot.dishes.map((d) => ({
              recipeId: d.recipeId,
              servings: d.servings,
              participants: json(d.participants),
              recipeSnapshot: json(d),
            })),
          },
        },
        include: { dishes: true },
      });
    },
    { timeout: 30000 },
  );
}
export async function approveSchedule(id: string, input: unknown) {
  const user = { id: "family:review" };
  const v = z
    .object({
      confirmed: z.literal(true),
      acknowledgeShortages: z.boolean().default(false),
    })
    .strict()
    .parse(input);
  return db.$transaction(
    async (tx) => {
      const s = await tx.mealSchedule.findFirst({
        where: { id, householdId: householdId(), status: "PROPOSED" },
      });
      if (!s) throw new ApiError(404, "Proposed schedule not found");
      const live = await coordinate(tx, {
        mealDate: s.mealDate,
        mealType: z.enum(mealTypes).parse(s.mealType),
        maxMinutes: s.maxMinutes,
      });
      if (live.stateVersion !== s.stateVersion)
        throw new ApiError(
          409,
          "Household or requests changed. Generate a new proposal.",
        );
      if (live.issues.length) throw new ApiError(422, live.issues.join(" "));
      if (live.inventory.status !== "READY" && !v.acknowledgeShortages)
        throw new ApiError(
          422,
          "Acknowledge shortages and unknown stock before approving",
        );
      await tx.mealSchedule.updateMany({
        where: {
          householdId: householdId(),
          mealDate: s.mealDate,
          mealType: s.mealType,
          status: "APPROVED",
        },
        data: { status: "SUPERSEDED" },
      });
      for (const r of live.requestVersions) {
        await tx.mealRequest.update({
          where: { id: r.id },
          data: {
            status: "APPROVED",
            reviewReason: "Approved in household cooking schedule",
          },
        });
        await tx.mealRequestStatusHistory.create({
          data: {
            requestId: r.id,
            status: "APPROVED",
            reason: "Schedule approved",
            actorId: user.id,
          },
        });
      }
      const result = await tx.mealSchedule.update({
        where: { id },
        data: { status: "APPROVED", approvedAt: new Date() },
        include: { dishes: true },
      });
      await log(
        tx,
        "SCHEDULE_APPROVED",
        id,
        `Cooking schedule approved for ${s.mealDate} ${s.mealType}. No stock deducted.`,
      );
      return result;
    },
    { timeout: 30000 },
  );
}
export async function withdrawSchedule(id: string) {
  return db.$transaction(async (tx) => {
    const s = await tx.mealSchedule.findFirst({
      where: { id, householdId: householdId(), status: "APPROVED" },
    });
    if (!s) throw new ApiError(404, "Approved schedule not found");
    await tx.mealSchedule.update({
      where: { id },
      data: { status: "WITHDRAWN" },
    });
    await tx.mealRequest.updateMany({
      where: {
        householdId: householdId(),
        mealDate: s.mealDate,
        mealType: s.mealType,
        status: "APPROVED",
      },
      data: {
        status: "UNDER_REVIEW",
        reviewReason: "Schedule withdrawn for review",
      },
    });
    await log(
      tx,
      "SCHEDULE_WITHDRAWN",
      id,
      "Schedule withdrawn; cook assignments removed.",
    );
    return { id };
  });
}
export async function schedules(date?: string, id?: string, cook = false) {
  const h = await db.household.findUniqueOrThrow({
    where: { id: householdId() },
  });
  const rows = await db.mealSchedule.findMany({
    where: {
      householdId: householdId(),
      ...(id ? { id } : {}),
      ...(date ? { mealDate: date } : {}),
      ...(cook ? { status: "APPROVED" } : {}),
    },
    include: { dishes: true, reports: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  if (id && !rows.length)
    throw new ApiError(404, "Approved meal assignment not found");
  return {
    today: todayInTimezone(h.timezone),
    timezone: h.timezone,
    preferredLanguage: h.cookLanguage,
    schedules: rows.map((s) => ({
      ...s,
      needsRecheck:
        h.version > s.stateVersion + 1 ||
        s.reports.some((r) => r.type !== "COOKING_NOTE"),
    })),
  };
}
export type ScheduleSnapshot = Awaited<ReturnType<typeof coordinate>>;

// Cooking activity records facts; it does not change family choices or stock.
async function cookActivity(
  tx: Prisma.TransactionClient,
  type: string,
  entityId: string,
  description: string,
) {
  const h = await tx.household.findUniqueOrThrow({
    where: { id: householdId() },
  });
  await tx.activityLog.create({
    data: {
      householdId: h.id,
      stateVersion: h.version,
      type,
      entityId,
      description,
    },
  });
}
export async function completePreparation(id: string, input: unknown) {
  const v = z
    .object({
      status: z.enum(["PENDING", "PREPARING", "COOKING", "READY", "COMPLETED"]),
    })
    .strict()
    .parse(input);
  return db.$transaction(async (tx) => {
    const dish = await tx.mealScheduleDish.findFirst({
      where: {
        id,
        schedule: { householdId: householdId(), status: "APPROVED" },
      },
    });
    if (!dish) throw new ApiError(404, "Approved dish not found");
    const result = await tx.mealScheduleDish.update({
      where: { id },
      data: {
        preparationStatus: v.status,
        completedAt: v.status === "COMPLETED" ? new Date() : null,
      },
    });
    await cookActivity(
      tx,
      "COOK_PROGRESS",
      id,
      `Cooking progress: ${v.status}.`,
    );
    return result;
  });
}
const cookingMessage = {
  scheduleId: z.string().min(1).max(128),
  message: z.string().trim().min(3).max(2000),
};
async function createCookReport(v: {
  scheduleId: string;
  message: string;
  type: string;
}) {
  return db.$transaction(async (tx) => {
    if (
      !(await tx.mealSchedule.findFirst({
        where: {
          id: v.scheduleId,
          householdId: householdId(),
          status: "APPROVED",
        },
      }))
    )
      throw new ApiError(404, "Approved schedule not found");
    const report = await tx.cookReport.create({
      data: { ...v, householdId: householdId(), createdBy: "cook" },
    });
    await cookActivity(tx, `COOK_${v.type}`, report.id, v.message);
    return report;
  });
}
export async function reportCookingIssue(input: unknown) {
  return createCookReport(
    z
      .object({
        ...cookingMessage,
        type: z.enum(["UNAVAILABLE_INGREDIENT", "RECIPE_CORRECTION"]),
      })
      .strict()
      .parse(input),
  );
}
export async function addCookingNote(input: unknown) {
  return createCookReport({
    ...z.object(cookingMessage).strict().parse(input),
    type: "COOKING_NOTE",
  });
}
export async function cookRequests(date?: string) {
  const h = await db.household.findUniqueOrThrow({
    where: { id: householdId() },
  });
  const rows = await adminRequests(date ?? todayInTimezone(h.timezone));
  return rows
    .filter((r) => !["DRAFT", "CANCELLED", "REJECTED"].includes(r.status))
    .map((r) => ({
      id: r.id,
      member: r.member,
      mealDate: r.mealDate,
      mealType: r.mealType,
      preferredTime: r.preferredTime,
      servings: r.servings,
      requestedDishName: r.requestedDishName,
      status: r.status,
      attendance: r.attendance,
      notes: r.notes,
      assessment: r.assessment,
    }));
}
export async function suggestSubstitution(input: unknown) {
  const v = z
    .object({
      requestId: z.string().min(1).max(128),
      ingredientFrom: z.string().trim().min(1).max(120),
      ingredientTo: z.string().trim().min(1).max(120),
      message: z.string().trim().min(3).max(2000),
    })
    .strict()
    .parse(input);
  return db.$transaction(async (tx) => {
    const r = await tx.mealRequest.findFirst({
      where: {
        id: v.requestId,
        householdId: householdId(),
        attendance: "HOME",
        status: {
          in: ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "NEEDS_CHANGE"],
        },
      },
    });
    if (!r) throw new ApiError(404, "Active meal request not found");
    const suggestion = await tx.cookSuggestion.create({
      data: { ...v, householdId: householdId(), requestRevision: r.revision },
    });
    await cookActivity(
      tx,
      "COOK_SUBSTITUTION_SUGGESTED",
      suggestion.id,
      `${v.ingredientFrom} to ${v.ingredientTo}: ${v.message}`,
    );
    return suggestion;
  });
}
export async function familyCookUpdates(date?: string) {
  const user = await familySelection();
  const requests = await db.mealRequest.findMany({
    where: {
      householdId: householdId(),
      memberId: user.memberId,
      ...(date ? { mealDate: date } : {}),
    },
    select: { mealDate: true, mealType: true },
  });
  const [reports, suggestions] = await Promise.all([
    db.cookReport.findMany({
      where: { householdId: householdId(), schedule: { OR: requests } },
      include: { schedule: { select: { mealDate: true, mealType: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.cookSuggestion.findMany({
      where: {
        householdId: householdId(),
        request: {
          memberId: user.memberId,
          ...(date ? { mealDate: date } : {}),
        },
      },
      include: {
        request: {
          select: {
            requestedDishName: true,
            mealDate: true,
            mealType: true,
            servings: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  const recipeIds = [
    ...new Set(
      suggestions.flatMap((s) =>
        Array.isArray(s.proposedRecipeIds)
          ? s.proposedRecipeIds.filter(
              (id): id is string => typeof id === "string",
            )
          : [],
      ),
    ),
  ];
  const alternatives = await db.recipe.findMany({
    where: { AND: [recipeScope(), { id: { in: recipeIds } }] },
    select: { id: true, name: true },
  });
  return {
    reports,
    suggestions: suggestions.map((s) => ({
      ...s,
      alternatives: alternatives.filter(
        (r) =>
          Array.isArray(s.proposedRecipeIds) &&
          s.proposedRecipeIds.includes(r.id),
      ),
    })),
  };
}
export async function reviewSuggestion(id: string, input: unknown) {
  const user = await familySelection();
  const v = z
    .discriminatedUnion("action", [
      z
        .object({
          action: z.literal("REJECT"),
          confirmed: z.literal(true),
          note: z.string().trim().max(1000).default(""),
        })
        .strict(),
      z
        .object({
          action: z.literal("ACCEPT"),
          confirmed: z.literal(true),
          recipeId: z.string().min(1).max(128),
          note: z.string().trim().max(1000).default(""),
        })
        .strict(),
    ])
    .parse(input);
  return db.$transaction(async (tx) => {
    const suggestion = await tx.cookSuggestion.findFirst({
      where: {
        id,
        householdId: householdId(),
        request: { memberId: user.memberId },
      },
      include: { request: true },
    });
    if (!suggestion)
      throw new ApiError(404, "Suggestion not found for selected profile");
    if (suggestion.status !== "PENDING")
      throw new ApiError(409, "Suggestion already reviewed");
    const r = suggestion.request;
    if (v.action === "ACCEPT") {
      if (
        r.revision !== suggestion.requestRevision ||
        ["CANCELLED", "REJECTED", "DRAFT"].includes(r.status)
      )
        throw new ApiError(
          409,
          "The meal choice changed. Request a fresh suggestion or edit your meal directly.",
        );
      const recipe = await requestedRecipe(tx, "", v.recipeId);
      if (!recipe)
        throw new ApiError(404, "Reviewed replacement recipe not found");
      const member = await tx.householdMember.findUniqueOrThrow({
        where: { id: user.memberId },
        include: memberInclude,
      });
      const verification = verifyRecipe(recipe, [member], {
        date: r.mealDate,
        mealType: r.mealType,
      });
      if (verification.status !== "VERIFIED")
        throw new ApiError(
          422,
          "Replacement requires dietary review: " + verification.explanation,
        );
      if (recipe.id === r.recipeId)
        throw new ApiError(
          422,
          "Choose a reviewed replacement recipe or create a household copy with the substituted ingredients first",
        );
      if (suggestion.unavailableIngredientId) {
        if (
          recipe.ingredients.some(
            (i) =>
              normalizeIngredient(i.ingredientId) ===
              suggestion.unavailableIngredientId,
          )
        )
          throw new ApiError(
            422,
            "This replacement still needs the unavailable ingredient.",
          );
        const inventory = await tx.inventoryItem.findMany({
          where: { householdId: householdId() },
        });
        if (
          compareInventory(
            scaleRecipe(recipe, r.servings),
            inventory,
            r.mealDate,
          ).status !== "READY"
        )
          throw new ApiError(
            422,
            "Replacement ingredients are no longer confirmed available. Check stock or choose another dish.",
          );
        if (!fitsMealCategory(recipe.mealCategory, r.mealType))
          throw new ApiError(
            422,
            "Choose an alternative suitable for this meal type.",
          );
        const dislikes = Array.isArray(member.dislikes)
          ? member.dislikes
              .filter((s): s is string => typeof s === "string")
              .map(normalizeIngredient)
          : [];
        if (
          recipe.ingredients.some((i) =>
            dislikes.includes(normalizeIngredient(i.ingredientId)),
          )
        )
          throw new ApiError(
            422,
            "This replacement contains a disliked ingredient. Choose another dish or update your preferences first.",
          );
      }
      await invalidateSchedules(tx, r, "Family confirmed a replacement recipe");
      await tx.mealRequest.update({
        where: { id: r.id },
        data: {
          recipeId: recipe.id,
          requestedDishName: recipe.name,
          status: "SUBMITTED",
          reviewReason:
            "Family confirmed a replacement; review ingredients and schedule again",
          revision: { increment: 1 },
        },
      });
      await tx.mealRequestStatusHistory.create({
        data: {
          requestId: r.id,
          status: "SUBMITTED",
          reason: `Family accepted suggestion ${id}: ${v.note}`,
          actorId: user.id,
        },
      });
      await log(
        tx,
        "FAMILY_SUBSTITUTION_CONFIRMED",
        r.id,
        `Family selected ${recipe.name}; schedule requires fresh approval.`,
      );
    }
    const result = await tx.cookSuggestion.update({
      where: { id },
      data: {
        status: v.action === "ACCEPT" ? "ACCEPTED" : "REJECTED",
        familyNote: v.note,
        acceptedRecipeId: v.action === "ACCEPT" ? v.recipeId : null,
        reviewedAt: new Date(),
      },
    });
    if (v.action === "REJECT")
      await cookActivity(
        tx,
        "FAMILY_SUBSTITUTION_REJECTED",
        id,
        "Family declined the suggestion; meal choice unchanged.",
      );
    return result;
  });
}
