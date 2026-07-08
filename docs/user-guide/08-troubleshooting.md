# 8. Troubleshooting

This is the one-stop page for when something isn't working. It's long on purpose — skim to your
situation, or paste this whole page (plus the page for the feature that's broken) into an AI
assistant and describe what you're seeing.

**If you only remember one thing:** open the **Settings** tab and look at the **Status** panel at the
top. It tells you what's broken and usually how to fix it. Start there.

---

## Start here: the 4-step diagnostic flow

Almost every problem is solved by this loop:

1. **Open Settings → Status panel.** The chip in the corner says either **"All systems ready"** or
   **"N need attention."**
2. **Find the row that's not green.** Each subsystem (Tunnel, Stripe, Web Push, Network, VirtualDJ,
   Photo booth, Sensor) shows a badge: **Ready**, **Degraded**, **Failed**, or **Disabled**, with a
   one-line summary.
3. **Click "Details" on the problem row.** If the app recognizes the error, it shows a plain-language
   **explanation** and a **"Try this:"** next action. Do what it says.
4. **Still stuck?** Scroll to the **Diagnostics** card, click **Save diagnostics bundle** (or **Copy
   diagnostics**), and send it to the maintainer (Michael). Secrets are never included.

Most of the time you'll fix it at step 3 without needing anyone.

---

## Reading the Status panel

- **Ready** (green) — this part is working.
- **Degraded** (yellow) — partly working or working with a warning.
- **Failed** (red) — broken; needs attention.
- **Disabled** — you haven't set this up, which is fine if you're not using it.

The **Details** expander under a row shows two things when available:

- The **explanation** — what went wrong, in plain words.
- **"Try this:"** — the exact next step to fix it.
- The **raw error** text (useful to copy into an AI assistant or send to the maintainer).

If a row is **Disabled** and you're not using that feature (say, Photo booth or Stripe), ignore it.

---

## The app's built-in guidance (recognized errors)

Roller Rumble recognizes these specific failures and tells you what to do. If you see one of these in
a Details expander, here's the same guidance, expanded:

| Error / situation                                                                         | What it means                                                                     | Fix                                                                                                                                                 |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tunnel token rejected** ("token is not valid", "401 unauthorized")                      | Cloudflare rejected your tunnel token, so the stable URL can't start              | Re-copy the connector token from Cloudflare (Tunnels → your tunnel → Configure → Token), paste it into **Tunnel token**, and **restart the tunnel** |
| **cloudflared missing** ("not found / not installed")                                     | The program that runs the tunnel isn't installed                                  | Click **Install cloudflared** in the Tunnel panel, then start the tunnel again                                                                      |
| **Stripe secure-connection failure** (certificate / TLS / SSL / "could not reach Stripe") | Usually HTTPS inspection (Zscaler / corporate VPN) blocking the secure connection | Export your org's trusted root certificate as a PEM file and paste its path into **Stripe CA certificate file** (see Payments page)                 |
| **Stripe key rejected** ("invalid API key", "invalid secret key")                         | Stripe rejected your secret key                                                   | Re-copy the secret key from Stripe (Developers → API keys); make sure you're using the right **test/live** mode key                                 |
| **Settings file not loaded**                                                              | The settings file couldn't be read, so saved settings aren't applied              | Click **Reload settings from disk**, or restart the app. If it persists, save the diagnostics bundle                                                |
| **Port already in use** ("EADDRINUSE", "address already in use")                          | Another copy of the app (or another program) is using the port                    | Quit the other copy / program and relaunch. A full restart usually clears it                                                                        |

Anything the app **doesn't** recognize shows the raw error plus a nudge to send the diagnostics
bundle.

---

## Sending diagnostics to the maintainer

When you can't fix it yourself, give Michael the information to help. In **Settings → Diagnostics**:

- **Copy diagnostics** — copies a short, redacted status summary to your clipboard. Paste it into a
  message. Fast and good for most cases.
- **Save diagnostics bundle** — saves a zip file with fuller logs. Attach it to an email/message when
  the summary isn't enough.
- **Reload settings from disk** — re-reads the settings file without a full restart (handy after you
  hand-edit the file).

**Secrets are never included** — keys and tokens show only as "set/unset" or their last four
characters. It's safe to share.

The Diagnostics card also shows your **settings file path** and whether it **exists**, plus which
files were loaded at startup — useful for confirming the app is reading the file you think it is.

---

## The golden rules (most problems trace back to these)

1. **Settings load only at startup.** Changed something and nothing happened? **Fully quit and reopen
   the app.** ("Fully quit" = the whole app, not just closing a window.)
2. **Phones need the tunnel's `https://` address.** Sign-in, notifications, and payments all fail
   over a plain `http://` Wi-Fi link. Use the tunnel QR/URL.
3. **Test mode vs live mode (Stripe) are separate worlds.** Test keys won't take real money; live
   keys reject test cards. Confirm your key prefix (`sk_test_` vs `sk_live_`).
4. **Do setup the day before, on the event laptop, on a normal network.** Corporate/inspected
   networks (Zscaler) cause the most day-of surprises.
