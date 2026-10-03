import { CheckCircle2, KeyRound, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { CredentialState, TestIntegration } from '@/hooks/useDealershipSettings';

/**
 * A credential the server keeps encrypted. The saved value is never sent back; the field shows
 * whether one is configured and lets the admin replace or remove it. `value` is what will be
 * sent on save: undefined = unchanged, '' / string = set, null = remove.
 */
export function CredentialField({
  label,
  help,
  state,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  help?: React.ReactNode;
  state?: CredentialState;
  value: string | null | undefined;
  onChange: (value: string | null | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const editing = typeof value === 'string';
  const removing = value === null;

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {editing ? (
        <div className="flex gap-2">
          <Input
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
          />
          <Button type="button" variant="ghost" onClick={() => onChange(undefined)}>Cancel</Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {removing ? (
            <span className="text-destructive">Will be removed when you save</span>
          ) : state?.configured ? (
            <span className="inline-flex items-center gap-1.5 text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" /> Saved <span className="font-mono text-muted-foreground">{state.hint}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">Not set</span>
          )}
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onChange('')}>
            <KeyRound className="mr-1 h-3 w-3" /> {state?.configured ? 'Replace' : 'Add'}
          </Button>
          {state?.configured && !removing && (
            <Button type="button" size="sm" variant="ghost" className="text-destructive" disabled={disabled} onClick={() => onChange(null)}>
              Remove
            </Button>
          )}
          {removing && (
            <Button type="button" size="sm" variant="ghost" onClick={() => onChange(undefined)}>Undo</Button>
          )}
        </div>
      )}
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}

export function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="block text-xs text-muted-foreground">{description}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

export function TestButton({
  integration,
  onTest,
  testing,
  disabled,
}: {
  integration: TestIntegration;
  onTest: (integration: TestIntegration) => Promise<{ message: string }>;
  testing: TestIntegration | null | undefined;
  disabled?: boolean;
}) {
  const run = async () => {
    try {
      toast.success((await onTest(integration)).message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test failed');
    }
  };
  return (
    <Button type="button" size="sm" variant="outline" onClick={run} disabled={disabled || testing === integration}>
      {testing === integration ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Send className="mr-1 h-3 w-3" />}
      Send test
    </Button>
  );
}
