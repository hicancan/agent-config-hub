import "server-only";

import { getUserHome } from "@/lib/server/shared";
import { scanMcp } from "@/lib/server/scan-mcp";
import { scanRules } from "@/lib/server/scan-rules";
import { scanSkills } from "@/lib/server/scan-skills";
import type { KindSummary, WorkspaceSnapshot } from "@/lib/types";

export async function getWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
  const [skills, rules, mcp] = await Promise.all([scanSkills(), scanRules(), scanMcp()]);
  const skillRoots = skills.roots.filter((item) => item.resourceCount > 0);
  const ruleRoots = rules.roots.filter((item) => item.resourceCount > 0);
  const mcpRoots = mcp.roots.filter((item) => item.resourceCount > 0);

  const roots = [...skillRoots, ...ruleRoots, ...mcpRoots].sort((left, right) => {
    const kindOrder = compareKind(left.kind, right.kind);
    return kindOrder === 0 ? left.label.localeCompare(right.label) : kindOrder;
  });

  const resources = [...skills.resources, ...rules.resources, ...mcp.resources].sort((left, right) => {
    const kindOrder = compareKind(left.kind, right.kind);
    if (kindOrder !== 0) {
      return kindOrder;
    }

    const dotBias = Number(left.name.startsWith(".")) - Number(right.name.startsWith("."));
    if (dotBias !== 0) {
      return dotBias;
    }

    return left.name.localeCompare(right.name);
  });

  const summaries: KindSummary[] = [
    createSummary("skill", skills.resources, skillRoots.length),
    createSummary("rule", rules.resources, ruleRoots.length),
    createSummary("mcp", mcp.resources, mcpRoots.length),
  ];

  return {
    generatedAt: new Date().toISOString(),
    userHome: getUserHome(),
    roots,
    resources,
    summaries,
  };
}

function createSummary(
  kind: KindSummary["kind"],
  resources: WorkspaceSnapshot["resources"],
  rootCount: number,
): KindSummary {
  return {
    kind,
    count: resources.length,
    brokenCount: resources.filter((item) => item.status === "broken").length,
    rootCount,
  };
}

function compareKind(left: KindSummary["kind"], right: KindSummary["kind"]) {
  const order: Record<KindSummary["kind"], number> = {
    skill: 0,
    rule: 1,
    mcp: 2,
  };

  return order[left] - order[right];
}
