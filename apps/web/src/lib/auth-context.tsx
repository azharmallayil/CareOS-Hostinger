import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { User, Session } from "@careos/supabase-client";
import type { CareOSAuthContext, CareOSMembership, CareOSUser } from "@careos/auth";
import { supabase } from "./supabase.js";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: CareOSUser | null;
  authContext: CareOSAuthContext | null;
  activeMembership: CareOSMembership | null;
  isPlatformAdmin: boolean;
  isLoading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<{ error?: string }>;
  updatePassword: (password: string) => Promise<{ error?: string }>;
  switchTenant: (tenantId: string) => Promise<boolean>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authContext, setAuthContext] = useState<CareOSAuthContext | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch full application auth context from API or DB
  const fetchAuthContext = useCallback(async (currentSession: Session | null) => {
    if (!currentSession) {
      setAuthContext(null);
      return;
    }

    try {
      const response = await fetch("/api/v1/auth/me", {
        headers: {
          Authorization: `Bearer ${currentSession.access_token}`,
        },
      });

      if (response.ok) {
        const payload = await response.json();
        setAuthContext(payload.data);
      } else {
        // Fallback: direct Supabase query if running standalone
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", currentSession.user.id)
          .maybeSingle();

        const { data: adminRecord } = await supabase
          .from("platform_admins")
          .select("id")
          .eq("user_id", currentSession.user.id)
          .maybeSingle();

        const { data: memberships } = await supabase
          .from("tenant_memberships")
          .select("*, tenants(id, name, slug)")
          .eq("user_id", currentSession.user.id)
          .eq("is_active", true);

        const memList: CareOSMembership[] = (memberships || []).map((m: any) => ({
          id: m.id,
          tenantId: m.tenant_id,
          tenantSlug: m.tenants?.slug || "",
          tenantName: m.tenants?.name || "",
          portal: m.portal,
          departmentId: m.department_id,
          isActive: m.is_active,
          roles: [],
          permissions: [],
        }));

        setAuthContext({
          user: {
            id: currentSession.user.id,
            email: currentSession.user.email || "",
            fullName: profile?.full_name || currentSession.user.email || "CareOS User",
            avatarUrl: profile?.avatar_url,
            preferredLanguage: profile?.preferred_language || "en",
          },
          memberships: memList,
          activeMembership: memList[0] || null,
          activeTenantId: memList[0]?.tenantId || null,
          isPlatformAdmin: Boolean(adminRecord),
        });
      }
    } catch (err: any) {
      console.error("Failed to load user auth context", err);
      setError(err.message || "Failed to load session details");
    }
  }, []);

  useEffect(() => {
    // 1. Initial session retrieval
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      void fetchAuthContext(initialSession).finally(() => setIsLoading(false));
    });

    // 2. Listen for auth state changes (login, logout, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      await fetchAuthContext(newSession);
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchAuthContext]);

  const signIn = async (email: string, password: string) => {
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
      setError(signInError.message);
      return { error: signInError.message };
    }
    return {};
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setAuthContext(null);
  };

  const sendPasswordReset = async (email: string) => {
    setError(null);
    const redirectUrl = `${window.location.origin}/reset-password`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    });
    if (resetError) {
      setError(resetError.message);
      return { error: resetError.message };
    }
    return {};
  };

  const updatePassword = async (password: string) => {
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      return { error: updateError.message };
    }
    return {};
  };

  const switchTenant = async (tenantId: string) => {
    if (!session) return false;

    try {
      const response = await fetch("/api/v1/auth/switch-tenant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ tenantId }),
      });

      if (response.ok) {
        const payload = await response.json();
        setAuthContext(payload.data);
        return true;
      }
    } catch {
      // Fallback local switch
    }

    if (authContext) {
      const targetMem = authContext.memberships.find(
        (m) => m.tenantId === tenantId && m.isActive
      );
      if (targetMem) {
        setAuthContext({
          ...authContext,
          activeTenantId: tenantId,
          activeMembership: targetMem,
        });
        return true;
      }
    }

    return false;
  };

  const refreshSession = async () => {
    const {
      data: { session: refreshed },
    } = await supabase.auth.getSession();
    setSession(refreshed);
    setUser(refreshed?.user ?? null);
    await fetchAuthContext(refreshed);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile: authContext?.user ?? null,
        authContext,
        activeMembership: authContext?.activeMembership ?? null,
        isPlatformAdmin: Boolean(authContext?.isPlatformAdmin),
        isLoading,
        error,
        signIn,
        signOut,
        sendPasswordReset,
        updatePassword,
        switchTenant,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
