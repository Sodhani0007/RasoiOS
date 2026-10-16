import { CookPortal } from "@/components/portals/cook";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CookPortal view="meal" id={id} />;
}
