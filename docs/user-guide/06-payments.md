# 6. Payments (Stripe)

This page is only for events where you want to **charge an entrance fee** before racers can join the
queue from their phones. Payments run through **Stripe**, a payment company that handles cards,
Apple Pay, Google Pay, and Link for you.

If you're not charging a fee, skip this whole page.

> **This is the most technical setup in the app.** Do it well before the event, on the same laptop
> you'll use at the door, and test it end to end. Budget an hour the first time. You'll need a Stripe
> account and the **tunnel** working first (see _Going Online_).

---

## What the fee actually does

- When payment is required, a racer who taps **Join** or **Challenge** on their phone is sent to a
  **Stripe Checkout** page to pay before they get in line.
- After they pay, the app automatically completes the join/challenge they were trying to do.
- The fee is **only enforced on the racer's phone.** As the host, you can always add, comp, or mark
  someone paid from the admin side — the desk is never blocked by the payment gate.

---

## Managing your Stripe account: sandbox (test) vs live

Before touching Roller Rumble, you need to understand how Stripe itself works, because this is where
most confusion happens.

### Create the account

1. Go to **stripe.com** and sign up (or log in). One free account covers everything.
2. You'll land in the **Stripe Dashboard**. This is Stripe's website where you manage payments — it's
   separate from Roller Rumble.

### The two modes: test vs live

Every Stripe account has **two completely separate worlds**:

| Mode          | Also called | What it does                               | Money                    |
| ------------- | ----------- | ------------------------------------------ | ------------------------ |
| **Test mode** | sandbox     | For practicing. Fake cards, fake payments. | No real money ever moves |
| **Live mode** | production  | For real events. Real cards, real charges. | Real money moves         |

There's a **toggle** in the Stripe Dashboard (usually a switch labeled **Test mode** near the top, or
a "Sandboxes"/"View test data" control) that flips the whole dashboard between these two worlds.

> **This is the single most important thing to get right:** test mode and live mode each have their
> **own separate keys** and their **own separate webhooks**. A test `sk_test_...` key will **not**
> work for real payments, and a live `sk_live_...` key will reject test cards. When you switch modes,
> you must re-copy the keys and re-create the webhook for that mode. More on this below.

### Practice in test mode first (always)

Do your entire setup and a few pretend races in **test mode** before an event:

- Keys copied in test mode start with `sk_test_...` and `whsec_...` (from a test-mode webhook).
- Payments use **fake test cards** (see "Testing with fake cards" below) — nothing is charged.
- You can watch payments appear in the Stripe Dashboard under **Payments** (with the test toggle on)
  to confirm the whole loop works.

### Going live for a real, paying event

When you're ready to charge real money, you have to do two things:

**1. Activate your Stripe account.** Live mode is locked until Stripe verifies your business. In the
Dashboard, look for **"Activate payments,"** **"Complete your account,"** or a similar prompt, and
provide what Stripe asks for:

- Business/individual details (name, address, tax info as required).
- A **bank account** for payouts (where the money lands).
- Identity verification.

Stripe usually approves quickly, but do this days ahead — you cannot take live payments until it's
done.

**2. Swap Roller Rumble over to the live keys.** Live mode uses _different_ keys and a _different_
webhook than test mode. To go live:

- Flip the Dashboard to **live mode** (turn the test toggle **off**).
- Copy the **live** secret key — it starts with `sk_live_...`.
- Create a **new webhook in live mode** pointing at the same `.../api/webhooks/stripe` address, and
  copy its **live** signing secret (`whsec_...`).
- In Roller Rumble → **Settings → Managed settings → Stripe**, replace the test key and webhook
  secret with the **live** ones.
- Fully quit and reopen the app, then run **Test Stripe Connection** again.

> **Switching back and forth:** If you practice in test mode and then go live, remember you're
> literally swapping the keys in Roller Rumble each time. A common event-day mistake is running a
> real event while the app still has `sk_test_...` keys — racers "pay" but no real money is
> collected. Before a paying event, confirm your key starts with `sk_live_...`.

### Enabling payment methods (Apple Pay, Google Pay, cards)

Which payment methods racers can use (cards, Apple Pay, Google Pay, Link) is controlled in the
**Stripe Dashboard**, not in Roller Rumble. In the Dashboard, find **Settings → Payments → Payment
methods** and enable the ones you want. Stripe's hosted Checkout page then offers them automatically.
Cards are on by default.

---

