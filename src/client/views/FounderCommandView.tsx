import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { apiFetch, formatKg, formatUsd } from '../lib/api.ts';
import { EmptyState, ErrorBanner, MetricTile, PageHeader, StatusLabel, SuccessBanner } from '../components/UiPrimitives.tsx';
import { ModuleKey } from '../../shared/types.ts';
import { Play } from 'lucide-react';

export function FounderCommandView({ onNavigate }: { onNavigate: (mod: ModuleKey) => void }) {
  const [data, setData] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [targetMarket, setTargetMarket] = useState('Germany');
  const [incoterm, setIncoterm] = useState<'EXW' | 'FOB' | 'CFR' | 'CIF'>('FOB');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadOverview() {
    setLoading(true);
    try {
      const [overviewRes, prodRes] = await Promise.all([
        apiFetch('/api/founder-command/overview'),
        apiFetch('/api/products'),
      ]);
      setData(overviewRes);
      setProducts(prodRes.products || []);
      if (prodRes.products?.length && !selectedProductId) {
        setSelectedProductId(prodRes.products[0].id);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOverview();
  }, []);

  async function runOrchestration() {
    if (!selectedProductId) return;
    setRunning(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch<any>('/api/agents/orchestrate-export-pipeline', {
        method: 'POST',
        body: JSON.stringify({ productId: selectedProductId, targetMarket, incoterm }),
      });
      setNotice(
        `Export pipeline executed: ${res.matchedCount} matches computed, compliance checklist created${
          res.quotationNumber ? `, quotation ${res.quotationNumber} queued for approval` : ''
        }.${res.aiNotice ? ` (${res.aiNotice})` : ''}`
      );
      await loadOverview();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  if (loading && !data) {
    return <div className="text-sm text-[#666D6A] py-12">Loading live command metrics...</div>;
  }

  const m = data?.metrics || {};
  const chartData = (data?.pipelineByStage || []).map((row: any) => ({
    stage: String(row.stage).replace(/_/g, ' '),
    valueUsd: Number(row.valueUsd || 0),
    count: Number(row.count || 0),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Founder Command Centre"
        subtitle="Real-time export operations telemetry computed directly from persisted supplier, buyer, compliance, and commercial records."
        action={
          <button
            type="button"
            onClick={() => onNavigate('approvals')}
            className="px-4 py-2 bg-[#11382A] text-[#FAF8F3] text-xs font-medium rounded-md hover:bg-[#174937] transition-colors whitespace-nowrap"
          >
            Review Approvals ({m.pendingApprovals ?? 0})
          </button>
        }
      />

      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      <SuccessBanner message={notice} onDismiss={() => setNotice(null)} />

      {/* 4-column primary KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricTile
          label="Export Inventory Available"
          value={formatKg(m.availableInventoryKg)}
          meta={`${m.lotCount ?? 0} active lots · ${m.verifiedSuppliers ?? 0}/${m.supplierCount ?? 0} verified suppliers`}
        />
        <MetricTile
          label="Commercial Pipeline Value"
          value={formatUsd(m.pipelineValueUsd)}
          meta={`${m.opportunityCount ?? 0} opportunities · ${m.matchCount ?? 0} buyer matches`}
        />
        <MetricTile
          label="Active Quotations"
          value={formatUsd(m.quotationValueUsd)}
          meta={`${m.quotationCount ?? 0} quotes · Projected fee ${formatUsd(m.projectedCommissionUsd)}`}
        />
        <MetricTile
          label="Governance & AI Audit"
          value={`${m.pendingApprovals ?? 0} Pending`}
          meta={`${m.agentTotalRuns ?? 0} AI runs · ${m.agentFlaggedRuns ?? 0} flagged by Auditor`}
        />
      </div>

      {/* CEO End-to-End Orchestration Bar */}
      <div className="bg-white border border-[#E5DEC9] rounded-lg p-5">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="max-w-xl">
            <h2 className="text-sm font-semibold text-[#1C1F1E]">CEO Operations Pipeline Orchestrator</h2>
            <p className="text-xs text-[#666D6A] mt-1">
              Executes matching, generates destination export compliance checklists, calculates an Incoterm quotation, and submits restricted actions for human approval.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-[#666D6A] mb-1">Product</label>
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="px-3 py-2 text-xs border border-[#D9D3C4] rounded-md bg-white min-w-[200px]"
              >
                {products.length === 0 ? <option value="">No products available</option> : null}
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#666D6A] mb-1">Destination</label>
              <input
                type="text"
                value={targetMarket}
                onChange={(e) => setTargetMarket(e.target.value)}
                className="px-3 py-2 text-xs border border-[#D9D3C4] rounded-md w-32"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#666D6A] mb-1">Incoterm</label>
              <select
                value={incoterm}
                onChange={(e) => setIncoterm(e.target.value as any)}
                className="px-3 py-2 text-xs border border-[#D9D3C4] rounded-md bg-white"
              >
                <option value="EXW">EXW</option>
                <option value="FOB">FOB</option>
                <option value="CFR">CFR</option>
                <option value="CIF">CIF</option>
              </select>
            </div>
            <button
              type="button"
              disabled={running || !selectedProductId}
              onClick={runOrchestration}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#11382A] text-[#FAF8F3] text-xs font-medium rounded-md hover:bg-[#174937] disabled:opacity-50 whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{running ? 'Running Pipeline...' : 'Run Export Pipeline'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Pipeline Chart + Active Opportunities */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white border border-[#E5DEC9] rounded-lg p-5">
          <h3 className="text-sm font-semibold text-[#1C1F1E]">Pipeline Value by Stage (USD)</h3>
          <p className="text-xs text-[#666D6A] mt-0.5">Aggregated from active sales opportunities</p>
          <div className="mt-4 h-64">
            {chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-[#666D6A]">
                No sales opportunities recorded yet. Run the Export Pipeline or create a quotation.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EAE4D3" vertical={false} />
                  <XAxis dataKey="stage" tick={{ fontSize: 11, fill: '#666D6A' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#666D6A' }} />
                  <Tooltip
                    formatter={(val: any) => formatUsd(Number(val))}
                    contentStyle={{ borderColor: '#E5DEC9', borderRadius: '6px', fontSize: '12px' }}
                  />
                  <Bar dataKey="valueUsd" fill="#11382A" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="lg:col-span-7 bg-white border border-[#E5DEC9] rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E5DEC9] flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[#1C1F1E]">Recent Export Opportunities</h3>
              <p className="text-xs text-[#666D6A]">Click CRM to manage buyer negotiations and outreach drafts</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('crm')}
              className="text-xs font-medium text-[#11382A] hover:underline whitespace-nowrap"
            >
              Open CRM
            </button>
          </div>
          {(data?.recentOpportunities || []).length === 0 ? (
            <div className="p-8 text-center text-xs text-[#666D6A]">
              No active trade opportunities yet. Match a product lot to an international buyer to initiate an opportunity.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E5DEC9] text-[11px] font-medium text-[#666D6A] bg-[#FAF8F3]">
                    <th className="py-2.5 px-4">Opportunity</th>
                    <th className="py-2.5 px-4">Buyer</th>
                    <th className="py-2.5 px-4">Stage</th>
                    <th className="py-2.5 px-4 text-right">Est. Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0EAD8] text-xs">
                  {data.recentOpportunities.map((opp: any) => (
                    <tr key={opp.id} className="hover:bg-[#FAF8F3]">
                      <td className="py-3 px-4 font-medium text-[#1C1F1E]">{opp.product_name}</td>
                      <td className="py-3 px-4 text-[#3A3F3D]">{opp.buyer_name}</td>
                      <td className="py-3 px-4">
                        <StatusLabel status={opp.stage} />
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-[#1C1F1E]">
                        {formatUsd(opp.estimated_value_usd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
