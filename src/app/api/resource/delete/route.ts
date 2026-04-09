import { NextResponse } from "next/server";
import { deleteManagedResource } from "@/lib/server/resource-actions";
import { resourceDeleteRequestSchema } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const parsed = resourceDeleteRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { message: parsed.error.issues[0]?.message ?? "请求参数无效" },
        { status: 400 },
      );
    }

    const result = await deleteManagedResource(parsed.data.resourceId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "删除资源失败";
    return NextResponse.json({ message }, { status: 500 });
  }
}