5. **The host can always override.** You can add racers, mark them paid, waive fees, and finalize
   races manually — the desk is never truly stuck.

---

## Problem tables by area

### Starting up & installing

| Problem                                           | Cause                                  | Fix                                                 |
| ------------------------------------------------- | -------------------------------------- | --------------------------------------------------- |
| Mac won't open the app ("unidentified developer") | Unsigned app (expected)                | Right-click the app → **Open**, then **Open** again |
| Windows blocks it ("protected your PC")           | SmartScreen on unsigned app (expected) | **More info → Run anyway**                          |
| App won't start / "port already in use"           | Another copy is running                | Quit all copies, relaunch                           |
| "Port 5173 already in use" (source/dev only)      | A dev server is already running        | Close the other one, or fully quit and relaunch     |

### Settings not taking effect

| Problem                           | Cause                     | Fix                                                 |
| --------------------------------- | ------------------------- | --------------------------------------------------- |
| Saved a setting, nothing changed  | Settings apply at startup | **Fully quit and reopen**                           |
| Environment card says "Missing"   | Settings file not created | **Settings → Environment → Create & Open Env File** |
| Hand-edited the file, no change   | App hasn't re-read it     | **Reload settings from disk**, or restart           |
| Not sure the right file is loaded | Multiple env files        | Check **Diagnostics** for the path + loaded files   |

### Running a race

| Problem                                    | Cause                                                  | Fix                                                                                 |
| ------------------------------------------ | ------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Bottom tray is empty                       | Nothing staged or queued                               | Add racers to the queue (Race Desk)                                                 |
| No **Stage Next Race** button              | A race/tournament is already active                    | Finish or unstage the current race first                                            |
| Countdown won't start                      | Nothing staged                                         | **Stage Next Race**, then **Start Countdown**                                       |
| Rider quit mid-race                        | Race can't reach the finish                            | **Finalize Current** to record the result                                           |
| False start                                | Need to redo                                           | **Reset To Staged**, then **Start Countdown**                                       |
| Winner modal stuck on projector            | It's on its ~15-second timer                           | Wait, or click **Move On**                                                          |
| App closed mid-race, race is "interrupted" | Crash/close during a live race                         | **Resume Interrupted**, **Restart Race**, or **Finalize As-Is**                     |
| No riders move during a race               | (Simulator) fine; (real hardware) sensor not connected | Real-hardware sensor support is still being finished; use the simulator to practice |

### The queue

