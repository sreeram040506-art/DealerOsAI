import sgMail from '@sendgrid/mail';
import twilio from 'twilio';
import prisma from '../db/prisma.js';
import { getDealershipSecrets, getDealershipSettings } from './dealershipSettings.js';

// Sends alerts through the dealership's own email (SendGrid), SMS (Twilio) and Slack settings.
// These were once platform-wide environment variables, so every dealership's alerts went to
// the same Slack channel from the same sender.

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function sendEmail({ apiKey, from, fromName, to, title, message, severity, type }) {
  // A client per call: the shared sgMail singleton would leak one dealership's key to another.
  const client = new sgMail.MailService();
  client.setApiKey(apiKey);
  await client.send({
    to,
    from: { email: from, name: fromName },
    subject: `[${fromName}] ${title}`,
    text: message,
    html: `<div style="font-family: sans-serif; padding: 20px; border: 1px solid #eaeaea; border-radius: 10px;">
      <h2 style="margin-top: 0;">${escapeHtml(title)}</h2>
      <p><strong>Type:</strong> ${escapeHtml(type || 'Alert')} &middot; <strong>Severity:</strong> ${escapeHtml(severity)}</p>
      <p style="font-size: 16px; line-height: 1.5; color: #333; white-space: pre-wrap;">${escapeHtml(message)}</p>
    </div>`,
  });
}

async function sendSms({ sid, token, from, to, title, message }) {
  await twilio(sid, token).messages.create({ body: `${title}: ${message}`.slice(0, 1500), from, to });
}

async function postSlack({ url, title, message, severity, type }) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: `*${title}*\n*Severity:* ${severity} · *Type:* ${type}\n\n${message}` }),
  });
  if (!response.ok) throw new Error(`Slack responded with status ${response.status}`);
}

/**
 * Dispatches an alert for one dealership. `event` is the settings toggle it falls under
 * ('newLead' or 'manualAlerts'). Returns per-channel results; never throws.
 */
export async function dispatchNotification({ dealershipId, event = 'manualAlerts', title, message, severity = 'MEDIUM', type = 'ALERT', only }) {
  const results = {};
  if (!dealershipId) return results;

  const [settings, secrets, dealership] = await Promise.all([
    getDealershipSettings(dealershipId),
    getDealershipSecrets(dealershipId),
    prisma.dealership.findUnique({ where: { id: dealershipId }, select: { name: true } }),
  ]);
  const n = settings.notifications;
  if (!only && n.events?.[event] === false) return results;
  const want = (channel) => !only || only === channel;
  const payload = { title, message, severity, type };

  if (want('email')) {
    if (!n.emailEnabled && !only) results.email = 'disabled';
    else if (!secrets.sendgridApiKey || !n.fromEmail) results.email = 'not configured';
    else if (!n.alertEmails.length) results.email = 'no recipients';
    else {
      try {
        await sendEmail({ ...payload, apiKey: secrets.sendgridApiKey, from: n.fromEmail, fromName: dealership?.name || 'Dealership', to: n.alertEmails });
        results.email = 'sent';
      } catch (err) {
        results.email = `failed: ${err.message}`;
      }
    }
  }

  if (want('sms')) {
    if (!n.smsEnabled && !only) results.sms = 'disabled';
    else if (!secrets.twilioAccountSid || !secrets.twilioAuthToken || !n.smsFromNumber) results.sms = 'not configured';
    else if (!n.alertPhones.length) results.sms = 'no recipients';
    else {
      const outcomes = await Promise.allSettled(n.alertPhones.map((to) =>
        sendSms({ ...payload, sid: secrets.twilioAccountSid, token: secrets.twilioAuthToken, from: n.smsFromNumber, to })));
      const failed = outcomes.filter((o) => o.status === 'rejected');
      results.sms = failed.length ? `failed: ${failed[0].reason?.message}` : 'sent';
    }
  }

  if (want('slack')) {
    if (!n.slackEnabled && !only) results.slack = 'disabled';
    else if (!secrets.slackWebhookUrl) results.slack = 'not configured';
    else {
      try {
        await postSlack({ ...payload, url: secrets.slackWebhookUrl });
        results.slack = 'sent';
      } catch (err) {
        results.slack = `failed: ${err.message}`;
      }
    }
  }

  const failures = Object.entries(results).filter(([, v]) => String(v).startsWith('failed'));
  if (failures.length) console.error(`[Notifications] Dealership ${dealershipId}:`, Object.fromEntries(failures));
  return results;
}
