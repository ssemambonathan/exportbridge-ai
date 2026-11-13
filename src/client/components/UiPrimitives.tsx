import React from 'react';
import { AlertCircle, CheckCircle2, Clock, X, XCircle } from 'lucide-react';

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between pb-6 border-b border-[#E5DEC9]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#1C1F1E] text-balance">{title}</h1>
        <p className="mt-1 text-sm text-[#666D6A] max-w-2xl">{subtitle}</p>
      </div>
      {action ? <div className="shrink-0 flex items-center gap-3">{action}</div> : null}
    </div>
  );
}

export function MetricTile({
  label,
  value,
  meta,
}: {
  label: string;
  value: string | number;
  meta?: string;
}) {
  return (
    <div className="bg-white border border-[#E5DEC9] rounded-lg p-5">
      <div className="text-xs font-medium text-[#666D6A]">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-[#1C1F1E] tabular-nums tracking-tight">{value}</div>
      {meta ? <div className="mt-1.5 text-xs text-[#666D6A] tabular-nums">{meta}</div> : null}
    </div>
  );
}

export function StatusLabel({ status }: { status: string }) {
  const s = (status || 'unknown').toLowerCase();
  const isPositive = ['verified', 'approved', 'completed', 'passed', 'available', 'sent', 'accepted', 'closed_won', 'settled', 'low'].includes(s);
  const isWarning = ['pending', 'under_review', 'pending_approval', 'in_progress', 'queued', 'running', 'proposed', 'shortlisted', 'awaiting_approval', 'medium', 'ai_researched', 'ai_generated', 'pending_audit'].includes(s);
  const isNegative = ['rejected', 'failed', 'cancelled', 'flagged', 'high', 'denied', 'closed_lost'].includes(s);

  const colorClass = isPositive
    ? 'text-[#11382A]'
    : isNegative
      ? 'text-[#991B1B]'
      : isWarning
        ? 'text-[#9A6F09]'
        : 'text-[#666D6A]';

  const Icon = isPositive ? CheckCircle2 : isNegative ? XCircle : Clock;
  const label = s.replace(/_/g, ' ');

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium capitalize whitespace-nowrap ${colorClass}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{label}</span>
    </span>
  );
}

export function ErrorBanner({ message, onDismiss }: { message: string | null; onDismiss?: () => void }) {
  if (!message) return null;
  return (
    <div className="flex items-start justify-between gap-3 bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] rounded-lg px-4 py-3 text-sm">
      <div className="flex items-start gap-2.5">
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
        <span>{message}</span>
      </div>
      {onDismiss ? (
        <button type="button" onClick={onDismiss} className="text-[#991B1B] hover:opacity-75" aria-label="Dismiss error">
          <X className="w-4 h-4" />
        </button>
      ) : null}
    </div>
  );
}

export function SuccessBanner({ message, onDismiss }: { message: string | null; onDismiss?: () => void }) {
  if (!message) return null;
  return (
    <div className="flex items-start justify-between gap-3 bg-[#ECFDF5] border border-[#A7F3D0] text-[#11382A] rounded-lg px-4 py-3 text-sm">
      <div className="flex items-start gap-2.5">
        <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
        <span>{message}</span>
      </div>
      {onDismiss ? (
        <button type="button" onClick={onDismiss} className="text-[#11382A] hover:opacity-75" aria-label="Dismiss notice">
          <X className="w-4 h-4" />
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-[#E5DEC9] rounded-lg p-10 text-center">
      <h3 className="text-base font-semibold text-[#1C1F1E]">{title}</h3>
      <p className="mt-1.5 text-sm text-[#666D6A] max-w-md mx-auto">{description}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#121514]/50 p-4 overflow-y-auto">
      <div className="bg-white border border-[#E5DEC9] rounded-lg w-full max-w-xl shadow-lg overflow-hidden my-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5DEC9]">
          <h2 className="text-base font-semibold text-[#1C1F1E]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-[#666D6A] hover:text-[#1C1F1E] hover:bg-[#FAF8F3]"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 max-h-[80vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
