import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  createAgentIdentity,
  fileExists,
  getUserHome,
  normalizePath,
  safeReadDir,
  uniqueBy,
} from "@/lib/server/shared";
import type { ResourceRecord, RootRecord } from "@/lib/types";

type McpConfigEntry = {
  name: string;
  detail: string;
  enabled?: boolean;
};

const JSON_CONFIG_CANDIDATES = [
  ".claude.json",
  path.join(".cursor", "mcp.json"),
  path.join(".gemini", "settings.json"),
  path.join(".config", "opencode", "opencode.json"),
];

const TOML_CONFIG_CANDIDATES = [path.join(".codex", "config.toml")];

export async function scanMcp() {
  const home = getUserHome();
  const resources: ResourceRecord[] = [];
  const roots: RootRecord[] = [];

  const directoryRoots = await discoverMcpDirectories(home);
  for (const directoryPath of directoryRoots) {
    const { agentKey, agentName } = createAgentIdentity(path.dirname(directoryPath));
    const entries = await scanMcpDirectory(directoryPath, agentKey, agentName);
    resources.push(...entries);
    roots.push({
      id: `mcp-dir:${normalizePath(directoryPath).toLowerCase()}`,
      kind: "mcp",
      agentKey,
      agentName,
      label: `${agentName} MCP`,
      path: directoryPath,
      resourceCount: entries.length,
      brokenCount: 0,
    });
  }

  for (const candidate of JSON_CONFIG_CANDIDATES) {
    const fullPath = path.join(home, candidate);
    if (!(await fileExists(fullPath))) {
      continue;
    }
    const parsed = await parseJsonMcpConfig(fullPath);
    const { agentKey, agentName } = createMcpConfigIdentity(home, fullPath);
    const entries = parsed.map((item) =>
      makeMcpConfigRecord({
        item,
        fullPath,
        agentKey,
        agentName,
      }),
    );
    resources.push(...entries);
    roots.push({
      id: `mcp-config:${normalizePath(fullPath).toLowerCase()}`,
      kind: "mcp",
      agentKey,
      agentName,
      label: `${agentName} Config`,
      path: fullPath,
      resourceCount: entries.length,
      brokenCount: 0,
    });
  }

  for (const candidate of TOML_CONFIG_CANDIDATES) {
    const fullPath = path.join(home, candidate);
    if (!(await fileExists(fullPath))) {
      continue;
    }
    const parsed = await parseTomlMcpConfig(fullPath);
    const { agentKey, agentName } = createMcpConfigIdentity(home, fullPath);
    const entries = parsed.map((item) =>
      makeMcpConfigRecord({
        item,
        fullPath,
        agentKey,
        agentName,
      }),
    );
    resources.push(...entries);
    roots.push({
      id: `mcp-config:${normalizePath(fullPath).toLowerCase()}`,
      kind: "mcp",
      agentKey,
      agentName,
      label: `${agentName} Config`,
      path: fullPath,
      resourceCount: entries.length,
      brokenCount: 0,
    });
  }

  return {
    resources: uniqueBy(resources, (item) => item.id),
    roots: uniqueBy(roots, (item) => item.id),
  };
}

async function discoverMcpDirectories(home: string) {
  const results = new Set<string>();
  const topLevel = await safeReadDir(home);

  for (const entry of topLevel) {
    if (!entry.isDirectory()) {
      continue;
    }

    const childRoot = path.join(home, entry.name);
    const namedMcp = path.join(childRoot, "mcp");
    if (await fileExists(namedMcp)) {
      results.add(namedMcp);
    }
  }

  const configRoot = path.join(home, ".config");
  const configDirs = await safeReadDir(configRoot);
  for (const entry of configDirs) {
    if (!entry.isDirectory()) {
      continue;
    }

    const namedMcp = path.join(configRoot, entry.name, "mcp");
    if (await fileExists(namedMcp)) {
      results.add(namedMcp);
    }
  }

  return [...results].sort();
}

