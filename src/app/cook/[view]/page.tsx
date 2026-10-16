import { notFound } from "next/navigation";
import { CookPortal } from "@/components/portals/cook";
export default async function Page({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  const { view } = await params;
  if (!["dashboard", "today", "ingredients", "preparation"].includes(view))
    notFound();
  return <CookPortal view={view} />;
}
