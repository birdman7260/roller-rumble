# 2. First-Time Setup

This page gets Roller Rumble installed and ready on a laptop, from a blank machine to "I can create
an event." You only do most of this **once per laptop**. Set aside 20–30 minutes the first time.

> **Do this before the event, not at the door.** Some steps need internet and a restart. Get the
> laptop fully set up and tested a day ahead.

Here's the whole journey at a glance:

1. Install the app.
2. Open it for the first time and get past the "unknown developer" warning.
3. Create the settings file.
4. Generate the notification keys.
5. (Optional, but recommended for real events) Set up the internet tunnel and payments — these have
   their own detailed pages.
6. Restart and confirm everything is green.

---

## Step 1 — Install the app

Wyatt and Jackson: you install Roller Rumble like any normal app, by downloading it. You do **not**
need to be a programmer for this path.

1. Go to the project's **GitHub Releases** page (Michael will give you the link).
2. Download the file for your computer:
   - **Mac:** the file ending in **`.dmg`**
   - **Windows:** the file ending in **`.exe`**
3. Install it the normal way:
   - **Mac:** open the `.dmg`, then drag **Roller Rumble** into your **Applications** folder.
   - **Windows:** run the `.exe` installer and follow the prompts.

> **Which Mac file?** Newer Macs (Apple silicon / M1, M2, M3, …) and older Intel Macs may have
> different `.dmg` files. If you're unsure, pick the one Michael points you to, or the one labeled
> for "Apple silicon" on modern Macs.

---

## Step 2 — Open it the first time (get past the safety warning)

The app is **not code-signed** yet (code-signing is a paid certificate we haven't set up). That's
normal and safe — but your computer will show a scary-looking warning the first time. Here's how to
get past it. You only have to do this once.

### On a Mac

1. Double-clicking may show _"Roller Rumble can't be opened because it is from an unidentified
   developer."_
2. Instead, **right-click** (or Control-click) the Roller Rumble app in Applications and choose
   **Open**.
3. Click **Open** again on the follow-up dialog.

After you do this once, it opens normally from then on.

### On Windows

1. Windows SmartScreen may show _"Windows protected your PC."_
2. Click **More info**.
3. Click **Run anyway**.

---

## Step 3 — Create the settings file

Roller Rumble keeps its private settings (like notification keys and payment keys) in a small text
file called the **environment file** — usually written as `.env.local`. You don't create it by
hand. The app makes it for you.

1. Open Roller Rumble. The **Admin Display** appears.
2. Click the **Settings** tab on the left.
3. Scroll to the **Environment** card. (It may be collapsed — click its title to expand it.)
4. Click **Create & Open Env File**.

This does two things:

- Creates the settings file in the right place for your computer.
- Opens it in your default text editor so you can see it.

The file starts with helpful comments explaining each setting. For most of setup you won't edit it
by hand — the buttons in the app fill it in for you.

> **Where does this file live?** You normally don't need to know, but for reference:
>
> - **Mac:** `~/Library/Application Support/Roller Rumble/.env.local`
> - **Windows:** `%APPDATA%\Roller Rumble\.env.local`
>
> The Environment card also shows the exact path on your machine, and a **Local Env File** status of
> **Present** or **Missing**.

> **Golden rule:** The app reads this file **only when it starts up**. Any time you change it (by
> hand or with a button), you must **fully quit and reopen Roller Rumble** for the change to take
> effect. "Fully quit" means the whole app is closed, not just the window.

---

## Step 4 — Generate the notification keys

Racers can get push notifications on their phones ("your race is coming up"). For that to work, the
app needs a matched pair of secret **push keys**. The app can generate these for you.

1. Still on **Settings → Environment**, click **Generate Push Keys**.
2. If it warns that push already looks configured, that's a safety check — on a fresh setup you can
   confirm. (Only regenerate later if you have a specific reason; see the note below.)
3. **Fully quit and reopen Roller Rumble.**

That's it. The app has now written the notification keys into your settings file.

> **Do this once.** If racers have already turned on notifications at a past event and you generate
> _new_ keys, those racers may have to turn notifications on again. During first-time setup there's
> nothing to lose, so generate away.

The full notifications topic (how racers turn them on, sending manual messages) is covered on the
**Going Online** page.

---

## Step 5 — Optional but recommended: tunnel and payments

For a real event where racers join from their own phones, you'll usually also want:

- **The internet tunnel** — so phones can reach the app from anywhere, and so secure phone sign-in
  (passkeys) and notifications work reliably. Set up on the **Going Online** page.
- **Payments (Stripe)** — only if you charge an entrance fee. Set up on the **Payments** page.

You can skip both for a quick practice session on the same Wi-Fi, but plan to set them up before a
public event. Each has its own page in this handbook with step-by-step instructions.

---

## Step 6 — Confirm everything is healthy

The Settings tab has a **status area at the top** that summarizes whether each part of the app is
**ready**, **degraded**, or **failed**. This is your at-a-glance "is anything broken?" panel.

After setup, open **Settings** and check that the pieces you set up show as ready:

- **Web push** — ready, if you generated push keys.
- **Tunnel** — ready, if you set up the tunnel (or intentionally left off for a Wi-Fi-only test).
- **Stripe** — ready, only if you're using payments.

Anything you didn't set up on purpose can stay "not configured" — that's fine.

You're now ready to move on to **Running an Event**.

---

## For the technical setup path (optional — skip if you installed the app)

If instead of the installer you're running Roller Rumble from the source code (for development), the
short version is:

1. Install **mise** (it pins the right Node and pnpm versions), then from the project folder run:
   ```bash
   mise trust
   mise install
   mise run install
   ```
2. Start the app in development mode:
   ```bash
   pnpm dev
   ```
   This launches the admin window, the race display window, a local web server on port **3187**, and
   a dev server on port **5173**.
3. In dev, the settings file lives at the project root as `.env.local`, and practice data lives in a
   `.roller-rumble-dev/runtime` folder.

Most operators should ignore this section and use the installed app from Step 1.

---

## Common first-time setup problems

| What you see                                     | What's going on                           | What to do                                                    |
| ------------------------------------------------ | ----------------------------------------- | ------------------------------------------------------------- |
| Mac says "unidentified developer"                | The app isn't code-signed (expected)      | Right-click the app → **Open** (Step 2)                       |
| Windows "protected your PC"                      | SmartScreen on an unsigned app (expected) | **More info → Run anyway** (Step 2)                           |
| Changed a setting but nothing changed            | Settings only load at startup             | **Fully quit and reopen** the app                             |
| Environment card shows "Missing"                 | The settings file hasn't been created     | Click **Create & Open Env File**                              |
| Notifications don't work on phones               | Push keys missing, or no HTTPS tunnel     | Generate push keys, and set up the tunnel (Going Online page) |
| "Port 5173 is already in use" (source path only) | Another copy of the dev server is running | Close the other one, or fully quit and relaunch               |

If something here doesn't match what you see, check the dedicated **Troubleshooting** page, or paste
this page plus the Troubleshooting page into an AI assistant and describe exactly what you're seeing.

---

**Next:** [Running an Event](03-running-an-event.md) — create an event, add racers, and run your
first race.
