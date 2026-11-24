"use server";

import { createAuthenticatedClient } from "@/lib/server/supabaseAdmin";
import { revalidatePath } from "next/cache";

export async function fetchLibraryItemsAction(userId: string, token?: string) {
  const db = createAuthenticatedClient(token);
  const { data, error } = await db
    .from("library_items")
    .select("*, item_sources(*, source_assets(*))")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

export async function updateLibraryItemAction(
  userId: string,
  itemId: string,
  updates: Record<string, unknown>,
  token?: string
) {
  const db = createAuthenticatedClient(token);
  const { data, error } = await db
    .from("library_items")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/library");
  return data;
}

export async function deleteLibraryItemAction(userId: string, itemId: string, token?: string) {
  const db = createAuthenticatedClient(token);
  const { error } = await db
    .from("library_items")
    .delete()
    .eq("id", itemId)
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
  revalidatePath("/library");
  return { success: true };
}