## The two things to understand first

### 1. You need three pieces of information from Stripe

| Piece                      | Looks like                       | Where it comes from                                               |
| -------------------------- | -------------------------------- | ----------------------------------------------------------------- |
| **Secret key**             | starts with `sk_`                | Stripe Dashboard → Developers → API keys                          |
| **Webhook signing secret** | starts with `whsec_`             | Stripe Dashboard → Developers → Webhooks (created in setup below) |
| **Public racer URL**       | `https://your-event.example.com` | Your Cloudflare tunnel address (from _Going Online_)              |

### 2. Stripe needs to be able to "call the app back"

When a racer pays, Stripe sends a **webhook** — a little "payment succeeded" message — back to the
app so it can mark the racer paid and put them in the queue. For Stripe to reach your laptop, the app
must be publicly reachable at a **stable web address**. That's the **tunnel in token mode** (a fixed
URL). A "quick" throwaway tunnel URL changes every time, so it can't be used as a reliable webhook
address.

**Bottom line: set up the token-mode tunnel first (Going Online page), then do payments.**

---

## How a payment flows (the big picture)

1. Racer taps **Join** / **Challenge** on their phone.
2. The app opens **Stripe Checkout**; the racer pays with card / Apple Pay / Google Pay.
3. Stripe charges them and sends a **webhook** to `https://your-tunnel-address/api/webhooks/stripe`.
4. The app marks that racer **paid** for the event and automatically performs their join/challenge.
5. Their phone card updates to **"Payment confirmed. You are ready to race."**

If step 3 (the webhook) doesn't arrive, the racer's card says **"Payment is processing"** and they
won't be auto-queued. Your safety net: mark them **Paid** by hand from the **Racers** tab (see
below).

---

## Setup, step by step

### Step 1 — Get your Stripe secret key

1. Log in to the **Stripe Dashboard**.
2. Go to **Developers → API keys**.
3. Copy the **Secret key** (starts with `sk_`). Keep it private — it's like a password.

> Use **test mode** keys (they contain `test`) while you practice, and switch to **live** keys for a
> real paid event. Test-mode payments use fake cards and don't move real money.

### Step 2 — Create the webhook in Stripe

1. In the Stripe Dashboard, go to **Developers → Webhooks → Add endpoint**.
2. For the **Endpoint URL**, enter your tunnel address followed by `/api/webhooks/stripe`, for
   example:
   ```
   https://your-event.example.com/api/webhooks/stripe
   ```
3. Select the events to send. The checkout completion events are the important ones (Stripe's
   "Checkout session completed" / "expired"). If unsure, you can send all events.
4. Save the endpoint.
5. Copy the endpoint's **Signing secret** (starts with `whsec_`).

### Step 3 — Enter the keys in Roller Rumble

You enter these right in the app — no file editing needed.

1. Open **Settings**, then expand the **Managed settings** card.
2. In the **Stripe** group, fill in:
   - **Stripe secret key** → your `sk_...` key.
   - **Stripe webhook secret** → your `whsec_...` secret.
3. In the **Network** group, set **Public racer URL** to your tunnel address (e.g.
   `https://your-event.example.com`).
4. Save. Managed settings are written into your settings file and re-applied. If anything doesn't
   take effect, **fully quit and reopen** the app.

### Step 4 — Test the connection

1. Go to the **Event** tab → **Event Payments** card.
2. Check the status pills: **Stripe** should read **Ready**, **Stripe Secret** = **Set**, and
   **Webhook Secret** = **Set**.
3. Click **Test Stripe Connection**.
   - Success means the app can reach Stripe from this machine.
   - Failure shows an error message (see troubleshooting below).

> **What the test does and doesn't check:** It confirms the app can _talk out_ to Stripe. It does
> **not** confirm that Stripe can _reach back_ to your webhook — that depends on your tunnel being up
> and the webhook URL being correct. Do a real test payment (test mode) to confirm the whole loop.

---

## Testing with fake cards (test mode)

The whole point of test mode is to run a **complete pretend payment** — racer taps Join, pays, gets
queued — without spending a cent. Stripe gives you fake card numbers for exactly this.

Set an entrance fee on your event (next section), make sure your keys are **test** keys
(`sk_test_...`), then on a phone open the racer page, tap **Join**, and at the Stripe Checkout page
enter a test card:

**The everyday "payment succeeds" card:**