async function scanMcpDirectory(directoryPath: string, agentKey: string, agentName: string) {
  const children = await safeReadDir(directoryPath);
  return children.map<ResourceRecord>((child) => {
    const childPath = path.join(directoryPath, child.name);
    return {
      id: `mcp:${normalizePath(childPath).toLowerCase()}`,
      kind: "mcp",
      status: "directory",
      name: child.name,
      path: childPath,
      rootPath: directoryPath,
      rootLabel: agentName,
      agentKey,
      agentName,
      relativePath: child.name,
      detail: child.isDirectory() ? "MCP 目录条目" : "MCP 文件条目",
      tags: [agentKey, agentName, "mcp", child.isDirectory() ? "directory" : "file"],
    };
  });
}

async function parseJsonMcpConfig(fullPath: string) {
  try {
    const raw = await fs.readFile(fullPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const entries = new Map<string, McpConfigEntry>();
    collectJsonMcpEntries(parsed, entries, []);
    return [...entries.values()];
  } catch {
    return [] satisfies McpConfigEntry[];
  }
}

function collectJsonMcpEntries(
  value: unknown,
  entries: Map<string, McpConfigEntry>,
  trail: string[],
) {
  if (!value || typeof value !== "object") {
    return;
  }

  if ("mcpServers" in value && isPlainObject((value as Record<string, unknown>).mcpServers)) {
    const servers = (value as Record<string, unknown>).mcpServers as Record<string, unknown>;
    for (const [name, config] of Object.entries(servers)) {
      const detail = summarizeMcpConfig(config);
      entries.set(`${trail.join(".")}:${name}`, { name, detail });
    }
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (typeof child === "object" && child) {
      collectJsonMcpEntries(child, entries, [...trail, key]);
    }
  }
}

async function parseTomlMcpConfig(fullPath: string) {
  try {
    const raw = await fs.readFile(fullPath, "utf8");
    const lines = raw.split(/\r?\n/);
    const entries: McpConfigEntry[] = [];
    let current: McpConfigEntry | null = null;

    for (const line of lines) {
      const header = line.match(/^\s*\[(mcp_servers|mcpServers)\.([^\]]+)\]\s*$/);
      if (header) {
        if (current) {
          entries.push(current);
        }
        current = { name: header[2], detail: "TOML MCP server" };
        continue;
      }

      if (!current) {
        continue;
      }

      const command = line.match(/^\s*command\s*=\s*["'](.+?)["']\s*$/);
      if (command) {
        current.detail = `command: ${command[1]}`;
      }

      const url = line.match(/^\s*url\s*=\s*["'](.+?)["']\s*$/);
      if (url) {
        current.detail = `url: ${url[1]}`;
      }

      const enabled = line.match(/^\s*enabled\s*=\s*(true|false)\s*$/);
      if (enabled) {
        current.enabled = enabled[1] === "true";
      }
    }

    if (current) {
      entries.push(current);
    }

    return entries;
  } catch {
    return [] satisfies McpConfigEntry[];
  }
}

function makeMcpConfigRecord({
  item,
  fullPath,
  agentKey,
  agentName,
}: {
  item: McpConfigEntry;
  fullPath: string;
  agentKey: string;
  agentName: string;
}) {
  return {
    id: `mcp:${normalizePath(`${fullPath}#${item.name}`).toLowerCase()}`,
    kind: "mcp" as const,
    status: "config" as const,
    name: item.name,
    path: fullPath,
    rootPath: fullPath,
    rootLabel: agentName,
    agentKey,
    agentName,
    relativePath: item.name,
    detail: item.enabled === false ? `${item.detail} · disabled` : item.detail,
    tags: [agentKey, agentName, "mcp", "config"],
  };
}

function createMcpConfigIdentity(home: string, fullPath: string) {
  if (path.basename(fullPath) === ".claude.json") {
    return createAgentIdentity(path.join(home, ".claude"));
  }

  return createAgentIdentity(path.dirname(fullPath));
}

function summarizeMcpConfig(value: unknown) {
  if (!isPlainObject(value)) {
    return "JSON MCP server";
  }

  const command = typeof value.command === "string" ? value.command : null;
  const url = typeof value.url === "string" ? value.url : null;
  const transport = typeof value.transport === "string" ? value.transport : null;

  if (command) {
    return `command: ${command}`;
  }

  if (url) {
    return `url: ${url}`;
  }

  if (transport) {
    return `transport: ${transport}`;
  }

  return "JSON MCP server";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
