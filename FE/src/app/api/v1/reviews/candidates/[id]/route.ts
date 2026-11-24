import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/server/auth";
import { createAuthenticatedClient } from "@/lib/server/supabaseAdmin";
import { buildMediaProxyUrl, redactInlineDataUrls } from "@/lib/server/storage";

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
  const { data: candidate, error } = await db
    .from("identification_candidates")
    .select("*, source_assets(*), image_derivatives(*)")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !candidate) {
    return NextResponse.json({ detail: "Candidate not found" }, { status: 404 });
  }

  const cropSignedUrl = candidate.source_asset_id
    ? buildMediaProxyUrl(candidate.source_asset_id, "crop", candidate.derivative_id || null)
    : "";
  const sourceSignedUrl = candidate.source_asset_id
    ? buildMediaProxyUrl(candidate.source_asset_id, "original")
    : "";

  const providers = Array.isArray(candidate.provider_candidates)
    ? (candidate.provider_candidates as Array<Record<string, unknown>>)
    : [];
  const provider = providers[0] || {};

  return NextResponse.json(
    redactInlineDataUrls({
      ...candidate,
      suggested_subcategory:
        candidate.suggested_subcategory ?? provider.suggested_subcategory ?? null,
      direct_url: candidate.direct_url ?? provider.direct_url ?? null,
      crop_signed_url: cropSignedUrl,
      source_signed_url: sourceSignedUrl,
    })
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const db = createAuthenticatedClient(user.token);
  const { id } = await params;
  try {
    const body = await req.json();

    const allowedFields = [
      "suggested_title",
      "suggested_creator",
      "suggested_type",
      "suggested_subcategory",
      "direct_url",
      "description_clue",
      "year_clue",
      "confidence_score",
      "evidence_text",
      "bounding_box",
      "uncertainty_reasons",
      "review_status",
    ] as const;

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) updates[field] = body[field];
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { detail: "No editable fields were provided" },
        { status: 400 }
      );
    }

    const { data: updated, error } = await db
      .from("identification_candidates")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ detail: error.message }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json({ detail: "Candidate not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (err: unknown) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Update failed" },
      { status: 400 }
    );
  }
}
