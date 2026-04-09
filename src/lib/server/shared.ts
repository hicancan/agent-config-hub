import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

export type ManagedRoot = {
  agentKey: string;
  agentName: string;
  rootPath: string;
  resourcesPath: string;
};

const AGENT_LABELS: Array<[suffix: string, label: string, key: string]> = [
  ["/.agents", "Shared (.agents)", "shared-agents"],
  ["/.claude", "Claude Code", "claude"],
  ["/.codex", "Codex", "codex"],
  ["/.cursor", "Cursor", "cursor"],
  ["/.gemini", "Gemini CLI", "gemini"],
  ["/.copilot", "GitHub Copilot", "copilot"],
  ["/.trae", "Trae", "trae"],
  ["/.config/opencode", "OpenCode", "opencode"],
  ["/.config/agents", "Generic Agents", "generic-agents"],
  ["/.codeium/windsurf", "Windsurf", "windsurf"],
  ["/.pi/agent", "Pi Agent", "pi-agent"],
  ["/.docker", "Docker", "docker"],
  ["/.cherrystudio", "Cherry Studio", "cherrystudio"],
];

export function getUserHome() {
  const value = process.env.USERPROFILE ?? process.env.HOME;
  if (!value) {
    throw new Error("无法解析当前用户目录");
  }
  return value;
}

export function normalizePath(input: string) {
  return input.replace(/\\/g, "/");
}

export function isWithinPath(basePath: string, targetPath: string) {
  const normalizedBase = normalizePath(path.resolve(basePath)).toLowerCase();
  const normalizedTarget = normalizePath(path.resolve(targetPath)).toLowerCase();
  return normalizedTarget === normalizedBase || normalizedTarget.startsWith(`${normalizedBase}/`);
}

export function createAgentIdentity(rootPath: string) {
  const normalized = normalizePath(rootPath).toLowerCase();
  const match = AGENT_LABELS.find(([suffix]) => normalized.endsWith(suffix));

  if (match) {
    return { agentName: match[1], agentKey: match[2] };
  }

  const base = path.basename(rootPath);
  return {
    agentName: base || "Unknown Root",
    agentKey: base.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "unknown-root",
  };
}

export async function findManagedRoots(dirName: "skills" | "rules"): Promise<ManagedRoot[]> {
  const home = getUserHome();
  const discovered = new Map<string, ManagedRoot>();

  const push = async (rootPath: string) => {
    const resourcesPath = path.join(rootPath, dirName);
    if (!(await isDirectory(resourcesPath))) {
      return;
    }

    const key = normalizePath(resourcesPath).toLowerCase();
    if (discovered.has(key)) {
      return;
    }

    const { agentKey, agentName } = createAgentIdentity(rootPath);
    discovered.set(key, { agentKey, agentName, rootPath, resourcesPath });
  };

  await push(path.join(home, ".agents"));

  const topLevel = await safeReadDir(home);
  for (const entry of topLevel) {
    if (!entry.isDirectory()) {
      continue;
    }
    await push(path.join(home, entry.name));
  }

  const configRoot = path.join(home, ".config");
  const configDirs = await safeReadDir(configRoot);
  for (const entry of configDirs) {
    if (!entry.isDirectory()) {
      continue;
    }
    await push(path.join(configRoot, entry.name));
  }

  return [...discovered.values()].sort((left, right) =>
    left.agentName.localeCompare(right.agentName),
  );
}

export async function safeReadDir(target: string) {
  try {
    return await fs.readdir(target, { withFileTypes: true });
  } catch {
    return [];
  }
}

export async function isDirectory(target: string) {
  try {
    const stat = await fs.stat(target);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

export async function fileExists(target: string) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export function uniqueBy<T>(items: T[], keySelector: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keySelector(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
