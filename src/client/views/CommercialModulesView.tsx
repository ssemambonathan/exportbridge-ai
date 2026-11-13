import React, { useEffect, useState } from 'react';
import { apiFetch, formatKg, formatUsd } from '../lib/api.ts';
import { EmptyState, ErrorBanner, Modal, PageHeader, StatusLabel, SuccessBanner } from '../components/UiPrimitives.tsx';
import { Calculator, Check, FileCheck2, Send, Sparkles } from 'lucide-react';

export function CommercialModulesView({
  activeTab,
}: {
  activeTab: 'matching' | 'compliance' | 'quotations' | 'crm';
}) {
  const [matches, setMatches] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [buyers, setBuyers] = useState<any[]>([]);
  const [checklists, setChecklists] = useState<any[]>([]);
  const [quotations, setQuotations] = useState<any[]>([]);
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<any[]>([]);

  const [selectedProductId, setSelectedProductId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Compliance modal
  const [showChecklistModal, setShowChecklistModal] = useState(false);
  const [chkForm, setChkForm] = useState({ supplierId: '', destinationCountry: 'Germany', commodity: 'Green Arabica Coffee' });

  // Quotation modal
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [quoteForm, setQuoteForm] = useState({
    supplierId: '',
    buyerId: '',
    productId: '',
    incoterm: 'FOB' as 'EXW' | 'FOB' | 'CFR' | 'CIF',
    quantityKg: '2000',
    unitFobUsdKg: '5.45',
    commissionRatePct: '3.5',
    validityDays: '14',
  });

  // Draft modal
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [draftForm, setDraftForm] = useState({
    buyerId: '',
    opportunityId: '',
    channel: 'email' as 'email' | 'whatsapp_brief' | 'formal_offer',
    useAiAgent: false,
    subject: '',
    body: '',
    contextNotes: '',
  });

  async function loadAll() {
    setLoading(true);
    try {
      const [mRes, pRes, sRes, bRes, cRes, qRes, crmRes] = await Promise.all([
        apiFetch('/api/matches'),
        apiFetch('/api/products'),
        apiFetch('/api/suppliers'),
        apiFetch('/api/buyers'),
        apiFetch('/api/compliance/checklists'),
        apiFetch('/api/quotations'),
        apiFetch('/api/crm'),
      ]);
      setMatches(mRes.matches || []);
      setProducts(pRes.products || []);
      setSuppliers(sRes.suppliers || []);
      setBuyers(bRes.buyers || []);
      setChecklists(cRes.checklists || []);
      setQuotations(qRes.quotations || []);
      setOpportunities(crmRes.opportunities || []);
      setDrafts(crmRes.drafts || []);

      if (pRes.products?.length) {
        const p0 = pRes.products[0];
        if (!selectedProductId) setSelectedProductId(p0.id);
        setQuoteForm((prev) => ({
          ...prev,
          productId: prev.productId || p0.id,
          supplierId: prev.supplierId || p0.supplier_id,
          unitFobUsdKg: prev.unitFobUsdKg || String(p0.unit_price_usd_per_kg),
        }));
      }
      if (sRes.suppliers?.length && !chkForm.supplierId) {
        setChkForm((prev) => ({ ...prev, supplierId: sRes.suppliers[0].id }));
      }
      if (bRes.buyers?.length) {
        const b0 = bRes.buyers[0];
        setQuoteForm((prev) => ({ ...prev, buyerId: prev.buyerId || b0.id }));
        setDraftForm((prev) => ({ ...prev, buyerId: prev.buyerId || b0.id }));
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function runMatching() {
    if (!selectedProductId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<any>('/api/matches/run', {
        method: 'POST',
        body: JSON.stringify({ productId: selectedProductId }),
      });
      setNotice(`Matching engine completed: ${res.matchedCount} buyer matches scored and persisted.`);
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function updateMatchStatus(id: string, status: string) {
    try {
      await apiFetch(`/api/matches/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function createChecklist(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/compliance/checklists', { method: 'POST', body: JSON.stringify(chkForm) });
      setShowChecklistModal(false);
      setNotice('Export readiness checklist generated.');
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function updateChecklistItem(itemId: string, status: string) {
    setError(null);
    try {
      await apiFetch(`/api/compliance/items/${itemId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function submitChecklistApproval(checklistId: string) {
    setError(null);
    try {
      const res = await apiFetch<any>(`/api/compliance/checklists/${checklistId}/submit-approval`, { method: 'POST' });
      setNotice(`Compliance checklist submitted for Compliance Officer approval (${res.approvalId.slice(0, 8)}).`);
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function createQuotation(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/quotations', {
        method: 'POST',
        body: JSON.stringify({
          supplierId: quoteForm.supplierId,
          buyerId: quoteForm.buyerId,
          productId: quoteForm.productId,
          incoterm: quoteForm.incoterm,
          quantityKg: Number(quoteForm.quantityKg),
          unitFobUsdKg: Number(quoteForm.unitFobUsdKg),
          commissionRatePct: Number(quoteForm.commissionRatePct),
          validityDays: Number(quoteForm.validityDays),
        }),
      });
      setShowQuoteModal(false);
      setNotice('Quotation calculated and linked sales opportunity created.');
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function submitQuoteApproval(quoteId: string) {
    setError(null);
    try {
      const res = await apiFetch<any>(`/api/quotations/${quoteId}/submit-approval`, { method: 'POST' });
      setNotice(`Quotation submitted for human approval (${res.approvalId.slice(0, 8)}).`);
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function createCommunicationDraft(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<any>('/api/crm/drafts', {
        method: 'POST',
        body: JSON.stringify({
          buyerId: draftForm.buyerId,
          opportunityId: draftForm.opportunityId || undefined,
          channel: draftForm.channel,
          useAiAgent: draftForm.useAiAgent,
          subject: draftForm.subject,
          body: draftForm.body,
          contextNotes: draftForm.contextNotes,
        }),
      });
      setShowDraftModal(false);
      setNotice(`Communication draft queued for human approval (${res.approvalId.slice(0, 8)}) before external dispatch.`);
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendApprovedDraft(draftId: string) {
    setError(null);
    try {
      const res = await apiFetch<any>(`/api/crm/drafts/${draftId}/send`, { method: 'POST' });
      setNotice(`Communication dispatched (${res.deliveryMode}).`);
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-6">
      {activeTab === 'matching' ? (
        <>
          <PageHeader
            title="Intelligent Product-to-Buyer Matching"
            subtitle="Deterministic multi-factor matching across commodity category, lot volume, FOB price ceiling, and EUDR/verification readiness."
            action={
              <div className="flex items-center gap-2">
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="px-3 py-2 text-xs border border-[#D9D3C4] rounded-md bg-white"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={busy || !selectedProductId}
                  onClick={runMatching}
                  className="px-4 py-2 bg-[#11382A] text-white text-xs font-medium rounded-md hover:bg-[#174937] disabled:opacity-50 whitespace-nowrap"
                >
                  {busy ? 'Matching...' : 'Run Matching Engine'}
                </button>
              </div>
            }
          />
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
          <SuccessBanner message={notice} onDismiss={() => setNotice(null)} />

          {matches.length === 0 ? (
            <EmptyState
              title="No product-buyer matches calculated yet"
              description="Select a product above and run the matching engine to score prospective international buyers."
            />
          ) : (
            <div className="bg-white border border-[#E5DEC9] rounded-lg overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E5DEC9] bg-[#FAF8F3] text-[11px] font-medium text-[#666D6A]">
                    <th className="py-3 px-4">Product & Lot</th>
                    <th className="py-3 px-4">Matched Buyer</th>
                    <th className="py-3 px-4 text-right">Score Breakdown</th>
                    <th className="py-3 px-4">Rationale</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0EAD8] text-xs">
                  {matches.map((m) => (
                    <tr key={m.id} className="hover:bg-[#FAF8F3]">
                      <td className="py-3 px-4">
                        <div className="font-medium text-[#1C1F1E]">{m.product_name}</div>
                        <div className="text-[11px] text-[#666D6A] font-mono">{m.lot_code || 'No lot linked'} · {formatKg(m.available_kg)}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-[#1C1F1E]">{m.buyer_name}</div>
                        <div className="text-[11px] text-[#666D6A]">{m.buyer_country}</div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        <div className="font-semibold text-[#11382A]">{m.match_score}/100</div>
                        <div className="text-[10px] text-[#666D6A]">
                          C:{m.commodity_fit_score} V:{m.volume_fit_score} P:{m.price_fit_score} R:{m.compliance_fit_score}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-[#3A3F3D] max-w-xs">{m.rationale}</td>
                      <td className="py-3 px-4"><StatusLabel status={m.status} /></td>
                      <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => updateMatchStatus(m.id, 'shortlisted')}
                          className="px-2 py-1 border border-[#11382A] text-[#11382A] rounded text-[11px] hover:bg-[#11382A] hover:text-white"
                        >
                          Shortlist
                        </button>
                        <button
                          type="button"
                          onClick={() => updateMatchStatus(m.id, 'rejected')}
                          className="px-2 py-1 border border-[#D9D3C4] text-[#666D6A] rounded text-[11px] hover:bg-[#FAF8F3]"
                        >
                          Dismiss
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}

      {activeTab === 'compliance' ? (
        <>
          <PageHeader
            title="Export Readiness & Compliance"
            subtitle="Country- and commodity-specific export documentation checklists (UCDA, MAAIF Phytosanitary, EUR.1, EUDR Geolocation). Requires human Compliance sign-off."
            action={
              <button
                type="button"
                onClick={() => setShowChecklistModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#11382A] text-white text-xs font-medium rounded-md hover:bg-[#174937] whitespace-nowrap"
              >
                <FileCheck2 className="w-3.5 h-3.5" />
                <span>Generate Checklist</span>
              </button>
            }
          />
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
          <SuccessBanner message={notice} onDismiss={() => setNotice(null)} />

          {checklists.length === 0 ? (
            <EmptyState
              title="No export compliance checklists generated"
              description="Generate a checklist for a supplier lot and destination country to track mandatory export permits."
            />
          ) : (
            <div className="space-y-5">
              {checklists.map((c) => (
                <div key={c.id} className="bg-white border border-[#E5DEC9] rounded-lg overflow-hidden">
                  <div className="px-5 py-4 border-b border-[#E5DEC9] flex flex-wrap items-center justify-between gap-3 bg-[#FAF8F3]">
                    <div>
                      <h3 className="text-sm font-semibold text-[#1C1F1E]">
                        {c.supplier_name} · {c.commodity} to {c.destination_country}
                      </h3>
                      <div className="text-xs text-[#666D6A] tabular-nums mt-0.5">
                        Readiness {c.readiness_pct}% {c.lot_code ? `· Lot ${c.lot_code}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusLabel status={c.overall_status} />
                      {c.overall_status === 'in_progress' || c.overall_status === 'draft' ? (
                        <button
                          type="button"
                          onClick={() => submitChecklistApproval(c.id)}
                          className="px-3 py-1.5 bg-[#11382A] text-white text-xs font-medium rounded-md hover:bg-[#174937] whitespace-nowrap"
                        >
                          Submit for Compliance Sign-Off
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="divide-y divide-[#F0EAD8]">
                    {(c.items || []).map((item: any) => (
                      <div key={item.id} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                        <div>
                          <div className="font-medium text-[#1C1F1E]">
                            <span className="font-mono text-[#666D6A] mr-2">{item.requirement_code}</span>
                            {item.title}
                          </div>
                          <div className="text-[11px] text-[#666D6A] mt-0.5">
                            Authority: {item.issuing_authority} · {item.notes}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <StatusLabel status={item.status} />
                          <button
                            type="button"
                            onClick={() => updateChecklistItem(item.id, 'uploaded')}
                            className="px-2.5 py-1 border border-[#D9D3C4] rounded text-[11px] hover:bg-[#FAF8F3]"
                          >
                            Mark Uploaded
                          </button>
                          <button
                            type="button"
                            onClick={() => updateChecklistItem(item.id, 'verified')}
                            className="inline-flex items-center gap-1 px-2.5 py-1 border border-[#11382A] text-[#11382A] rounded text-[11px] hover:bg-[#11382A] hover:text-white"
                          >
                            <Check className="w-3 h-3" />
                            <span>Verify</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : null}

      {activeTab === 'quotations' ? (
        <>
          <PageHeader
            title="Commercial & Quotation Management"
            subtitle="Deterministic EXW, FOB, CFR, and CIF cost build-up with marine cargo insurance, freight, and platform commission calculation."
            action={
              <button
                type="button"
                onClick={() => setShowQuoteModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#11382A] text-white text-xs font-medium rounded-md hover:bg-[#174937] whitespace-nowrap"
              >
                <Calculator className="w-3.5 h-3.5" />
                <span>Create Quotation</span>
              </button>
            }
          />
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
          <SuccessBanner message={notice} onDismiss={() => setNotice(null)} />

          {quotations.length === 0 ? (
            <EmptyState
              title="No commercial quotations created"
              description="Calculate a structured EXW, FOB, CFR, or CIF offer for a matched buyer."
            />
          ) : (
            <div className="bg-white border border-[#E5DEC9] rounded-lg overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E5DEC9] bg-[#FAF8F3] text-[11px] font-medium text-[#666D6A]">
                    <th className="py-3 px-4">Quote No.</th>
                    <th className="py-3 px-4">Buyer & Product</th>
                    <th className="py-3 px-4">Incoterm</th>
                    <th className="py-3 px-4 text-right">Qty</th>
                    <th className="py-3 px-4 text-right">Logistics + Ins.</th>
                    <th className="py-3 px-4 text-right">Commission</th>
                    <th className="py-3 px-4 text-right">Total Contract</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0EAD8] text-xs">
                  {quotations.map((q) => {
                    const logistics = Number(q.inland_haulage_usd) + Number(q.port_handling_usd) + Number(q.ocean_freight_usd) + Number(q.marine_insurance_usd);
                    return (
                      <tr key={q.id} className="hover:bg-[#FAF8F3]">
                        <td className="py-3 px-4 font-mono font-medium text-[#1C1F1E]">{q.quote_number}</td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-[#1C1F1E]">{q.buyer_name}</div>
                          <div className="text-[11px] text-[#666D6A]">{q.product_name}</div>
                        </td>
                        <td className="py-3 px-4 font-mono">{q.incoterm}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">{formatKg(q.quantity_kg)}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">{formatUsd(logistics)}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">{formatUsd(q.commission_usd)}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-[#11382A]">{formatUsd(q.total_value_usd)}</td>
                        <td className="py-3 px-4"><StatusLabel status={q.status} /></td>
                        <td className="py-3 px-4 text-right">
                          {q.status === 'draft' ? (
                            <button
                              type="button"
                              onClick={() => submitQuoteApproval(q.id)}
                              className="px-2.5 py-1.5 border border-[#11382A] text-[#11382A] rounded text-[11px] font-medium hover:bg-[#11382A] hover:text-white whitespace-nowrap"
                            >
                              Submit for Approval
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}

      {activeTab === 'crm' ? (
        <>
          <PageHeader
            title="Sales & Customer Relationship Management"
            subtitle="Track export deal stages and prepare buyer communication drafts. External outreach is blocked server-side until approved."
            action={
              <button
                type="button"
                onClick={() => setShowDraftModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#11382A] text-white text-xs font-medium rounded-md hover:bg-[#174937] whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Compose Buyer Outreach</span>
              </button>
            }
          />
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
          <SuccessBanner message={notice} onDismiss={() => setNotice(null)} />

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-[#1C1F1E]">Sales Pipeline</h3>
            {opportunities.length === 0 ? (
              <EmptyState title="No sales opportunities" description="Create a commercial quotation to initiate a tracked export opportunity." />
            ) : (
              <div className="bg-white border border-[#E5DEC9] rounded-lg overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#E5DEC9] bg-[#FAF8F3] text-[11px] font-medium text-[#666D6A]">
                      <th className="py-3 px-4">Deal Title</th>
                      <th className="py-3 px-4">Buyer</th>
                      <th className="py-3 px-4">Stage</th>
                      <th className="py-3 px-4 text-right">Est. Value</th>
                      <th className="py-3 px-4">Next Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0EAD8] text-xs">
                    {opportunities.map((o) => (
                      <tr key={o.id} className="hover:bg-[#FAF8F3]">
                        <td className="py-3 px-4 font-medium text-[#1C1F1E]">{o.title}</td>
                        <td className="py-3 px-4 text-[#3A3F3D]">{o.buyer_name} · {o.buyer_country}</td>
                        <td className="py-3 px-4"><StatusLabel status={o.stage} /></td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">{formatUsd(o.estimated_value_usd)}</td>
                        <td className="py-3 px-4 text-[#666D6A]">{o.next_action || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h3 className="text-sm font-semibold text-[#1C1F1E] pt-2">Buyer Communication Drafts (Human Approval Gate)</h3>
            {drafts.length === 0 ? (
              <EmptyState title="No outreach drafts" description="Compose a manual or AI-assisted buyer communication draft above." />
            ) : (
              <div className="space-y-3">
                {drafts.map((d) => (
                  <div key={d.id} className="bg-white border border-[#E5DEC9] rounded-lg p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-[#1C1F1E]">{d.subject}</span>
                        <span className="text-[#666D6A]">· To: {d.buyer_name}</span>
                        <StatusLabel status={d.information_origin} />
                        <StatusLabel status={d.status} />
                      </div>
                      <p className="text-xs text-[#3A3F3D] whitespace-pre-wrap">{d.body}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => sendApprovedDraft(d.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#1C1F1E] text-white text-xs font-medium rounded-md hover:bg-[#3A3F3D] shrink-0 whitespace-nowrap"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{d.status === 'approved' ? 'Dispatch Communication' : 'Send (Requires Approval)'}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}

      {/* Compliance Checklist Modal */}
      <Modal open={showChecklistModal} title="Generate Export Readiness Checklist" onClose={() => setShowChecklistModal(false)}>
        <form onSubmit={createChecklist} className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Supplier</label>
            <select required value={chkForm.supplierId} onChange={(e) => setChkForm({ ...chkForm, supplierId: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md bg-white">
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.legal_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Commodity</label>
            <input required value={chkForm.commodity} onChange={(e) => setChkForm({ ...chkForm, commodity: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Destination Country</label>
            <input required value={chkForm.destinationCountry} onChange={(e) => setChkForm({ ...chkForm, destinationCountry: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md" />
          </div>
          <button type="submit" className="w-full py-2.5 bg-[#11382A] text-white text-sm font-medium rounded-md hover:bg-[#174937]">Generate Checklist</button>
        </form>
      </Modal>

      {/* Quotation Modal */}
      <Modal open={showQuoteModal} title="Calculate Commercial Export Quotation" onClose={() => setShowQuoteModal(false)}>
        <form onSubmit={createQuotation} className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Product</label>
            <select
              required
              value={quoteForm.productId}
              onChange={(e) => {
                const p = products.find((x) => x.id === e.target.value);
                setQuoteForm({
                  ...quoteForm,
                  productId: e.target.value,
                  supplierId: p?.supplier_id || quoteForm.supplierId,
                  unitFobUsdKg: p ? String(p.unit_price_usd_per_kg) : quoteForm.unitFobUsdKg,
                });
              }}
              className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md bg-white"
            >
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">International Buyer</label>
            <select required value={quoteForm.buyerId} onChange={(e) => setQuoteForm({ ...quoteForm, buyerId: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md bg-white">
              {buyers.map((b) => <option key={b.id} value={b.id}>{b.company_name} ({b.country})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Incoterm</label>
              <select value={quoteForm.incoterm} onChange={(e) => setQuoteForm({ ...quoteForm, incoterm: e.target.value as any })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md bg-white">
                <option value="EXW">EXW (Ex Works)</option>
                <option value="FOB">FOB (Mombasa / Port)</option>
                <option value="CFR">CFR (Cost & Freight)</option>
                <option value="CIF">CIF (Cost, Ins. & Freight)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Quantity (kg)</label>
              <input type="number" required value={quoteForm.quantityKg} onChange={(e) => setQuoteForm({ ...quoteForm, quantityKg: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Unit FOB (USD/kg)</label>
              <input type="number" step="0.01" required value={quoteForm.unitFobUsdKg} onChange={(e) => setQuoteForm({ ...quoteForm, unitFobUsdKg: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Commission (%)</label>
              <input type="number" step="0.1" required value={quoteForm.commissionRatePct} onChange={(e) => setQuoteForm({ ...quoteForm, commissionRatePct: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md" />
            </div>
          </div>
          <button type="submit" className="w-full py-2.5 bg-[#11382A] text-white text-sm font-medium rounded-md hover:bg-[#174937]">Calculate & Save Quotation</button>
        </form>
      </Modal>

      {/* Draft Modal */}
      <Modal open={showDraftModal} title="Compose Buyer Communication Draft" onClose={() => setShowDraftModal(false)}>
        <form onSubmit={createCommunicationDraft} className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Buyer</label>
            <select required value={draftForm.buyerId} onChange={(e) => setDraftForm({ ...draftForm, buyerId: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md bg-white">
              {buyers.map((b) => <option key={b.id} value={b.id}>{b.company_name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2 py-1">
            <input
              id="useAiDraft"
              type="checkbox"
              checked={draftForm.useAiAgent}
              onChange={(e) => setDraftForm({ ...draftForm, useAiAgent: e.target.checked })}
            />
            <label htmlFor="useAiDraft" className="text-xs font-medium text-[#1C1F1E]">
              Generate draft via Sales & Customer Success AI Agent
            </label>
          </div>
          {draftForm.useAiAgent ? (
            <div>
              <label className="block text-xs font-medium mb-1">Context / Offer Notes</label>
              <textarea rows={3} value={draftForm.contextNotes} onChange={(e) => setDraftForm({ ...draftForm, contextNotes: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md" placeholder="Offer 2,000 kg AA Green Arabica FOB Mombasa, sample dispatch available..." />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium mb-1">Subject</label>
                <input required value={draftForm.subject} onChange={(e) => setDraftForm({ ...draftForm, subject: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Message Body</label>
                <textarea rows={4} required value={draftForm.body} onChange={(e) => setDraftForm({ ...draftForm, body: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md" />
              </div>
            </>
          )}
          <button type="submit" disabled={busy} className="w-full py-2.5 bg-[#11382A] text-white text-sm font-medium rounded-md hover:bg-[#174937] disabled:opacity-50">
            {busy ? 'Generating & Queueing...' : 'Save Draft & Request Approval'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
