import { NextResponse } from "next/server";
import { installResourceToRoot } from "@/lib/server/resource-actions";
import { resourceInstallRequestSchema } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const parsed = resourceInstallRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { message: parsed.error.issues[0]?.message ?? "请求参数无效" },
        { status: 400 },
      );
    }

    const result = await installResourceToRoot(
      parsed.data.resourceId,
      parsed.data.destinationRootId,
    );

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "资源安装失败";
    return NextResponse.json({ message }, { status: 500 });
  }
}
