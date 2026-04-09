import { NextResponse } from "next/server";
import { openInExplorer } from "@/lib/server/powershell";
import { fileExists, getUserHome, normalizePath } from "@/lib/server/shared";
import { openPathRequestSchema } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const parsed = openPathRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "请求参数无效" }, { status: 400 });
    }
    const targetPath = parsed.data.path;

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
