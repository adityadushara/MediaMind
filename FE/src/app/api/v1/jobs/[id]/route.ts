import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/server/auth";
import { createAuthenticatedClient } from "@/lib/server/supabaseAdmin";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const db = createAuthenticatedClient(user.token);
  const { id } = await params;
  const { data: job, error } = await db
    .from("processing_jobs")
    .select("*, source_assets(*), identification_candidates(*)")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !job) {
    return NextResponse.json({ detail: "Job not found" }, { status: 404 });
  }

  return NextResponse.json(job);
}
