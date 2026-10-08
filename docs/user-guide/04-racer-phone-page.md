# 4. The Racer Phone Page

The **Racer Page** is what riders open on their own phones to register, add themselves to the race
queue, challenge a friend, and get alerts when their race is coming up. This page walks through what
racers see and do — and what _you_ (the host) do when a racer gets stuck.

You don't operate this page yourself, but you'll be the one helping racers through it at the desk,
so it's worth knowing well.

> **Do racers need the tunnel?** Not to register or race. Phones on the same Wi-Fi as the laptop can
> register, join the queue, and upload a photo over the plain Wi-Fi address. The **Cloudflare
> tunnel** (covered on the _Going Online_ page) is still what you want for a real event: it lets
> phones join from anywhere, and phone **notifications** and online **payments** only work over its
> secure **`https://`** address.

---

## How racers open the page

Racers get to the page one of these ways:

- **Scan a QR code.** The projector (Race Display) and the admin window can show a QR code that
  points straight to the racer page for the current event. This is the easiest option — riders
  point their phone camera at it and tap the link. It points at your tunnel address when you have
  one, and at the laptop's Wi-Fi address otherwise (details on the _Going Online_ page).
- **Type the address.** If you're using the tunnel, it has a fixed web address (like
  `https://your-event-name.example.com/racer`) that you can print or write on a sign.

Once a racer has registered, the page remembers them on that phone across refreshes, so a racer
generally opens it once and leaves it up during the event.

---

## The five tabs

Along the bottom of the racer page are up to five tabs:

| Tab            | What's there                                               |
| -------------- | ---------------------------------------------------------- |
| **Race**       | The live race view — what's happening right now.           |
| **Queue**      | The upcoming lineup, and the buttons to join or challenge. |
| **Tournament** | The bracket/standings, when a tournament is running.       |
| **Racers**     | The list of racers at the event.                           |
| **Me**         | Your race card / your stats / notifications.               |

Which tabs show up depends on the event. (For example, the Tournament tab is most useful when a
tournament is active.) Whether someone can browse these before registering is controlled by the
**Show race info before racer sign-in** setting on the admin side.

---

## Registering

A new racer registers by walking through a short **registration wizard**. A progress bar at the top
shows which step they're on and how many are left. There's no password, no email sign-in, and no
Face ID prompt.

Where the wizard appears depends on the **Show race info before racer sign-in** setting:

- **Off (the default):** the page opens straight to a **Register** card with the wizard, and no tabs.
- **On:** visitors can browse the tabs first, then tap **Register**, which takes them to the **Me**
  tab's wizard.

Either way, the tabs disappear while a racer is partway through the wizard and come back once
they've finished.

1. **Your details** — their real **name**, **phone**, and **email**. Only you (the hosts) see these,
   in the admin window, so you can reach a racer about their races. They're never shown on the big
   screen or to other racers. If something's mistyped, the field explains what's wrong, and
   **Continue** stays greyed out until all three look right.
2. **Pick your racer name** — the fun name the crowd sees on the projector (Turbo Tortoise, Captain
   Cadence…). Tapping **Continue** here creates the racer. Nothing appears on the big screen until
   this step, so someone who gives up halfway never shows up by their real name.
3. **Your photo** — required. They tap **Take a selfie** or **Choose a photo**, see a preview, and
   can retake it. If you run the photo booth, its QR shows here too, and a booth photo counts as soon
   as it arrives.
4. **Payment** — _only when the event charges an entry fee._ With Stripe set up, they tap the **Pay** button and
   finish on Stripe's checkout page, then come straight back. Without Stripe, the step says **Pay at
   the desk**; they tap **Got it** and you mark them paid from the admin window (see the _Payments_
   page).

When the last step is done, the racer lands on the race page, ready to queue.

If a racer closes the page or their phone locks partway through, they pick up where they left off
the next time they open it on the same phone.

