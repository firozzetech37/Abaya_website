import { formatINR, PRODUCTION_STAGE_LABELS, type ProductionStage } from '@abaya/contracts';
import type { PushPayload, WhatsAppPayload } from './ports/notify.ports';

/**
 * Every customer- and tailor-facing notification text lives here, so Hindi/Urdu
 * can be added in one place (CLAUDE.md "UI copy"). WhatsApp template names and
 * variable order must match the templates approved in the provider dashboard
 * (docs/whatsapp-templates.md).
 */
export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function layout(heading: string, paragraphs: string[], cta?: { label: string; url: string }): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 12px;line-height:1.5">${escape(p)}</p>`).join('');
  const button = cta
    ? `<p style="margin:20px 0"><a href="${escape(cta.url)}" style="background:#1A534C;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">${escape(cta.label)}</a></p>`
    : '';
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1C1A18;max-width:560px;margin:auto;padding:24px"><h1 style="font-size:20px;margin:0 0 16px">${escape(heading)}</h1>${body}${button}<p style="color:#7D766C;font-size:12px;margin-top:32px">You are receiving this because you placed an order with us.</p></div>`;
}

const orderUrl = (webUrl: string, orderNumber: string) =>
  `${webUrl.replace(/\/$/, '')}/orders/${encodeURIComponent(orderNumber)}`;
const appOrderUrl = (orderNumber: string) => `abaya://orders/${encodeURIComponent(orderNumber)}`;
const firstName = (name: string | null) => name?.trim().split(/\s+/)[0] || 'there';

// ───────────── Order placed ─────────────

export interface OrderPlacedInput {
  name: string | null;
  orderNumber: string;
  totalInPaise: number;
  webUrl: string;
}

export function orderPlacedEmail(input: OrderPlacedInput): EmailContent {
  const lines = [
    input.name ? `Hi ${input.name},` : 'Hi,',
    `Thank you! We have received your payment of ${formatINR(input.totalInPaise)} for order ${input.orderNumber}.`,
    'Our team will confirm the design details next, then your abaya goes to one of our tailors. We will send you an update at every step.',
  ];
  return {
    subject: `Order ${input.orderNumber} confirmed`,
    text: `${lines.join('\n\n')}\n\nTrack your order: ${orderUrl(input.webUrl, input.orderNumber)}`,
    html: layout('Your order is confirmed', lines, { label: 'Track your order', url: orderUrl(input.webUrl, input.orderNumber) }),
  };
}

/** Template "order_confirmed": Hi {{1}}, we received {{2}} for order {{3}}... */
export const orderPlacedWhatsApp = (input: OrderPlacedInput, phone: string): WhatsAppPayload => ({
  phone,
  template: 'order_confirmed',
  language: 'en',
  params: [firstName(input.name), formatINR(input.totalInPaise), input.orderNumber],
});

export const orderPlacedPush = (input: OrderPlacedInput): PushPayload => ({
  app: 'CUSTOMER',
  title: 'Order confirmed',
  body: `We received your payment for ${input.orderNumber}. We'll keep you posted at every step.`,
  url: appOrderUrl(input.orderNumber),
});

// ───────────── Stage changed ─────────────

const STAGE_MESSAGES: Partial<Record<ProductionStage, string>> = {
  SPEC_APPROVED: 'We have confirmed the design and measurements for your {design}.',
  PATTERN: 'Production has started: our pattern maker is drafting the pattern for your {design} from your measurements.',
  CUTTING: 'The fabric for your {design} is being cut.',
  STITCHING: 'Your {design} is being stitched. A progress photo is on your order page.',
  QC: 'Your {design} is finished and in our quality check. A photo is on your order page.',
  PACKED: 'Your {design} has passed our quality check and is packed, ready to ship.',
  SHIPPED: 'Your {design} has shipped.',
  DELIVERED: 'Your {design} has been delivered. We hope it fits beautifully — tell us if anything needs adjusting.',
  CANCELLED: 'Your {design} has been cancelled.',
  REMAKE: 'We are remaking your {design}.',
};

export interface StageInput {
  name: string | null;
  orderNumber: string;
  designName: string;
  to: ProductionStage;
  note?: string;
  webUrl: string;
}

const stageSentence = (input: StageInput) => (STAGE_MESSAGES[input.to] ?? '').replace('{design}', input.designName);

export function stageChangedEmail(input: StageInput): EmailContent {
  const label = PRODUCTION_STAGE_LABELS[input.to];
  const lines = [input.name ? `Hi ${input.name},` : 'Hi,', stageSentence(input)];
  if (input.to === 'SHIPPED' && input.note) lines.push(`Tracking: ${input.note}`);
  if (input.to === 'CANCELLED' && input.note) lines.push(`Reason: ${input.note}`);
  return {
    subject: `${label}: order ${input.orderNumber}`,
    text: `${lines.join('\n\n')}\n\n${orderUrl(input.webUrl, input.orderNumber)}`,
    html: layout(label, lines, { label: 'View your order', url: orderUrl(input.webUrl, input.orderNumber) }),
  };
}

/**
 * Template "order_update": Hi {{1}}, update on order {{2}}: {{3}}. Track it here: {{4}}
 * (Shipping uses the same template; the tracking detail goes into {{3}}.)
 */
export function stageChangedWhatsApp(input: StageInput, phone: string): WhatsAppPayload {
  const detail = input.to === 'SHIPPED' && input.note ? `${stageSentence(input)} Tracking: ${input.note}` : stageSentence(input);
  return {
    phone,
    template: 'order_update',
    language: 'en',
    params: [firstName(input.name), input.orderNumber, detail, orderUrl(input.webUrl, input.orderNumber)],
  };
}

export const stageChangedPush = (input: StageInput): PushPayload => ({
  app: 'CUSTOMER',
  title: `${PRODUCTION_STAGE_LABELS[input.to]} · ${input.orderNumber}`,
  body: stageSentence(input),
  url: appOrderUrl(input.orderNumber),
});

// ───────────── Refund ─────────────

export interface RefundInput {
  name: string | null;
  orderNumber: string;
  amountInPaise: number;
  webUrl: string;
}

export function refundEmail(input: RefundInput): EmailContent {
  const lines = [
    input.name ? `Hi ${input.name},` : 'Hi,',
    `We have refunded ${formatINR(input.amountInPaise)} for order ${input.orderNumber}. It usually reaches your account in 5–7 working days.`,
  ];
  return {
    subject: `Refund for order ${input.orderNumber}`,
    text: lines.join('\n\n'),
    html: layout('Refund processed', lines, { label: 'View your order', url: orderUrl(input.webUrl, input.orderNumber) }),
  };
}

/** Template "refund_processed": Hi {{1}}, we refunded {{2}} for order {{3}}... */
export const refundWhatsApp = (input: RefundInput, phone: string): WhatsAppPayload => ({
  phone,
  template: 'refund_processed',
  language: 'en',
  params: [firstName(input.name), formatINR(input.amountInPaise), input.orderNumber],
});

export const refundPush = (input: RefundInput): PushPayload => ({
  app: 'CUSTOMER',
  title: 'Refund processed',
  body: `${formatINR(input.amountInPaise)} for ${input.orderNumber} is on its way to your account.`,
  url: appOrderUrl(input.orderNumber),
});
