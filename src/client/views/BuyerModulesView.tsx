import React, { useEffect, useState } from 'react';
import { apiFetch, formatUsd } from '../lib/api.ts';
import { EmptyState, ErrorBanner, Modal, PageHeader, StatusLabel, SuccessBanner } from '../components/UiPrimitives.tsx';
import { ExternalLink, Globe, Plus, Search, ShieldAlert } from 'lucide-react';

export function BuyerModulesView({
  activeTab,
}: {
  activeTab: 'buyers' | 'market_intelligence' | 'buyer_discovery' | 'buyer_verification';
}) {
  const [buyers, setBuyers] = useState<any[]>([]);
  const [briefs, setBriefs] = useState<any[]>([]);
  const [evidence, setEvidence] = useState<any[]>([]);
  const [verifications, setVerifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [showBuyerModal, setShowBuyerModal] = useState(false);
  const [buyerForm, setBuyerForm] = useState({
    companyName: '',
    country: 'Netherlands',
    city: 'Rotterdam',
    website: '',
    contactName: '',
    contactEmail: '',
    importCategories: 'Green Arabica Coffee',
    annualVolumeMt: '60',
    preferredIncoterms: 'FOB',
    targetPriceMaxUsdKg: '6.25',
  });

  const [researchForm, setResearchForm] = useState({
    commodity: 'Green Arabica Coffee',
    hsCode: '0901.11',
    originCountry: 'Uganda',
    targetMarket: 'Germany',
  });

  async function loadAll() {
    setLoading(true);
    try {
      const [bRes, mRes, eRes, vRes] = await Promise.all([
        apiFetch('/api/buyers'),
        apiFetch('/api/market-intelligence'),
        apiFetch('/api/buyer-discovery/evidence'),
        apiFetch('/api/buyer-verifications'),
      ]);
      setBuyers(bRes.buyers || []);
      setBriefs(mRes.briefs || []);
      setEvidence(eRes.evidence || []);
      setVerifications(vRes.verifications || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function createBuyer(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/buyers', {
        method: 'POST',
        body: JSON.stringify({
          ...buyerForm,
          importCategories: buyerForm.importCategories.split(',').map((s) => s.trim()).filter(Boolean),
          annualVolumeMt: Number(buyerForm.annualVolumeMt),
          targetPriceMaxUsdKg: buyerForm.targetPriceMaxUsdKg ? Number(buyerForm.targetPriceMaxUsdKg) : undefined,
        }),
      });
      setShowBuyerModal(false);
      setNotice('International buyer saved to directory.');
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function runMarketResearch(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch('/api/market-intelligence/research', {
        method: 'POST',
        body: JSON.stringify(researchForm),
      });
      setNotice('Grounded market intelligence brief generated and saved with source citations.');
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function runBuyerDiscovery(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch<any>('/api/buyer-discovery/discover', {
        method: 'POST',
        body: JSON.stringify({
          commodity: researchForm.commodity,
          originCountry: researchForm.originCountry,
          targetMarket: researchForm.targetMarket,
        }),
      });
      setNotice(
        `Discovery workflow completed: ${res.discoveredBuyers?.length || 0} prospective buyers stored as unverified with ${res.groundingSources?.length || 0} grounded citations.`
      );
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function runBuyerAssessment(buyerId: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch<any>(`/api/buyers/${buyerId}/assess`, { method: 'POST' });
      setNotice(`Buyer suitability assessment complete and routed for Compliance approval (${res.approvalId.slice(0, 8)}).`);
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {activeTab === 'buyers' ? (
        <>
          <PageHeader
            title="International Buyer Directory"
            subtitle="Manage global agricultural importers, roasters, and trading houses. Distinguishes human-verified accounts from AI-researched leads."
            action={
              <button
                type="button"
                onClick={() => setShowBuyerModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#11382A] text-[#FAF8F3] text-xs font-medium rounded-md hover:bg-[#174937] whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Buyer</span>
              </button>
            }
          />
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
          <SuccessBanner message={notice} onDismiss={() => setNotice(null)} />

          {loading ? (
            <div className="text-sm text-[#666D6A] py-8">Loading buyer directory...</div>
          ) : buyers.length === 0 ? (
            <EmptyState
              title="No international buyers registered"
              description="Add a known importer manually or run the International Buyer Discovery workflow."
            />
          ) : (
            <div className="bg-white border border-[#E5DEC9] rounded-lg overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E5DEC9] bg-[#FAF8F3] text-[11px] font-medium text-[#666D6A]">
                    <th className="py-3 px-4">Company</th>
                    <th className="py-3 px-4">Market</th>
                    <th className="py-3 px-4">Import Categories</th>
                    <th className="py-3 px-4 text-right">Volume / Incoterm</th>
                    <th className="py-3 px-4">Origin / Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0EAD8] text-xs">
                  {buyers.map((b) => (
                    <tr key={b.id} className="hover:bg-[#FAF8F3]">
                      <td className="py-3 px-4">
                        <div className="font-medium text-[#1C1F1E]">{b.company_name}</div>
                        <div className="text-[11px] text-[#666D6A]">
                          {b.website || 'No website recorded'}
                          {b.is_demo ? ' · Demo Record' : ''}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-[#3A3F3D]">{b.country}{b.city ? ` · ${b.city}` : ''}</td>
                      <td className="py-3 px-4 text-[#3A3F3D]">{JSON.parse(b.import_categories_json || '[]').join(', ')}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {b.annual_volume_mt} MT · {b.preferred_incoterms}
                      </td>
                      <td className="py-3 px-4">
                        <StatusLabel status={b.verification_status} />
                        <div className="text-[11px] text-[#666D6A] mt-0.5">
                          Source: {String(b.source_type).replace(/_/g, ' ')} · Risk: {b.risk_tier}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => runBuyerAssessment(b.id)}
                          className="px-2.5 py-1.5 border border-[#11382A] text-[#11382A] rounded text-[11px] font-medium hover:bg-[#11382A] hover:text-white transition-colors whitespace-nowrap disabled:opacity-50"
                        >
                          Assess Risk
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

      {activeTab === 'market_intelligence' ? (
        <>
          <PageHeader
            title="Market Intelligence"
            subtitle="Grounded commodity demand briefs, HS tariff notes, and reference FOB/CIF benchmarks. AI-generated findings are explicitly labelled."
          />
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
          <SuccessBanner message={notice} onDismiss={() => setNotice(null)} />

          <form onSubmit={runMarketResearch} className="bg-white border border-[#E5DEC9] rounded-lg p-5 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <div>
              <label className="block text-xs font-medium mb-1">Commodity</label>
              <input required value={researchForm.commodity} onChange={(e) => setResearchForm({ ...researchForm, commodity: e.target.value })} className="w-full px-3 py-2 text-xs border border-[#D9D3C4] rounded-md" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">HS Code</label>
              <input required value={researchForm.hsCode} onChange={(e) => setResearchForm({ ...researchForm, hsCode: e.target.value })} className="w-full px-3 py-2 text-xs border border-[#D9D3C4] rounded-md font-mono" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Origin</label>
              <input required value={researchForm.originCountry} onChange={(e) => setResearchForm({ ...researchForm, originCountry: e.target.value })} className="w-full px-3 py-2 text-xs border border-[#D9D3C4] rounded-md" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Target Market</label>
              <input required value={researchForm.targetMarket} onChange={(e) => setResearchForm({ ...researchForm, targetMarket: e.target.value })} className="w-full px-3 py-2 text-xs border border-[#D9D3C4] rounded-md" />
            </div>
            <button type="submit" disabled={busy} className="inline-flex items-center justify-center gap-1.5 py-2 px-4 bg-[#11382A] text-white text-xs font-medium rounded-md hover:bg-[#174937] disabled:opacity-50 whitespace-nowrap">
              <Globe className="w-3.5 h-3.5" />
              <span>{busy ? 'Researching...' : 'Run Market Brief'}</span>
            </button>
          </form>

          {briefs.length === 0 ? (
            <EmptyState
              title="No market intelligence briefs yet"
              description="Execute the Market Research Agent above to generate a grounded commodity brief with web citations."
            />
          ) : (
            <div className="space-y-4">
              {briefs.map((b) => {
                const sources = JSON.parse(b.sources_json || '[]');
                return (
                  <div key={b.id} className="bg-white border border-[#E5DEC9] rounded-lg p-5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-[#1C1F1E]">
                          {b.commodity} · {b.target_market}
                        </h3>
                        <div className="text-xs text-[#666D6A] font-mono tabular-nums mt-0.5">
                          HS {b.hs_code} · Benchmark {b.benchmark_price_usd_kg ? `${formatUsd(b.benchmark_price_usd_kg)}/kg` : 'Unquoted'}
                        </div>
                      </div>
                      <StatusLabel status={b.information_origin} />
                    </div>
                    <p className="text-xs text-[#3A3F3D] leading-relaxed">{b.summary}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-[#F0EAD8] text-xs">
                      <div>
                        <span className="font-medium text-[#1C1F1E]">Demand Trend: </span>
                        <span className="text-[#3A3F3D]">{b.demand_trend}</span>
                      </div>
                      <div>
                        <span className="font-medium text-[#1C1F1E]">Tariff / Regulatory Notes: </span>
                        <span className="text-[#3A3F3D]">{b.tariff_notes}</span>
                      </div>
                    </div>
                    {sources.length > 0 ? (
                      <div className="pt-2 border-t border-[#F0EAD8] text-[11px] text-[#666D6A] flex flex-wrap gap-3">
                        <span className="font-medium text-[#1C1F1E]">Grounded Sources:</span>
                        {sources.map((src: any, i: number) => (
                          <a key={i} href={src.uri} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#11382A] hover:underline">
                            <span>{src.title || src.uri}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : null}

      {activeTab === 'buyer_discovery' ? (
        <>
          <PageHeader
            title="International Buyer Discovery"
            subtitle="Discovers prospective importers using live grounded web search and stores verifiable research evidence. Never fabricates buyer records."
          />
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
          <SuccessBanner message={notice} onDismiss={() => setNotice(null)} />

          <form onSubmit={runBuyerDiscovery} className="bg-white border border-[#E5DEC9] rounded-lg p-5 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-xs font-medium mb-1">Commodity</label>
              <input required value={researchForm.commodity} onChange={(e) => setResearchForm({ ...researchForm, commodity: e.target.value })} className="w-full px-3 py-2 text-xs border border-[#D9D3C4] rounded-md" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Origin Country</label>
              <input required value={researchForm.originCountry} onChange={(e) => setResearchForm({ ...researchForm, originCountry: e.target.value })} className="w-full px-3 py-2 text-xs border border-[#D9D3C4] rounded-md" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Destination Market</label>
              <input required value={researchForm.targetMarket} onChange={(e) => setResearchForm({ ...researchForm, targetMarket: e.target.value })} className="w-full px-3 py-2 text-xs border border-[#D9D3C4] rounded-md" />
            </div>
            <button type="submit" disabled={busy} className="inline-flex items-center justify-center gap-1.5 py-2 px-4 bg-[#11382A] text-white text-xs font-medium rounded-md hover:bg-[#174937] disabled:opacity-50 whitespace-nowrap">
              <Search className="w-3.5 h-3.5" />
              <span>{busy ? 'Searching...' : 'Discover Prospective Buyers'}</span>
            </button>
          </form>

          {evidence.length === 0 ? (
            <EmptyState
              title="No buyer research evidence captured yet"
              description="Run the Buyer Discovery workflow to query real agricultural importers and store source citations."
            />
          ) : (
            <div className="bg-white border border-[#E5DEC9] rounded-lg overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E5DEC9] bg-[#FAF8F3] text-[11px] font-medium text-[#666D6A]">
                    <th className="py-3 px-4">Prospect / Reference</th>
                    <th className="py-3 px-4">Research Query</th>
                    <th className="py-3 px-4">Evidence Excerpt</th>
                    <th className="py-3 px-4">Source Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0EAD8] text-xs">
                  {evidence.map((ev) => (
                    <tr key={ev.id} className="hover:bg-[#FAF8F3]">
                      <td className="py-3 px-4 font-medium text-[#1C1F1E]">{ev.company_name || ev.source_title}</td>
                      <td className="py-3 px-4 text-[#666D6A]">{ev.query}</td>
                      <td className="py-3 px-4 text-[#3A3F3D] max-w-md">{ev.excerpt}</td>
                      <td className="py-3 px-4">
                        {ev.source_url?.startsWith('http') ? (
                          <a href={ev.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#11382A] hover:underline">
                            <span>Inspect Source</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-[#666D6A]">{ev.confidence_label}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}

      {activeTab === 'buyer_verification' ? (
        <>
          <PageHeader
            title="Buyer Verification & Qualification"
            subtitle="Structured counterparty risk screening, corporate registry verification, and suitability scoring before commercial quotation."
          />
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
          <SuccessBanner message={notice} onDismiss={() => setNotice(null)} />

          {verifications.length === 0 ? (
            <EmptyState
              title="No counterparty assessments recorded"
              description="Open the International Buyer Directory and select 'Assess Risk' on any prospective buyer to run due diligence."
            />
          ) : (
            <div className="bg-white border border-[#E5DEC9] rounded-lg overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E5DEC9] bg-[#FAF8F3] text-[11px] font-medium text-[#666D6A]">
                    <th className="py-3 px-4">Buyer</th>
                    <th className="py-3 px-4">Suitability Score</th>
                    <th className="py-3 px-4">Risk Tier</th>
                    <th className="py-3 px-4">Findings Summary</th>
                    <th className="py-3 px-4">Approval Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0EAD8] text-xs">
                  {verifications.map((v) => (
                    <tr key={v.id} className="hover:bg-[#FAF8F3]">
                      <td className="py-3 px-4">
                        <div className="font-medium text-[#1C1F1E]">{v.company_name}</div>
                        <div className="text-[11px] text-[#666D6A]">{v.country}</div>
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums font-semibold">{v.suitability_score}/100</td>
                      <td className="py-3 px-4"><StatusLabel status={v.risk_tier} /></td>
                      <td className="py-3 px-4 text-[#3A3F3D] max-w-md">{v.findings_summary}</td>
                      <td className="py-3 px-4"><StatusLabel status={v.verification_status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}

      <Modal open={showBuyerModal} title="Register International Buyer" onClose={() => setShowBuyerModal(false)}>
        <form onSubmit={createBuyer} className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Company Name</label>
            <input required value={buyerForm.companyName} onChange={(e) => setBuyerForm({ ...buyerForm, companyName: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md" placeholder="Amsterdam Green Coffee Traders BV" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Country</label>
              <input required value={buyerForm.country} onChange={(e) => setBuyerForm({ ...buyerForm, country: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">City</label>
              <input value={buyerForm.city} onChange={(e) => setBuyerForm({ ...buyerForm, city: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Website</label>
              <input value={buyerForm.website} onChange={(e) => setBuyerForm({ ...buyerForm, website: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md" placeholder="https://..." />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Contact Email</label>
              <input type="email" value={buyerForm.contactEmail} onChange={(e) => setBuyerForm({ ...buyerForm, contactEmail: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Import Categories (comma-separated)</label>
            <input required value={buyerForm.importCategories} onChange={(e) => setBuyerForm({ ...buyerForm, importCategories: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Volume (MT/yr)</label>
              <input type="number" required value={buyerForm.annualVolumeMt} onChange={(e) => setBuyerForm({ ...buyerForm, annualVolumeMt: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Incoterm</label>
              <select value={buyerForm.preferredIncoterms} onChange={(e) => setBuyerForm({ ...buyerForm, preferredIncoterms: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md bg-white">
                <option value="EXW">EXW</option>
                <option value="FOB">FOB</option>
                <option value="CFR">CFR</option>
                <option value="CIF">CIF</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Max Price $/kg</label>
              <input type="number" step="0.01" value={buyerForm.targetPriceMaxUsdKg} onChange={(e) => setBuyerForm({ ...buyerForm, targetPriceMaxUsdKg: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md" />
            </div>
          </div>
          <button type="submit" className="w-full py-2.5 bg-[#11382A] text-white text-sm font-medium rounded-md hover:bg-[#174937]">Save Buyer</button>
        </form>
      </Modal>
    </div>
  );
}