| Problem                               | Cause                                                      | Fix                                                                  |
| ------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------- |
| A racer can't join from their phone   | A tournament is active (queue paused), or they need to pay | End the tournament, or handle the fee                                |
| "Queue limit reached" on a phone      | Racer hit their max active entries                         | Raise **Max active queue entries per racer**, or wait for one to run |
| "Pick a challenge to replace" appears | Racer is fully challenge-locked at their limit             | They pick which challenge to swap, or **Cancel**                     |
| New joiners keep pushing races back   | (They shouldn't) the next few races are protected          | This is expected behavior; the top of the queue is stable            |

### Tournaments

| Problem                       | Cause                                 | Fix                                              |
| ----------------------------- | ------------------------------------- | ------------------------------------------------ |
| Racers "can't join the queue" | Tournament mode pauses the open queue | Expected; end the tournament to reopen it        |
| **Stage Next Race** is gone   | You're in tournament mode             | Stage matches from the **Bracket Board**         |
| Can't change a matchup        | A race is staged/live                 | Finalize or unstage first                        |
| Too many BYEs                 | Bracket bigger than the field         | Smaller bracket, or **Fill BYE Slot**            |
| Seeding looks unfair          | Few/no results to rank by             | Run open races first, then start the tournament  |
| Finalized a match wrong       | Human error                           | Open the match → **Undo Result** (if still safe) |

### Racer phone & sign-in

| Problem                                  | Cause                                          | Fix                                                                               |
| ---------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------- |
| No Face ID / passkey prompt              | On a plain `http://` link                      | Use the tunnel **`https://`** address / QR                                        |
| "See the host" after entering email      | Email registered, but no passkey on this phone | Use original device, race **accountless**, or host-adds them (see Racer Page doc) |
| No "Continue accountless" option         | Accountless signup disabled                    | Enable **Allow accountless racer signup**, or register/add them                   |
| Signed out after refresh                 | Rare cross-origin cookie issue                 | Sign in again; keep to the same tunnel address                                    |
| Join opens a payment screen unexpectedly | Event requires a fee                           | Expected; they pay, or you comp them                                              |

### Tunnel

| Problem                             | Cause                                          | Fix                                                   |
| ----------------------------------- | ---------------------------------------------- | ----------------------------------------------------- |
| Status won't go **active**          | cloudflared missing, bad token, or no internet | Install cloudflared; re-check token; confirm internet |
| Token URL loads but looks broken    | Public Hostname mis-pointed                    | Set it to `HTTP` → `127.0.0.1:3187`, **empty path**   |
| Quick URL stopped working           | Quick URLs change on restart                   | Re-share, or switch to token mode                     |
| "401 unauthorized" / token rejected | Wrong/expired tunnel token                     | Re-copy the connector token, restart the tunnel       |

### Notifications

| Problem                            | Cause                                       | Fix                                                     |
| ---------------------------------- | ------------------------------------------- | ------------------------------------------------------- |
| Notifications never arrive         | Push keys missing, or racers off the tunnel | Generate push keys + restart; confirm tunnel `https://` |
| **Web Push** says "Not configured" | Keys not generated/applied                  | **Generate Push Keys**, then fully restart              |
| Racer never saw the enable prompt  | Hasn't tapped a queue button / opened card  | Open **Me** → **Enable Notifications**                  |
| Racer allowed, still nothing       | Phone-level permission or focus mode        | Re-check phone notification settings for the browser    |

### Payments (Stripe)

| Problem                                        | Cause                                       | Fix                                                             |
| ---------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------- |
| Stripe says "Needs Setup"                      | Keys missing/not applied                    | Enter keys in Managed settings, restart                         |
| **Test Stripe Connection** fails               | No internet, wrong key, or HTTPS inspection | Check internet; re-copy `sk_` key; set CA cert if inspected     |
| Cert error `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` | Corporate HTTPS inspection                  | Set **Stripe CA certificate file** (Payments doc)               |
| Racer stuck on "Payment is processing"         | Webhook didn't reach the app                | Check tunnel + webhook URL; meanwhile **Mark Paid** at the desk |
| Real event, no money collected                 | App still on **test** keys                  | Confirm the key starts with `sk_live_`                          |
| Test card rejected as invalid                  | You're in **live** mode                     | Switch to test keys / test mode                                 |

### Projector (Race Display)

| Problem                             | Cause                             | Fix                                                           |
| ----------------------------------- | --------------------------------- | ------------------------------------------------------------- |
| Wrong colors / wrong side           | Lane colors flipped vs your setup | **Settings → Projector Display → Flip projector lane colors** |
| Wrong window size for the projector | Default window size               | Use the **720p / 1080p** buttons                              |
| Event name not showing              | Toggle off                        | Turn on **Show event name under the Roller Rumble title**     |
| Ticker messages not appearing       | Not saved, or list empty          | Type messages, **Save Ticker Messages**                       |

---

## Event-day emergency playbook

When you're live and something breaks, use the fast fallback — fix the root cause later.

- **Racer can't sign in / passkey trouble** → have them tap **Continue accountless** with their name
  and race now. Reconcile later.
- **Payment stuck "processing"** but they paid → **Racers tab → Mark Paid**, and queue them.
- **Someone needs to race but isn't in the system** → **Racers tab → Quick Add**, then **Add To
  Queue** (host actions bypass the fee gate).
- **A race won't finish** (rider bailed) → **Finalize Current**.
- **Tunnel died mid-event** → if everyone's on the same Wi-Fi, they can still reach the LAN address
  for viewing, but secure sign-in/payments won't work until the tunnel is back. Restart the tunnel
  (**Stop Tunnel** → **Start Tunnel**); if token mode is failing, quick mode gets you a URL fast.
- **Everything feels wedged** → **fully quit and reopen the app.** Interrupted races recover, and
  most transient issues clear.

---

## Getting help from an AI assistant

These docs are written so an AI assistant can help you from them. For the best answer:

1. Paste **this Troubleshooting page** plus the page for the broken feature (e.g. Payments).
2. Describe exactly what you did and what you saw — the **exact error text** matters most.
3. If you have it, paste the **Copy diagnostics** summary (it's safe — no secrets).
4. Ask a specific question, e.g. _"Racers get 'Payment is processing' but never get queued. The
   tunnel Status shows active. What should I check?"_

## Getting help from the maintainer

If the AI and these docs don't crack it, send Michael:

- A short description of what broke and when.
- The **Copy diagnostics** summary, or the **Save diagnostics bundle** zip.
- The exact error text from the Status → Details expander.

---

## Appendix: scary error messages decoded

| Message                                 | Plain meaning                                                                                        |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `EADDRINUSE` / "address already in use" | Another program (often a second copy of the app) is using the app's port. Quit it and restart.       |
| `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`     | A network security tool (Zscaler/VPN) is intercepting HTTPS. Add the company CA cert (Payments doc). |
| `401 unauthorized` (tunnel)             | Cloudflare rejected the tunnel token. Re-copy it.                                                    |
| "invalid API key" (Stripe)              | Wrong Stripe secret key, or wrong test/live mode.                                                    |
| "unidentified developer" (Mac)          | The app isn't code-signed. Right-click → Open.                                                       |
| "Windows protected your PC"             | SmartScreen on an unsigned app. More info → Run anyway.                                              |

---

That's the end of the handbook. Between the **Status** panel, these tables, and the diagnostics
bundle, you should be able to diagnose almost anything — and safely keep an event moving with the
host overrides even while you sort out the root cause.

**Back to:** [Handbook index](README.md)
