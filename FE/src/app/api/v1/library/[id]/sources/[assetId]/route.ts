import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/server/auth";
import { createAuthenticatedClient } from "@/lib/server/supabaseAdmin";
import crypto from "crypto";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; assetId: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const db = createAuthenticatedClient(user.token);
  const { id: library_item_id, assetId: source_asset_id } = await params;

  // Enforce explicit ownership on both the library item and the source asset
  // even when the server client uses the service-role key.
  const [{ data: ownedItem }, { data: ownedAsset }] = await Promise.all([
    db
      .from("library_items")
      .select("id")
      .eq("id", library_item_id)
      .eq("user_id", user.id)
      .maybeSingle(),
    db
      .from("source_assets")
      .select("id")
      .eq("id", source_asset_id)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (!ownedItem || !ownedAsset) {
    return NextResponse.json(
      { detail: "That library item or screenshot no longer exists." },
      { status: 404 }
    );
  }

  // A duplicate link is a normal user mistake, not a server error. The
  // uniqueness constraint only covers (library_item_id, source_asset_id), so
  // confirm reachability with a friendly 409 before attempting the insert.
  const { data: existing, error: lookupError } = await db
    .from("item_sources")
    .select("id")
    .eq("library_item_id", library_item_id)
    .eq("source_asset_id", source_asset_id)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json({ detail: lookupError.message }, { status: 500 });
  }
  if (existing) {
    return NextResponse.json(
      { detail: "This screenshot is already attached to this item." },
      { status: 409 }
    );
  }

  const { error } = await db.from("item_sources").insert({
    id: crypto.randomUUID(),
    library_item_id,
    source_asset_id,
    created_at: new Date().toISOString(),
  });

  if (error) {
    // Concurrent insert or a database-level unique violation.
    if (error.code === "23505" || /duplicate key/i.test(error.message)) {
      return NextResponse.json(
        { detail: "This screenshot is already attached to this item." },
        { status: 409 }
      );
    }
    if (error.code === "23503" || /foreign key/i.test(error.message)) {
      return NextResponse.json(
        { detail: "That library item or screenshot no longer exists." },
        { status: 404 }
      );
    }
    return NextResponse.json({ detail: error.message }, { status: 500 });
  }

  return NextResponse.json({
    status: "linked",
    library_item_id,
    source_asset_id,
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; assetId: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const db = createAuthenticatedClient(user.token);
  const { id: library_item_id, assetId: source_asset_id } = await params;

  const { data: ownedItem } = await db
    .from("library_items")
    .select("id")
    .eq("id", library_item_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!ownedItem) {
    return NextResponse.json({ detail: "Library item not found" }, { status: 404 });
  }

  const { data: deleted, error } = await db
    .from("item_sources")
    .delete()
    .eq("library_item_id", library_item_id)
    .eq("source_asset_id", source_asset_id)
    .select("id");

  if (error) {
    return NextResponse.json({ detail: error.message }, { status: 500 });
  }
  if (!deleted || deleted.length === 0) {
    return NextResponse.json({ detail: "Source association not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, message: "Source unlinked" });
}
