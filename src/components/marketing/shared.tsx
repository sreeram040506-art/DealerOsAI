import { Checkbox } from '@/components/ui/checkbox';

export function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${className}`}>
      {children}
    </span>
  );
}

export function ChannelPicker({
  channels,
  selected,
  onChange,
}: {
  channels: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (channel: string, on: boolean) =>
    onChange(on ? [...selected, channel] : selected.filter((c) => c !== channel));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {channels.map((channel) => (
        <label key={channel} className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox checked={selected.includes(channel)} onCheckedChange={(v) => toggle(channel, v === true)} />
          {channel}
        </label>
      ))}
    </div>
  );
}
