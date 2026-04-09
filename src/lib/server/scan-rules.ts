import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import { findManagedRoots, normalizePath } from "@/lib/server/shared";
import type { ResourceRecord, RootRecord } from "@/lib/types";

export async function scanRules() {
  const roots = await findManagedRoots("rules");
  const resources: ResourceRecord[] = [];
  const rootRecords: RootRecord[] = [];

  for (const root of roots) {
    const entries = await collectRuleFiles(root.resourcesPath, root.resourcesPath, root.agentKey, root.agentName);
    resources.push(...entries);
    rootRecords.push({
      id: `rule-root:${normalizePath(root.resourcesPath).toLowerCase()}`,
      kind: "rule",
      agentKey: root.agentKey,
      agentName: root.agentName,
      label: root.agentName,
      path: root.resourcesPath,
      resourceCount: entries.length,
      brokenCount: 0,
    });
  }

  return { resources, roots: rootRecords };
}

async function collectRuleFiles(
  rootPath: string,
  currentPath: string,
  agentKey: string,
  agentName: string,
): Promise<ResourceRecord[]> {
  const resources: ResourceRecord[] = [];
  const children = await fs.readdir(currentPath, { withFileTypes: true });

  for (const child of children) {
    const childPath = path.join(currentPath, child.name);
    if (child.isDirectory()) {
      resources.push(...(await collectRuleFiles(rootPath, childPath, agentKey, agentName)));
      continue;
    }

    const relativePath = normalizePath(path.relative(rootPath, childPath));
    const extension = path.extname(child.name).replace(".", "") || "file";

    resources.push({
      id: `rule:${normalizePath(childPath).toLowerCase()}`,
      kind: "rule",
      status: "file",
      name: child.name,
      path: childPath,
      rootPath,
      rootLabel: agentName,
      agentKey,
      agentName,
      relativePath,
      detail: `规则文件 · ${extension}`,
      tags: [agentKey, agentName, "rules", extension],
    });
  }

  return resources;
}

