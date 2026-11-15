import React, { useState, useEffect } from "react";
import { useAuth } from "../../../lib/auth-context.js";
import { Card, CardHeader } from "../../../components/ui/Card.js";
import { Badge } from "../../../components/ui/Badge.js";
import { Modal } from "../../../components/ui/Modal.js";
import { Input } from "../../../components/ui/Input.js";
import {
  BookOpen,
  Plus,
  Search,
  Filter,
  FileText,
  HelpCircle,
  Wrench,
  Cpu,
  Layers,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";

interface KnowledgeArticle {
  id: string;
  title: string;
  slug: string;
  category: "manual" | "faq" | "troubleshooting" | "installation_guide" | "datasheet" | "procedure";
  target_audience: "customer" | "internal" | "all";
  summary?: string;
  tags: string[];
  device_models: string[];
  created_at: string;
}

export function KnowledgeBaseView() {
  const { session, authContext } = useAuth();
  const token = session?.access_token;
  const activeTenantId = authContext?.activeTenantId;

  const [loading, setLoading] = useState(true);
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [newArticle, setNewArticle] = useState({
    title: "",
    slug: "",
    category: "troubleshooting" as KnowledgeArticle["category"],
    targetAudience: "customer" as KnowledgeArticle["target_audience"],
    content: "",
    summary: "",
    tags: "",
    deviceModels: "",
  });

  const fetchArticles = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/knowledge/articles", {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (res.ok) {
        const data = await res.json();
        setArticles(data.articles || []);
      } else {
        const data = await res.json();
        setError(data.error?.message || "Failed to load knowledge articles");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchArticles();
  }, [token, activeTenantId]);

  const handleCreateArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    try {
      const payload = {
        title: newArticle.title,
        slug: newArticle.slug || newArticle.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        category: newArticle.category,
        targetAudience: newArticle.targetAudience,
        content: newArticle.content,
        summary: newArticle.summary || undefined,
        tags: newArticle.tags.split(",").map((t) => t.trim()).filter(Boolean),
        deviceModels: newArticle.deviceModels.split(",").map((m) => m.trim()).filter(Boolean),
        isPublished: true,
      };

      const res = await fetch("/api/v1/knowledge/articles", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setShowModal(false);
        setNewArticle({
          title: "",
          slug: "",
          category: "troubleshooting",
          targetAudience: "customer",
          content: "",
          summary: "",
          tags: "",
          deviceModels: "",
        });
        void fetchArticles();
      } else {
        const data = await res.json();
        setError(data.error?.message || "Failed to create article");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    }
  };

  const filteredArticles = articles.filter((art) => {
    const matchesCat = selectedCategory === "all" || art.category === selectedCategory;
    const matchesQuery =
      searchQuery.trim().length === 0 ||
      art.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (art.summary && art.summary.toLowerCase().includes(searchQuery.toLowerCase())) ||
      art.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCat && matchesQuery;
  });

  return (
    <div className="space-y-6 p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-blue-700">
              Documentation & Guides
            </span>
            <Badge variant="primary">Step 17 Active</Badge>
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
            Knowledge Base & AI Docs
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Tenant-scoped technical manuals, troubleshooting guides, FAQs, and procedures ingested into CareOS Assist AI.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => void fetchArticles()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-700 shadow-sm transition hover:bg-neutral-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            <Plus className="h-3.5 w-3.5" />
            New Article
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="flex-1 relative">
          <Search className="h-4 w-4 text-neutral-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search knowledge articles by title, tag, or device model..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 pl-9 pr-3 py-1.5 text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
          />
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap gap-1.5 items-center">
          {[
            { id: "all", label: "All Categories" },
            { id: "troubleshooting", label: "Troubleshooting" },
            { id: "manual", label: "Manuals" },
            { id: "faq", label: "FAQs" },
            { id: "procedure", label: "Procedures" },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                selectedCategory === cat.id
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Articles Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredArticles.length === 0 ? (
          <div className="col-span-full py-12 text-center text-xs text-neutral-400 rounded-2xl border border-dashed border-neutral-200 bg-white">
            No knowledge articles found. Click "New Article" to add technical documentation.
          </div>
        ) : (
          filteredArticles.map((art) => (
            <Card key={art.id}>
              <div className="flex items-start justify-between gap-2">
                <Badge variant={art.target_audience === "internal" ? "warning" : "success"}>
                  {art.target_audience === "internal" ? "Internal Only" : "Customer Safe"}
                </Badge>
                <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">
                  {art.category.replace(/_/g, " ")}
                </span>
              </div>

              <h3 className="mt-3 font-semibold text-sm text-neutral-900 leading-snug">{art.title}</h3>
              <p className="mt-1 text-xs text-neutral-500 line-clamp-3">
                {art.summary || "No summary provided. Full content available."}
              </p>

              {/* Tags & Models */}
              <div className="mt-4 flex flex-wrap gap-1">
                {art.tags.slice(0, 3).map((t) => (
                  <span key={t} className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-600">
                    #{t}
                  </span>
                ))}
                {art.device_models.slice(0, 2).map((m) => (
                  <span key={m} className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700 font-mono">
                    {m}
                  </span>
                ))}
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Author Knowledge Article">
          <form onSubmit={handleCreateArticle} className="space-y-4">
            <Input
              label="Article Title"
              placeholder="e.g. 4G MDVR Video Loss Diagnostic Procedure"
              value={newArticle.title}
              onChange={(e) => setNewArticle({ ...newArticle, title: e.target.value })}
              required
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-700">Category</label>
                <select
                  value={newArticle.category}
                  onChange={(e) => setNewArticle({ ...newArticle, category: e.target.value as any })}
                  className="mt-1 block w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900"
                >
                  <option value="troubleshooting">Troubleshooting</option>
                  <option value="manual">Manual</option>
                  <option value="faq">FAQ</option>
                  <option value="installation_guide">Installation Guide</option>
                  <option value="datasheet">Datasheet</option>
                  <option value="procedure">Procedure</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700">Audience</label>
                <select
                  value={newArticle.targetAudience}
                  onChange={(e) => setNewArticle({ ...newArticle, targetAudience: e.target.value as any })}
                  className="mt-1 block w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900"
                >
                  <option value="customer">Customer Safe (Visible in Customer Portal)</option>
                  <option value="internal">Internal Only (Staff & Technicians)</option>
                  <option value="all">All Audiences</option>
                </select>
              </div>
            </div>

            <Input
              label="Summary"
              placeholder="Brief overview displayed in search results and AI citations"
              value={newArticle.summary}
              onChange={(e) => setNewArticle({ ...newArticle, summary: e.target.value })}
            />

            <div>
              <label className="block text-xs font-semibold text-neutral-700">Article Content (Markdown)</label>
              <textarea
                rows={6}
                value={newArticle.content}
                onChange={(e) => setNewArticle({ ...newArticle, content: e.target.value })}
                placeholder="Write step-by-step diagnostic instructions or manual details..."
                className="mt-1 block w-full rounded-xl border border-neutral-200 bg-white p-3 text-xs text-neutral-900 focus:outline-none"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Tags (comma separated)"
                placeholder="mdvr, camera, video_loss"
                value={newArticle.tags}
                onChange={(e) => setNewArticle({ ...newArticle, tags: e.target.value })}
              />
              <Input
                label="Device Models"
                placeholder="MDVR-4410, CAM-DMS-01"
                value={newArticle.deviceModels}
                onChange={(e) => setNewArticle({ ...newArticle, deviceModels: e.target.value })}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-xl border border-neutral-200 bg-white px-4 py-2 text-xs font-semibold text-neutral-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-blue-700"
              >
                Publish Article
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
