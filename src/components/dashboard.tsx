"use client";

import { useDeferredValue, useState, useTransition } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  ArrowUpRight,
  Boxes,
  FileStack,
  FolderTree,
  Home,
  Link2,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
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
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  KindSummary,
  ResourceKind,
  ResourceRecord,
  RootRecord,
  WorkspaceSnapshot,
} from "@/lib/types";
import { workspaceSnapshotSchema } from "@/lib/types";
import { cn } from "@/lib/utils";

const FILTER_KINDS = ["all", "skill", "rule", "mcp"] as const;

const KIND_META: Record<
  ResourceKind,
  { label: string; shortLabel: string; icon: LucideIcon; tint: string }
> = {
  skill: {
    label: "Skills",
    shortLabel: "Skills",
    icon: Boxes,
    tint: "from-blue-600/12 via-sky-500/10 to-indigo-500/8",
  },
  rule: {
    label: "Rules",
    shortLabel: "Rules",
    icon: FileStack,
    tint: "from-cyan-500/12 via-blue-500/8 to-sky-400/8",
  },
  mcp: {
    label: "MCP",
    shortLabel: "MCP",
    icon: Workflow,
    tint: "from-indigo-500/12 via-blue-500/10 to-sky-500/8",
  },
};

const FILTER_LABELS: Record<(typeof FILTER_KINDS)[number], string> = {
  all: "全部",
  skill: "Skills",
  rule: "Rules",
  mcp: "MCP",
};

const STATUS_META: Record<
  ResourceRecord["status"],
  { label: string; className: string }
> = {
  source: {
    label: "Source",
    className:
      "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200",
  },
  linked: {
    label: "Junction",
    className:
      "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-50 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200",
  },
  broken: {
    label: "Broken",
    className:
      "border-red-200 bg-red-50 text-red-700 hover:bg-red-50 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200",
  },
  file: {
    label: "File",
    className:
      "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-50 dark:border-slate-500/30 dark:bg-slate-500/10 dark:text-slate-200",
  },
  config: {
    label: "Config",
    className:
      "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200",
  },
  directory: {
    label: "Directory",
    className:
      "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-500/30 dark:bg-zinc-500/10 dark:text-zinc-200",
  },
};

