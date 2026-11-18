import React, { useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  appendFirestoreChatMessage,
  archiveFirestoreExportNote,
  ChatModelId,
  ChatPersonaId,
  createFirestoreChatThread,
  createFirestoreExportNote,
  FirestoreExportNote,
  signInWithGooglePopup,
  subscribeExportNotes,
  syncFirebaseUserProfiles,
} from '../../lib/firebase.ts';
import { ErrorBanner, SectionCard, SuccessBanner } from '../components/UiPrimitives.tsx';
import { Bot, FilePlus2, RotateCcw, Send, Sparkles, User as UserIcon } from 'lucide-react';

interface ChatMessageItem {
  id: string;
  role: 'user' | 'model';
  text: string;
  model: ChatModelId;
}

const MODEL_OPTIONS: Array<{ id: ChatModelId; label: string; note: string }> = [
  { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen', note: 'General · Balanced' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', note: 'Fast · Low Latency' },
  { id: 'gemini-4-argon', label: 'Gemini 4 Argon', note: 'Complex Interactive' },
  { id: 'gemini-4-carbon', label: 'Gemini 4 Carbon', note: 'Deep Reasoning' },
];

const PERSONA_OPTIONS: Array<{ id: ChatPersonaId; label: string; hint: string }> = [
  {
    id: 'export_compliance',
    label: 'Export Compliance Officer',
    hint: 'EUDR geolocation, phytosanitary inspection, rules of origin, and customs clearance.',
  },
  {
    id: 'pricing_strategist',
    label: 'Commercial Pricing Strategist',
    hint: 'EXW/FOB/CFR/CIF cost buildup, haulage, port handling, insurance, and margins.',
  },
  {
    id: 'buyer_diligence',
    label: 'Buyer Due Diligence Analyst',
    hint: 'Counterparty vetting, LC vs CAD settlement structures, and trade red flags.',
  },
  {
    id: 'logistics_coordinator',
    label: 'Origin Logistics Coordinator',
    hint: '20ft container loading, moisture control, East/West African corridor transit.',
  },
];

const QUICK_PROMPTS = [
  'What EUDR polygon and phytosanitary documents are mandatory for shipping 18,000 kg Bugisu Arabica from Mombasa to Hamburg?',
  'Compare Irrevocable Confirmed LC vs Cash Against Documents (CAD) for a first-time €95,000 specialty coffee contract.',
  'Walk through a CIF Rotterdam cost breakdown starting from $4.85/kg FOB Mombasa.',
];

