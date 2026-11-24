import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/server/auth";
import { createAuthenticatedClient } from "@/lib/server/supabaseAdmin";
import { acceptCandidate } from "@/lib/server/libraryIngest";
import type { CandidateRecord } from "@/lib/server/libraryIngest";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const db = createAuthenticatedClient(user.token);
  const { id } = await params;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const { data: candidate, error: candErr } = await db
    .from("identification_candidates")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (candErr || !candidate) {
    return NextResponse.json({ detail: "Candidate not found" }, { status: 404 });
  }

  try {
    const item = await acceptCandidate(db, user.id, candidate as CandidateRecord, {
      title: typeof body.title === "string" ? body.title : undefined,
      creator:
        body.creator !== undefined
          ? (body.creator as string | null)
          : undefined,
      content_type:
        typeof body.content_type === "string" ? body.content_type : undefined,
      subcategory:
        body.subcategory !== undefined
          ? (body.subcategory as string | null)
          : undefined,
      direct_url:
        typeof body.direct_url === "string" ? body.direct_url : undefined,
      release_year:
        typeof body.release_year === "number" ? body.release_year : undefined,
      overview:
        typeof body.overview === "string" ? body.overview : undefined,
      cover_image_url:
        typeof body.cover_image_url === "string" ? body.cover_image_url : undefined,
      consumption_status:
        typeof body.consumption_status === "string"
          ? body.consumption_status
          : undefined,
    });

    if (!item) {
      return NextResponse.json(
        { detail: "Could not create a library item from this candidate" },
        { status: 500 }
      );
    }

    return NextResponse.json(item);
  } catch (err: unknown) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Accept failed" },
      { status: 500 }
    );
  }
}
