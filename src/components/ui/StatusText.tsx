import { AlertTriangle, CheckCircle2, Clock, MinusCircle, XCircle } from 'lucide-react';

interface StatusTextProps {
  value: string;
}

export function StatusText({ value }: StatusTextProps) {
  const normalized = value.toLowerCase();

  if (
    ['approved', 'fit', 'available', 'completed', 'successful', 'normal', 'negative', 'certified', 'stable', 'nominal', 'eligible', 'ready'].includes(
      normalized,
    )
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{value}</span>
      </span>
    );
  }

  if (
    ['pending', 'waiting', 'proposed', 'evaluated', 'registered', 'urgent', 'recovering', 'critical window', 'conditional', 'limited', 'high load'].includes(
      normalized,
    )
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
        <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{value}</span>
      </span>
    );
  }

  if (['allocated', 'confirmed', 'transplanted', 'retrieved'].includes(normalized)) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700 whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{value}</span>
      </span>
    );
  }

  if (
    ['emergency', 'critical', 'rejected', 'unfit', 'expired', 'failed', 'abnormal', 'positive', 'complication', 'deceased', 'ineligible', 'busy'].includes(
      normalized,
    )
  ) {
    const isCritical = ['emergency', 'critical', 'complication', 'abnormal', 'busy'].includes(normalized);
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-700 whitespace-nowrap">
        {isCritical ? (
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        )}
        <span>{value}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 whitespace-nowrap">
      <MinusCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{value}</span>
    </span>
  );
}
