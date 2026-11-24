import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/server/auth";

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    id: user.id,
    email: user.email || "user@mediamind.local",
    display_name: user.email ? user.email.split("@")[0] : "MediaMind User",
  });
}
