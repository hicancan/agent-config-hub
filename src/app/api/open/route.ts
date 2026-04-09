import { NextResponse } from "next/server";
import { openInExplorer } from "@/lib/server/powershell";
import { fileExists, getUserHome, normalizePath } from "@/lib/server/shared";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { path?: string };
    const targetPath = body.path?.trim();

    if (!targetPath) {
      return NextResponse.json({ message: "缺少 path" }, { status: 400 });
    }

    const home = normalizePath(getUserHome()).toLowerCase();
    const normalizedTarget = normalizePath(targetPath).toLowerCase();

    if (!normalizedTarget.startsWith(home)) {
      return NextResponse.json({ message: "仅允许打开当前用户目录下的资源" }, { status: 403 });
    }

    if (!(await fileExists(targetPath))) {
      return NextResponse.json({ message: "目标路径不存在" }, { status: 404 });
    }

    await openInExplorer(targetPath);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "打开路径失败";
    return NextResponse.json({ message }, { status: 500 });
  }
}

