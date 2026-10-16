import type {
  getHousehold,
  getMembers,
  getInventory,
  getRecipes,
  getActivity,
} from "../lib/db/service";
type Serialized<T> = T extends Date
  ? string
  : T extends Array<infer U>
    ? Serialized<U>[]
    : T extends object
      ? { [K in keyof T]: Serialized<T[K]> }
      : T;
export type Household = Serialized<Awaited<ReturnType<typeof getHousehold>>>;
export type Member = Serialized<Awaited<ReturnType<typeof getMembers>>>[number];
export type Inventory = Serialized<
  Awaited<ReturnType<typeof getInventory>>
>[number];
export type Recipe = Serialized<Awaited<ReturnType<typeof getRecipes>>>[number];
export type Activity = Serialized<
  Awaited<ReturnType<typeof getActivity>>
>[number];
export type Ingredient = { id: string; name: string; category: string };
