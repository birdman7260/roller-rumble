# 4. The Racer Phone Page

The **Racer Page** is what riders open on their own phones to sign in, add themselves to the race
queue, challenge a friend, and get alerts when their race is coming up. This page walks through what
racers see and do — and what _you_ (the host) do when a racer gets stuck.

You don't operate this page yourself, but you'll be the one helping racers through it at the desk,
so it's worth knowing well.

> **The big requirement:** Secure phone sign-in (passkeys) and phone notifications only work over a
> secure **`https://`** web address. On phones, that means racers should reach the page through the
> **Cloudflare tunnel** (covered on the _Going Online_ page), not a plain `http://` Wi-Fi address.
> If you're only testing on the laptop itself, `localhost` is fine.

---

## How racers open the page

Racers get to the page one of these ways:

- **Scan a QR code.** The projector (Race Display) and the admin window can show a QR code that
  points straight to the racer page for the current event. This is the easiest option — riders
  point their phone camera at it and tap the link.
- **Type the address.** If you're using the tunnel, it has a fixed web address (like
  `https://your-event-name.example.com/racer`) that you can print or write on a sign.

Once open, the page stays signed in across refreshes, so a racer generally opens it once and leaves
it up during the event.

---

## The five tabs

Along the bottom of the racer page are up to five tabs:

| Tab            | What's there                                               |
| -------------- | ---------------------------------------------------------- |
| **Race**       | The live race view — what's happening right now.           |
| **Queue**      | The upcoming lineup, and the buttons to join or challenge. |
| **Tournament** | The bracket/standings, when a tournament is running.       |
| **Racers**     | The list of racers at the event.                           |
| **Me**         | Sign in / your race card / your stats / notifications.     |

Which tabs show up depends on the event. (For example, the Tournament tab is most useful when a
tournament is active.) Whether someone can browse these before signing in is controlled by the
**Show race info before racer sign-in** setting on the admin side.

---

## Signing in (the "Me" tab)

Everything about a racer's account happens on the **Me** tab. There are three ways a racer can get
in.

### A brand-new racer (register)

1. On the **Me** tab, type your **Email** and tap **Sign in**.
2. Because the email is new, the page switches to registration and asks for a **Display name**
   (what shows on the race screen) and an optional **Phone**.
3. Tap **Register [name]**.
4. The phone prompts for **Face ID / Touch ID / fingerprint / PIN** to create a **passkey**. Approve
   it.

That's it — the racer is signed in and has a secure account tied to their phone. No password to
remember.

### A returning racer (sign in)

1. On the **Me** tab, type the **Email** you registered with and tap **Sign in**.
2. Approve the **Face ID / Touch ID / fingerprint** prompt.

Done. Their history and stats come back with them.

### No account — just race (accountless)

If the host has turned on **Allow accountless racer signup** (in admin **Settings → Settings**), the
Me tab also offers a **Continue without an account** box:

1. Type a **Display name**.
2. Tap **Continue accountless**.

The racer can race right away with no email or passkey. Later, they can **secure the account** (add
an email and passkey) from their race card without losing their profile — see below.

---

## When a racer sees "See the host"

Sometimes a returning racer types their email and the page shows a **"See the host"** message:

> _"This email is already registered, but it does not have a passkey yet. A host can help attach one
> safely."_

This means: **that email already belongs to an account, but this particular phone/browser doesn't
have a passkey for it.** It usually happens when someone:

