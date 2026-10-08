import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { ChannelPicker } from '@/components/marketing/shared';
import {
  SettingsError,
  type DealershipSettings,
  type SettingsResponse,
  type SettingsUpdate,
  type TestIntegration,
} from '@/hooks/useDealershipSettings';
import { CredentialField, TestButton, ToggleRow } from './SettingsControls';
import { parseList, useCredentialDrafts } from './settingsUtils';

type SectionProps = {
  data: SettingsResponse;
  save: (update: SettingsUpdate) => Promise<SettingsResponse>;
  saving: boolean;
  test: (integration: TestIntegration) => Promise<{ ok: boolean; message: string }>;
  testing: TestIntegration | null | undefined;
};

const ALL_CHANNELS = [
  'Facebook Marketplace', 'Instagram', 'TikTok', 'Dealer Website', 'Craigslist', 'YouTube Shorts', 'Google Vehicle Listings',
];

async function runSave(save: SectionProps['save'], update: SettingsUpdate, onDone?: () => void) {
  try {
    await save(update);
    toast.success('Settings saved');
    onDone?.();
  } catch (err) {
    if (err instanceof SettingsError && err.fieldErrors.length) {
      toast.error(err.fieldErrors.map((e) => e.message).join(' · '));
    } else {
      toast.error(err instanceof Error ? err.message : 'Could not save settings');
    }
  }
}

function SaveFooter({ saving, onSave, note }: { saving: boolean; onSave: () => void; note?: string }) {
  return (
    <CardFooter className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-6">
      <p className="text-xs text-muted-foreground">{note}</p>
      <Button type="button" onClick={onSave} disabled={saving} className="gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save
      </Button>
    </CardFooter>
  );
}

function CredentialsUnavailable({ data }: { data: SettingsResponse }) {
  if (data.canStoreCredentials) return null;
  return (
    <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
      The server can't store credentials yet: SETTINGS_ENCRYPTION_KEY is not set. Ask your platform administrator.
    </p>
  );
}

// ── Notifications ────────────────────────────────────────────────────────────────────────

