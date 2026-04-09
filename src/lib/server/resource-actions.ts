import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  createDirectoryJunction,
  removeItemWithPowerShell,
} from "@/lib/server/powershell";
import {
  fileExists,
  getUserHome,
  isWithinPath,
  normalizePath,
} from "@/lib/server/shared";
import { getWorkspaceSnapshot } from "@/lib/server/snapshot";
import type { ResourceRecord, RootRecord } from "@/lib/types";

export async function installResourceToRoot(resourceId: string, destinationRootId: string) {
  const snapshot = await getWorkspaceSnapshot();
  const resource = snapshot.resources.find((item) => item.id === resourceId);
  const destinationRoot = snapshot.roots.find((item) => item.id === destinationRootId);

  if (!resource) {
    throw new Error("找不到要安装的资源");
  }

  if (!destinationRoot) {
    throw new Error("找不到目标文件夹");
  }

  if (resource.kind !== destinationRoot.kind) {
    throw new Error("资源类型与目标文件夹不匹配");
  }

  if (resource.kind === "mcp") {
    throw new Error("MCP 暂不支持拖拽安装，请后续做专用编辑器");
  }

  if (resource.kind === "skill") {
    const result = await installSkillToRoot(resource, destinationRoot);
    const nextSnapshot = await getWorkspaceSnapshot();
    return {
      message: result.message,
      snapshot: nextSnapshot,
      focusRootId: destinationRoot.id,
      focusResourceId: createResourceId("skill", result.destinationPath),
    };
  }

  const result = await installRuleToRoot(resource, destinationRoot);
  const nextSnapshot = await getWorkspaceSnapshot();
  return {
    message: result.message,
    snapshot: nextSnapshot,
    focusRootId: destinationRoot.id,
    focusResourceId: createResourceId("rule", result.destinationPath),
  };
}

export async function deleteManagedResource(resourceId: string) {
  const snapshot = await getWorkspaceSnapshot();
  const resource = snapshot.resources.find((item) => item.id === resourceId);

  if (!resource) {
    throw new Error("找不到要删除的资源");
  }

  if (resource.kind === "mcp" && resource.status === "config") {
    throw new Error("这个 MCP 条目嵌在配置文件里，当前版本暂不支持直接删除");
  }

  assertManagedPath(resource.path);

  if (!(await fileExists(resource.path))) {
    const nextSnapshot = await getWorkspaceSnapshot();
    return {
      message: "目标已经不存在，已刷新视图。",
      snapshot: nextSnapshot,
      focusRootId: findRootId(nextSnapshot.roots, resource),
      focusResourceId: null,
    };
  }

  if (resource.kind === "skill") {
    await removeItemWithPowerShell(resource.path);
  } else {
    const stat = await fs.lstat(resource.path);
    if (stat.isDirectory()) {
      await fs.rm(resource.path, { recursive: true, force: true });
    } else {
      await fs.rm(resource.path, { force: true });
    }
  }

  const nextSnapshot = await getWorkspaceSnapshot();
  return {
    message: describeDeletion(resource),
    snapshot: nextSnapshot,
    focusRootId: findRootId(nextSnapshot.roots, resource),
    focusResourceId: null,
  };
}

async function installSkillToRoot(resource: ResourceRecord, destinationRoot: RootRecord) {
  if (resource.status === "broken") {
    throw new Error("坏链不能直接安装，请先修复源路径");
  }

  if (resource.status !== "source" && resource.status !== "linked") {
    throw new Error("只有 skills source 或 link 能拖到 Skills 文件夹");
  }

  const sourcePath =
    resource.status === "linked" ? resource.targetPath ?? null : resource.path;

  if (!sourcePath) {
    throw new Error("无法解析 skill 的真实源路径");
  }

  assertManagedPath(sourcePath);
  const destinationPath = path.join(destinationRoot.path, resource.relativePath);
  assertManagedPath(destinationPath);

  if (normalizePath(destinationPath).toLowerCase() === normalizePath(resource.path).toLowerCase()) {
    return {
      message: `${resource.name} 已经在这个文件夹里了。`,
      destinationPath,
    };
  }

  if (!(await fileExists(path.join(sourcePath, "SKILL.md")))) {
    throw new Error("源 skill 缺少 SKILL.md，不能安装");
  }

  if (await fileExists(destinationPath)) {
    throw new Error("目标文件夹里已经有同名 skill");
  }

  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await createDirectoryJunction(destinationPath, sourcePath);

  return {
    message: `已将 ${resource.name} 安装到 ${destinationRoot.agentName}。`,
    destinationPath,
  };
}

async function installRuleToRoot(resource: ResourceRecord, destinationRoot: RootRecord) {
  if (resource.status !== "file") {
    throw new Error("当前只支持拖拽规则文件");
  }

  const destinationPath = path.join(destinationRoot.path, resource.relativePath);
  assertManagedPath(destinationPath);

  if (normalizePath(destinationPath).toLowerCase() === normalizePath(resource.path).toLowerCase()) {
    return {
      message: `${resource.name} 已经在这个文件夹里了。`,
      destinationPath,
    };
  }

  if (await fileExists(destinationPath)) {
    throw new Error("目标文件夹里已经有同名规则文件");
  }

  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.copyFile(resource.path, destinationPath);

  return {
    message: `已将 ${resource.name} 复制到 ${destinationRoot.agentName}。`,
    destinationPath,
  };
}

function assertManagedPath(targetPath: string) {
  const home = getUserHome();
  if (!isWithinPath(home, targetPath)) {
    throw new Error("拒绝操作用户目录之外的路径");
  }
}

function describeDeletion(resource: ResourceRecord) {
  if (resource.kind === "skill") {
    if (resource.status === "linked" || resource.status === "broken") {
      return `已删除 ${resource.name} 的链接。`;
    }

    return `已删除 ${resource.name} 的源目录。`;
  }

  if (resource.kind === "rule") {
    return `已删除规则文件 ${resource.name}。`;
  }

  return `已删除 ${resource.name}。`;
}

function createResourceId(kind: ResourceRecord["kind"], targetPath: string) {
  return `${kind}:${normalizePath(targetPath).toLowerCase()}`;
}

function findRootId(roots: RootRecord[], resource: ResourceRecord) {
  return roots.find((item) => item.path === resource.rootPath)?.id ?? roots[0]?.id;
}