```
Card number:  4242 4242 4242 4242
Expiry:       any future date (e.g. 12 / 34)
CVC:          any 3 digits (e.g. 123)
ZIP / postal: any (e.g. 12345)
Name:         anything
```

That card always succeeds. After "paying," the racer's card should update to **"Payment confirmed.
You are ready to race,"** and they should appear in the queue — that confirms the full loop
(including the webhook) is working.

**Useful cards for testing failures:**

| Test card number      | What it simulates                                    |
| --------------------- | ---------------------------------------------------- |
| `4242 4242 4242 4242` | A normal successful payment                          |
| `4000 0000 0000 0002` | A card that's **declined**                           |
| `4000 0000 0000 9995` | Declined for **insufficient funds**                  |
| `4000 0025 0000 3155` | Requires **extra authentication** (3D Secure pop-up) |

For all of them, use any future expiry, any CVC, and any ZIP. (Stripe keeps a full, up-to-date list
of test cards in its documentation — search "Stripe test cards" if you need more.)

> **Real cards do nothing in test mode**, and **test cards do nothing in live mode.** If a test card
> is rejected as invalid, you're probably accidentally in live mode (or using live keys). Check that
> your key starts with `sk_test_...`.

Once test payments work end to end, you're ready to switch to live keys for a real event (see
"Going live" above).

---

## Turn on the fee for your event

The fee is set **per event**, so each event can have its own price (or none).

1. Go to the **Event** tab → **Event Payments** card.
2. Set the **Entrance fee** amount (e.g. `10.00`). The minimum is **$0.50**.
3. Turn on **Require entrance fee before racer queue signup**.
4. Click **Save Payment Settings**.

The **Current Fee** pill now shows the amount, and racers joining from their phones will be sent to
Checkout.

> Leaving the "Require" toggle **off** but setting an amount means the fee is displayed as info but
> not enforced. Turn the toggle **on** to actually gate the queue.

---

## Running the desk with payments on

On the **Racers** tab, each racer shows their fee status, plus host overrides:

- **Mark Paid** — record that they paid (e.g. cash at the desk, or a payment that's "processing").
- **Waive** — let them race for free (comp).
- **Unpaid** — undo a "paid" mark.

Because host queue actions bypass the gate, you can always keep the line moving and sort out money
your own way.

---

## Behind a corporate network (Zscaler, VPN, HTTPS inspection)

Some office networks inspect HTTPS traffic (Zscaler is common). On those, the **Test Stripe
Connection** may fail with a certificate error like `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, even though
Safari or Chrome work fine. The fix is to give the app your company's trusted certificate:

1. Export your company's root certificate as a **PEM** file. On a Mac, a common way is:
   ```bash
   security find-certificate -a -c "Zscaler" -p > ~/Documents/zscaler-ca.pem
   ```
2. In **Settings → Managed settings → Stripe**, set **Stripe CA certificate file** to the full path
   of that PEM file.
3. **Fully quit and reopen** Roller Rumble, then run **Test Stripe Connection** again.

> **Never** try to "fix" this by turning off certificate checking entirely. Just point the app at the
> right certificate as above. If you can, the simplest fix is to run the event on a network without
> HTTPS inspection (like a phone hotspot).

---

## Common payment problems

| What you see                                        | Likely cause                                           | What to do                                                                                       |
| --------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Stripe pill says **Needs Setup**                    | Keys missing or not applied                            | Enter keys in Managed settings, then restart                                                     |
| **Test Stripe Connection** fails                    | No internet, wrong key, or HTTPS inspection            | Check internet/VPN, re-copy the `sk_` key, or set the CA cert (above)                            |
| Racer paid but stuck on **"Payment is processing"** | The webhook didn't reach the app                       | Check the tunnel is up and the webhook URL is correct; meanwhile **Mark Paid** on the Racers tab |
| Cert error `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`      | Corporate HTTPS inspection                             | Set the **Stripe CA certificate file** (above)                                                   |
| Test payments won't take a real card                | You're in Stripe **test mode**                         | Use Stripe's test card numbers; switch to live keys for real events                              |
| Racer isn't sent to Checkout at all                 | The fee isn't required, or they're already paid/waived | Confirm the **Require** toggle is on and their status is unpaid                                  |

For anything else, see the **Troubleshooting** page, or paste this page plus Troubleshooting into an
AI assistant with the exact error text.

---

**Next:** [Going Online — Tunnel & Notifications](07-going-online.md) — letting phones connect over
the internet and sending push alerts.