export function NotificationSettings({ data, save, saving, test, testing }: SectionProps) {
  const [n, setN] = useState<DealershipSettings['notifications']>(data.settings.notifications);
  const [emails, setEmails] = useState(data.settings.notifications.alertEmails.join('\n'));
  const [phones, setPhones] = useState(data.settings.notifications.alertPhones.join('\n'));
  const creds = useCredentialDrafts();

  useEffect(() => {
    setN(data.settings.notifications);
    setEmails(data.settings.notifications.alertEmails.join('\n'));
    setPhones(data.settings.notifications.alertPhones.join('\n'));
  }, [data.settings.notifications]);

  const onSave = () =>
    runSave(save, {
      settings: { notifications: { ...n, alertEmails: parseList(emails), alertPhones: parseList(phones) } },
      credentials: creds.changes,
    }, creds.reset);

  const c = data.credentials;
  const noCredStore = !data.canStoreCredentials;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Notifications</CardTitle>
        <CardDescription>Where this dealership's alerts go, using its own email, SMS and Slack accounts.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <CredentialsUnavailable data={data} />

        <div className="space-y-3">
          <p className="text-sm font-semibold">Send alerts for</p>
          <ToggleRow label="New marketing leads" description="When a buyer sends an inquiry from a listing page." checked={n.events.newLead} onChange={(v) => setN({ ...n, events: { ...n.events, newLead: v } })} />
          <ToggleRow label="Alerts created by staff" description="Notifications added from the notifications panel." checked={n.events.manualAlerts} onChange={(v) => setN({ ...n, events: { ...n.events, manualAlerts: v } })} />
        </div>

        <Separator />

        <div className="space-y-4">
          <ToggleRow label="Email (SendGrid)" checked={n.emailEnabled} onChange={(v) => setN({ ...n, emailEnabled: v })} />
          <div className="grid gap-4 sm:grid-cols-2">
            <CredentialField label="SendGrid API key" state={c.sendgridApiKey} value={creds.drafts.sendgridApiKey} onChange={creds.set('sendgridApiKey')} placeholder="SG.xxxx.yyyy" disabled={noCredStore} />
            <div className="space-y-1.5">
              <Label>Send from</Label>
              <Input type="email" placeholder="alerts@yourdealership.com" value={n.fromEmail} onChange={(e) => setN({ ...n, fromEmail: e.target.value })} />
              <p className="text-xs text-muted-foreground">Must be a sender verified in your SendGrid account.</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Send email alerts to</Label>
            <Textarea rows={2} placeholder="one address per line" value={emails} onChange={(e) => setEmails(e.target.value)} />
          </div>
          <TestButton integration="email" onTest={test} testing={testing} />
        </div>

        <Separator />

        <div className="space-y-4">
          <ToggleRow label="Text messages (Twilio)" checked={n.smsEnabled} onChange={(v) => setN({ ...n, smsEnabled: v })} />
          <div className="grid gap-4 sm:grid-cols-2">
            <CredentialField label="Twilio Account SID" state={c.twilioAccountSid} value={creds.drafts.twilioAccountSid} onChange={creds.set('twilioAccountSid')} placeholder="AC…" disabled={noCredStore} />
            <CredentialField label="Twilio auth token" state={c.twilioAuthToken} value={creds.drafts.twilioAuthToken} onChange={creds.set('twilioAuthToken')} disabled={noCredStore} />
            <div className="space-y-1.5">
              <Label>Send from (Twilio number)</Label>
              <Input placeholder="+15551234567" value={n.smsFromNumber} onChange={(e) => setN({ ...n, smsFromNumber: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Text alerts to</Label>
              <Textarea rows={2} placeholder="+15551234567, one per line" value={phones} onChange={(e) => setPhones(e.target.value)} />
            </div>
          </div>
          <TestButton integration="sms" onTest={test} testing={testing} />
        </div>

        <Separator />

        <div className="space-y-4">
          <ToggleRow label="Slack" checked={n.slackEnabled} onChange={(v) => setN({ ...n, slackEnabled: v })} />
          <CredentialField
            label="Slack incoming-webhook URL"
            state={c.slackWebhookUrl}
            value={creds.drafts.slackWebhookUrl}
            onChange={creds.set('slackWebhookUrl')}
            placeholder="https://hooks.slack.com/services/…"
            help="Posts to the channel you chose when creating the webhook in your Slack workspace."
            disabled={noCredStore}
          />
          <TestButton integration="slack" onTest={test} testing={testing} />
        </div>
      </CardContent>
      <SaveFooter saving={saving} onSave={onSave} note="Save before sending a test; tests use the saved settings." />
    </Card>
  );
}

// ── Marketing ────────────────────────────────────────────────────────────────────────────

export function MarketingSettings({ data, save, saving, test, testing }: SectionProps) {
  const [m, setM] = useState<DealershipSettings['marketing']>(data.settings.marketing);
  const creds = useCredentialDrafts();
  useEffect(() => setM(data.settings.marketing), [data.settings.marketing]);

  const onSave = () => {
    if (!m.enabledChannels.length) {
      toast.error('Keep at least one channel turned on');
      return;
    }
    runSave(save, { settings: { marketing: m }, credentials: creds.changes }, creds.reset);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Marketing</CardTitle>
        <CardDescription>Which channels this dealership advertises on, and its own Facebook Page.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <CredentialsUnavailable data={data} />
        <div className="space-y-2">
          <Label>Channels your staff can publish to</Label>
          <ChannelPicker channels={ALL_CHANNELS} selected={m.enabledChannels} onChange={(next) => setM({ ...m, enabledChannels: next })} />
        </div>

        <Separator />

        <div className="space-y-4">
          <p className="text-sm font-semibold">Facebook Page</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Page ID</Label>
              <Input inputMode="numeric" placeholder="e.g. 104523456789012" value={m.facebookPageId} onChange={(e) => setM({ ...m, facebookPageId: e.target.value.trim() })} />
            </div>
            <CredentialField
              label="Page access token"
              state={data.credentials.facebookAccessToken}
              value={creds.drafts.facebookAccessToken}
              onChange={creds.set('facebookAccessToken')}
              help="A long-lived Page token with permission to publish posts."
              disabled={!data.canStoreCredentials}
            />
          </div>
          <TestButton integration="facebook" onTest={test} testing={testing} />
        </div>

        <Separator />

        <div className="max-w-xs space-y-1.5">
          <Label>"Low miles" threshold (miles per year of age)</Label>
          <Input type="number" min={1000} max={50000} value={m.lowMileagePerYear} onChange={(e) => setM({ ...m, lowMileagePerYear: Number(e.target.value) })} />
          <p className="text-xs text-muted-foreground">Listings only say "low miles" when a vehicle is under this.</p>
        </div>
      </CardContent>
      <SaveFooter saving={saving} onSave={onSave} />
    </Card>
  );
}

// ── AI ───────────────────────────────────────────────────────────────────────────────────

export function AiSettings({ data, save, saving, test, testing }: SectionProps) {
  const [enabled, setEnabled] = useState(data.settings.ai.enabled);
  useEffect(() => setEnabled(data.settings.ai.enabled), [data.settings.ai.enabled]);

  const source = !enabled ? 'AI features are off for this dealership.'
    : data.platformAiAvailable ? 'AI features use the platform\'s OpenAI key. You do not need to enter one.'
    : 'The platform has no OpenAI key set up yet, so AI features fall back to templates.';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">AI</CardTitle>
        <CardDescription>The assistant, AI Insights answers, listing text and market price checks.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ToggleRow label="Use AI features" description="When off, listing text uses the factual template, the assistant is disabled and market price checks do not run." checked={enabled} onChange={setEnabled} />
        <p className="text-sm text-muted-foreground">{source}</p>
        <TestButton integration="openai" onTest={test} testing={testing} disabled={!enabled} />
      </CardContent>
      <SaveFooter saving={saving} onSave={() => runSave(save, { settings: { ai: { enabled } } })} />
    </Card>
  );
}

// ── Dealer network ───────────────────────────────────────────────────────────────────────

export function SwapNetworkSettings({ data, save, saving }: SectionProps) {
  const [s, setS] = useState<DealershipSettings['swapNetwork']>(data.settings.swapNetwork);
  useEffect(() => setS(data.settings.swapNetwork), [data.settings.swapNetwork]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Dealer swap network</CardTitle>
        <CardDescription>Trade aging inventory with other dealerships on the platform.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ToggleRow
          label="Take part in the swap network"
          description="Other participating dealerships see your aging vehicles (year, make, model, mileage, VIN, days in stock) and your name, phone and email, and can propose trades. Prices and costs are never shared."
          checked={s.participate}
          onChange={(v) => setS({ ...s, participate: v })}
        />
        <div className="max-w-xs space-y-1.5">
          <Label>Offer vehicles after this many days in stock</Label>
          <Input type="number" min={0} max={365} value={s.minDaysInStock} onChange={(e) => setS({ ...s, minDaysInStock: Number(e.target.value) })} disabled={!s.participate} />
        </div>
      </CardContent>
      <SaveFooter saving={saving} onSave={() => runSave(save, { settings: { swapNetwork: s } })} />
    </Card>
  );
}

// ── Market pricing ───────────────────────────────────────────────────────────────────────

export function PricingSettings({ data, save, saving }: SectionProps) {
  const [s, setS] = useState<DealershipSettings['pricing']>(data.settings.pricing);
  useEffect(() => setS(data.settings.pricing), [data.settings.pricing]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Market price checks</CardTitle>
        <CardDescription>Every day, vehicles that have not sold are compared with similar listings on the web, and owners and managers are told if the price looks off.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ToggleRow
          label="Check unsold vehicles against the market"
          description="Uses the platform's AI key to search the web. A price is only ever changed when an owner or manager clicks Apply. Needs AI features to be on."
          checked={s.enabled}
          onChange={(v) => setS({ ...s, enabled: v })}
        />
        <div className="max-w-xs space-y-1.5">
          <Label>Check a vehicle after this many days unsold</Label>
          <Input type="number" min={3} max={120} value={s.staleDays} onChange={(e) => setS({ ...s, staleDays: Number(e.target.value) })} disabled={!s.enabled} />
          <p className="text-xs text-muted-foreground">Each vehicle is checked at most once a week.</p>
        </div>
      </CardContent>
      <SaveFooter saving={saving} onSave={() => runSave(save, { settings: { pricing: s } })} />
    </Card>
  );
}
