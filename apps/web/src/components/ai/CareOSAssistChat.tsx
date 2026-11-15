import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../../lib/auth-context.js";
import { Badge } from "../ui/Badge.js";
import {
  Sparkles,
  X,
  Send,
  Loader2,
  ShieldAlert,
  BookOpen,
  User,
  Bot,
  AlertCircle,
  HelpCircle,
} from "lucide-react";

interface Message {
  id: string;
  sender: "user" | "assistant";
  content: string;
  citations?: Array<{ id: string; title: string; category: string; slug: string }>;
  providerUsed?: string;
  requiresHumanApproval?: boolean;
  actionRequested?: string;
  timestamp: string;
}

interface CareOSAssistChatProps {
  isOpen: boolean;
  onClose: () => void;
  portalMode?: "customer" | "internal";
}

export function CareOSAssistChat({ isOpen, onClose, portalMode = "internal" }: CareOSAssistChatProps) {
  const { session, authContext } = useAuth();
  const token = session?.access_token;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const welcome =
        portalMode === "customer"
          ? "Hello! I am CareOS Assist. I can help answer questions about your equipment, check ticket status, explain warranties and quotations, or guide you through approved troubleshooting."
          : "CareOS Assist active in Internal Operations Mode. I can help search technical manuals, summarize customer requests and complaints, and draft troubleshooting steps.";

      setMessages([
        {
          id: "welcome",
          sender: "assistant",
          content: welcome,
          timestamp: new Date().toISOString(),
          providerUsed: "deterministic_fallback",
        },
      ]);
    }
  }, [isOpen, portalMode]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !token || loading) return;

    const userText = input.trim();
    setInput("");

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      sender: "user",
      content: userText,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await fetch("/api/v1/ai/chat", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: userText,
          conversationId: conversationId || undefined,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data.conversationId) {
        setConversationId(data.conversationId);
      }

      const assistantMsg: Message = {
        id: `assist-${Date.now()}`,
        sender: "assistant",
        content: data.reply,
        citations: data.citations || [],
        providerUsed: data.providerUsed,
        requiresHumanApproval: data.requiresHumanApproval,
        actionRequested: data.actionRequested,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: unknown) {
      const errorMsg: Message = {
        id: `err-${Date.now()}`,
        sender: "assistant",
        content: "I encountered an issue connecting to the AI Gateway. Deterministic safety controls remain active.",
        timestamp: new Date().toISOString(),
        providerUsed: "deterministic_fallback",
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl border-l border-neutral-200">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-sm">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-neutral-900">CareOS Assist</span>
              <Badge variant={portalMode === "customer" ? "primary" : "neutral"}>
                {portalMode === "customer" ? "Customer Mode" : "Internal Ops"}
              </Badge>
            </div>
            <p className="text-[10px] text-neutral-400">Tenant-isolated AI assistant</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700 transition"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Safety Notice */}
      <div className="border-b border-amber-200 bg-amber-50/70 px-4 py-2 text-[11px] text-amber-900 flex items-start gap-2">
        <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
        <span>
          CareOS Assist provides informational guidance. All warranty, payments, dispatch, and closures require human authorization.
        </span>
      </div>

      {/* Message History */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m) => {
          const isUser = m.sender === "user";
          return (
            <div key={m.id} className={`flex gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}>
              {!isUser && (
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-xs font-bold mt-1">
                  <Bot className="h-3.5 w-3.5" />
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed ${
                  isUser
                    ? "bg-blue-600 text-white"
                    : "bg-neutral-100 text-neutral-900 border border-neutral-200"
                }`}
              >
                <div className="whitespace-pre-line">{m.content}</div>

                {/* Consequential action alert */}
                {m.requiresHumanApproval && (
                  <div className="mt-2.5 rounded-xl border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-800 flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>Consequential action requested. Flagged for operations manager authorization.</span>
                  </div>
                )}

                {/* Citations */}
                {m.citations && m.citations.length > 0 && (
                  <div className="mt-2.5 border-t border-neutral-200 pt-2 space-y-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 block">
                      Knowledge Citations
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {m.citations.map((c) => (
                        <span
                          key={c.id}
                          className="inline-flex items-center gap-1 rounded bg-white px-2 py-0.5 text-[10px] font-medium text-neutral-700 border border-neutral-200"
                        >
                          <BookOpen className="h-2.5 w-2.5 text-blue-500" />
                          {c.title}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Provider footer */}
                {!isUser && m.providerUsed && (
                  <div className="mt-1 text-[9px] text-neutral-400 text-right">
                    via {m.providerUsed}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-neutral-400 italic">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            CareOS Assist thinking...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <form onSubmit={handleSend} className="border-t border-neutral-200 bg-neutral-50 p-3">
        <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 shadow-xs">
          <input
            type="text"
            placeholder={
              portalMode === "customer"
                ? "Ask about ticket status, warranty, or troubleshooting..."
                : "Ask for ticket summaries, procedures, or manuals..."
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            className="flex-1 bg-transparent text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-lg bg-blue-600 p-1.5 text-white hover:bg-blue-700 disabled:opacity-40 transition"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </form>
    </div>
  );
}
