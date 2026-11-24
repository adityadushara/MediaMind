import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "./supabaseAdmin";

export interface AuthenticatedUser {
  id: string;
  email?: string;
  token?: string;
}

export async function getAuthUser(req: NextRequest): Promise<AuthenticatedUser | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return null;

  try {
    const { data, error } = await getSupabaseAdmin().auth.getUser(token);
    if (error || !data.user) {
      return null;
    }

    return {
      id: data.user.id,
      email: data.user.email,
      token,
    };
  } catch {
    return null;
  }
}
