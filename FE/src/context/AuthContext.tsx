"use client";

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from "react";
import { User, Session, AuthError } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { setCachedAccessToken } from "@/lib/api";

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isConfigured: boolean;
  isAuthModalOpen: boolean;
  authModalMode: "signin" | "signup";
  openAuthModal: (mode?: "signin" | "signup") => void;
  closeAuthModal: () => void;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | Error | null }>;
  signUp: (
    email: string,
    password: string,
    displayName?: string
  ) => Promise<{ error: AuthError | Error | null; data: { user: User | null; session: Session | null } | null }>;
  signOut: () => Promise<void>;
}

const defaultAuthContext: AuthContextType = {
  user: null,
  session: null,
  isLoading: false,
  isConfigured: false,
  isAuthModalOpen: false,
  authModalMode: "signin",
  openAuthModal: () => {},
  closeAuthModal: () => {},
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null, data: null }),
  signOut: async () => {},
};

const AuthContext = createContext<AuthContextType>(defaultAuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<"signin" | "signup">("signin");

  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      if (!isSupabaseConfigured) {
        if (isMounted) setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.warn("Error fetching Supabase session:", error.message);
        }
        if (isMounted) {
          setCachedAccessToken(data.session?.access_token || null);
          setSession(data.session);
          setUser(data.session?.user ?? null);
          setIsLoading(false);
        }
      } catch (err) {
        console.warn("Failed to initialize auth session:", err);
        if (isMounted) setIsLoading(false);
      }
    }

    initAuth();

    if (!isSupabaseConfigured) return;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (!isMounted) return;
      setCachedAccessToken(currentSession?.access_token || null);
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const openAuthModal = useCallback((mode: "signin" | "signup" = "signin") => {
    setAuthModalMode(mode);
    setIsAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setIsAuthModalOpen(false);
  }, []);

  const signIn = useCallback(
    async (email: string, password: string): Promise<{ error: AuthError | Error | null }> => {
      if (!isSupabaseConfigured) {
        return {
          error: new Error("Supabase is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and ANON key."),
        };
      }
      try {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (!error) {
          closeAuthModal();
        }
        return { error };
      } catch (err) {
        return { error: err instanceof Error ? err : new Error("Sign in failed") };
      }
    },
    [closeAuthModal]
  );

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      displayName?: string
    ): Promise<{
      error: AuthError | Error | null;
      data: { user: User | null; session: Session | null } | null;
    }> => {
      if (!isSupabaseConfigured) {
        return {
          error: new Error("Supabase is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and ANON key."),
          data: null,
        };
      }
      if (!displayName || !displayName.trim()) {
        return {
          error: new Error("Please enter your full name."),
          data: null,
        };
      }
      try {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              display_name: displayName.trim(),
            },
          },
        });
        if (error) {
          return { error, data: null };
        }
        if (data.session) {
          closeAuthModal();
          return { error: null, data };
        }
        // If session was not directly returned, attempt immediate direct sign-in so user does not need to verify email
        const signInRes = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInRes.data?.session) {
          closeAuthModal();
          return { error: null, data: signInRes.data };
        }
        return { error: signInRes.error || null, data };
      } catch (err) {
        return {
          error: err instanceof Error ? err : new Error("Sign up failed"),
          data: null,
        };
      }
    },
    [closeAuthModal]
  );

  const signOut = useCallback(async () => {
    setCachedAccessToken(null);
    if (!isSupabaseConfigured) {
      setUser(null);
      setSession(null);
      return;
    }
    try {
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
    } catch (err) {
      console.warn("Sign out error:", err);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      session,
      isLoading,
      isConfigured: isSupabaseConfigured,
      isAuthModalOpen,
      authModalMode,
      openAuthModal,
      closeAuthModal,
      signIn,
      signUp,
      signOut,
    }),
    [
      user,
      session,
      isLoading,
      isAuthModalOpen,
      authModalMode,
      openAuthModal,
      closeAuthModal,
      signIn,
      signUp,
      signOut,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  return context ?? defaultAuthContext;
}
