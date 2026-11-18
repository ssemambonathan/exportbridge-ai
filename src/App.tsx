import React, { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { AuthSessionContext, ModuleKey } from './shared/types.ts';
import { apiFetch } from './client/lib/api.ts';
import { signOutFirebase, subscribeFirebaseAuth } from './lib/firebase.ts';
import { AuthView } from './client/views/AuthView.tsx';
import { FounderCommandView } from './client/views/FounderCommandView.tsx';
import { SupplyModulesView } from './client/views/SupplyModulesView.tsx';
import { BuyerModulesView } from './client/views/BuyerModulesView.tsx';
import { CommercialModulesView } from './client/views/CommercialModulesView.tsx';
import { GovernanceModulesView } from './client/views/GovernanceModulesView.tsx';
import { ChatbotView } from './client/views/ChatbotView.tsx';
import { Export3DShowcaseView } from './client/views/Export3DShowcaseView.tsx';
import {
  Activity,
  Bot,
  Box,
  Briefcase,
  Building2,
  Calculator,
  CheckSquare,
  Compass,
  DollarSign,
  FileCheck2,
  FolderLock,
  GitMerge,
  Globe,
  LogOut,
  Menu,
  MessageSquare,
  Package,
  ShieldAlert,
  ShieldCheck,
  Sprout,
  X,
} from 'lucide-react';

interface NavGroup {
  label: string;
  items: Array<{ key: ModuleKey; label: string; icon: React.ComponentType<{ className?: string }> }>;
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Executive & Governance',
    items: [
      { key: 'founder_command', label: 'Founder Command', icon: Activity },
      { key: 'approvals', label: 'Human Approvals', icon: CheckSquare },
      { key: 'ai_workforce', label: 'AI Workforce (10)', icon: Bot },
      { key: 'gemini_chat', label: 'Gemini Trade Copilot', icon: MessageSquare },
    ],
  },
  {
    label: 'Supply & Origin',
    items: [
      { key: 'suppliers', label: 'Suppliers', icon: Sprout },
      { key: 'products', label: 'Products & Lots', icon: Package },
      { key: 'port_twin_3d', label: '3D Port & Lot Twin', icon: Box },
      { key: 'compliance', label: 'Export Compliance', icon: FileCheck2 },
      { key: 'documents', label: 'Document Vault', icon: FolderLock },
    ],
  },
  {
    label: 'Markets & Buyers',
    items: [
      { key: 'market_intelligence', label: 'Market Intelligence', icon: Globe },
      { key: 'buyer_discovery', label: 'Buyer Discovery', icon: Compass },
      { key: 'buyers', label: 'International Buyers', icon: Building2 },
      { key: 'buyer_verification', label: 'Buyer Verification', icon: ShieldCheck },
    ],
  },
  {
    label: 'Commercial & Finance',
    items: [
      { key: 'matching', label: 'Product Matching', icon: GitMerge },
      { key: 'quotations', label: 'Quotations', icon: Calculator },
      { key: 'crm', label: 'Sales & CRM', icon: Briefcase },
      { key: 'finance', label: 'Financial Ledger', icon: DollarSign },
    ],
  },
  {
    label: 'Platform & Security',
    items: [
      { key: 'organisations', label: 'Organisations & RBAC', icon: Building2 },
      { key: 'audit_security', label: 'Audit & Security', icon: ShieldAlert },
    ],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

export default function App() {
  const [user, setUser] = useState<AuthSessionContext | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [activeModule, setActiveModule] = useState<ModuleKey>('founder_command');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const unsub = subscribeFirebaseAuth((fbUser) => {
      setFirebaseUser(fbUser);
    });
    apiFetch<{ user: AuthSessionContext }>('/api/auth/me')
      .then((res) => setUser(res.user))
      .catch(() => setUser(null))
      .finally(() => setCheckingAuth(false));
    return () => unsub();
  }, []);

  async function handleLogout() {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // clear local session regardless
    }
    try {
      await signOutFirebase();
    } catch {
      // ignore firebase signout error if not signed into firebase
    }
    setUser(null);
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#FAF8F3] flex items-center justify-center text-sm text-[#666D6A]">
        Verifying ExportBridge AI session...
      </div>
    );
  }

  if (!user) {
    return <AuthView onAuthenticated={(u) => setUser(u)} />;
  }

  const currentItem = ALL_ITEMS.find((i) => i.key === activeModule) || ALL_ITEMS[0];

  function renderActiveModule() {
    switch (activeModule) {
      case 'founder_command':
        return <FounderCommandView onNavigate={setActiveModule} />;
      case 'gemini_chat':
        return (
          <ChatbotView
            firebaseUser={firebaseUser}
            organisationName={user!.organisationName}
          />
        );
      case 'port_twin_3d':
        return <Export3DShowcaseView />;
      case 'suppliers':
      case 'products':
        return <SupplyModulesView activeTab={activeModule} />;
      case 'buyers':
      case 'market_intelligence':
      case 'buyer_discovery':
      case 'buyer_verification':
        return <BuyerModulesView activeTab={activeModule} />;
      case 'matching':
      case 'compliance':
      case 'quotations':
      case 'crm':
        return <CommercialModulesView activeTab={activeModule} />;
      case 'organisations':
      case 'documents':
      case 'ai_workforce':
      case 'approvals':
      case 'finance':
      case 'audit_security':
        return <GovernanceModulesView activeTab={activeModule} />;
      default:
        return <FounderCommandView onNavigate={setActiveModule} />;
    }
  }

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#11382A] text-[#FAF8F3]">
      <div className="px-5 py-5 border-b border-[#FAF8F3]/10 flex items-center justify-between">
        <div>
          <div className="text-base font-semibold tracking-tight whitespace-nowrap">ExportBridge AI</div>
          <div className="text-[11px] text-[#E4EDE9]/70 truncate max-w-[190px]">{user.organisationName}</div>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden p-1 text-[#E4EDE9]"
          aria-label="Close navigation"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="px-2.5 mb-1.5 text-[11px] font-medium text-[#E4EDE9]/55">{group.label}</div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = activeModule === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      setActiveModule(item.key);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium transition-colors text-left ${
                      active
                        ? 'bg-[#FAF8F3] text-[#11382A]'
                        : 'text-[#E4EDE9]/85 hover:bg-[#174937] hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-[#FAF8F3]/10 text-xs">
        <div className="font-medium text-[#FAF8F3] truncate">{user.fullName}</div>
        <div className="text-[11px] text-[#D1A12B] font-mono mt-0.5">{user.role}</div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FAF8F3] flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 border-r border-[#0B261C] sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="w-64 h-full">{sidebarContent}</div>
          <div className="flex-1 bg-black/40" onClick={() => setMobileMenuOpen(false)} />
        </div>
      ) : null}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-white border-b border-[#E5DEC9] px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 rounded-md border border-[#E5DEC9] text-[#1C1F1E]"
              aria-label="Open navigation"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="text-xs text-[#666D6A] truncate">
              <span>ExportBridge AI</span>
              <span className="mx-2">/</span>
              <span className="font-medium text-[#1C1F1E]">{currentItem.label}</span>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <span className="hidden sm:inline text-xs text-[#666D6A] whitespace-nowrap">
              {user.email}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-[#D9D3C4] rounded-md text-xs font-medium text-[#1C1F1E] hover:bg-[#FAF8F3] whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {renderActiveModule()}
        </main>
      </div>
    </div>
  );
}
