import { NextResponse } from "next/server";
import { getWorkspaceSnapshot } from "@/lib/server/snapshot";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await getWorkspaceSnapshot();
    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "无法生成本地资源快照";
    return NextResponse.json({ message }, { status: 500 });
  }
}

