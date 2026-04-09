"use client";

import { useDeferredValue, useState, useTransition } from "react";
import type { KindSummary, ResourceKind, ResourceRecord, RootRecord, WorkspaceSnapshot } from "@/lib/types";
import styles from "./dashboard.module.css";

const KIND_LABELS: Record<ResourceKind | "all", string> = {
  all: "全部",
  skill: "Skills",
  rule: "Rules",
  mcp: "MCP",
};

const STATUS_LABELS: Record<ResourceRecord["status"], string> = {
  source: "Source",
  linked: "Junction",
  broken: "Broken",
  file: "File",
  config: "Config",
  directory: "Directory",
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
  const timestamp = formatDate(snapshot.generatedAt);

  async function refresh() {
    setError("");
    setFeedback("");

    startTransition(async () => {
      try {
        const response = await fetch("/api/snapshot", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(await readError(response));
        }
        const next = (await response.json()) as WorkspaceSnapshot;
        setSnapshot(next);
        setFeedback("已刷新本地资源清单。");
      } catch (reason) {
        setError(normalizeError(reason));
      }
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
    <main className={styles.shell}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>Local Agent Inventory</p>
          <h1>一个面向本机 agent 生态的 web 控制台。</h1>
          <p className={styles.heroText}>
            这版从一开始就把 <strong>skills</strong>、<strong>rules</strong>、<strong>mcp</strong> 放在同一张图里看。
            服务端直接扫描你的本机目录，客户端只负责筛选、浏览和打开路径。
          </p>
        </div>

        <div className={styles.summaryGrid}>
          {snapshot.summaries.map((summary) => (
            <SummaryCard key={summary.kind} summary={summary} />
          ))}
        </div>
      </section>

      <section className={styles.toolbar}>
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.kicker}>Workspace</p>
              <h2>本地概况</h2>
            </div>
            <button onClick={() => void openPath(snapshot.userHome)}>打开用户目录</button>
          </div>
          <div className={styles.metaGrid}>
            <div>
              <span>用户目录</span>
              <strong>{snapshot.userHome}</strong>
            </div>
            <div>
              <span>扫描时间</span>
              <strong>{timestamp}</strong>
            </div>
            <div>
              <span>资源总数</span>
              <strong>{snapshot.resources.length}</strong>
            </div>
            <div>
              <span>根目录数</span>
              <strong>{snapshot.roots.length}</strong>
            </div>
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.kicker}>Filters</p>
              <h2>浏览器</h2>
            </div>
            <button onClick={() => void refresh()} disabled={isPending}>
              {isPending ? "刷新中..." : "刷新快照"}
            </button>
          </div>
          <div className={styles.kindTabs}>
            {(["all", "skill", "rule", "mcp"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                className={kind === activeKind ? styles.kindTabActive : styles.kindTab}
                onClick={() => setActiveKind(kind)}
              >
                {KIND_LABELS[kind]}
              </button>
            ))}
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="按名称、路径、agent 或状态搜索"
          />
          <p className={styles.microcopy}>当前显示 {visibleResources.length} 个资源，跨 3 类本地配置。</p>
        </div>
      </section>

      {feedback ? <div className={styles.bannerSuccess}>{feedback}</div> : null}
      {error ? <div className={styles.bannerError}>{error}</div> : null}

      <section className={styles.sectionHeader}>
        <div>
          <p className={styles.kicker}>Resource Stream</p>
          <h2>统一资源视图</h2>
        </div>
      </section>

      <section className={styles.resourceGrid}>
        {visibleResources.map((resource) => (
          <article key={resource.id} className={styles.resourceCard}>
            <div className={styles.resourceTop}>
              <div>
                <p className={styles.resourceKind}>{KIND_LABELS[resource.kind]}</p>
                <h3>{resource.name}</h3>
              </div>
              <span className={`${styles.status} ${styles[`status_${resource.status}`]}`}>{STATUS_LABELS[resource.status]}</span>
            </div>

            <p className={styles.resourceMeta}>
              {resource.agentName} · {resource.relativePath}
            </p>

            {resource.detail ? <p className={styles.detail}>{resource.detail}</p> : null}

            <div className={styles.pathBlock}>
              <span>Path</span>
              <button className={styles.linkButton} onClick={() => void openPath(resource.path)}>
                {resource.path}
              </button>
            </div>

            {resource.targetPath ? (
              <div className={styles.pathBlock}>
                <span>Target</span>
                <button className={styles.linkButton} onClick={() => void openPath(resource.targetPath!)}>
                  {resource.targetPath}
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </section>

      <section className={styles.sectionHeader}>
        <div>
          <p className={styles.kicker}>Root Inventory</p>
          <h2>根目录分布</h2>
        </div>
      </section>

      <section className={styles.rootGrid}>
        {visibleRoots.map((root) => (
          <RootCard key={root.id} root={root} onOpen={openPath} />
        ))}
      </section>
    </main>
  );
}

function SummaryCard({ summary }: { summary: KindSummary }) {
  return (
    <article className={styles.summaryCard}>
      <span>{KIND_LABELS[summary.kind]}</span>
      <strong>{summary.count}</strong>
      <p>
        {summary.rootCount} 个根目录
        {summary.brokenCount > 0 ? ` · ${summary.brokenCount} 个异常` : " · 状态正常"}
      </p>
    </article>
  );
}

function RootCard({ root, onOpen }: { root: RootRecord; onOpen: (path: string) => Promise<void> }) {
  return (
    <article className={styles.rootCard}>
      <div className={styles.rootTop}>
        <div>
          <p className={styles.resourceKind}>{KIND_LABELS[root.kind]}</p>
          <h3>{root.label}</h3>
        </div>
        <button className={styles.secondaryButton} onClick={() => void onOpen(root.path)}>
          打开
        </button>
      </div>
      <p className={styles.resourceMeta}>{root.path}</p>
      <div className={styles.rootStats}>
        <span>{root.resourceCount} 个资源</span>
        <span>{root.brokenCount} 个异常</span>
      </div>
    </article>
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
