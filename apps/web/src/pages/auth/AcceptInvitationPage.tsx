import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../lib/auth-context.js";
import { supabase } from "../../lib/supabase.js";

export function AcceptInvitationPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();
  const { session, user } = useAuth();

  const [invitationInfo, setInvitationInfo] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setErrorMsg("Invitation token is missing from URL.");
      setIsLoading(false);
      return;
    }

    fetch(`/api/v1/auth/invitations/verify?token=${encodeURIComponent(token)}`)
      .then((res) => res.json())
      .then((res) => {
        if (res.error) {
          setErrorMsg(res.error.message || "Failed to verify invitation.");
        } else if (!res.data?.isValid) {
          if (res.data?.isExpired) setErrorMsg("This invitation has expired.");
          else if (res.data?.isAccepted) setErrorMsg("This invitation has already been accepted.");
          else if (res.data?.isRevoked) setErrorMsg("This invitation was revoked.");
          else setErrorMsg("Invalid invitation.");
        } else {
          setInvitationInfo(res.data);
        }
      })
      .catch((err) => {
        setErrorMsg(err.message || "Network error verifying invitation");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [token]);

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      // 1. If not logged in, sign up with the invited email and provided password
      let activeToken = session?.access_token;

      if (!activeToken) {
        const { data: authData, error: signUpError } = await supabase.auth.signUp({
          email: invitationInfo.email,
          password,
        });

        if (signUpError || !authData.session) {
          throw new Error(
            signUpError?.message ||
              "Could not establish session. Please sign in or check your email verification."
          );
        }

        activeToken = authData.session.access_token;
      }

      // 2. Accept invitation via API
      const acceptRes = await fetch("/api/v1/auth/invitations/accept", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${activeToken}`,
        },
        body: JSON.stringify({ token }),
      });

      const acceptPayload = await acceptRes.json();

      if (!acceptRes.ok || acceptPayload.error) {
        throw new Error(acceptPayload.error?.message || "Failed to accept invitation");
      }

      // 3. Route to the accepted portal
      const portal = acceptPayload.data?.portal || invitationInfo?.portal || "operations";
      navigate(`/${portal}`, { replace: true });
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to accept invitation");
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-100 p-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-100 p-4">
      <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
            Accept Workspace Invitation
          </h1>
          {invitationInfo?.tenant?.name && (
            <p className="mt-1 text-sm text-neutral-600">
              You have been invited to join <strong>{invitationInfo.tenant.name}</strong> as{" "}
              <strong>{invitationInfo.role?.display_name || invitationInfo.portal}</strong>
            </p>
          )}
        </div>

        {errorMsg && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
            {errorMsg}
          </div>
        )}

        {invitationInfo?.isValid ? (
          <form onSubmit={handleAccept} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700">Invited Email</label>
              <input
                type="text"
                disabled
                value={invitationInfo.email}
                className="mt-1 block w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500"
              />
            </div>

            {!user && (
              <div>
                <label className="block text-sm font-medium text-neutral-700">
                  Create Account Password
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                  placeholder="Choose a strong password"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:opacity-50"
            >
              {isSubmitting ? "Accepting..." : "Join Workspace"}
            </button>
          </form>
        ) : (
          <div className="text-center">
            <Link to="/login" className="text-sm font-medium text-blue-600 hover:text-blue-500">
              Return to Login
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
