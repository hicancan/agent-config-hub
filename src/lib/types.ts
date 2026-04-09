export type ResourceKind = "skill" | "rule" | "mcp";

export type ResourceStatus =
  | "source"
  | "linked"
  | "broken"
  | "file"
  | "config"
  | "directory";

export type ResourceRecord = {
  id: string;
  kind: ResourceKind;
  status: ResourceStatus;
  name: string;
  path: string;
  rootPath: string;
  rootLabel: string;
  agentKey: string;
  agentName: string;
  relativePath: string;
  targetPath?: string | null;
  linkType?: string | null;
  detail?: string;
  tags: string[];
};

export type RootRecord = {
  id: string;
  kind: ResourceKind;
  agentKey: string;
  agentName: string;
  label: string;
  path: string;
  resourceCount: number;
  brokenCount: number;
};

export type KindSummary = {
  kind: ResourceKind;
  count: number;
  brokenCount: number;
  rootCount: number;
};

export type WorkspaceSnapshot = {
  generatedAt: string;
  userHome: string;
  roots: RootRecord[];
  resources: ResourceRecord[];
  summaries: KindSummary[];
};

