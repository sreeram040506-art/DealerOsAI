import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/**
 * Full VIN in a readable size; one click copies it. Stops the click so a surrounding
 * clickable row or card doesn't also open.
 */
export default function CopyVin({ vin, className }: { vin: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  if (!vin) return <span className="text-muted-foreground">—</span>;

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(vin);
      setCopied(true);
      toast.success('VIN copied');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy the VIN');
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      title="Copy VIN"
      aria-label={`Copy VIN ${vin}`}
      className={cn(
        'group/vin inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 -mx-1.5 font-mono text-sm font-semibold tracking-wide text-foreground hover:bg-muted/60 transition-colors',
        className,
      )}
    >
      <span className="break-all text-left">{vin}</span>
      {copied
        ? <Check className="h-3.5 w-3.5 shrink-0 text-green-600" aria-hidden="true" />
        : <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-60 group-hover/vin:opacity-100" aria-hidden="true" />}
    </button>
  );
}