- switched phones (passkeys don't automatically move between an iPhone and an Android),
- is using a different browser than they originally registered on, or
- was originally added by the host with an email but never created a passkey.

The app blocks a self-serve claim here on purpose — otherwise anyone could type someone else's email
and take over their account.

**What to do right now (current workarounds):**

- **Use the original device/browser.** If the racer has the phone they first registered on, the
  passkey lives there and normal **Sign in** works.
- **Race accountless for today.** Have them tap **Continue accountless** with their name and race
  now. Their results this event just won't be linked to their old history yet.
- **Host adds them.** You can add the racer from the admin **Racers** tab so they're in the event
  and can be queued. (Their older history stays under the old account.)

> **Heads up:** A one-tap "host helps attach a passkey" tool (a scan-able QR from the admin Racers
> tab) is planned but **not built into the current app yet**. For now, use the workarounds above. If
> a page or older note tells you to "generate an attach QR" in the Racers tab, that button doesn't
> exist in this version.

---

## Your Race Card (once signed in)

After signing in, the Me tab turns into **Your Race Card**. From here a racer can:

- **See their name and avatar.** Tap the little pencil on the avatar (or the **Upload avatar**
  control) to set or change their picture.
- **Sign out.**
- **Enable Notifications** — turn on phone alerts for "your race is coming up." (More on the _Going
  Online_ page.)
- **See Your Stats** — race count, wins, and where they sit in the queue or bracket.
- **Secure This Account** — _only shown for accountless racers._ They enter an **Email** and
  **Display name**, tap **Create Passkey**, approve the Face ID / fingerprint prompt, and their
  existing profile is upgraded to a full account. Nothing about their history is lost.

---

## Joining a race (the "Queue" tab)

Once signed in, the racer uses the **Queue** tab to get in line. The **Queue Controls** card offers:

- **Join Head-to-Head Queue** — get matched automatically against another waiting racer.
- **Solo Run** — race alone against the clock.
- **Challenge** — pick a specific opponent from the searchable list and tap **Challenge** to line up
  a match against that exact person.

The **Upcoming Races** card above shows the current lineup with positions, so racers can see how
long the wait is.

### "Pick a challenge to replace"

If a racer is already at their maximum number of queue spots (set by **Max active queue entries per
racer** in admin settings) and they're only in locked challenge matches, challenging someone new
pops up a **"Pick a challenge to replace"** window. They tap which existing challenge to swap out.
Their former opponent stays in the regular queue. Tap **Cancel** to back out.

### "Queue limit reached"

If a racer tries to join more times than allowed, a small window explains the limit. They tap **Got
it** to dismiss it and can join again once one of their races runs.

---

## When a tournament is running

While a tournament is active, the open queue is **paused**. The racer's Queue tab shows a
**Tournament Mode** notice — the lineup is still visible for reference, but racers can't add
themselves until the tournament ends. During a tournament, matchups are set by the bracket (see the
Tournaments page), not by racers joining.

---

## Payments on the phone (only if you charge a fee)

If the event requires an entrance fee, the Queue tab tells the racer the price, and tapping a join
or challenge button opens **Stripe Checkout** on their phone. After they pay, the page returns and
their intended join/challenge happens automatically. You'll see a "Payment confirmed" or "Payment is
processing" message on their card. Full details are on the _Payments_ page.

Remember: this fee is only enforced when a racer joins **from their own phone**. You can always add
or comp someone from the admin side.

---

## Notifications on the phone (quick version)

Racers tap **Enable Notifications** on their race card (or they're prompted the first time they hit a
queue button). After they allow it in the phone's pop-up, they get:

- A **push alert** when their race is a few matches away or when a tournament they're in starts.
- A **full-screen message** inside the page if they have it open at that moment.

Notifications need the secure tunnel address and the push keys you generated during setup. The full
setup is on the _Going Online_ page.

---

## Photo booth QR (optional)

If you run the optional Raspberry Pi photo booth, a signed-in racer's card shows a **Photo Booth**
QR they can present to the booth scanner to capture a nice camera avatar. Most events don't use
this; it has a short reference page.

---

## Common racer-page problems

| What the racer sees                             | Likely cause                                               | What to do                                                                          |
| ----------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| No Face ID / passkey prompt appears             | Page opened over plain `http://`, not the secure tunnel    | Have them open the **tunnel `https://` address** (or scan the event QR)             |
| "See the host" after entering email             | Email is registered but this phone has no passkey          | Use the workarounds above (original device, accountless, or host-add)               |
| Can't find **Continue accountless**             | Accountless signup is turned off                           | Host enables **Allow accountless racer signup** in Settings, or registers/adds them |
| Join button opens a payment screen unexpectedly | Event requires an entrance fee                             | That's expected; they pay, or you comp them from the admin **Racers** tab           |
| Signed out after refreshing                     | Rare cookie/origin issue across the tunnel                 | Sign in again; make sure they're using the tunnel address consistently              |
| Can't join — "Tournament Mode"                  | A tournament is active                                     | The open queue is paused until the tournament ends                                  |
| Notifications never arrive                      | Push keys missing, or not on the tunnel `https://` address | Confirm push keys were generated and they're on the tunnel (Going Online page)      |

For deeper issues, see the **Troubleshooting** page.

---

**Next:** [Tournaments & Brackets](05-tournaments.md) — setting up and running structured
competitions.