export function ChatbotView({
  firebaseUser,
  organisationName,
}: {
  firebaseUser: User | null;
  organisationName: string;
}) {
  const [model, setModel] = useState<ChatModelId>('gemini-4-hydrogen');
  const [persona, setPersona] = useState<ChatPersonaId>('export_compliance');
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [firestoreThreadId, setFirestoreThreadId] = useState<string | null>(null);
  const [sqlSessionId, setSqlSessionId] = useState<number | undefined>(undefined);

  // Firestore Export Dossier Notes (Personal Cloud Sync)
  const [notes, setNotes] = useState<FirestoreExportNote[]>([]);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteLotCode, setNoteLotCode] = useState('EB-UG-2026-01');
  const [noteMarket, setNoteMarket] = useState('Germany');
  const [noteContent, setNoteContent] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const threadEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  useEffect(() => {
    if (!firebaseUser) {
      setNotes([]);
      return;
    }
    const unsub = subscribeExportNotes(
      firebaseUser.uid,
      (items) => setNotes(items),
      (err) => setError(`Firestore notes sync notice: ${err.message}`)
    );
    return () => unsub();
  }, [firebaseUser]);

  async function handleConnectGoogle() {
    setError(null);
    try {
      const { user, idToken } = await signInWithGooglePopup();
      await syncFirebaseUserProfiles(user, organisationName, model);
      await fetch('/api/auth/firebase-sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      setNotice(`Google account (${user.email}) linked for cloud dossier persistence.`);
    } catch (err: any) {
      setError(err?.message || 'Google Sign-In was cancelled or failed.');
    }
  }

  async function sendMessage(overrideText?: string) {
    const promptText = (overrideText ?? input).trim();
    if (!promptText || streaming) return;

    setError(null);
    if (!overrideText) setInput('');

    const priorHistory = messages.map((m) => ({ role: m.role, text: m.text }));
    const userMsgId = `u-${Date.now()}`;
    const assistantMsgId = `a-${Date.now() + 1}`;

    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: 'user', text: promptText, model },
      { id: assistantMsgId, role: 'model', text: '', model },
    ]);
    setStreaming(true);

    try {
      const firebaseIdToken = firebaseUser ? await firebaseUser.getIdToken() : undefined;
      let activeThreadId = firestoreThreadId;
      if (firebaseUser && !activeThreadId) {
        activeThreadId = await createFirestoreChatThread(firebaseUser.uid, {
          title: promptText.slice(0, 80),
          model,
          persona,
        });
        setFirestoreThreadId(activeThreadId);
      }
      if (firebaseUser && activeThreadId) {
        await appendFirestoreChatMessage(activeThreadId, firebaseUser.uid, {
          role: 'user',
          content: promptText,
          model,
        });
      }

      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          message: promptText,
          model,
          persona,
          history: priorHistory,
          sqlSessionId,
          firebaseIdToken,
        }),
      });

      if (!res.ok || !res.body) {
        const errPayload = await res.json().catch(() => ({}));
        throw new Error(errPayload?.error || `Chat request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalReply = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const evt of events) {
          const line = evt
            .split('\n')
            .find((l) => l.startsWith('data: '));
          if (!line) continue;
          const payload = JSON.parse(line.slice(6));
          if (payload.type === 'chunk') {
            finalReply += payload.text;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantMsgId ? { ...m, text: finalReply } : m))
            );
          } else if (payload.type === 'done') {
            finalReply = payload.text || finalReply;
            if (payload.sqlSessionId) setSqlSessionId(payload.sqlSessionId);
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantMsgId ? { ...m, text: finalReply } : m))
            );
          } else if (payload.type === 'error') {
            throw new Error(payload.error || 'Gemini streaming failed.');
          }
        }
      }

      if (firebaseUser && activeThreadId && finalReply) {
        await appendFirestoreChatMessage(activeThreadId, firebaseUser.uid, {
          role: 'model',
          content: finalReply,
          model,
        });
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to generate response.');
      setMessages((prev) => prev.filter((m) => m.id !== assistantMsgId || m.text.length > 0));
    } finally {
      setStreaming(false);
    }
  }

  async function handleSaveNote(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseUser) return;
    setSavingNote(true);
    setError(null);
    try {
      await createFirestoreExportNote(firebaseUser.uid, {
        title: noteTitle,
        commodityCode: noteLotCode,
        targetMarket: noteMarket,
        content: noteContent,
      });
      const idToken = await firebaseUser.getIdToken();
      await fetch('/api/cloudsql/notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          title: noteTitle,
          commodityLotCode: noteLotCode,
          targetMarket: noteMarket,
          incoterm: 'FOB',
          content: noteContent,
        }),
      });
      setNoteTitle('');
      setNoteContent('');
      setNotice('Export dossier note saved to your workspace.');
    } catch (err: any) {
      setError(err?.message || 'Failed to save export note.');
    } finally {
      setSavingNote(false);
    }
  }

  const activePersona = PERSONA_OPTIONS.find((p) => p.id === persona) || PERSONA_OPTIONS[0];

  return (
    <div className="space-y-6">
      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      <SuccessBanner message={notice} onDismiss={() => setNotice(null)} />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Multi-Turn Gemini Chat Workspace */}
        <div className="xl:col-span-8">
          <SectionCard
            title="Gemini Export Operations Copilot"
            subtitle={activePersona.hint}
            actions={
              <button
                type="button"
                onClick={() => {
                  setMessages([]);
                  setFirestoreThreadId(null);
                  setSqlSessionId(undefined);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#D9D3C4] text-xs font-medium text-[#1C1F1E] hover:bg-[#FAF8F3]"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>New Thread</span>
              </button>
            }
          >
            {/* Model & Role Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-4 border-b border-[#E5DEC9]">
              <div>
                <label className="block text-[11px] font-medium text-[#666D6A] mb-1">
                  Gemini Model
                </label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value as ChatModelId)}
                  className="w-full px-3 py-2 text-xs font-medium border border-[#D9D3C4] rounded-md bg-white text-[#1C1F1E] focus:outline-none focus:border-[#11382A]"
                >
                  {MODEL_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label} ({opt.note})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#666D6A] mb-1">
                  Specialist Persona (System Instruction)
                </label>
                <select
                  value={persona}
                  onChange={(e) => setPersona(e.target.value as ChatPersonaId)}
                  className="w-full px-3 py-2 text-xs font-medium border border-[#D9D3C4] rounded-md bg-white text-[#1C1F1E] focus:outline-none focus:border-[#11382A]"
                >
                  {PERSONA_OPTIONS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Scrollable Conversation Thread */}
            <div className="mt-4 h-[420px] overflow-y-auto pr-2 space-y-3">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col justify-center items-center text-center px-4">
                  <Sparkles className="w-6 h-6 text-[#B8860B] mb-2" />
                  <div className="text-sm font-semibold text-[#1C1F1E]">
                    Start a multi-turn export strategy session
                  </div>
                  <p className="text-xs text-[#666D6A] max-w-md mt-1">
                    Ask about EUDR compliance, Incoterm cost buildups, documentary credits, or East African port dispatch. Switch models or personas mid-thread anytime.
                  </p>
                  <div className="mt-4 space-y-2 w-full max-w-xl">
                    {QUICK_PROMPTS.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => sendMessage(q)}
                        className="w-full text-left px-3 py-2 rounded-md border border-[#E5DEC9] bg-[#FAF8F3] hover:border-[#11382A] text-xs text-[#1C1F1E] transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${
                      msg.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    {msg.role === 'model' ? (
                      <div className="w-7 h-7 rounded-md bg-[#11382A] text-[#FAF8F3] flex items-center justify-center shrink-0 mt-0.5">
                        <Bot className="w-4 h-4" />
                      </div>
                    ) : null}
                    <div
                      className={`max-w-[82%] rounded-lg px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                        msg.role === 'user'
                          ? 'bg-[#11382A] text-[#FAF8F3]'
                          : 'bg-[#FAF8F3] border border-[#E5DEC9] text-[#1C1F1E]'
                      }`}
                    >
                      {msg.text || (streaming ? 'Generating response...' : '')}
                      <div
                        className={`mt-1.5 text-[10px] font-mono ${
                          msg.role === 'user' ? 'text-[#E4EDE9]/70' : 'text-[#666D6A]'
                        }`}
                      >
                        {msg.model}
                      </div>
                    </div>
                    {msg.role === 'user' ? (
                      <div className="w-7 h-7 rounded-md bg-[#E5DEC9] text-[#1C1F1E] flex items-center justify-center shrink-0 mt-0.5">
                        <UserIcon className="w-4 h-4" />
                      </div>
                    ) : null}
                  </div>
                ))
              )}
              <div ref={threadEndRef} />
            </div>

            {/* Composer */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sendMessage();
              }}
              className="mt-4 pt-3 border-t border-[#E5DEC9] flex gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`Ask ${activePersona.label}...`}
                disabled={streaming}
                className="flex-1 px-3 py-2 text-sm border border-[#D9D3C4] rounded-md focus:outline-none focus:border-[#11382A]"
              />
              <button
                type="submit"
                disabled={streaming || !input.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#11382A] text-[#FAF8F3] text-xs font-medium rounded-md hover:bg-[#174937] disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{streaming ? 'Streaming...' : 'Send'}</span>
              </button>
            </form>
          </SectionCard>
        </div>

        {/* Cloud Export Dossier Notes (Firebase + Cloud SQL) */}
        <div className="xl:col-span-4 space-y-4">
          <SectionCard
            title="Trade Dossier Notes"
            subtitle="Personal export checklists & shipment memos synced to your Google account."
          >
            {!firebaseUser ? (
              <div className="space-y-3 py-2">
                <p className="text-xs text-[#666D6A] leading-relaxed">
                  Link your Google account to persist private export dossier notes and multi-turn Copilot threads across sessions.
                </p>
                <button
                  type="button"
                  onClick={handleConnectGoogle}
                  className="w-full py-2 px-3 rounded-md bg-[#1C1F1E] text-[#FAF8F3] text-xs font-medium hover:bg-[#3A3F3D]"
                >
                  Link Google Account
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <form onSubmit={handleSaveNote} className="space-y-2.5">
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={160}
                    value={noteTitle}
                    onChange={(e) => setNoteTitle(e.target.value)}
                    placeholder="Dossier memo title"
                    className="w-full px-3 py-1.5 text-xs border border-[#D9D3C4] rounded-md"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      required
                      minLength={2}
                      maxLength={48}
                      value={noteLotCode}
                      onChange={(e) => setNoteLotCode(e.target.value)}
                      placeholder="Lot code"
                      className="w-full px-2.5 py-1.5 text-xs border border-[#D9D3C4] rounded-md font-mono"
                    />
                    <input
                      type="text"
                      required
                      minLength={2}
                      maxLength={80}
                      value={noteMarket}
                      onChange={(e) => setNoteMarket(e.target.value)}
                      placeholder="Target market"
                      className="w-full px-2.5 py-1.5 text-xs border border-[#D9D3C4] rounded-md"
                    />
                  </div>
                  <textarea
                    required
                    rows={3}
                    maxLength={4000}
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    placeholder="Capture compliance action items, buyer terms, or port notes..."
                    className="w-full px-3 py-1.5 text-xs border border-[#D9D3C4] rounded-md"
                  />
                  <button
                    type="submit"
                    disabled={savingNote}
                    className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 bg-[#11382A] text-[#FAF8F3] text-xs font-medium rounded-md hover:bg-[#174937] disabled:opacity-50"
                  >
                    <FilePlus2 className="w-3.5 h-3.5" />
                    <span>{savingNote ? 'Saving...' : 'Save Export Note'}</span>
                  </button>
                </form>

                <div className="pt-3 border-t border-[#E5DEC9] space-y-2 max-h-64 overflow-y-auto">
                  {notes.length === 0 ? (
                    <div className="text-xs text-[#666D6A]">No saved dossier notes yet.</div>
                  ) : (
                    notes.map((n) => (
                      <div
                        key={n.id}
                        className="p-2.5 rounded-md border border-[#E5DEC9] bg-[#FAF8F3] space-y-1"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-xs font-semibold text-[#1C1F1E]">{n.title}</div>
                          <span className="text-[10px] font-mono text-[#666D6A] shrink-0">
                            {n.status}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-[#11382A]">
                          {n.commodityCode} · {n.targetMarket}
                        </div>
                        <p className="text-xs text-[#3A3F3D] line-clamp-3">{n.content}</p>
                        {n.status === 'active' ? (
                          <button
                            type="button"
                            onClick={() => archiveFirestoreExportNote(n.id)}
                            className="text-[11px] font-medium text-[#11382A] hover:underline"
                          >
                            Archive
                          </button>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
