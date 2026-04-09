import { ConfigExplorer } from "@/components/config-explorer";
import { getWorkspaceSnapshot } from "@/lib/server/snapshot";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const snapshot = await getWorkspaceSnapshot();
  return <ConfigExplorer initialSnapshot={snapshot} />;
}
