import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, createAuthenticatedClient } from "@/lib/server/supabaseAdmin";
import { verifyAccessToken } from "@/lib/server/auth";
import {
  getStorageBucket,
  isInlineDataUrl,
  normalizeStoragePath,
  parseDataUrl,
} from "@/lib/server/storage";

/**
 * Authenticated media proxy.
 *
 * Screenshots are private. This route serves originals (and region crops) to
 * the owner only. It also lets the app render screenshots that were stored
 * inline when Supabase Storage was unavailable, without shipping base64
 * payloads inside list API responses.
 *
 * Auth may arrive as a Bearer header or as a `token` query parameter, because
 * <img src> cannot send custom headers.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const authHeader = req.headers.get("authorization") || "";
  const headerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  const queryToken = req.nextUrl.searchParams.get("token") || "";
  const token = headerToken || queryToken;

  if (!token) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const authUser = await verifyAccessToken(token);
  if (!authUser) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const db = createAuthenticatedClient(token);
  const kind = req.nextUrl.searchParams.get("kind") === "crop" ? "crop" : "original";
  const derivativeId = req.nextUrl.searchParams.get("derivative_id");
  const bucket = getStorageBucket();

  const { data: asset, error: assetError } = await db
    .from("source_assets")
    .select("id, file_path, mime_type")
    .eq("id", id)
    .eq("user_id", authUser.id)
    .maybeSingle();

  if (assetError || !asset) {
    return NextResponse.json({ detail: "Screenshot not found" }, { status: 404 });
  }

  let storagePath: string | null = asset.file_path;
  let mimeType: string = asset.mime_type || "image/jpeg";

  if (kind === "crop") {
    let derivativeQuery = db
      .from("image_derivatives")
      .select("storage_path, mime_type")
      .eq("source_asset_id", id)
      .eq("user_id", authUser.id)
      .eq("derivative_type", "region_crop")
      .order("created_at", { ascending: false })
      .limit(1);

    if (derivativeId) {
      derivativeQuery = derivativeQuery.eq("id", derivativeId);
    }

    const { data: derivatives } = await derivativeQuery;
    const derivative = derivatives?.[0];
    if (!derivative?.storage_path) {
      return NextResponse.json({ detail: "Crop not found" }, { status: 404 });
    }
    storagePath = derivative.storage_path;
    mimeType = derivative.mime_type || "image/jpeg";
  }

  if (!storagePath) {
    return NextResponse.json({ detail: "Screenshot not found" }, { status: 404 });
  }

  if (isInlineDataUrl(storagePath)) {
    const parsed = parseDataUrl(storagePath);
    if (!parsed) {
      return NextResponse.json({ detail: "Stored image is invalid" }, { status: 422 });
    }
    return new NextResponse(new Uint8Array(parsed.buffer), {
      status: 200,
      headers: {
        "Content-Type": parsed.mimeType,
        "Content-Length": String(parsed.buffer.length),
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  // Signing a private object requires a privileged client; ownership was
  // already enforced by the query above, so the service role cannot leak
  // another user's file here.
  // Stream the object back instead of redirecting to a signed URL. The
  // redirect cost a second round trip for every screenshot and produced a new,
  // unchanging-per-hour URL for the browser to re-download; a stable response
  // with a long private cache makes repeat views free.
  const { data: fileData, error: downloadError } = await getSupabaseAdmin().storage
    .from(bucket)
    .download(normalizeStoragePath(storagePath, bucket));

  if (downloadError || !fileData) {
    return NextResponse.json(
      { detail: "Screenshot is temporarily unavailable" },
      { status: 404 }
    );
  }

  const body = new Uint8Array(await fileData.arrayBuffer());
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(body.length),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
