# 7. Going Online — Tunnel & Notifications

This page covers two connected topics:

- **The tunnel** — how racers' phones reach the app over the internet, and why it matters for secure
  sign-in, notifications, and payments.
- **Notifications** — sending "your race is coming up" alerts to racers' phones.

They live together because notifications (and passkeys, and payments) all depend on the tunnel's
secure `https://` address.

---

# Part A — The Tunnel

## Why a tunnel at all?

The app runs on your laptop. For a racer's phone to reach it, the phone needs a web address that
points at your laptop. There are two ways:

| Connection            | Address looks like               | Works for…                 | Problem                                                                                |
| --------------------- | -------------------------------- | -------------------------- | -------------------------------------------------------------------------------------- |
| **Local Wi-Fi (LAN)** | `http://192.168.1.42:3187`       | Phones on the _same_ Wi-Fi | It's plain `http://`, so **passkeys, notifications, and payments don't work reliably** |
| **Tunnel**            | `https://your-event.example.com` | Phones **anywhere**        | None for our purposes — this is the real-event choice                                  |

The magic ingredient is **`https://`** (the secure padlock). Phones refuse to do Face ID sign-in
(passkeys) or push notifications over plain `http://`. The tunnel gives you a proper `https://`
address, so **for any real event, use the tunnel.** Plain Wi-Fi is only okay for a quick same-room
test where nobody needs to sign in securely.

## cloudflared — the tool that makes the tunnel

The tunnel is powered by a small program called **cloudflared** (from Cloudflare). Roller Rumble can
install it for you:

1. Go to **Settings** → **Tunnel** card.
2. If you see an **Install cloudflared** button, click it. The app downloads the correct version and
   verifies it. (No Homebrew, no admin install needed.)

The Tunnel card's **cloudflared** pill tells you where the app found it.

## Two tunnel modes: Quick vs Token

There are two ways to run the tunnel. Pick based on what you're doing.

|                       | **Quick mode**                       | **Token mode**                           |
| --------------------- | ------------------------------------ | ---------------------------------------- |
| Setup effort          | None                                 | Cloudflare account + a tunnel + a domain |
| Web address           | Throwaway, **changes every time**    | **Stable**, always the same              |
| Good for              | A fast test, casual same-day use     | Real events, sharing a printed URL       |
| **Payments (Stripe)** | ❌ Not reliable (URL keeps changing) | ✅ Required                              |

**Rule of thumb:** use **Quick** to try things out; set up **Token** for any real or paid event.

---

## Quick mode (zero setup)

1. **Settings → Managed settings → Tunnel**: set **Tunnel mode** to **Quick (throwaway URL)**.
2. **Settings → Tunnel card**: make sure cloudflared is installed, then click **Start Tunnel**.
3. Wait for **Status** to read **active**. A public `https://…trycloudflare.com` address appears,
   along with a **QR code** racers can scan.

That's it — racers scan the QR (or you share the link) and they're on the secure page. Remember: if
you stop and restart, you'll get a **different** address, so re-share it.

---

## Token mode (stable URL for real events)

Token mode gives you a fixed address like `https://roller-rumble.yourdomain.com`. It takes a
one-time Cloudflare setup. You'll need a **Cloudflare account** and a **domain name** managed by
Cloudflare.

### One-time Cloudflare setup

