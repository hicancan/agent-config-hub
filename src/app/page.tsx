import { Dashboard } from "@/components/dashboard";
import { getWorkspaceSnapshot } from "@/lib/server/snapshot";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const snapshot = await getWorkspaceSnapshot();
  return <Dashboard initialSnapshot={snapshot} />;
}

