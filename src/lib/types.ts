import { z } from "zod";

export const resourceKindSchema = z.enum(["skill", "rule", "mcp"]);
export const resourceStatusSchema = z.enum([
  "source",
  "linked",
  "broken",
  "file",
  "config",
  "directory",
]);

export const resourceRecordSchema = z.object({
  id: z.string(),
  kind: resourceKindSchema,
  status: resourceStatusSchema,
  name: z.string(),
  path: z.string(),
  rootPath: z.string(),
  rootLabel: z.string(),
  agentKey: z.string(),
  agentName: z.string(),
  relativePath: z.string(),
  targetPath: z.string().nullable().optional(),
  linkType: z.string().nullable().optional(),
  detail: z.string().optional(),
  tags: z.array(z.string()),
});

export const rootRecordSchema = z.object({
  id: z.string(),
  kind: resourceKindSchema,
  agentKey: z.string(),
  agentName: z.string(),
  label: z.string(),
  path: z.string(),
  resourceCount: z.number().int().nonnegative(),
  brokenCount: z.number().int().nonnegative(),
});

export const kindSummarySchema = z.object({
  kind: resourceKindSchema,
  count: z.number().int().nonnegative(),
  brokenCount: z.number().int().nonnegative(),
  rootCount: z.number().int().nonnegative(),
});

export const workspaceSnapshotSchema = z.object({
  generatedAt: z.string(),
  userHome: z.string(),
  roots: z.array(rootRecordSchema),
  resources: z.array(resourceRecordSchema),
  summaries: z.array(kindSummarySchema),
});

export const openPathRequestSchema = z.object({
  path: z.string().trim().min(1, "缺少 path"),
});

export const resourceInstallRequestSchema = z.object({
  resourceId: z.string().trim().min(1, "缺少 resourceId"),
  destinationRootId: z.string().trim().min(1, "缺少 destinationRootId"),
});

export const resourceDeleteRequestSchema = z.object({
  resourceId: z.string().trim().min(1, "缺少 resourceId"),
});

export const resourceActionResponseSchema = z.object({
  message: z.string(),
  snapshot: workspaceSnapshotSchema,
  focusRootId: z.string().optional(),
  focusResourceId: z.string().nullable().optional(),
});

export type ResourceKind = z.infer<typeof resourceKindSchema>;
export type ResourceStatus = z.infer<typeof resourceStatusSchema>;
export type ResourceRecord = z.infer<typeof resourceRecordSchema>;
export type RootRecord = z.infer<typeof rootRecordSchema>;
export type KindSummary = z.infer<typeof kindSummarySchema>;
export type WorkspaceSnapshot = z.infer<typeof workspaceSnapshotSchema>;
