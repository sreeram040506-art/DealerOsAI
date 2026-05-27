import sgMail from '@sendgrid/mail';
import twilio from 'twilio';

// Load configurations
const sendgridApiKey = process.env.SENDGRID_API_KEY;
const sendgridFromEmail = process.env.SENDGRID_FROM_EMAIL || 'notifications@dealer-os.ai';
if (sendgridApiKey) {
  sgMail.setApiKey(sendgridApiKey);
}

const twilioSid = process.env.TWILIO_ACCOUNT_SID;
const twilioToken = process.env.TWILIO_AUTH_TOKEN;
const twilioFromPhone = process.env.TWILIO_PHONE_NUMBER || '+1234567890';
let twilioClient = null;
if (twilioSid && twilioToken) {
  twilioClient = twilio(twilioSid, twilioToken);
}

const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;

/**
 * Dispatch notification across configured channels (SMS, Email, Slack webhooks)
 */
export async function dispatchNotification({ title, message, severity, type, recipientEmail, recipientPhone }) {
  console.log(`[Notification Dispatcher] Initiating dispatch for: [${severity}] ${title}`);

  // 1. Send Email (SendGrid)
  if (sendgridApiKey && recipientEmail) {
    try {
      await sgMail.send({
        to: recipientEmail,
        from: sendgridFromEmail,
        subject: `[DealerOS Alert] ${title}`,
        text: message,
        html: `<div style="font-family: sans-serif; padding: 20px; border: 1px solid #eaeaea; border-radius: 10px;">
          <h2 style="color: #4f46e5; margin-top: 0;">DealerOS Notification</h2>
          <p><strong>Type:</strong> ${type || 'Alert'}</p>
          <p><strong>Severity:</strong> ${severity}</p>
          <hr style="border: 0; border-top: 1px solid #eaeaea; margin: 20px 0;" />
          <p style="font-size: 16px; line-height: 1.5; color: #333;">${message}</p>
        </div>`,
      });
      console.log(`[SendGrid] Email sent successfully to ${recipientEmail}`);
    } catch (err) {
      console.error('[SendGrid] Email dispatch failed:', err.message);
    }
  } else {
    console.log(`[SendGrid] Email dispatch skipped (API Key or Recipient Email missing). Email context: to=${recipientEmail || 'N/A'}, content="${message}"`);
  }

  // 2. Send SMS (Twilio)
  if (twilioClient && recipientPhone) {
    try {
      await twilioClient.messages.create({
        body: `[DealerOS Alert] ${title}: ${message}`,
        from: twilioFromPhone,
        to: recipientPhone,
      });
      console.log(`[Twilio] SMS sent successfully to ${recipientPhone}`);
    } catch (err) {
      console.error('[Twilio] SMS dispatch failed:', err.message);
    }
  } else {
    console.log(`[Twilio] SMS dispatch skipped (Twilio not configured or phone missing). SMS context: to=${recipientPhone || 'N/A'}, content="${message}"`);
  }

  // 3. Post to Slack Webhook
  if (slackWebhookUrl) {
    try {
      const payload = {
        text: `*🚨 DealerOS Alert:* _${title}_\n*Severity:* ${severity}\n*Type:* ${type}\n\n${message}`,
      };
      const response = await fetch(slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(`Slack API responded with status ${response.status}`);
      }
      console.log('[Slack] Posted notification successfully to webhook');
    } catch (err) {
      console.error('[Slack] Post failed:', err.message);
    }
  } else {
    console.log(`[Slack] Post skipped (Webhook URL missing). Slack context: content="${message}"`);
  }
}
