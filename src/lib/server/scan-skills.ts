import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import { listLinkedDirectories } from "@/lib/server/powershell";
import {
  fileExists,
  findManagedRoots,
  normalizePath,
  type ManagedRoot,
} from "@/lib/server/shared";
import type { ResourceRecord, RootRecord } from "@/lib/types";

export async function scanSkills() {
  const roots = await findManagedRoots("skills");
  const resources: ResourceRecord[] = [];
  const rootRecords: RootRecord[] = [];

  for (const root of roots) {
    const entries = await collectSkillEntries(root);
    resources.push(...entries);
    rootRecords.push({
      id: `skill-root:${normalizePath(root.resourcesPath).toLowerCase()}`,
      kind: "skill",
      agentKey: root.agentKey,
      agentName: root.agentName,
      label: root.agentName,
      path: root.resourcesPath,
      resourceCount: entries.length,
      brokenCount: entries.filter((entry) => entry.status === "broken").length,
    });
  }

  return { resources, roots: rootRecords };
}

async function collectSkillEntries(root: ManagedRoot): Promise<ResourceRecord[]> {
  const entries = await listLinkedDirectories(root.resourcesPath);
  const resources: ResourceRecord[] = [];

  for (const entry of entries) {
    const relativePath = entry.name;
    const fullPath = entry.fullName;

    if (entry.linkType) {
      const targetPath = entry.target[0] ?? null;
      const valid = targetPath ? await fileExists(path.join(targetPath, "SKILL.md")) : false;
      resources.push({
        id: `skill:${normalizePath(fullPath).toLowerCase()}`,
        kind: "skill",
        status: valid ? "linked" : "broken",
        name: relativePath,
        path: fullPath,
        rootPath: root.resourcesPath,
        rootLabel: root.agentName,
        agentKey: root.agentKey,
        agentName: root.agentName,
        relativePath,
        targetPath,
        linkType: entry.linkType,
        detail: valid
          ? "目录联接到共享 skill 源"
          : "链接目标不存在或缺少 SKILL.md",
        tags: [root.agentKey, root.agentName, "skills"],
      });
      continue;
    }

    if (await fileExists(path.join(fullPath, "SKILL.md"))) {
      resources.push(makeSourceSkill(root, fullPath, relativePath));
      continue;
    }

    resources.push(...(await scanNestedSkillDirectory(root, fullPath)));
  }

  return resources;
}

async function scanNestedSkillDirectory(root: ManagedRoot, currentPath: string): Promise<ResourceRecord[]> {
  const resources: ResourceRecord[] = [];
  const children = await fs.readdir(currentPath, { withFileTypes: true });

  for (const child of children) {
    if (!child.isDirectory()) {
      continue;
    }

    const childPath = path.join(currentPath, child.name);
    const relativePath = normalizePath(path.relative(root.resourcesPath, childPath));

    if (await fileExists(path.join(childPath, "SKILL.md"))) {
      resources.push(makeSourceSkill(root, childPath, relativePath));
      continue;
    }

    resources.push(...(await scanNestedSkillDirectory(root, childPath)));
  }

  return resources;
}

function makeSourceSkill(root: ManagedRoot, fullPath: string, relativePath: string): ResourceRecord {
  return {
    id: `skill:${normalizePath(fullPath).toLowerCase()}`,
    kind: "skill",
    status: "source",
    name: relativePath.split("/").at(-1) ?? relativePath,
    path: fullPath,
    rootPath: root.resourcesPath,
    rootLabel: root.agentName,
    agentKey: root.agentKey,
    agentName: root.agentName,
    relativePath,
    targetPath: null,
    linkType: null,
    detail: "本地 source 目录",
    tags: [root.agentKey, root.agentName, "skills"],
  };
}

