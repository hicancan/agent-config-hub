"use client";

import { useDeferredValue, useState, useTransition } from "react";
import type { DragEvent } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  ArrowUpRight,
  Boxes,
  ChevronRight,
  FileCode2,
  FileJson2,
  FileText,
  FolderOpen,
  GripVertical,
  Link2,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Workflow,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
  ResourceKind,
  ResourceRecord,
  RootRecord,
  WorkspaceSnapshot,
} from "@/lib/types";
import {
  resourceActionResponseSchema,
  workspaceSnapshotSchema,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type ExplorerGroup = {
  agentKey: string;
  agentName: string;
  roots: Partial<Record<ResourceKind, RootRecord>>;
};

const KIND_ORDER: ResourceKind[] = ["skill", "rule", "mcp"];

const KIND_META: Record<
  ResourceKind,
  { label: string; icon: LucideIcon; description: string }
> = {
  skill: {
    label: "Skills",
    icon: Boxes,
    description: "拖进去会创建 link / junction",
  },
  rule: {
    label: "Rules",
    icon: FileCode2,
    description: "拖进去会复制规则文件",
  },
  mcp: {
    label: "MCP",
    icon: Workflow,
    description: "当前先做浏览和定位",
  },
};

const STATUS_META: Record<ResourceRecord["status"], { label: string; className: string }> = {
  source: { label: "Source", className: "border-blue-200 bg-blue-50 text-blue-700" },
  linked: { label: "Link", className: "border-sky-200 bg-sky-50 text-sky-700" },
  broken: { label: "Broken", className: "border-red-200 bg-red-50 text-red-700" },
  file: { label: "File", className: "border-slate-200 bg-slate-50 text-slate-700" },
  config: { label: "Config", className: "border-indigo-200 bg-indigo-50 text-indigo-700" },
  directory: { label: "Directory", className: "border-zinc-200 bg-zinc-50 text-zinc-700" },
};

export function ConfigExplorer({
  initialSnapshot,
}: {
  initialSnapshot: WorkspaceSnapshot;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [selectedRootId, setSelectedRootId] = useState(() => getInitialRootId(initialSnapshot));
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [draggingResourceId, setDraggingResourceId] = useState<string | null>(null);
  const [dragOverRootId, setDragOverRootId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const groups = buildExplorerGroups(snapshot.roots);
  const selectedRoot =
    snapshot.roots.find((root) => root.id === selectedRootId) ?? snapshot.roots[0] ?? null;
  const folderResources = selectedRoot
    ? snapshot.resources.filter((resource) => resource.rootPath === selectedRoot.path)
    : [];
  const search = deferredQuery.trim().toLowerCase();
  const visibleResources = folderResources.filter((resource) => {
    if (!search) return true;
    const stack = [
      resource.name,
      resource.relativePath,
      resource.path,
      resource.detail ?? "",
      resource.targetPath ?? "",
      ...resource.tags,
    ];
    return stack.some((item) => item.toLowerCase().includes(search));
  });

  const selectedResource =
    visibleResources.find((resource) => resource.id === selectedResourceId) ??
    folderResources.find((resource) => resource.id === selectedResourceId) ??
    null;
  const selectedMeta = selectedRoot ? KIND_META[selectedRoot.kind] : null;
  const usingResources = selectedResource
    ? getUsingResources(snapshot.resources, selectedResource)
    : [];
  const deleteDisabledReason = selectedResource
    ? getDeleteDisabledReason(selectedResource)
    : null;
  const currentPathLabel = selectedRoot
    ? `本机资源 / ${selectedRoot.agentName} / ${selectedMeta?.label}`
    : "本机资源";

  function refresh() {
    setError("");
    setFeedback("");
    startTransition(() => {
      void (async () => {
        try {
          const response = await fetch("/api/snapshot", { cache: "no-store" });
          if (!response.ok) throw new Error(await readError(response));
          const parsed = workspaceSnapshotSchema.safeParse(await response.json());
          if (!parsed.success) throw new Error("快照数据结构无效");
          setSnapshot(parsed.data);
          setSelectedRootId((current) => current ?? getInitialRootId(parsed.data));
          setFeedback("已刷新资源管理器。");
        } catch (reason) {
          setError(normalizeError(reason));
        }
      })();
    });
  }

  async function openPath(targetPath: string) {
    setError("");
    try {
      const response = await fetch("/api/open", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: targetPath }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setFeedback(`已打开 ${targetPath}`);
    } catch (reason) {
      setError(normalizeError(reason));
    }
  }

  function selectRoot(rootId: string) {
    setSelectedRootId(rootId);
    setSelectedResourceId(null);
    setQuery("");
  }

  async function installResource(resourceId: string, destinationRootId: string) {
    setError("");
    setFeedback("");
    try {
      const response = await fetch("/api/resource/install", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resourceId, destinationRootId }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const parsed = resourceActionResponseSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error("资源安装响应无效");
      setSnapshot(parsed.data.snapshot);
      setSelectedRootId(parsed.data.focusRootId ?? destinationRootId);
      setSelectedResourceId(parsed.data.focusResourceId ?? null);
      setFeedback(parsed.data.message);
    } catch (reason) {
      setError(normalizeError(reason));
    } finally {
      setDraggingResourceId(null);
      setDragOverRootId(null);
    }
  }

  async function deleteSelectedResource() {
    if (!selectedResource || deleteDisabledReason) return;
    const confirmed = window.confirm(
      `${getDeleteActionLabel(selectedResource)} “${selectedResource.name}”？\n\n路径：${selectedResource.path}`,
    );
    if (!confirmed) return;
    try {
      const response = await fetch("/api/resource/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resourceId: selectedResource.id }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const parsed = resourceActionResponseSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error("删除响应无效");
      setSnapshot(parsed.data.snapshot);
      setSelectedRootId(parsed.data.focusRootId ?? selectedRoot?.id ?? getInitialRootId(parsed.data.snapshot));
      setSelectedResourceId(parsed.data.focusResourceId ?? null);
      setFeedback(parsed.data.message);
    } catch (reason) {
      setError(normalizeError(reason));
    }
  }

  function handleDragStart(event: DragEvent<HTMLElement>, resource: ResourceRecord) {
    if (!isDraggableResource(resource)) return;
    event.dataTransfer.effectAllowed = "copyMove";
    event.dataTransfer.setData("text/resource-id", resource.id);
    setDraggingResourceId(resource.id);
  }

  function handleDragEnd() {
    setDraggingResourceId(null);
    setDragOverRootId(null);
  }

  function handleDragOverRoot(event: DragEvent<HTMLButtonElement>, root: RootRecord) {
    const draggedResource = snapshot.resources.find((resource) => resource.id === draggingResourceId) ?? null;
    if (!canDropResourceIntoRoot(draggedResource, root)) return;
    event.preventDefault();
    if (dragOverRootId !== root.id) setDragOverRootId(root.id);
  }

  function handleDropOnRoot(event: DragEvent<HTMLButtonElement>, root: RootRecord) {
    event.preventDefault();
    const resourceId = event.dataTransfer.getData("text/resource-id") || draggingResourceId;
    setDragOverRootId(null);
    if (resourceId) void installResource(resourceId, root.id);
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto flex max-w-[1680px] flex-col gap-4 px-4 py-4 md:px-6 lg:px-8 lg:py-6">
        <section className="rounded-[1.75rem] border border-white/70 bg-white/85 p-5 shadow-[0_18px_70px_rgba(37,99,235,0.08)] backdrop-blur xl:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs tracking-[0.22em] text-blue-700 uppercase">
                <span>Agent Explorer</span>
                <ChevronRight className="size-3.5" />
                <span>文件夹模型</span>
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-slate-950 md:text-4xl [font-family:var(--font-display)]">
                像资源管理器一样管理 agent 配置。
              </h1>
              <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-600 md:text-base">
                左边是 agent 文件夹树，中间是当前文件夹内容，右边是详情与动作。
                <strong> Skills</strong> 可以拖进别的 <strong>Skills</strong> 文件夹创建 link，
                <strong> Rules</strong> 可以拖进去复制文件，<strong>MCP</strong> 先专注浏览和定位。
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="outline" className="border-blue-200 bg-blue-50 px-3 py-1 text-blue-700">
                {snapshot.resources.length} resources
              </Badge>
              <Badge variant="outline" className="border-blue-200 bg-white px-3 py-1 text-slate-600">
                {snapshot.roots.length} folders
              </Badge>
              <Button
                variant="outline"
                className="rounded-xl border-blue-200 bg-white/90 text-blue-700 hover:bg-blue-50 hover:text-blue-700"
                onClick={refresh}
                disabled={isPending}
              >
                <RefreshCw className={cn("size-4", isPending && "animate-spin")} />
                {isPending ? "刷新中" : "刷新"}
              </Button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1">拖拽为主</span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">删除分清 link / source</span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">搜索只作用于当前文件夹</span>
          </div>
        </section>

        {feedback ? (
          <Alert className="border-blue-200 bg-blue-50/85 text-blue-900">
            <ShieldCheck className="size-4" />
            <AlertTitle>操作完成</AlertTitle>
            <AlertDescription>{feedback}</AlertDescription>
          </Alert>
        ) : null}

        {error ? (
          <Alert variant="destructive" className="border-red-200 bg-red-50/85">
            <AlertCircle className="size-4" />
            <AlertTitle>操作失败</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[290px_minmax(0,1fr)_360px]">
          <Card className="overflow-hidden border-white/70 bg-white/88 shadow-[0_18px_60px_rgba(37,99,235,0.08)]">
            <CardHeader className="pb-4">
              <CardDescription className="text-[11px] tracking-[0.24em] text-blue-700 uppercase">
                Explorer Tree
              </CardDescription>
              <CardTitle className="text-2xl text-slate-950 [font-family:var(--font-display)]">
                Agent 文件夹
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <ScrollArea className="h-[calc(100vh-17rem)] min-h-[560px]">
                <div className="px-4 pb-5">
                  {groups.map((group) => (
                    <div key={group.agentKey} className="mb-5 last:mb-0">
                      <div className="mb-2 px-2 text-[11px] tracking-[0.22em] text-slate-500 uppercase">
                        {group.agentName}
                      </div>
                      <div className="grid gap-2">
                        {KIND_ORDER.map((kind) => {
                          const root = group.roots[kind];
                          if (!root) return null;
                          const meta = KIND_META[kind];
                          const Icon = meta.icon;
                          const selected = selectedRoot?.id === root.id;
                          const droppable = canDropResourceIntoRoot(
                            snapshot.resources.find((resource) => resource.id === draggingResourceId) ?? null,
                            root,
                          );

                          return (
                            <button
                              key={root.id}
                              type="button"
                              className={cn(
                                "group flex items-start gap-3 rounded-[1.15rem] border px-3 py-3 text-left transition-colors",
                                selected
                                  ? "border-blue-300 bg-blue-50 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.15)]"
                                  : "border-transparent bg-slate-50/75 hover:border-blue-100 hover:bg-blue-50/55",
                                dragOverRootId === root.id && "border-sky-300 bg-sky-50 ring-2 ring-sky-200/80",
                              )}
                              onClick={() => selectRoot(root.id)}
                              onDragOver={(event) => handleDragOverRoot(event, root)}
                              onDragLeave={() => {
                                if (dragOverRootId === root.id) setDragOverRootId(null);
                              }}
                              onDrop={(event) => handleDropOnRoot(event, root)}
                            >
                              <div
                                className={cn(
                                  "rounded-xl border p-2",
                                  selected
                                    ? "border-blue-200 bg-white text-blue-700"
                                    : "border-slate-200 bg-white text-slate-600",
                                )}
                              >
                                <Icon className="size-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="truncate text-sm font-medium text-slate-900">
                                    {meta.label}
                                  </span>
                                  <Badge variant="outline" className="border-slate-200 bg-white text-slate-500">
                                    {root.resourceCount}
                                  </Badge>
                                </div>
                                <p className="mt-1 text-xs leading-5 text-slate-500">
                                  {droppable ? "松开鼠标即可安装到这里" : meta.description}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-white/70 bg-white/92 shadow-[0_18px_60px_rgba(37,99,235,0.08)]">
            <CardHeader className="gap-4 pb-4">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <CardDescription className="text-[11px] tracking-[0.24em] text-blue-700 uppercase">
                    Current Folder
                  </CardDescription>
                  <CardTitle className="mt-2 truncate text-2xl text-slate-950 [font-family:var(--font-display)]">
                    {selectedRoot ? `${selectedRoot.agentName} / ${selectedMeta?.label}` : "未选择文件夹"}
                  </CardTitle>
                  <CardDescription className="mt-2 text-sm leading-6 text-slate-600">
                    {currentPathLabel}
                  </CardDescription>
                </div>

                {selectedRoot ? (
                  <Button
                    variant="outline"
                    className="rounded-xl border-blue-200 bg-white text-blue-700 hover:bg-blue-50 hover:text-blue-700"
                    onClick={() => void openPath(selectedRoot.path)}
                  >
                    打开文件夹
                    <ArrowUpRight className="size-4" />
                  </Button>
                ) : null}
              </div>

              <div className="grid gap-3">
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  placeholder="在当前文件夹内搜索名称、路径或标签"
                  className="h-11 rounded-xl border-blue-100 bg-white"
                />
                <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                    当前显示 {visibleResources.length} 项
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                    拖到左边同类文件夹即可安装
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-0">
              <ScrollArea className="h-[calc(100vh-17rem)] min-h-[560px]">
                <div className="px-4 pb-5">
                  {selectedRoot ? (
                    visibleResources.length > 0 ? (
                      <div className="grid gap-2">
                        {visibleResources.map((resource) => {
                          const meta = KIND_META[resource.kind];
                          const status = STATUS_META[resource.status];
                          const selected = selectedResource?.id === resource.id;
                          const draggable = isDraggableResource(resource);
                          const Icon = getResourceIcon(resource);

                          return (
                            <div
                              key={resource.id}
                              draggable={draggable}
                              onDragStart={(event) => handleDragStart(event, resource)}
                              onDragEnd={handleDragEnd}
                              className={cn(
                                "group grid gap-3 rounded-[1.2rem] border px-4 py-4 transition-colors",
                                selected
                                  ? "border-blue-300 bg-blue-50"
                                  : "border-slate-200 bg-white hover:border-blue-100 hover:bg-slate-50/90",
                                draggingResourceId === resource.id && "opacity-65",
                              )}
                            >
                              <div className="flex items-start gap-3">
                                <button
                                  type="button"
                                  onClick={() => setSelectedResourceId(resource.id)}
                                  className="flex min-w-0 flex-1 items-start gap-3 text-left"
                                >
                                  <div
                                    className={cn(
                                      "mt-0.5 rounded-xl border p-2",
                                      selected
                                        ? "border-blue-200 bg-white text-blue-700"
                                        : "border-slate-200 bg-slate-50 text-slate-600",
                                    )}
                                  >
                                    <Icon className="size-4" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="truncate text-sm font-medium text-slate-950">{resource.name}</span>
                                      <Badge variant="outline" className="border-slate-200 bg-white text-slate-500">
                                        {meta.label}
                                      </Badge>
                                      <Badge variant="outline" className={status.className}>
                                        {status.label}
                                      </Badge>
                                    </div>
                                    <p className="mt-1 text-sm text-slate-500">{resource.relativePath}</p>
                                    <p className="mt-2 text-xs leading-6 text-slate-500">
                                      {resource.detail ?? resource.path}
                                    </p>
                                    {resource.targetPath ? (
                                      <p className="mt-1 break-all text-xs leading-6 text-sky-700">
                                        Target: {resource.targetPath}
                                      </p>
                                    ) : null}
                                  </div>
                                </button>
                                <div className="flex items-center gap-2 self-stretch">
                                  {draggable ? (
                                    <div className="hidden rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-500 lg:block">
                                      <GripVertical className="size-3.5" />
                                    </div>
                                  ) : null}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="rounded-xl text-blue-700 hover:bg-blue-100/70 hover:text-blue-700"
                                    onClick={() => void openPath(resource.path)}
                                  >
                                    打开
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <EmptyState
                        title="当前文件夹没有匹配项"
                        description="可以切换左侧文件夹，或者清空搜索词再看完整内容。"
                      />
                    )
                  ) : (
                    <EmptyState
                      title="还没有可浏览的文件夹"
                      description="先确认本机目录里存在 skills、rules 或 mcp 配置。"
                    />
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-white/70 bg-white/90 shadow-[0_18px_60px_rgba(37,99,235,0.08)]">
            <CardHeader className="pb-4">
              <CardDescription className="text-[11px] tracking-[0.24em] text-blue-700 uppercase">
                Inspector
              </CardDescription>
              <CardTitle className="text-2xl text-slate-950 [font-family:var(--font-display)]">
                详情与动作
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <ScrollArea className="h-[calc(100vh-17rem)] min-h-[560px]">
                <div className="px-6 pb-6">
                  {selectedResource ? (
                    <div className="grid gap-5">
                      <div className="flex items-start gap-3">
                        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3 text-blue-700">
                          {(() => {
                            const Icon = getResourceIcon(selectedResource);
                            return <Icon className="size-5" />;
                          })()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="truncate text-xl font-semibold text-slate-950">
                              {selectedResource.name}
                            </h2>
                            <Badge variant="outline" className={STATUS_META[selectedResource.status].className}>
                              {STATUS_META[selectedResource.status].label}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm text-slate-500">
                            {selectedResource.agentName} / {KIND_META[selectedResource.kind].label}
                          </p>
                        </div>
                      </div>

                      <InspectorBlock label="相对路径" value={selectedResource.relativePath} />
                      <InspectorBlock
                        label="实际路径"
                        value={selectedResource.path}
                        onOpen={() => void openPath(selectedResource.path)}
                      />

                      {selectedResource.targetPath ? (
                        <InspectorBlock
                          label="目标路径"
                          value={selectedResource.targetPath}
                          onOpen={() => void openPath(selectedResource.targetPath!)}
                        />
                      ) : null}

                      {selectedResource.detail ? (
                        <InspectorBlock label="说明" value={selectedResource.detail} />
                      ) : null}

                      {selectedResource.kind === "skill" ? (
                        <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50/80 p-4">
                          <p className="text-xs tracking-[0.18em] text-slate-500 uppercase">使用情况</p>
                          <div className="mt-3 grid gap-2">
                            {usingResources.map((resource) => (
                              <div
                                key={resource.id}
                                className="flex items-center justify-between gap-3 rounded-xl border border-white bg-white px-3 py-2"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-slate-900">
                                    {resource.agentName}
                                  </p>
                                  <p className="truncate text-xs text-slate-500">
                                    {resource.relativePath}
                                  </p>
                                </div>
                                <Badge variant="outline" className={STATUS_META[resource.status].className}>
                                  {STATUS_META[resource.status].label}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50/80 p-4">
                        <p className="text-xs tracking-[0.18em] text-slate-500 uppercase">动作</p>
                        <div className="mt-3 grid gap-3">
                          <Button className="justify-between rounded-xl" onClick={() => void openPath(selectedResource.path)}>
                            打开位置
                            <ArrowUpRight className="size-4" />
                          </Button>

                          {selectedResource.targetPath ? (
                            <Button
                              variant="outline"
                              className="justify-between rounded-xl border-blue-200 text-blue-700 hover:bg-blue-50 hover:text-blue-700"
                              onClick={() => void openPath(selectedResource.targetPath!)}
                            >
                              打开目标
                              <Link2 className="size-4" />
                            </Button>
                          ) : null}

                          <Button
                            variant="destructive"
                            className="justify-between rounded-xl"
                            disabled={Boolean(deleteDisabledReason)}
                            onClick={() => void deleteSelectedResource()}
                          >
                            {getDeleteActionLabel(selectedResource)}
                            <Trash2 className="size-4" />
                          </Button>

                          {deleteDisabledReason ? (
                            <p className="text-xs leading-6 text-red-600">{deleteDisabledReason}</p>
                          ) : null}
                        </div>
                      </div>

                      <div className="rounded-[1.25rem] border border-dashed border-blue-200 bg-blue-50/70 p-4">
                        <p className="text-xs tracking-[0.18em] text-blue-700 uppercase">操作提示</p>
                        <div className="mt-3 grid gap-2 text-sm leading-6 text-slate-600">
                          <p>把当前条目拖到左侧同类文件夹，就会按资源类型执行安装动作。</p>
                          <p>Skills 拖拽会创建 link，Rules 拖拽会复制文件，MCP 暂时只做浏览。</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <EmptyState
                      title="先选中一个条目"
                      description="右侧详情只展示当前选中的资源。你可以先在中间列表点选，或者直接拖拽到左侧文件夹。"
                    />
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}

function buildExplorerGroups(roots: RootRecord[]) {
  const map = new Map<string, ExplorerGroup>();
  for (const root of roots) {
    const existing = map.get(root.agentKey);
    if (existing) {
      existing.roots[root.kind] = root;
    } else {
      map.set(root.agentKey, {
        agentKey: root.agentKey,
        agentName: root.agentName,
        roots: { [root.kind]: root },
      });
    }
  }
  return [...map.values()].sort((left, right) => {
    if (left.agentKey === "shared-agents") return -1;
    if (right.agentKey === "shared-agents") return 1;
    return left.agentName.localeCompare(right.agentName);
  });
}

function getInitialRootId(snapshot: WorkspaceSnapshot) {
  return (
    snapshot.roots.find((root) => root.agentKey === "shared-agents" && root.kind === "skill")?.id ??
    snapshot.roots[0]?.id ??
    null
  );
}

function isDraggableResource(resource: ResourceRecord) {
  if (resource.kind === "skill") return resource.status === "source" || resource.status === "linked";
  if (resource.kind === "rule") return resource.status === "file";
  return false;
}

function canDropResourceIntoRoot(resource: ResourceRecord | null, root: RootRecord) {
  if (!resource || resource.kind !== root.kind) return false;
  if (resource.kind === "skill") return resource.status !== "broken" && resource.rootPath !== root.path;
  if (resource.kind === "rule") return resource.status === "file" && resource.rootPath !== root.path;
  return false;
}

function getResourceIcon(resource: ResourceRecord) {
  if (resource.kind === "skill") return resource.status === "linked" ? Link2 : Boxes;
  if (resource.kind === "rule") return FileText;
  return resource.status === "config" ? FileJson2 : Workflow;
}

function getDeleteActionLabel(resource: ResourceRecord) {
  if (resource.kind === "skill") {
    return resource.status === "linked" || resource.status === "broken" ? "删除链接" : "删除源目录";
  }
  if (resource.kind === "rule") return "删除文件";
  return "删除条目";
}

function getDeleteDisabledReason(resource: ResourceRecord) {
  if (resource.kind === "mcp" && resource.status === "config") {
    return "这个 MCP 条目来自 JSON/TOML 配置文件内嵌字段，当前版本先不直接改写配置。";
  }
  return null;
}

function getUsingResources(resources: ResourceRecord[], current: ResourceRecord) {
  if (current.kind !== "skill") return [];
  const sourcePath =
    current.status === "linked"
      ? current.targetPath ?? null
      : current.status === "source"
        ? current.path
        : null;
  if (!sourcePath) return [];
  const normalized = sourcePath.toLowerCase();
  return resources.filter((resource) => {
    if (resource.kind !== "skill") return false;
    const candidate =
      resource.status === "linked"
        ? resource.targetPath ?? null
        : resource.status === "source"
          ? resource.path
          : null;
    return candidate?.toLowerCase() === normalized;
  });
}

function InspectorBlock({
  label,
  value,
  onOpen,
}: {
  label: string;
  value: string;
  onOpen?: () => void;
}) {
  return (
    <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50/80 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs tracking-[0.18em] text-slate-500 uppercase">{label}</p>
          <p className="mt-2 break-all text-sm leading-6 text-slate-900">{value}</p>
        </div>
        {onOpen ? (
          <Button
            variant="ghost"
            size="sm"
            className="rounded-xl text-blue-700 hover:bg-blue-100/70 hover:text-blue-700"
            onClick={onOpen}
          >
            打开
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[1.4rem] border border-dashed border-blue-200 bg-blue-50/55 p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl border border-blue-100 bg-white p-3 text-blue-700">
          <FolderOpen className="size-5" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-slate-950">{title}</h3>
          <p className="mt-2 text-sm leading-7 text-slate-600">{description}</p>
        </div>
      </div>
    </div>
  );
}

async function readError(response: Response) {
  try {
    const payload = (await response.json()) as { message?: string };
    return payload.message ?? "请求失败";
  } catch {
    return `请求失败: ${response.status}`;
  }
}

function normalizeError(reason: unknown) {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === "string") return reason;
  return "发生了未识别错误。";
}
