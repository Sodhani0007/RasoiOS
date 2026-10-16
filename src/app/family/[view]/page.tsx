import { AdminRequests, AdminSettings } from "@/components/portals/admin";
import { notFound } from "next/navigation";
import { FamilyPortal } from "@/components/portals/family";
export default async function Page({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  const { view } = await params;
  if (view === "requests") return <AdminRequests />;
  if (view === "settings") return <AdminSettings />;
  if (
    ![
      "dashboard",
      "my-meals",
      "choose-meal",
      "my-preferences",
      "recipes",
    ].includes(view)
  )
    notFound();
  return <FamilyPortal view={view} />;
}