> **One racer per registration.** Every registration creates a brand-new racer, even if the name,
> phone, or email matches someone already at the event. Nobody can "sign in as" someone else by
> typing their details.

---

## The phone _is_ the login

Once registered, the racer stays signed in **on that phone, in that browser**. That's the only place
their login lives. There is no password and no way to sign back in from somewhere else. That means:

- **Lost phone, new phone, different browser, or cleared browser data → register again.** The racer
  goes through the wizard as a new racer. Their earlier races stay under the old racer; they won't be
  linked to the new one.
- **Private / incognito tabs forget the racer when closed.** Ask racers to use a normal browser tab.
- **Signing out is permanent on that phone** — see below.

At the desk, the fix for "I can't get back in" is always the same: have them register again (or add
them yourself from the admin **Racers** tab).

---

## Your Race Card (once registered)

After the wizard, the Me tab turns into **Your Race Card**. From here a racer can:

- **See their name and photo.** Tap the little pencil on the photo to change it.
- **Enable Notifications** — turn on phone alerts for "your race is coming up." (More on the _Going
  Online_ page.)
- **See Your Stats** — race count, wins, and where they sit in the queue or bracket.
- **Sign out** — behind a strong warning (below).

### Signing out

Tapping **Sign out** opens a warning: **"This racer will be gone from this phone."** Because there's
no password or email sign-in, a racer who signs out can't get that racer back on that phone. Their
races, queue spots, and photo stay behind, and to race again they register as a brand-new racer. They
can tap **Stay signed in** to back out, or **Sign out for good** to confirm, which returns the page to
the start of the wizard.

A racer who's stuck partway through the wizard sees a **Sign out and start over** button for the same
purpose (for example, to fix a typo in their display name). It shows the same warning.

> **Sharing one phone?** Two people can't both be signed in on the same phone and browser. The
> second racer either uses their own phone, or you add them from the admin **Racers** tab.

---

## Joining a race (the "Queue" tab)

Once registered, the racer uses the **Queue** tab to get in line. The **Queue Controls** card offers:

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

If the event requires an entrance fee, racers usually settle it in the wizard's **Payment** step
(above). If a racer still owes the fee when they try to join, the Queue tab tells them the price, and
tapping a join or challenge button opens **Stripe Checkout** on their phone. After they pay, the page
returns and their intended join/challenge happens automatically. You'll see a "Payment confirmed" or
"Payment is processing" message on their card. Full details are on the _Payments_ page.

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

If you run the optional Raspberry Pi photo booth, the wizard's photo step and a registered racer's
card show a **Photo Booth** QR they can present to the booth scanner to capture a nice camera avatar. Most events don't use
this; it has a short reference page.

---

## Common racer-page problems

| What the racer sees                             | Likely cause                                                  | What to do                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| "I can't get back in" / new phone               | The login only lives on the phone they registered on          | Have them register again, or add them from the admin **Racers** tab            |
| Racer was forgotten after closing the tab       | They registered in a private / incognito tab                  | Register again in a normal browser tab                                         |
| **Continue** stays greyed out on "Your details" | One of name, phone, or email isn't filled in correctly        | Check the red message under each field; phone needs 7–15 digits                |
| Stuck on the **Your photo** step                | A photo is required to finish registering                     | Take a selfie or choose any photo; they can change it later                    |
| Join button opens a payment screen unexpectedly | Event requires an entrance fee                                | That's expected; they pay, or you comp them from the admin **Racers** tab      |
| Racer forgotten after switching addresses       | The Wi-Fi address and tunnel address count as different sites | Stick to one address (the QR); if lost, register again                         |
| Can't join — "Tournament Mode"                  | A tournament is active                                        | The open queue is paused until the tournament ends                             |
| Notifications never arrive                      | Push keys missing, or not on the tunnel `https://` address    | Confirm push keys were generated and they're on the tunnel (Going Online page) |

For deeper issues, see the **Troubleshooting** page.

---

**Next:** [Tournaments & Brackets](05-tournaments.md) — setting up and running structured
competitions.
