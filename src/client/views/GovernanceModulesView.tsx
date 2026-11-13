import React, { useEffect, useState } from 'react';
import { apiFetch, formatUsd } from '../lib/api.ts';
import { EmptyState, ErrorBanner, MetricTile, Modal, PageHeader, StatusLabel, SuccessBanner } from '../components/UiPrimitives.tsx';
import { Bot, Check, Download, Lock, Plus, Upload, UserPlus, X } from 'lucide-react';

export function GovernanceModulesView({
  activeTab,
}: {
  activeTab: 'organisations' | 'documents' | 'ai_workforce' | 'approvals' | 'finance' | 'audit_security';
}) {
  const [orgsData, setOrgsData] = useState<{ organisations: any[]; memberships: any[] }>({ organisations: [], memberships: [] });
  const [documents, setDocuments] = useState<any[]>([]);
  const [aiData, setAiData] = useState<{ agents: any[]; tasks: any[]; runs: any[]; aiProviderStatus?: any }>({ agents: [], tasks: [], runs: [] });
  const [approvals, setApprovals] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [auditData, setAuditData] = useState<{ logs: any[]; securityPosture?: any }>({ logs: [] });

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Forms
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [memberForm, setMemberForm] = useState({ fullName: '', email: '', password: '', role: 'supplier_member' });

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [docType, setDocType] = useState('ucda_quality_certificate');
  const [docConfidentiality, setDocConfidentiality] = useState<'org_private' | 'internal_ops' | 'shared_with_buyer'>('org_private');

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskForm, setTaskForm] = useState({ agentId: 'supplier_intel', title: '', contextText: '' });

  const [txModalOpen, setTxModalOpen] = useState(false);
  const [txForm, setTxForm] = useState({ txType: 'invoice', amountUsd: '10900', counterparty: 'Nordic Specialty Coffee Imports GmbH' });

  async function loadAll() {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        apiFetch('/api/organisations'),
        apiFetch('/api/documents'),
        apiFetch('/api/agents'),
        apiFetch('/api/approvals'),
        apiFetch('/api/finance/transactions'),
        apiFetch('/api/audit/logs'),
      ]);
      if (results[0].status === 'fulfilled') setOrgsData(results[0].value);
      if (results[1].status === 'fulfilled') setDocuments(results[1].value.documents || []);
      if (results[2].status === 'fulfilled') setAiData(results[2].value);
      if (results[3].status === 'fulfilled') setApprovals(results[3].value.approvals || []);
      if (results[4].status === 'fulfilled') setTransactions(results[4].value.transactions || []);
      if (results[5].status === 'fulfilled') setAuditData(results[5].value);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, [activeTab]);

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/organisations/members', { method: 'POST', body: JSON.stringify(memberForm) });
      setShowMemberModal(false);
      setNotice('Team member added to organisation.');
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleDocumentUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadFile) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', uploadFile);
      fd.append('docType', docType);
      fd.append('confidentiality', docConfidentiality);
      await apiFetch('/api/documents', { method: 'POST', body: fd });
      setUploadFile(null);
      setNotice('Document encrypted/stored in private vault with SHA-256 verification.');
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function runAgentTask(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/api/agents/tasks', {
        method: 'POST',
        body: JSON.stringify({
          agentId: taskForm.agentId,
          title: taskForm.title,
          taskType: 'manual_assignment',
          input: { notes: taskForm.contextText },
          executeNow: true,
        }),
      });
      setTaskModalOpen(false);
      setNotice('AI agent task executed and audited by the Independent Quality & Risk Auditor.');
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function cancelTask(taskId: string) {
    try {
      await apiFetch(`/api/agents/tasks/${taskId}/cancel`, { method: 'POST' });
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function decideApproval(id: string, decision: 'approved' | 'rejected') {
    setError(null);
    try {
      await apiFetch(`/api/approvals/${id}/decide`, {
        method: 'POST',
        body: JSON.stringify({ decision, note: `Decided via Governance Console (${decision})` }),
      });
      setNotice(`Approval request ${decision}. Target business record updated.`);
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function createFinancialTx(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiFetch<any>('/api/finance/transactions', {
        method: 'POST',
        body: JSON.stringify({
          txType: txForm.txType,
          amountUsd: Number(txForm.amountUsd),
          counterparty: txForm.counterparty,
        }),
      });
      setTxModalOpen(false);
      setNotice(`Financial entry created and routed to Founder Admin approval (${res.approvalId.slice(0, 8)}).`);
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-6">
      {activeTab === 'organisations' ? (
        <>
          <PageHeader
            title="Authentication & Organisation Management"
            subtitle="Multi-tenant organisation isolation, role-based access control (RBAC), and team membership governance."
            action={
              <button
                type="button"
                onClick={() => setShowMemberModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#11382A] text-white text-xs font-medium rounded-md hover:bg-[#174937] whitespace-nowrap"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add Member</span>
              </button>
            }
          />
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
          <SuccessBanner message={notice} onDismiss={() => setNotice(null)} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-[#E5DEC9] rounded-lg overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#E5DEC9] bg-[#FAF8F3] text-xs font-semibold text-[#1C1F1E]">
                Organisations ({orgsData.organisations.length})
              </div>
              <div className="divide-y divide-[#F0EAD8]">
                {orgsData.organisations.map((o) => (
                  <div key={o.id} className="px-5 py-3.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-medium text-[#1C1F1E]">{o.name}</div>
                      <div className="text-[11px] text-[#666D6A]">{o.country} · Reg {o.registration_number || '—'}</div>
                    </div>
                    <span className="font-mono text-[11px] text-[#11382A] capitalize">{o.type.replace(/_/g, ' ')}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-[#E5DEC9] rounded-lg overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#E5DEC9] bg-[#FAF8F3] text-xs font-semibold text-[#1C1F1E]">
                Team Memberships & Roles ({orgsData.memberships.length})
              </div>
              <div className="divide-y divide-[#F0EAD8]">
                {orgsData.memberships.map((m) => (
                  <div key={m.id} className="px-5 py-3.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-medium text-[#1C1F1E]">{m.full_name}</div>
                      <div className="text-[11px] text-[#666D6A]">{m.email}</div>
                    </div>
                    <span className="font-mono text-[11px] text-[#9A6F09]">{m.role}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : null}

      {activeTab === 'documents' ? (
        <>
          <PageHeader
            title="Private Document Vault"
            subtitle="Organisation-isolated export certificates, phytosanitary records, and EUDR polygons. Enforces MIME validation, 10MB cap, and SHA-256 integrity."
          />
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
          <SuccessBanner message={notice} onDismiss={() => setNotice(null)} />

          <form onSubmit={handleDocumentUpload} className="bg-white border border-[#E5DEC9] rounded-lg p-5 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-xs font-medium mb-1">Select File (PDF, PNG, JPG, CSV, DOCX)</label>
              <input
                type="file"
                required
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                className="w-full text-xs text-[#3A3F3D] file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-[#F3EFE4] file:text-[#1C1F1E]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Document Type</label>
              <select value={docType} onChange={(e) => setDocType(e.target.value)} className="w-full px-3 py-2 text-xs border border-[#D9D3C4] rounded-md bg-white">
                <option value="ucda_quality_certificate">UCDA Quality Certificate</option>
                <option value="phytosanitary_certificate">Phytosanitary Certificate</option>
                <option value="eudr_geolocation_geojson">EUDR Geolocation Record</option>
                <option value="certificate_of_origin">Certificate of Origin</option>
                <option value="commercial_invoice">Commercial Invoice</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Confidentiality</label>
              <select value={docConfidentiality} onChange={(e) => setDocConfidentiality(e.target.value as any)} className="w-full px-3 py-2 text-xs border border-[#D9D3C4] rounded-md bg-white">
                <option value="org_private">Organisation Private</option>
                <option value="internal_ops">Internal Ops Shared</option>
                <option value="shared_with_buyer">Shared with Buyer</option>
              </select>
            </div>
            <button type="submit" disabled={busy || !uploadFile} className="inline-flex items-center justify-center gap-1.5 py-2 px-4 bg-[#11382A] text-white text-xs font-medium rounded-md hover:bg-[#174937] disabled:opacity-50 whitespace-nowrap">
              <Upload className="w-3.5 h-3.5" />
              <span>{busy ? 'Uploading...' : 'Upload to Vault'}</span>
            </button>
          </form>

          {documents.length === 0 ? (
            <EmptyState title="Document vault is empty" description="Upload export compliance certificates or trade contracts above." />
          ) : (
            <div className="bg-white border border-[#E5DEC9] rounded-lg overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E5DEC9] bg-[#FAF8F3] text-[11px] font-medium text-[#666D6A]">
                    <th className="py-3 px-4">Filename</th>
                    <th className="py-3 px-4">Type & Access</th>
                    <th className="py-3 px-4">SHA-256 Checksum</th>
                    <th className="py-3 px-4 text-right">Size</th>
                    <th className="py-3 px-4 text-right">Download</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0EAD8] text-xs">
                  {documents.map((doc) => (
                    <tr key={doc.id} className="hover:bg-[#FAF8F3]">
                      <td className="py-3 px-4 font-medium text-[#1C1F1E]">{doc.original_filename}</td>
                      <td className="py-3 px-4 text-[#3A3F3D]">{doc.doc_type} · {doc.confidentiality}</td>
                      <td className="py-3 px-4 font-mono text-[11px] text-[#666D6A]">{String(doc.sha256_hash).slice(0, 16)}...</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">{(doc.size_bytes / 1024).toFixed(1)} KB</td>
                      <td className="py-3 px-4 text-right">
                        <a
                          href={`/api/documents/${doc.id}/download`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 border border-[#11382A] text-[#11382A] rounded text-[11px] font-medium hover:bg-[#11382A] hover:text-white"
                        >
                          <Download className="w-3 h-3" />
                          <span>Download</span>
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}

      {activeTab === 'ai_workforce' ? (
        <>
          <PageHeader
            title="AI Workforce & Orchestration (10 Specialized Agents)"
            subtitle="Structured task orchestration powered by server-side Gemini models with Zod schema validation and automatic Independent Quality & Risk Auditing."
            action={
              <button
                type="button"
                onClick={() => setTaskModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#11382A] text-white text-xs font-medium rounded-md hover:bg-[#174937] whitespace-nowrap"
              >
                <Bot className="w-3.5 h-3.5" />
                <span>Assign Agent Task</span>
              </button>
            }
          />
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
          <SuccessBanner message={notice} onDismiss={() => setNotice(null)} />

          {/* 10 Agents Directory Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            {aiData.agents.map((ag) => (
              <div key={ag.id} className="bg-white border border-[#E5DEC9] rounded-lg p-4 flex flex-col justify-between">
                <div>
                  <div className="text-[11px] font-medium text-[#9A6F09]">{ag.department}</div>
                  <h3 className="text-xs font-semibold text-[#1C1F1E] mt-1">{ag.name}</h3>
                  <p className="text-[11px] text-[#666D6A] mt-1.5 line-clamp-3">{ag.responsibilities[0]}</p>
                </div>
                <div className="mt-3 pt-2 border-t border-[#F0EAD8] text-[10px] text-[#666D6A]">
                  Prohibited: {ag.prohibitedActions.slice(0, 2).join(', ')}
                </div>
              </div>
            ))}
          </div>

          <h3 className="text-sm font-semibold text-[#1C1F1E]">Agent Execution History & Auditor Verdicts</h3>
          {aiData.runs.length === 0 && aiData.tasks.length === 0 ? (
            <EmptyState title="No AI tasks executed yet" description="Assign an agent task above or run the Export Pipeline from Founder Command." />
          ) : (
            <div className="bg-white border border-[#E5DEC9] rounded-lg overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E5DEC9] bg-[#FAF8F3] text-[11px] font-medium text-[#666D6A]">
                    <th className="py-3 px-4">Agent</th>
                    <th className="py-3 px-4">Task Summary</th>
                    <th className="py-3 px-4">Model / Latency</th>
                    <th className="py-3 px-4">Auditor Status</th>
                    <th className="py-3 px-4">Output Excerpt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0EAD8] text-xs">
                  {aiData.runs.map((r) => (
                    <tr key={r.id} className="hover:bg-[#FAF8F3]">
                      <td className="py-3 px-4 font-medium text-[#1C1F1E]">{r.agent_id}</td>
                      <td className="py-3 px-4 text-[#3A3F3D]">{r.prompt_summary}</td>
                      <td className="py-3 px-4 font-mono text-[11px] tabular-nums">{r.model_name} · {r.duration_ms}ms</td>
                      <td className="py-3 px-4"><StatusLabel status={r.audit_status} /></td>
                      <td className="py-3 px-4 text-[11px] font-mono text-[#666D6A] max-w-sm truncate">{r.output_json}</td>
                    </tr>
                  ))}
                  {aiData.tasks.filter((t) => t.status !== 'completed').map((t) => (
                    <tr key={t.id} className="hover:bg-[#FAF8F3]">
                      <td className="py-3 px-4 font-medium">{t.agent_id}</td>
                      <td className="py-3 px-4">{t.title}</td>
                      <td className="py-3 px-4 text-[#666D6A]"><StatusLabel status={t.status} /></td>
                      <td className="py-3 px-4 text-[#991B1B] text-[11px]">{t.error_message || '—'}</td>
                      <td className="py-3 px-4 text-right">
                        {t.status === 'queued' ? (
                          <button type="button" onClick={() => cancelTask(t.id)} className="text-[11px] text-[#991B1B] hover:underline">
                            Cancel
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}

      {activeTab === 'approvals' ? (
        <>
          <PageHeader
            title="Human Approval & Governance Queue"
            subtitle="Server-enforced approval gates for supplier certifications, compliance sign-offs, quotations, financial commitments, and external buyer emails."
          />
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
          <SuccessBanner message={notice} onDismiss={() => setNotice(null)} />

          {approvals.length === 0 ? (
            <EmptyState title="No approval requests in queue" description="Restricted actions submitted by suppliers, staff, or AI agents appear here for authorized human sign-off." />
          ) : (
            <div className="space-y-3">
              {approvals.map((a) => (
                <div key={a.id} className="bg-white border border-[#E5DEC9] rounded-lg p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold text-[#1C1F1E]">{a.title}</span>
                      <span className="font-mono text-[11px] text-[#666D6A]">Requires: {a.required_role}</span>
                      <StatusLabel status={a.status} />
                    </div>
                    <p className="text-xs text-[#3A3F3D]">{a.summary}</p>
                    <div className="text-[11px] text-[#666D6A]">
                      Action: {a.action_type} · Requested by {a.requested_by_name || a.requested_by_agent_id || 'System'}
                    </div>
                  </div>
                  {a.status === 'pending' ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => decideApproval(a.id, 'approved')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#11382A] text-white text-xs font-medium rounded-md hover:bg-[#174937]"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Approve</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => decideApproval(a.id, 'rejected')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 border border-[#991B1B] text-[#991B1B] text-xs font-medium rounded-md hover:bg-[#FEF2F2]"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Reject</span>
                      </button>
                    </div>
                  ) : (
                    <div className="text-xs text-[#666D6A] shrink-0">Decided {a.decided_at}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      ) : null}

      {activeTab === 'finance' ? (
        <>
          <PageHeader
            title="Financial & Trade Ledger"
            subtitle="Track export invoices, escrow deposits, supplier payouts, freight costs, and platform commissions. Financial commitments require Founder Admin approval."
            action={
              <button
                type="button"
                onClick={() => setTxModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#11382A] text-white text-xs font-medium rounded-md hover:bg-[#174937] whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Record Financial Entry</span>
              </button>
            }
          />
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
          <SuccessBanner message={notice} onDismiss={() => setNotice(null)} />

          {transactions.length === 0 ? (
            <EmptyState title="No financial transactions recorded" description="Record an invoice, escrow deposit, or commission entry above." />
          ) : (
            <div className="bg-white border border-[#E5DEC9] rounded-lg overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E5DEC9] bg-[#FAF8F3] text-[11px] font-medium text-[#666D6A]">
                    <th className="py-3 px-4">Reference</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Counterparty</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0EAD8] text-xs">
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-[#FAF8F3]">
                      <td className="py-3 px-4 font-mono font-medium text-[#1C1F1E]">{tx.reference_code}</td>
                      <td className="py-3 px-4 capitalize text-[#3A3F3D]">{String(tx.tx_type).replace(/_/g, ' ')}</td>
                      <td className="py-3 px-4 text-[#3A3F3D]">{tx.counterparty}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">{formatUsd(tx.amount_usd)}</td>
                      <td className="py-3 px-4"><StatusLabel status={tx.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}

      {activeTab === 'audit_security' ? (
        <>
          <PageHeader
            title="Audit & Security Centre"
            subtitle="Immutable audit trail of authentication events, authorization denials, AI executions, prompt-injection alerts, and integration boundary status."
          />
          <ErrorBanner message={error} onDismiss={() => setError(null)} />

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <MetricTile label="Denied Authorizations" value={auditData.securityPosture?.deniedCount ?? 0} meta="401 / 403 server blocks" />
            <MetricTile label="Prompt Injection Alerts" value={auditData.securityPosture?.injectionAlertCount ?? 0} meta="Sanitized untrusted inputs" />
            <MetricTile
              label="AI & Session Security"
              value={auditData.securityPosture?.integrations?.geminiAi === 'configured' ? 'Gemini Active' : 'Key Missing'}
              meta={auditData.securityPosture?.sessionSecretConfigured ? 'Persistent HMAC secret active' : 'Ephemeral dev secret'}
            />
            <MetricTile
              label="Supabase Integration"
              value={
                auditData.securityPosture?.integrations?.supabase?.serviceRoleConfigured
                  ? (auditData.securityPosture?.integrations?.supabase?.schemaReady ? 'Connected' : 'Schema Pending')
                  : (auditData.securityPosture?.integrations?.supabase?.urlConfigured ? 'Anon Staged' : 'SQLite Only')
              }
              meta={
                auditData.securityPosture?.integrations?.supabase?.serviceRoleConfigured
                  ? 'Service role key configured'
                  : 'SQLite active · Awaiting service role key'
              }
            />
          </div>

          <div className="bg-white border border-[#E5DEC9] rounded-lg overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E5DEC9] bg-[#FAF8F3] text-[11px] font-medium text-[#666D6A]">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Event</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EAD8] text-xs">
                {auditData.logs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#FAF8F3]">
                    <td className="py-3 px-4 font-mono text-[11px] text-[#666D6A] whitespace-nowrap">{log.created_at}</td>
                    <td className="py-3 px-4 font-mono text-[11px] text-[#1C1F1E]">{log.event_type}</td>
                    <td className="py-3 px-4 text-[#3A3F3D]">{log.actor_email || log.actor_agent_id || 'system'}</td>
                    <td className="py-3 px-4 text-[#3A3F3D] max-w-md">{log.action}</td>
                    <td className="py-3 px-4"><StatusLabel status={log.outcome} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {/* Add Member Modal */}
      <Modal open={showMemberModal} title="Add Organisation Team Member" onClose={() => setShowMemberModal(false)}>
        <form onSubmit={addMember} className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Full Name</label>
            <input required value={memberForm.fullName} onChange={(e) => setMemberForm({ ...memberForm, fullName: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Email</label>
            <input type="email" required value={memberForm.email} onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Temporary Password</label>
            <input type="password" required minLength={8} value={memberForm.password} onChange={(e) => setMemberForm({ ...memberForm, password: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Role</label>
            <select value={memberForm.role} onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md bg-white">
              <option value="supplier_member">Supplier Member</option>
              <option value="supplier_admin">Supplier Admin</option>
              <option value="buyer_member">Buyer Member</option>
              <option value="buyer_admin">Buyer Admin</option>
              <option value="ops_manager">Ops Manager (Internal Ops only)</option>
              <option value="compliance_officer">Compliance Officer (Internal Ops only)</option>
            </select>
          </div>
          <button type="submit" className="w-full py-2.5 bg-[#11382A] text-white text-sm font-medium rounded-md">Create Member</button>
        </form>
      </Modal>

      {/* Assign AI Task Modal */}
      <Modal open={taskModalOpen} title="Assign Task to Specialized AI Agent" onClose={() => setTaskModalOpen(false)}>
        <form onSubmit={runAgentTask} className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Specialized Agent</label>
            <select value={taskForm.agentId} onChange={(e) => setTaskForm({ ...taskForm, agentId: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md bg-white">
              {aiData.agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Task Title</label>
            <input required value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md" placeholder="Evaluate Rwenzori Arabica export readiness" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Task Context (Treated as Untrusted Input)</label>
            <textarea rows={4} required value={taskForm.contextText} onChange={(e) => setTaskForm({ ...taskForm, contextText: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md" placeholder="Provide lot, supplier, or buyer parameters..." />
          </div>
          <button type="submit" disabled={busy} className="w-full py-2.5 bg-[#11382A] text-white text-sm font-medium rounded-md disabled:opacity-50">
            {busy ? 'Executing & Auditing...' : 'Execute Task'}
          </button>
        </form>
      </Modal>

      {/* Financial Transaction Modal */}
      <Modal open={txModalOpen} title="Record Financial Transaction" onClose={() => setTxModalOpen(false)}>
        <form onSubmit={createFinancialTx} className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Transaction Type</label>
            <select value={txForm.txType} onChange={(e) => setTxForm({ ...txForm, txType: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md bg-white">
              <option value="invoice">Commercial Invoice</option>
              <option value="escrow_deposit">Escrow Deposit</option>
              <option value="supplier_payout">Supplier Payout</option>
              <option value="freight_expense">Freight Expense</option>
              <option value="platform_commission">Platform Commission</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Counterparty</label>
            <input required value={txForm.counterparty} onChange={(e) => setTxForm({ ...txForm, counterparty: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Amount (USD)</label>
            <input type="number" step="0.01" required value={txForm.amountUsd} onChange={(e) => setTxForm({ ...txForm, amountUsd: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md" />
          </div>
          <button type="submit" className="w-full py-2.5 bg-[#11382A] text-white text-sm font-medium rounded-md">Submit for Approval</button>
        </form>
      </Modal>
    </div>
  );
}
