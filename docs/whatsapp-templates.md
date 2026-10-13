# WhatsApp templates

WhatsApp only lets a business start a conversation with a **pre-approved template**.
Create these in your provider's dashboard (Interakt or Gupshup → WhatsApp → Templates),
category **Utility**, language **English**. The names and the order of the `{{n}}`
variables must match exactly — the API fills them in
(`apps/api/src/modules/notify/application/templates.ts`).

| Name | Sent when | Body (submit this text) |
| --- | --- | --- |
| `order_confirmed` | Payment captured | `Hi {{1}}, thank you for your order! We have received {{2}} for order {{3}}. We will confirm your design and measurements next and keep you posted at every step.` |
| `order_update` | Item goes to a tailor, ships, is delivered, cancelled or remade | `Hi {{1}}, an update on your order {{2}}: {{3}} Track it here: {{4}}` |
| `refund_processed` | Refund processed | `Hi {{1}}, we have refunded {{2}} for order {{3}}. It usually reaches your account in 5–7 working days.` |

Example values: `{{1}}` = first name, `{{2}}` = order number or amount (`₹4,149`),
`{{3}}` = one sentence such as "Your Butterfly Flow Abaya has shipped. Tracking: Delhivery DL123456",
`{{4}}` = order page link.

## Who receives WhatsApp messages

- Only customers who switched on **Order updates on WhatsApp** (consent `WHATSAPP_UPDATES`,
  recorded with the policy version and time) **and** saved a valid Indian mobile number.
- Only milestones: order confirmed, with the tailor, shipped, delivered, cancelled, remade,
  refunded. Every step also goes to email and app push.
- Turning the switch off stops messages immediately; the latest consent record wins.

## Setting it up

**Interakt** (`WHATSAPP_PROVIDER=interakt`)
1. Connect your WhatsApp Business number and verify the business in Meta.
2. Create and submit the three templates above; wait for approval.
3. Developer settings → copy the **Secret key** into `WHATSAPP_PROVIDER_API_KEY`.

**Gupshup** (`WHATSAPP_PROVIDER=gupshup`)
1. Create a WhatsApp app, note the **app name** (`GUPSHUP_APP_NAME`) and the business number
   with country code, digits only (`GUPSHUP_SOURCE_NUMBER`, e.g. `919812345678`).
2. Submit the templates; once approved copy each template **id** into
   `WHATSAPP_TEMPLATE_IDS`, e.g.
   `{"order_confirmed":"a1b2…","order_update":"c3d4…","refund_processed":"e5f6…"}`.
3. Put the account API key in `WHATSAPP_PROVIDER_API_KEY`.

The API refuses to start if the chosen provider is missing any of these values.
Leave `WHATSAPP_PROVIDER=none` until templates are approved.

## Delivery and retries

Messages go through the notification outbox (`Notification` table). A worker in the API
sends them within seconds and retries failures after 1 min, 5 min, 30 min, 2 h and 6 h.
Errors the provider marks as permanent (invalid number, template not approved) are not
retried; the row keeps the error text for support.
