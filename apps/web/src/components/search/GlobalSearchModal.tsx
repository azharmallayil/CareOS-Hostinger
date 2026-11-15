import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth-context.js";
import {
  Search,
  X,
  LifeBuoy,
  Truck,
  Building2,
  Wrench,
  Layers,
  ArrowRight,
  Loader2,
} from "lucide-react";

interface SearchResults {
  tickets?: Array<{ id: string; ticket_number: string; title: string; status: string; priority: string }>;
  assets?: Array<{ id: string; plate_number: string; fleet_number?: string; make?: string; model?: string; operational_status: string }>;
  customers?: Array<{ id: string; name: string; account_number: string; status: string }>;
  workOrders?: Array<{ id: string; work_order_number: string; title: string; status: string }>;
  parts?: Array<{ id: string; part_number: string; name: string }>;
}

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GlobalSearchModal({ isOpen, onClose }: GlobalSearchModalProps) {
  const { session } = useAuth();
  const token = session?.access_token;
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResults>({});
  const [totalMatches, setTotalMatches] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
      setResults({});
      setTotalMatches(0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!token || query.trim().length < 2) {
      setResults({});
      setTotalMatches(0);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/search?q=${encodeURIComponent(query.trim())}&limit=5`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        if (res.ok) {
          const data = await res.json();
          setResults(data.results || {});
          setTotalMatches(data.totalMatches || 0);
        }
      } catch (err) {
        console.error("Global search error:", err);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query, token]);

  if (!isOpen) return null;

  const handleSelect = (path: string) => {
    onClose();
    navigate(path);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-neutral-200 overflow-hidden">
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-200 bg-neutral-50/50">
          <Search className="h-5 w-5 text-neutral-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search tickets, fleet assets, customer accounts, work orders..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-neutral-400 shrink-0" />}
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results Area */}
        <div className="max-h-[60vh] overflow-y-auto p-4 space-y-4">
          {query.trim().length < 2 && (
            <div className="py-8 text-center text-xs text-neutral-400">
              Type at least 2 characters to search across authorized records.
            </div>
          )}

          {query.trim().length >= 2 && !loading && totalMatches === 0 && (
            <div className="py-8 text-center text-xs text-neutral-400">
              No matching records found for "{query}".
            </div>
          )}

          {/* Tickets */}
          {results.tickets && results.tickets.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
                <LifeBuoy className="h-3.5 w-3.5" />
                <span>Tickets ({results.tickets.length})</span>
              </div>
              <div className="space-y-1">
                {results.tickets.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleSelect(`/operations/tickets/${t.id}`)}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-neutral-100 text-left transition group"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-blue-600">{t.ticket_number}</span>
                        <span className="text-xs font-medium text-neutral-900">{t.title}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-neutral-400">
                        <span className="capitalize">{t.status.replace(/_/g, " ")}</span>
                        <span>•</span>
                        <span className="capitalize">{t.priority}</span>
                      </div>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-neutral-400 opacity-0 group-hover:opacity-100 transition" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Assets */}
          {results.assets && results.assets.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
                <Truck className="h-3.5 w-3.5" />
                <span>Fleet & Assets ({results.assets.length})</span>
              </div>
              <div className="space-y-1">
                {results.assets.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => handleSelect(`/operations/assets/${a.id}`)}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-neutral-100 text-left transition group"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-neutral-900">{a.plate_number}</span>
                        {a.fleet_number && (
                          <span className="text-[11px] font-mono text-neutral-500">({a.fleet_number})</span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[11px] text-neutral-400">
                        {a.make} {a.model} • Status: {a.operational_status}
                      </div>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-neutral-400 opacity-0 group-hover:opacity-100 transition" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Customers */}
          {results.customers && results.customers.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
                <Building2 className="h-3.5 w-3.5" />
                <span>Customer Accounts ({results.customers.length})</span>
              </div>
              <div className="space-y-1">
                {results.customers.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleSelect(`/operations/customers/${c.id}`)}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-neutral-100 text-left transition group"
                  >
                    <div>
                      <div className="text-xs font-semibold text-neutral-900">{c.name}</div>
                      <div className="mt-0.5 font-mono text-[11px] text-neutral-400">
                        Acc: {c.account_number} • Status: {c.status}
                      </div>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-neutral-400 opacity-0 group-hover:opacity-100 transition" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Work Orders */}
          {results.workOrders && results.workOrders.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
                <Wrench className="h-3.5 w-3.5" />
                <span>Work Orders ({results.workOrders.length})</span>
              </div>
              <div className="space-y-1">
                {results.workOrders.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => handleSelect(`/operations/dispatch`)}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-neutral-100 text-left transition group"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-amber-600">{w.work_order_number}</span>
                        <span className="text-xs font-medium text-neutral-900">{w.title}</span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-neutral-400">Status: {w.status}</div>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-neutral-400 opacity-0 group-hover:opacity-100 transition" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2 border-t border-neutral-100 bg-neutral-50 flex items-center justify-between text-[11px] text-neutral-400">
          <span>Role-scoped search: Only authorized tenant records displayed.</span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  );
}
