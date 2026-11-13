import React, { useEffect, useState } from 'react';
import { apiFetch, formatKg, formatUsd } from '../lib/api.ts';
import { EmptyState, ErrorBanner, Modal, PageHeader, StatusLabel, SuccessBanner } from '../components/UiPrimitives.tsx';
import { Plus, ShieldCheck } from 'lucide-react';

export function SupplyModulesView({ activeTab }: { activeTab: 'suppliers' | 'products' }) {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [lots, setLots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Modals
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showLotModal, setShowLotModal] = useState(false);

  // Forms
  const [supForm, setSupForm] = useState({
    legalName: '',
    country: 'Uganda',
    region: 'Eastern Region',
    district: 'Mbale',
    cooperativeRegNo: '',
    primaryCommodities: 'Green Arabica Coffee',
    annualCapacityMt: '120',
    certificationsClaimed: 'UCDA Registered',
  });

  const [prodForm, setProdForm] = useState({
    supplierId: '',
    name: '',
    commodityCategory: 'Green Arabica Coffee',
    hsCode: '0901.11',
    variety: 'SL14 / SL28',
    grade: 'Grade AA',
    processingMethod: 'Fully Washed',
    originRegion: 'Uganda',
    unitPriceUsdPerKg: '5.50',
    minOrderKg: '1000',
    certifications: 'EUDR Polygon Ready',
  });

  const [lotForm, setLotForm] = useState({
    productId: '',
    lotCode: '',
    quantityKg: '2000',
    moisturePct: '10.8',
    screenSize: 'Screen 18',
    defectCountPer300g: '4',
    harvestDate: '2026-10-01',
    warehouseLocation: 'Kampala Export Warehouse',
  });

  async function loadAll() {
    setLoading(true);
    try {
      const [supRes, prodRes] = await Promise.all([apiFetch('/api/suppliers'), apiFetch('/api/products')]);
      setSuppliers(supRes.suppliers || []);
      setProducts(prodRes.products || []);
      setLots(prodRes.lots || []);
      if (supRes.suppliers?.length && !prodForm.supplierId) {
        setProdForm((prev) => ({ ...prev, supplierId: supRes.suppliers[0].id }));
      }
      if (prodRes.products?.length && !lotForm.productId) {
        setLotForm((prev) => ({ ...prev, productId: prodRes.products[0].id }));
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

  async function createSupplier(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/suppliers', {
        method: 'POST',
        body: JSON.stringify({
          legalName: supForm.legalName,
          country: supForm.country,
          region: supForm.region,
          district: supForm.district,
          cooperativeRegNo: supForm.cooperativeRegNo,
          primaryCommodities: supForm.primaryCommodities.split(',').map((s) => s.trim()).filter(Boolean),
          annualCapacityMt: Number(supForm.annualCapacityMt),
          certificationsClaimed: supForm.certificationsClaimed.split(',').map((s) => s.trim()).filter(Boolean),
        }),
      });
      setShowSupplierModal(false);
      setNotice('Supplier profile saved to database.');
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function submitSupplierCertification(id: string) {
    setError(null);
    try {
      const res = await apiFetch<any>(`/api/suppliers/${id}/submit-certification`, { method: 'POST' });
      setNotice(`Supplier submitted for Compliance Officer certification review (Approval ID: ${res.approvalId.slice(0, 8)}).`);
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function createProduct(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/products', {
        method: 'POST',
        body: JSON.stringify({
          supplierId: prodForm.supplierId,
          name: prodForm.name,
          commodityCategory: prodForm.commodityCategory,
          hsCode: prodForm.hsCode,
          variety: prodForm.variety,
          grade: prodForm.grade,
          processingMethod: prodForm.processingMethod,
          originRegion: prodForm.originRegion,
          unitPriceUsdPerKg: Number(prodForm.unitPriceUsdPerKg),
          minOrderKg: Number(prodForm.minOrderKg),
          certifications: prodForm.certifications.split(',').map((s) => s.trim()).filter(Boolean),
        }),
      });
      setShowProductModal(false);
      setNotice('Product catalog record created.');
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function createLot(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/lots', {
        method: 'POST',
        body: JSON.stringify({
          productId: lotForm.productId,
          lotCode: lotForm.lotCode,
          quantityKg: Number(lotForm.quantityKg),
          moisturePct: Number(lotForm.moisturePct),
          screenSize: lotForm.screenSize,
          defectCountPer300g: Number(lotForm.defectCountPer300g),
          harvestDate: lotForm.harvestDate,
          warehouseLocation: lotForm.warehouseLocation,
        }),
      });
      setShowLotModal(false);
      setNotice('Export inventory lot persisted.');
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    }
  }

  const filteredSuppliers = suppliers.filter((s) =>
    `${s.legal_name} ${s.country} ${s.region}`.toLowerCase().includes(search.toLowerCase())
  );
  const filteredProducts = products.filter((p) =>
    `${p.name} ${p.commodity_category} ${p.hs_code}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {activeTab === 'suppliers' ? (
        <>
          <PageHeader
            title="Supplier Management"
            subtitle="Agricultural cooperatives, estates, and primary exporters. AI agents cannot certify suppliers—human Compliance Officer sign-off is required."
            action={
              <button
                type="button"
                onClick={() => setShowSupplierModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#11382A] text-[#FAF8F3] text-xs font-medium rounded-md hover:bg-[#174937] whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Supplier</span>
              </button>
            }
          />
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
          <SuccessBanner message={notice} onDismiss={() => setNotice(null)} />

          <div className="flex items-center justify-between gap-4">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter suppliers by legal name, country, or region..."
              className="w-full max-w-sm px-3 py-2 text-xs bg-white border border-[#D9D3C4] rounded-md focus:outline-none focus:border-[#11382A]"
            />
            <span className="text-xs text-[#666D6A] tabular-nums">{filteredSuppliers.length} suppliers</span>
          </div>

          {loading ? (
            <div className="text-sm text-[#666D6A] py-8">Loading supplier registry...</div>
          ) : filteredSuppliers.length === 0 ? (
            <EmptyState
              title="No suppliers registered yet"
              description="Register an African agricultural cooperative or exporter to track export capacity and product lots."
              action={
                <button
                  type="button"
                  onClick={() => setShowSupplierModal(true)}
                  className="px-4 py-2 bg-[#11382A] text-white text-xs font-medium rounded-md"
                >
                  Register First Supplier
                </button>
              }
            />
          ) : (
            <div className="bg-white border border-[#E5DEC9] rounded-lg overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E5DEC9] bg-[#FAF8F3] text-[11px] font-medium text-[#666D6A]">
                    <th className="py-3 px-4">Supplier Legal Name</th>
                    <th className="py-3 px-4">Origin</th>
                    <th className="py-3 px-4">Commodities</th>
                    <th className="py-3 px-4 text-right">Capacity</th>
                    <th className="py-3 px-4">Verification</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0EAD8] text-xs">
                  {filteredSuppliers.map((s) => (
                    <tr key={s.id} className="hover:bg-[#FAF8F3]">
                      <td className="py-3 px-4">
                        <div className="font-medium text-[#1C1F1E]">{s.legal_name}</div>
                        <div className="text-[11px] text-[#666D6A]">
                          Reg: {s.cooperative_reg_no || 'Pending'}
                          {s.is_demo ? ' · Demo Record' : ''}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-[#3A3F3D]">{s.country} · {s.region}</td>
                      <td className="py-3 px-4 text-[#3A3F3D]">
                        {JSON.parse(s.primary_commodities_json || '[]').join(', ')}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">{s.annual_capacity_mt} MT/yr</td>
                      <td className="py-3 px-4"><StatusLabel status={s.verification_status} /></td>
                      <td className="py-3 px-4 text-right">
                        {s.verification_status === 'pending' ? (
                          <button
                            type="button"
                            onClick={() => submitSupplierCertification(s.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-[#11382A] text-[#11382A] rounded text-[11px] font-medium hover:bg-[#11382A] hover:text-white transition-colors whitespace-nowrap"
                          >
                            <ShieldCheck className="w-3 h-3" />
                            <span>Submit for Certification</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-[#666D6A] tabular-nums">
                            Readiness {s.export_readiness_score}%
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <>
          <PageHeader
            title="Products & Export Lots"
            subtitle="Manage commodity specifications, HS codes, moisture & defect grading, and exportable warehouse lot inventory."
            action={
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowProductModal(true)}
                  className="px-3.5 py-2 border border-[#11382A] text-[#11382A] text-xs font-medium rounded-md hover:bg-[#E4EDE9] whitespace-nowrap"
                >
                  + Add Product
                </button>
                <button
                  type="button"
                  onClick={() => setShowLotModal(true)}
                  className="px-3.5 py-2 bg-[#11382A] text-[#FAF8F3] text-xs font-medium rounded-md hover:bg-[#174937] whitespace-nowrap"
                >
                  + Add Export Lot
                </button>
              </div>
            }
          />
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
          <SuccessBanner message={notice} onDismiss={() => setNotice(null)} />

          {/* Inspection Visual Context Banner */}
          <div className="bg-white border border-[#E5DEC9] rounded-lg overflow-hidden grid grid-cols-1 md:grid-cols-12 items-stretch">
            <div className="md:col-span-4 relative min-h-[160px] bg-[#E4EDE9]">
              <img
                src="/src/assets/images/coffee_lot_arabica_1794565678932.jpg"
                alt="Green Arabica coffee export lot quality inspection"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="md:col-span-8 p-5 flex flex-col justify-between">
              <div>
                <div className="text-xs font-medium text-[#9A6F09]">Quality-Graded Export Inventory</div>
                <h2 className="mt-1 text-base font-semibold text-[#1C1F1E]">
                  Lot Traceability & Physical Specification Control
                </h2>
                <p className="mt-1 text-xs text-[#666D6A] leading-relaxed">
                  Every lot tracks origin cooperative, moisture percentage, screen size, defect count per 300g, and bonded warehouse location—feeding directly into matching, EUDR compliance, and Incoterm quotations.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-[#F0EAD8] flex flex-wrap gap-6 text-xs tabular-nums">
                <div>
                  <span className="text-[#666D6A]">Catalog Products: </span>
                  <span className="font-semibold text-[#1C1F1E]">{products.length}</span>
                </div>
                <div>
                  <span className="text-[#666D6A]">Tracked Lots: </span>
                  <span className="font-semibold text-[#1C1F1E]">{lots.length}</span>
                </div>
                <div>
                  <span className="text-[#666D6A]">Total Available: </span>
                  <span className="font-semibold text-[#11382A]">
                    {formatKg(lots.reduce((acc, l) => acc + Number(l.available_kg || 0), 0))}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-[#1C1F1E]">Export Product Catalog</h3>
            <div className="bg-white border border-[#E5DEC9] rounded-lg overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E5DEC9] bg-[#FAF8F3] text-[11px] font-medium text-[#666D6A]">
                    <th className="py-3 px-4">Product</th>
                    <th className="py-3 px-4">Supplier</th>
                    <th className="py-3 px-4">HS Code & Grade</th>
                    <th className="py-3 px-4 text-right">Target FOB</th>
                    <th className="py-3 px-4 text-right">MOQ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0EAD8] text-xs">
                  {filteredProducts.map((p) => (
                    <tr key={p.id} className="hover:bg-[#FAF8F3]">
                      <td className="py-3 px-4">
                        <div className="font-medium text-[#1C1F1E]">{p.name}</div>
                        <div className="text-[11px] text-[#666D6A]">{p.commodity_category} · {p.origin_region}</div>
                      </td>
                      <td className="py-3 px-4 text-[#3A3F3D]">{p.supplier_name}</td>
                      <td className="py-3 px-4 font-mono text-[11px] text-[#3A3F3D]">{p.hs_code} · {p.grade}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-medium">{formatUsd(p.unit_price_usd_per_kg)}/kg</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">{formatKg(p.min_order_kg)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className="text-sm font-semibold text-[#1C1F1E] pt-2">Physical Export Lots</h3>
            <div className="bg-white border border-[#E5DEC9] rounded-lg overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E5DEC9] bg-[#FAF8F3] text-[11px] font-medium text-[#666D6A]">
                    <th className="py-3 px-4">Lot Code</th>
                    <th className="py-3 px-4">Product</th>
                    <th className="py-3 px-4">Quality Specs</th>
                    <th className="py-3 px-4">Warehouse</th>
                    <th className="py-3 px-4 text-right">Available</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0EAD8] text-xs">
                  {lots.map((l) => (
                    <tr key={l.id} className="hover:bg-[#FAF8F3]">
                      <td className="py-3 px-4 font-mono font-medium text-[#1C1F1E]">{l.lot_code}</td>
                      <td className="py-3 px-4 text-[#3A3F3D]">{l.product_name}</td>
                      <td className="py-3 px-4 text-[#666D6A] tabular-nums">
                        {l.moisture_pct ? `${l.moisture_pct}% moisture` : '—'} · {l.screen_size || 'Standard'} · {l.defect_count_per_300g ?? '—'} defects/300g
                      </td>
                      <td className="py-3 px-4 text-[#3A3F3D]">{l.warehouse_location}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-medium">{formatKg(l.available_kg)}</td>
                      <td className="py-3 px-4"><StatusLabel status={l.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Create Supplier Modal */}
      <Modal open={showSupplierModal} title="Register Agricultural Supplier" onClose={() => setShowSupplierModal(false)}>
        <form onSubmit={createSupplier} className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Legal Name</label>
            <input required value={supForm.legalName} onChange={(e) => setSupForm({ ...supForm, legalName: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md" placeholder="Bugisu Highland Coffee Union Ltd" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Country</label>
              <input required value={supForm.country} onChange={(e) => setSupForm({ ...supForm, country: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Region</label>
              <input required value={supForm.region} onChange={(e) => setSupForm({ ...supForm, region: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Registration No.</label>
              <input value={supForm.cooperativeRegNo} onChange={(e) => setSupForm({ ...supForm, cooperativeRegNo: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md" placeholder="UG-COOP-..." />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Annual Capacity (MT)</label>
              <input type="number" required value={supForm.annualCapacityMt} onChange={(e) => setSupForm({ ...supForm, annualCapacityMt: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Primary Commodities (comma-separated)</label>
            <input required value={supForm.primaryCommodities} onChange={(e) => setSupForm({ ...supForm, primaryCommodities: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md" />
          </div>
          <button type="submit" className="w-full py-2.5 bg-[#11382A] text-white text-sm font-medium rounded-md hover:bg-[#174937]">Save Supplier</button>
        </form>
      </Modal>

      {/* Create Product Modal */}
      <Modal open={showProductModal} title="Add Export Product" onClose={() => setShowProductModal(false)}>
        <form onSubmit={createProduct} className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Supplier</label>
            <select required value={prodForm.supplierId} onChange={(e) => setProdForm({ ...prodForm, supplierId: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md bg-white">
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.legal_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Product Name</label>
            <input required value={prodForm.name} onChange={(e) => setProdForm({ ...prodForm, name: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md" placeholder="Bugisu Washed Arabica AA" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Category</label>
              <input required value={prodForm.commodityCategory} onChange={(e) => setProdForm({ ...prodForm, commodityCategory: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">HS Code</label>
              <input required value={prodForm.hsCode} onChange={(e) => setProdForm({ ...prodForm, hsCode: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md font-mono" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Grade</label>
              <input required value={prodForm.grade} onChange={(e) => setProdForm({ ...prodForm, grade: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">FOB USD/kg</label>
              <input type="number" step="0.01" required value={prodForm.unitPriceUsdPerKg} onChange={(e) => setProdForm({ ...prodForm, unitPriceUsdPerKg: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">MOQ (kg)</label>
              <input type="number" required value={prodForm.minOrderKg} onChange={(e) => setProdForm({ ...prodForm, minOrderKg: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Origin Region</label>
            <input required value={prodForm.originRegion} onChange={(e) => setProdForm({ ...prodForm, originRegion: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md" />
          </div>
          <button type="submit" className="w-full py-2.5 bg-[#11382A] text-white text-sm font-medium rounded-md hover:bg-[#174937]">Save Product</button>
        </form>
      </Modal>

      {/* Create Export Lot Modal */}
      <Modal open={showLotModal} title="Create Physical Export Lot" onClose={() => setShowLotModal(false)}>
        <form onSubmit={createLot} className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Product</label>
            <select required value={lotForm.productId} onChange={(e) => setLotForm({ ...lotForm, productId: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md bg-white">
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Unique Lot Code</label>
              <input required value={lotForm.lotCode} onChange={(e) => setLotForm({ ...lotForm, lotCode: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md font-mono" placeholder="UG-BUG-2026-002" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Quantity (kg)</label>
              <input type="number" required value={lotForm.quantityKg} onChange={(e) => setLotForm({ ...lotForm, quantityKg: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Moisture %</label>
              <input type="number" step="0.1" value={lotForm.moisturePct} onChange={(e) => setLotForm({ ...lotForm, moisturePct: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Screen Size</label>
              <input value={lotForm.screenSize} onChange={(e) => setLotForm({ ...lotForm, screenSize: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Defects / 300g</label>
              <input type="number" value={lotForm.defectCountPer300g} onChange={(e) => setLotForm({ ...lotForm, defectCountPer300g: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Warehouse Location</label>
            <input required value={lotForm.warehouseLocation} onChange={(e) => setLotForm({ ...lotForm, warehouseLocation: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md" />
          </div>
          <button type="submit" className="w-full py-2.5 bg-[#11382A] text-white text-sm font-medium rounded-md hover:bg-[#174937]">Create Export Lot</button>
        </form>
      </Modal>
    </div>
  );
}
