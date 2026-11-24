import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { getSupabaseAdmin } from "./supabaseAdmin";

export interface AuthenticatedUser {
  id: string;
  email?: string;
  token?: string;
}

/**
 * Token verification is a network round trip to Supabase Auth, and every API
 * call made one — three per dashboard render, plus one per screenshot image.
 * A verified token is cached per serverless instance for a minute: it saves the
 * hop without meaningfully delaying revocation.
 */
const VERIFIED_TOKEN_TTL_MS = 60_000;
const MAX_CACHED_TOKENS = 500;
const verifiedTokens = new Map<string, { at: number; user: AuthenticatedUser }>();

function tokenKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function verifyAccessToken(token: string): Promise<AuthenticatedUser | null> {
  if (!token) return null;

  const key = tokenKey(token);
  const cached = verifiedTokens.get(key);
  if (cached) {
    if (Date.now() - cached.at < VERIFIED_TOKEN_TTL_MS) {
      return { ...cached.user, token };
    }
    verifiedTokens.delete(key);
  }

  try {
    const { data, error } = await getSupabaseAdmin().auth.getUser(token);
    if (error || !data.user) {
      return null;
    }

    const user: AuthenticatedUser = {
      id: data.user.id,
      email: data.user.email,
      token,
    };

    if (verifiedTokens.size >= MAX_CACHED_TOKENS) {
      verifiedTokens.clear();
    }
    verifiedTokens.set(key, { at: Date.now(), user: { id: user.id, email: user.email } });
    return user;
  } catch {
    return null;
  }
}

export async function getAuthUser(req: NextRequest): Promise<AuthenticatedUser | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.replace("Bearer ", "").trim();
  return verifyAccessToken(token);
}
