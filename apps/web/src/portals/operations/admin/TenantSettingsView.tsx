import React, { useEffect, useState } from "react";
import { useAuth } from "../../../lib/auth-context.js";
import { Card, CardHeader } from "../../../components/ui/Card.js";
import { Input } from "../../../components/ui/Input.js";
import { Select } from "../../../components/ui/Select.js";
import { Badge } from "../../../components/ui/Badge.js";
import { Save, Check, RefreshCw } from "lucide-react";

export function TenantSettingsView() {
  const { session, authContext } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState("active");
  const [plan, setPlan] = useState("starter");
  const [primaryColor, setPrimaryColor] = useState("#2563EB");
  const [accentColor, setAccentColor] = useState("#0EA5E9");
  const [timezone, setTimezone] = useState("Asia/Riyadh");
  const [currency, setCurrency] = useState("SAR");
  const [defaultLanguage, setDefaultLanguage] = useState<"en" | "ar">("en");
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [smsNotifications, setSmsNotifications] = useState(true);

  const fetchSettings = () => {
    if (!session?.access_token) return;
    setIsLoading(true);
    setErrorMsg(null);

    fetch("/api/v1/organization/settings", {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "X-Tenant-ID": authContext?.activeTenantId || "",
      },
    })
      .then((res) => res.json())
      .then((payload) => {
        if (payload.error) {
          setErrorMsg(payload.error.message);
        } else if (payload.data) {
          const { tenant, settings } = payload.data;
          setName(tenant.name || "");
          setSlug(tenant.slug || "");
          setStatus(tenant.status || "active");
          setPlan(tenant.plan || "starter");
          setPrimaryColor(settings?.branding?.primaryColor || "#2563EB");
          setAccentColor(settings?.branding?.accentColor || "#0EA5E9");
          setTimezone(settings?.branding?.timezone || "Asia/Riyadh");
          setCurrency(settings?.branding?.currency || "SAR");
          setDefaultLanguage(settings?.branding?.defaultLanguage || "en");
          setEmailNotifications(settings?.notification_config?.emailNotifications ?? true);
          setSmsNotifications(settings?.notification_config?.smsNotifications ?? true);
        }
      })
      .catch((err) => setErrorMsg(err.message))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchSettings();
  }, [session, authContext?.activeTenantId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.access_token) return;
    setIsSaving(true);
    setErrorMsg(null);
    setSaveSuccess(false);

    try {
      const res = await fetch("/api/v1/organization/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          "X-Tenant-ID": authContext?.activeTenantId || "",
        },
        body: JSON.stringify({
          name,
          branding: { primaryColor, accentColor },
          timezone,
          currency,
          defaultLanguage,
          notificationConfig: { emailNotifications, smsNotifications },
        }),
      });

      const payload = await res.json();
      if (!res.ok || payload.error) {
        throw new Error(payload.error?.message || "Failed to update settings");
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-4xl">
      {errorMsg && (
        <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200">
          {errorMsg}
        </div>
      )}

      {saveSuccess && (
        <div className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700 border border-emerald-200 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600" />
          Tenant profile and settings updated successfully.
        </div>
      )}

      {/* Tenant Identity & Plan */}
      <Card>
        <CardHeader
          title="Organization Profile"
          description="Basic organization identity and subscription plan status"
          action={
            <div className="flex items-center gap-2">
              <Badge variant={status === "active" ? "success" : "warning"} dot>
                {status.toUpperCase()}
              </Badge>
              <Badge variant="primary">{plan.toUpperCase()}</Badge>
            </div>
          }
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <Input
            label="Organization Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            hint="Public enterprise name used in customer communication"
          />
          <Input
            label="Workspace Identifier (Slug)"
            value={slug}
            disabled
            hint="Unique URL workspace slug (immutable)"
          />
        </div>
      </Card>

      {/* Branding & Visual Direction */}
      <Card>
        <CardHeader
          title="Branding & Appearance"
          description="Brand styling applied to the Customer Portal and official documents"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">
              Primary Brand Color
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-10 w-12 cursor-pointer rounded border border-neutral-300 p-1"
              />
              <Input
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                placeholder="#2563EB"
              />
            </div>
            <p className="mt-1 text-xs text-neutral-500">Buttons, links, and active accents</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">
              Secondary Accent Color
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="h-10 w-12 cursor-pointer rounded border border-neutral-300 p-1"
              />
              <Input
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                placeholder="#0EA5E9"
              />
            </div>
            <p className="mt-1 text-xs text-neutral-500">Secondary badges, tags, and highlights</p>
          </div>
        </div>

        {/* Live Preview */}
        <div className="mt-6 rounded-lg border border-neutral-200 p-4 bg-neutral-50">
          <p className="text-xs font-semibold text-neutral-600 mb-2">Customer Portal Preview</p>
          <div
            className="rounded-lg p-4 text-white flex items-center justify-between"
            style={{ backgroundColor: primaryColor }}
          >
            <div>
              <h4 className="font-bold text-sm">{name || "Organization Name"}</h4>
              <p className="text-xs opacity-90">Service Portal & Fleet Management</p>
            </div>
            <button
              type="button"
              className="px-3 py-1.5 rounded-md text-xs font-semibold shadow-xs"
              style={{ backgroundColor: accentColor, color: "#FFFFFF" }}
            >
              Submit Ticket
            </button>
          </div>
        </div>
      </Card>

      {/* Localization & Region */}
      <Card>
        <CardHeader
          title="Regional & Localization Defaults"
          description="Default operational timezone, currency, and language"
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <Select
            label="Default Timezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            options={[
              { value: "Asia/Riyadh", label: "Asia/Riyadh (GMT+3)" },
              { value: "Asia/Dubai", label: "Asia/Dubai (GMT+4)" },
              { value: "Asia/Kuwait", label: "Asia/Kuwait (GMT+3)" },
              { value: "UTC", label: "UTC (GMT+0)" },
            ]}
          />

          <Select
            label="Default Currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            options={[
              { value: "SAR", label: "SAR — Saudi Riyal" },
              { value: "AED", label: "AED — UAE Dirham" },
              { value: "USD", label: "USD — US Dollar" },
              { value: "EUR", label: "EUR — Euro" },
            ]}
          />

          <Select
            label="Default Interface Language"
            value={defaultLanguage}
            onChange={(e) => setDefaultLanguage(e.target.value as "en" | "ar")}
            options={[
              { value: "en", label: "English (LTR)" },
              { value: "ar", label: "العربية — Arabic (RTL)" },
            ]}
          />
        </div>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader
          title="Notification Channels"
          description="Automatic dispatch, customer status updates, and ticket notifications"
        />
        <div className="space-y-3 mt-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={emailNotifications}
              onChange={(e) => setEmailNotifications(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-600"
            />
            <div>
              <span className="text-xs font-medium text-neutral-800">Email Notifications</span>
              <p className="text-xs text-neutral-500">
                Send ticket updates, quotations, and invitations via email
              </p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={smsNotifications}
              onChange={(e) => setSmsNotifications(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-600"
            />
            <div>
              <span className="text-xs font-medium text-neutral-800">SMS Notifications</span>
              <p className="text-xs text-neutral-500">
                Send OTP verification and high-priority dispatch alerts via SMS
              </p>
            </div>
          </label>
        </div>
      </Card>

      <div className="flex items-center justify-end gap-3 pt-4">
        <button
          type="button"
          onClick={fetchSettings}
          className="px-4 py-2 rounded-lg border border-neutral-300 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Discard Changes
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 text-xs font-medium text-white hover:bg-blue-700 shadow-xs disabled:opacity-50"
        >
          {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {isSaving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </form>
  );
}