1. Sign in at **Cloudflare** and open **Zero Trust → Networks → Tunnels**.
2. **Create a tunnel** (the "cloudflared" connector type). Give it a name (e.g. `Roller Rumble`).
3. Cloudflare shows you a **connector token** — a long string. Copy it (you'll paste it into the app).
4. Add a **Public Hostname** to the tunnel with these exact settings:
   - **Subdomain / Hostname:** the address you want, e.g. `roller-rumble.yourdomain.com`
   - **Path:** _leave empty_
   - **Service type:** `HTTP`
   - **Service URL:** `127.0.0.1:3187`

> **Two things people get wrong here:**
>
> - Do **not** point the service at `5173` — it must be `127.0.0.1:3187` (the app's backend).
> - Do **not** set the Path to `/racer`. Leave it empty. The whole app must be exposed so styles,
>   `/api`, uploads, and the live WebSocket all work. (The racer page still lives at `/racer` on that
>   address.)

### Enter it in Roller Rumble

1. **Settings → Managed settings → Tunnel**:
   - **Tunnel mode** → **Token (stable URL)**
   - **Tunnel token** → paste the connector token from Cloudflare
   - **Tunnel name** → the name you gave it (for reference)
2. **Settings → Managed settings → Network**:
   - **Public racer URL** → your address, e.g. `https://roller-rumble.yourdomain.com/racer`
3. Save. Tunnel settings only take effect after the tunnel restarts — **fully quit and reopen** the
   app to be safe.
4. **Settings → Tunnel card → Start Tunnel.** Confirm **Status: active** and that the URL matches
   your domain.

---

## Using and sharing the tunnel

- The **Tunnel card** and the projector can show a **QR code** pointing at the racer page. Racers
  scan it with their phone camera.
- With token mode, the address never changes, so you can also print it on a sign.
- To take it down, click **Stop Tunnel**. To bring it back, **Start Tunnel**.

## The LAN address (optional)

For same-network features (the admin QR, the photo booth), the app advertises your laptop's local
address automatically. If it ever shows the wrong one (laptops with several network adapters can
guess wrong), set **Settings → Managed settings → Network → Local network address** to your laptop's
actual LAN IP (usually `192.168.x.x` or `10.x.x.x`).

---

# Part B — Notifications

## What notifications do

When set up, racers can get:

- **Push alerts on their phone** — e.g. "your race is coming up" — even if the page is in their
  pocket.
- **Full-screen messages inside the page** — if they happen to have the racer page open at that
  moment.

## What notifications need

Two things:

1. **Push keys** — a secret key pair. You made these during first-time setup with **Generate Push
   Keys**. If you skipped it: **Settings → Environment → Generate Push Keys**, then fully quit and
   reopen the app.
2. **The secure tunnel** — phones only allow push over `https://`, so racers must be on the tunnel
   address (Part A), not a plain Wi-Fi link.

You can confirm setup on **Settings → Notifications**: the **Web Push** pill should read **Ready** and
**Public Key** should be **Present**. (Your private key is never displayed.)

> **Optional contact address:** Browser push services like a contact email. It's set as **Web push
> contact** in **Settings → Managed settings → Web push** (e.g. `mailto:you@example.com`). The
> Generate Push Keys button fills in a default; you can change it.

## How racers turn notifications on

Racers do this themselves on their phone:

1. On the **Me** tab (their race card), tap **Enable Notifications** — or they'll be prompted the
   first time they tap a queue/challenge button.
2. Their phone shows a permission pop-up; they tap **Allow**.

From then on, that phone gets alerts.

## Automatic notifications

The app sends some alerts on its own:

- **"Race coming up"** — when a racer's open-queue race is a few matches away.
- **"Tournament starting"** — to racers seeded into a tournament when it starts.

## Sending a message yourself

You can broadcast a message to racers from **Settings → Notifications**:

1. Choose a **Target**:
   - **All current event racers**
   - **Queued racers** (just those currently in line)
   - **Active tournament racers**
   - **Selected racers** (pick specific people from the list)
2. Type a **Message title** (up to 80 characters) and **Message body** (up to 240 characters).
3. Click **Send Notification**.

Handy for "Bikes are open, come on down!" or "We're back in 10 minutes."

## The debug list (optional)

**Show racer notification debug list** (in Settings → Notifications) makes a small recent-notifications
list appear on racers' cards. It's mainly for checking that messages are landing; leave it off for
normal events.

---

## Common tunnel & notification problems

| What you see                                  | Likely cause                                              | What to do                                                  |
| --------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------- |
| Tunnel **Status** won't go **active**         | cloudflared missing, bad token, or no internet            | Install cloudflared; recheck the token; confirm internet    |
| Token-mode URL loads but styles/QR are broken | Public Hostname pointed at `5173` or Path set to `/racer` | Fix it to `HTTP` → `127.0.0.1:3187`, Path empty             |
| Racers can open the page but can't sign in    | They're on a plain `http://` Wi-Fi link                   | Have them use the **tunnel `https://`** address / QR        |
| Quick-mode URL stopped working                | Quick URLs change on restart                              | Re-share the new URL, or switch to token mode               |
| Notifications never arrive                    | Push keys missing, or racers not on the tunnel            | Generate push keys + restart; confirm they're on the tunnel |
| **Web Push** pill says **Not configured**     | Push keys not generated/applied                           | **Generate Push Keys**, then fully restart                  |
| Racer never got the enable prompt             | They haven't tapped a queue button or opened their card   | Have them open **Me** and tap **Enable Notifications**      |

For anything else, see the **Troubleshooting** page.

---

**Next:** [Troubleshooting](08-troubleshooting.md) — a single place for diagnosing problems, plus the
diagnostics tools built into the app.
