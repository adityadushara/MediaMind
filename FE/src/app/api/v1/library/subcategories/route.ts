import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/server/auth";
import { createAuthenticatedClient } from "@/lib/server/supabaseAdmin";
import { missingColumnFromError } from "@/lib/server/schemaFallback";

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const db = createAuthenticatedClient(user.token);
  const { searchParams } = new URL(req.url);
  const contentType = searchParams.get("content_type");

  let query = db
    .from("library_items")
    .select("subcategory")
    .eq("user_id", user.id)
    .not("subcategory", "is", null);

  if (contentType) {
    query = query.eq("content_type", contentType);
  }

  const { data, error } = await query;
  if (error) {
    // Older databases may not have the subcategory column yet.
    if (missingColumnFromError(error)) {
      return NextResponse.json([]);
    }
    return NextResponse.json({ detail: error.message }, { status: 500 });
  }

  const subcats = Array.from(
    new Set(
      (data || [])
        .map((row: { subcategory?: string | null }) => row.subcategory)
        .filter(Boolean)
    )
  ).sort();

  return NextResponse.json(subcats);
}