export function Dashboard({ initialSnapshot }: { initialSnapshot: WorkspaceSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [activeKind, setActiveKind] = useState<ResourceKind | "all">("all");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const search = deferredQuery.trim().toLowerCase();

  const visibleResources = snapshot.resources.filter((resource) => {
    if (activeKind !== "all" && resource.kind !== activeKind) {
      return false;
    }

    if (!search) {
      return true;
    }

    const stack = [
      resource.name,
      resource.agentName,
      resource.kind,
      resource.path,
      resource.relativePath,
      resource.targetPath ?? "",
      resource.detail ?? "",
      ...resource.tags,
    ];

    return stack.some((item) => item.toLowerCase().includes(search));
  });

  const visibleRoots = snapshot.roots.filter((root) => {
    if (activeKind !== "all" && root.kind !== activeKind) {
      return false;
    }

    if (!search) {
      return true;
    }

    const rootMatches = [root.label, root.path, root.agentName, root.kind].some((item) =>
      item.toLowerCase().includes(search),
    );

    if (rootMatches) {
      return true;
    }

    return visibleResources.some((resource) => resource.rootPath === root.path);
  });

  const brokenResources = snapshot.resources.filter((resource) => resource.status === "broken");
  const linkedResources = snapshot.resources.filter((resource) => resource.status === "linked");
  const healthyRoots = snapshot.roots.filter((root) => root.brokenCount === 0).length;
  const dominantAgent = getDominantAgent(snapshot.roots);

  function refresh() {
    setError("");
    setFeedback("");

    startTransition(() => {
      void (async () => {
        try {
          const response = await fetch("/api/snapshot", { cache: "no-store" });
          if (!response.ok) {
            throw new Error(await readError(response));
          }

          const parsed = workspaceSnapshotSchema.safeParse(await response.json());
          if (!parsed.success) {
            throw new Error("快照数据结构无效");
          }

          setSnapshot(parsed.data);
          setFeedback("已刷新本地资源快照。");
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
      if (!response.ok) {
        throw new Error(await readError(response));
      }
      setFeedback(`已打开 ${targetPath}`);
    } catch (reason) {
      setError(normalizeError(reason));
    }
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto flex max-w-[1520px] flex-col gap-6 px-4 py-5 md:px-6 lg:px-8 lg:py-8">
        <section className="relative overflow-hidden rounded-[2rem] border border-white/70 bg-white/80 shadow-[0_28px_90px_rgba(73,112,255,0.12)] backdrop-blur-xl">
          <div
            aria-hidden
            className="absolute inset-0 opacity-100"
            style={{ backgroundImage: "var(--hero-glow)" }}
          />
          <div className="relative flex flex-col gap-8 p-6 lg:p-8">
            <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-4xl">
                <Badge
                  variant="outline"
                  className="border-blue-200 bg-white/75 px-3 py-1 text-[11px] tracking-[0.24em] text-blue-700 uppercase"
                >
                  Local Agent Control Plane
                </Badge>
                <h1 className="mt-5 max-w-4xl text-4xl leading-[0.98] font-semibold tracking-[-0.05em] text-slate-950 md:text-5xl xl:text-6xl [font-family:var(--font-display)]">
                  白蓝基调的一体化 agent 配置控制台。
                </h1>
                <p className="mt-5 max-w-3xl text-base leading-8 text-slate-600 md:text-lg">
                  这版不再像脚手架 demo。它把 <strong>skills</strong>、<strong>rules</strong>、
                  <strong> mcp</strong> 拉回同一张控制面里，用统一的组件体系、白蓝色 token 和更高信息密度的布局来承接后续扩展。
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[560px]">
                {snapshot.summaries.map((summary) => (
                  <SummaryCard key={summary.kind} summary={summary} />
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <SignalPill
                icon={brokenResources.length > 0 ? ShieldAlert : ShieldCheck}
                label="资源健康度"
                value={brokenResources.length > 0 ? `${brokenResources.length} 个异常` : "全部正常"}
                tone={brokenResources.length > 0 ? "alert" : "good"}
              />
              <SignalPill
                icon={Link2}
                label="链接资源"
                value={`${linkedResources.length} 个 Junction / Link`}
                tone="neutral"
              />
              <SignalPill
                icon={Sparkles}
                label="最活跃 agent"
                value={dominantAgent}
                tone="neutral"
              />
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="grid gap-6">
            <Card className="border-white/70 bg-white/88 shadow-[0_24px_72px_rgba(37,99,235,0.08)]">
              <CardHeader className="gap-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardDescription className="text-[11px] tracking-[0.24em] text-blue-700 uppercase">
                      Workspace
                    </CardDescription>
                    <CardTitle className="mt-2 text-2xl text-slate-950 [font-family:var(--font-display)]">
                      本地概况
                    </CardTitle>
                  </div>
                  <div className="rounded-2xl border border-blue-100 bg-blue-50 p-2 text-blue-700">
                    <Home className="size-5" />
                  </div>
                </div>
                <CardDescription className="text-sm leading-6 text-slate-600">
                  这里展示当前扫描窗口、本机根目录总量和可直接打开的控制入口。
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <MetricBlock label="用户目录" value={snapshot.userHome} compact />
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                  <MetricBlock label="扫描时间" value={formatDate(snapshot.generatedAt)} />
                  <MetricBlock label="资源总数" value={`${snapshot.resources.length}`} />
                  <MetricBlock label="根目录数" value={`${snapshot.roots.length}`} />
                  <MetricBlock label="健康根目录" value={`${healthyRoots}`} />
                </div>
                <Button
                  size="lg"
                  className="mt-1 h-11 rounded-2xl shadow-[0_12px_30px_rgba(37,99,235,0.22)]"
                  onClick={() => void openPath(snapshot.userHome)}
                >
                  打开用户目录
                  <ArrowUpRight className="size-4" />
                </Button>
              </CardContent>
            </Card>

            <Card className="border-white/70 bg-white/88 shadow-[0_24px_72px_rgba(37,99,235,0.08)]">
              <CardHeader className="gap-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardDescription className="text-[11px] tracking-[0.24em] text-blue-700 uppercase">
                      Root Inventory
                    </CardDescription>
                    <CardTitle className="mt-2 text-2xl text-slate-950 [font-family:var(--font-display)]">
                      根目录分布
                    </CardTitle>
                  </div>
                  <div className="rounded-2xl border border-blue-100 bg-blue-50 p-2 text-blue-700">
                    <FolderTree className="size-5" />
                  </div>
                </div>
                <CardDescription className="text-sm leading-6 text-slate-600">
                  右侧是资源矩阵，左侧保留根目录观察区，方便快速定位某个 agent 的配置源头。
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                <ScrollArea className="h-[480px] px-6">
                  <div className="grid gap-3 pb-2">
                    {visibleRoots.map((root) => (
                      <RootListItem key={root.id} root={root} onOpen={openPath} />
                    ))}
                    {visibleRoots.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50/60 p-5 text-sm leading-7 text-slate-600">
                        当前筛选条件下没有匹配到根目录。
                      </div>
                    ) : null}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </aside>

          <section className="grid gap-6">
            <Card className="border-white/70 bg-white/92 shadow-[0_24px_72px_rgba(37,99,235,0.08)]">
              <CardHeader className="gap-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <CardDescription className="text-[11px] tracking-[0.24em] text-blue-700 uppercase">
                      Control Surface
                    </CardDescription>
                    <CardTitle className="mt-2 text-2xl text-slate-950 [font-family:var(--font-display)]">
                      浏览与筛选
                    </CardTitle>
                    <CardDescription className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                      搜索支持名称、路径、agent、状态与标签。资源视图与左侧根目录区会同步收窄。
                    </CardDescription>
                  </div>
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-11 rounded-2xl border-blue-200 bg-white/80 text-blue-700 hover:bg-blue-50 hover:text-blue-700"
                    disabled={isPending}
                    onClick={refresh}
                  >
                    <RefreshCw className={cn("size-4", isPending && "animate-spin")} />
                    {isPending ? "刷新中" : "刷新快照"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="grid gap-5">
                <div className="flex flex-wrap gap-2">
                  {FILTER_KINDS.map((kind) => (
                    <Button
                      key={kind}
                      type="button"
                      size="sm"
                      variant={kind === activeKind ? "default" : "outline"}
                      className={cn(
                        "rounded-full px-4",
                        kind !== activeKind &&
                          "border-blue-100 bg-white text-slate-700 hover:bg-blue-50 hover:text-blue-700",
                      )}
                      onClick={() => setActiveKind(kind)}
                    >
                      {FILTER_LABELS[kind]}
                    </Button>
                  ))}
                </div>

                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.currentTarget.value)}
                    placeholder="按名称、路径、agent 或标签搜索"
                    className="h-12 rounded-2xl border-blue-100 bg-white/85 pl-11 shadow-none"
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <FocusChip label="当前资源" value={`${visibleResources.length}`} />
                  <FocusChip label="当前根目录" value={`${visibleRoots.length}`} />
                  <FocusChip
                    label="异常数量"
                    value={`${visibleResources.filter((item) => item.status === "broken").length}`}
                  />
                </div>
              </CardContent>
            </Card>

            {feedback ? (
              <Alert className="border-blue-200 bg-blue-50/80 text-blue-900">
                <ShieldCheck className="size-4" />
                <AlertTitle>操作完成</AlertTitle>
                <AlertDescription>{feedback}</AlertDescription>
              </Alert>
            ) : null}

            {error ? (
              <Alert variant="destructive" className="border-red-200 bg-red-50/80">
                <AlertCircle className="size-4" />
                <AlertTitle>操作失败</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <Card className="border-white/70 bg-white/94 shadow-[0_24px_72px_rgba(37,99,235,0.08)]">
              <CardHeader className="gap-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <CardDescription className="text-[11px] tracking-[0.24em] text-blue-700 uppercase">
                      Resource Matrix
                    </CardDescription>
                    <CardTitle className="mt-2 text-2xl text-slate-950 [font-family:var(--font-display)]">
                      统一资源视图
                    </CardTitle>
                    <CardDescription className="mt-2 text-sm leading-6 text-slate-600">
                      当前视图里保留了路径打开、状态标记和 link target。后续要扩成批量治理也不需要推倒重来。
                    </CardDescription>
                  </div>
                  <Badge
                    variant="outline"
                    className="w-fit border-blue-200 bg-blue-50 px-3 py-1 text-blue-700"
                  >
                    {visibleResources.length} items
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="px-0">
                {visibleResources.length > 0 ? (
                  <ScrollArea className="h-[760px]">
                    <div className="min-w-[940px] px-6 pb-6">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-blue-100/80 hover:bg-transparent">
                            <TableHead className="w-[26%]">资源</TableHead>
                            <TableHead className="w-[10%]">类型</TableHead>
                            <TableHead className="w-[15%]">Agent</TableHead>
                            <TableHead className="w-[27%]">位置</TableHead>
                            <TableHead className="w-[12%]">状态</TableHead>
                            <TableHead className="w-[10%] text-right">动作</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {visibleResources.map((resource) => (
                            <ResourceRow
                              key={resource.id}
                              resource={resource}
                              onOpen={openPath}
                            />
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="px-6 pb-6">
                    <div className="rounded-[1.6rem] border border-dashed border-blue-200 bg-blue-50/60 p-8 text-sm leading-7 text-slate-600">
                      没有匹配到资源。可以切换筛选条件，或者清空搜索词再看完整视图。
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </main>
  );
}

function SummaryCard({ summary }: { summary: KindSummary }) {
  const meta = KIND_META[summary.kind];
  const Icon = meta.icon;

  return (
    <Card className="overflow-hidden border-white/70 bg-white/82 shadow-[0_18px_50px_rgba(37,99,235,0.08)]">
      <CardContent className="relative p-0">
        <div className={cn("absolute inset-0 bg-gradient-to-br", meta.tint)} />
        <div className="relative grid gap-4 p-5">
          <div className="flex items-start justify-between gap-4">
            <Badge variant="outline" className="border-white/80 bg-white/70 text-slate-700">
              {meta.shortLabel}
            </Badge>
            <div className="rounded-2xl border border-white/80 bg-white/80 p-2 text-blue-700">
              <Icon className="size-4" />
            </div>
          </div>
          <div>
            <div className="text-4xl font-semibold tracking-[-0.04em] text-slate-950">
              {summary.count}
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {summary.rootCount} 个根目录
              {summary.brokenCount > 0 ? ` · ${summary.brokenCount} 个异常` : " · 状态正常"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SignalPill({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone: "good" | "alert" | "neutral";
}) {
  const iconWrapClass =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "alert"
        ? "border-red-200 bg-red-50 text-red-700"
        : "border-blue-200 bg-white/80 text-blue-700";

  return (
    <div className="flex items-center gap-3 rounded-[1.35rem] border border-white/70 bg-white/70 px-4 py-3 shadow-[0_12px_32px_rgba(37,99,235,0.05)] backdrop-blur">
      <div className={cn("rounded-2xl border p-2", iconWrapClass)}>
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs tracking-[0.18em] text-slate-500 uppercase">{label}</p>
        <p className="truncate text-sm font-medium text-slate-900">{value}</p>
      </div>
    </div>
  );
}

function MetricBlock({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[1.35rem] border border-blue-100 bg-slate-50/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]",
        compact && "bg-blue-50/70",
      )}
    >
      <p className="text-xs tracking-[0.18em] text-slate-500 uppercase">{label}</p>
      <p className="mt-2 break-all text-sm font-medium leading-6 text-slate-900">{value}</p>
    </div>
  );
}

function FocusChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.35rem] border border-blue-100 bg-slate-50/75 px-4 py-3">
      <p className="text-xs tracking-[0.18em] text-slate-500 uppercase">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function RootListItem({
  root,
  onOpen,
}: {
  root: RootRecord;
  onOpen: (path: string) => Promise<void>;
}) {
  const meta = KIND_META[root.kind];

  return (
    <div className="rounded-[1.45rem] border border-blue-100 bg-slate-50/70 p-4 shadow-[0_10px_22px_rgba(37,99,235,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-blue-200 bg-white text-blue-700">
              {meta.label}
            </Badge>
            {root.brokenCount > 0 ? (
              <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                {root.brokenCount} 异常
              </Badge>
            ) : null}
          </div>
          <p className="mt-3 truncate text-sm font-semibold text-slate-950">{root.label}</p>
          <p className="mt-1 text-xs text-slate-500">{root.agentName}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="rounded-xl text-blue-700 hover:bg-blue-50 hover:text-blue-700"
          onClick={() => void onOpen(root.path)}
        >
          打开
        </Button>
      </div>
      <Separator className="my-3 bg-blue-100" />
      <div className="grid gap-2">
        <p className="break-all text-xs leading-6 text-slate-500">{root.path}</p>
        <div className="flex items-center gap-3 text-xs text-slate-600">
          <span>{root.resourceCount} 个资源</span>
          <span>{root.brokenCount} 个异常</span>
        </div>
      </div>
    </div>
  );
}

function ResourceRow({
  resource,
  onOpen,
}: {
  resource: ResourceRecord;
  onOpen: (path: string) => Promise<void>;
}) {
  const meta = KIND_META[resource.kind];
  const status = STATUS_META[resource.status];

  return (
    <TableRow className="border-blue-100/70 hover:bg-blue-50/40">
      <TableCell className="align-top">
        <div className="grid gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-950">{resource.name}</span>
            <Badge variant="outline" className="border-blue-100 bg-white text-slate-600">
              {meta.label}
            </Badge>
          </div>
          <p className="text-sm leading-6 text-slate-500">
            {resource.detail ?? resource.rootLabel}
          </p>
        </div>
      </TableCell>
      <TableCell className="align-top text-sm text-slate-600">
        <div className="flex items-center gap-2">
          <meta.icon className="size-4 text-blue-600" />
          {meta.shortLabel}
        </div>
      </TableCell>
      <TableCell className="align-top text-sm text-slate-600">
        <div className="grid gap-1">
          <span className="font-medium text-slate-900">{resource.agentName}</span>
          <span className="text-slate-500">{resource.rootLabel}</span>
        </div>
      </TableCell>
      <TableCell className="align-top">
        <div className="grid gap-2 text-sm">
          <button
            className="w-fit break-all text-left font-medium text-blue-700 hover:underline"
            onClick={() => void onOpen(resource.path)}
          >
            {resource.relativePath || resource.path}
          </button>
          <p className="break-all text-xs leading-6 text-slate-500">{resource.path}</p>
          {resource.targetPath ? (
            <p className="break-all text-xs leading-6 text-slate-500">
              Target:{" "}
              <button
                className="font-medium text-blue-700 hover:underline"
                onClick={() => void onOpen(resource.targetPath!)}
              >
                {resource.targetPath}
              </button>
            </p>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="align-top">
        <Badge variant="outline" className={status.className}>
          {status.label}
        </Badge>
      </TableCell>
      <TableCell className="align-top text-right">
        <Button
          size="sm"
          variant="ghost"
          className="rounded-xl text-blue-700 hover:bg-blue-50 hover:text-blue-700"
          onClick={() => void onOpen(resource.path)}
        >
          打开
          <ArrowUpRight className="size-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function getDominantAgent(roots: RootRecord[]) {
  if (roots.length === 0) {
    return "暂无数据";
  }

  const counts = new Map<string, number>();
  for (const root of roots) {
    counts.set(root.agentName, (counts.get(root.agentName) ?? 0) + root.resourceCount);
  }

  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? "暂无数据";
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
  if (reason instanceof Error) {
    return reason.message;
  }

  if (typeof reason === "string") {
    return reason;
  }

  return "发生了未识别错误。";
}

function formatDate(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}
