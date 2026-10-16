import { AsyncLocalStorage } from "node:async_hooks";

// These are freely chosen UI selections, never authenticated identities.
export type HouseholdSelection = { householdId: string; memberId?: string };
export const householdContext = new AsyncLocalStorage<HouseholdSelection>();
export const householdId = () =>
  householdContext.getStore()?.householdId ?? "demo-household";
export const selectedMemberId = () => householdContext.getStore()?.memberId;
export const draftOwner = () =>
  selectedMemberId() ? `profile:${selectedMemberId()}` : "household";
