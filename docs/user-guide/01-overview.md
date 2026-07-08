# 1. Overview & Key Concepts

Before you touch a single button, it helps to understand the big picture: what Roller Rumble is,
the three screens it shows, and the handful of words we use over and over. Once these click, every
other page in this handbook will make sense.

---

## What Roller Rumble is

Roller Rumble is an app that runs **live stationary-bike race events**. Riders pedal bikes mounted
on rollers, and the app turns their pedaling into a race on a big screen — complete with a
countdown, live speed, and a winner.

The most important thing to understand: **everything runs on one laptop.** That laptop is the
brain of the whole event. It:

- Keeps track of every racer, race, and result.
- Shows the host controls on its own screen.
- Sends the race animation to a projector or TV.
- Lets racers join from their phones.

Because it all lives on one machine, you don't need a special server or an internet connection for
the core race to work. (Internet is only needed for a few optional extras like online payments and
phone notifications, covered later.)

---

## The three screens

Roller Rumble shows the same event through three different "surfaces." Think of them as three
windows into the same event, each meant for a different audience.

### 1. The Admin Display (the host's control panel)

This is **your** screen — the person running the event. It opens on the laptop and is where you do
everything: create the event, add racers, start races, run tournaments, and change settings. Only
the host should see this screen.

The Admin Display is organized into five tabs across the side:

| Tab             | What you do there                                                       |
| --------------- | ----------------------------------------------------------------------- |
| **Event**       | Create/name the event, see totals at a glance, set an entrance fee      |
| **Race Desk**   | Line up (stage), start, and finish races; manage the queue              |
| **Racers**      | Add riders and manage who's racing                                      |
| **Tournaments** | Set up brackets (single elimination, double elimination, etc.)          |
| **Settings**    | Theme, race triggers, the internet tunnel, push notifications, and more |

Each of these tabs gets its own page later in this handbook.

### 2. The Race Display (the projector screen)

This is the **audience** screen — the exciting one. It shows the race animation: rider markers
moving down lanes, the countdown, live speeds, and the finish. You'd typically send this to a
projector or a second monitor so the crowd can watch.

It's a "look, don't touch" screen. There are no controls here — everything is driven by what you do
on the Admin Display.

### 3. The Racer Page (the phone screen)

This is the **racers'** screen. Riders open it on their own phones to sign in, add themselves to
the race queue, challenge a friend, and get notified when it's their turn. It's designed to be
simple and thumb-friendly on a small screen.

Racers reach this page either over the local Wi-Fi network or, more commonly at a real event, over
a secure internet link called a **tunnel** (explained on the "Going Online" page).

---

## The core building blocks

These are the main "things" the app keeps track of. You'll see these words everywhere.

### Event

An **event** is the container for one race session — for example, "Friday Finals." It holds all the
racers, the queue, the races, and any tournaments for that session. **Only one event is active at a
time.** When you start a new event, the app switches its attention to that one.

### Racer

A **racer** is a rider. Each racer has a display name and (optionally) an avatar picture. Racers
can be added two ways:

- **By the host** — you add them from the Racers tab.
- **By themselves** — they sign up on their own phone from the Racer Page.

A racer's history (their past races and results) sticks with them across events.

### Queue

The **queue** is the ordered lineup of upcoming races when you're running casual "open time trial"
racing (as opposed to a structured tournament). Racers add themselves to the queue, and the app
figures out the pairings — solo runs, automatic head-to-head matchups, and locked "challenge"
matches where two specific people race each other.

The queue is smart: it protects the next few races from being shoved back when new people join, and
it keeps challenge matches together.

### Race

A **race** is a single head-to-head (or solo) run. A race moves through clear stages:

1. **Staging** — you've lined it up but it hasn't started.
2. **Countdown** — the "3, 2, 1, GO" before pedaling counts.
3. **Active** — the race is live and speeds are being measured.
4. **Finished** — someone hit the target distance and the result is saved.

The app measures live speed, top speed, average speed, distance, and estimated wattage (power)
during each race. If the app is closed mid-race by accident, it can recover an interrupted race
when you reopen it.

### Tournament

A **tournament** is a structured competition with a bracket or standings, instead of a casual
queue. Roller Rumble supports several formats:

- **Open Time Trial** (the casual queue described above)
- **Single Elimination** (lose once, you're out)
- **Double Elimination** (you get a second chance in a losers' bracket)
- **Round Robin** (everyone races everyone; ranked by standings)
- **Groups → Single Elimination** (group stage first, then a knockout bracket)

The app draws the bracket live and updates it as matches finish.

### Theme

A **theme** changes the whole look — colors, fonts, and the little animated rider sprites — across
all three screens at once. You pick a theme in the Settings tab.

---

## The optional extras

These features are powerful but not required for a basic event. Each has its own page later.

- **Passkey sign-in** — Racers can create a secure account using their phone's Face ID, Touch ID,
  or fingerprint (called a "passkey"). No passwords to remember. There are also recovery paths for
  when someone shows up on a new phone.
- **Payments (Stripe)** — You can require racers to pay an entrance fee before they join the queue.
- **The tunnel** — A secure internet link (via a tool called _cloudflared_) that lets phones
  connect from anywhere, not just the local Wi-Fi. This is also what makes passkeys and phone
  notifications work reliably.
- **Notifications** — Push alerts to racers' phones ("your race is coming up").
- **Photo booth** — An optional Raspberry Pi setup that snaps a nice camera photo for a racer's
  avatar. (We don't use this at most events; it has a brief page for reference.)

---

## A mini glossary

Keep this handy. These are the exact words the app and this handbook use.

| Word                  | Plain-English meaning                                                                  |
| --------------------- | -------------------------------------------------------------------------------------- |
| **Host**              | The person running the event on the laptop (you).                                      |
| **Surface**           | One of the three screens: Admin, Race Display, or Racer Page.                          |
| **Event**             | One race session; holds everything for that session. Only one is active.               |
| **Racer**             | A rider. Has a name and optional avatar.                                               |
| **Queue**             | The lineup of upcoming casual races.                                                   |
| **Stage**             | To line up a race so it's ready to start (but not started yet).                        |
| **Race Desk**         | The Admin tab where you stage, start, and finish races.                                |
| **Tournament**        | A structured competition (bracket or standings).                                       |
| **Bracket**           | The tree diagram showing who plays who in an elimination tournament.                   |
| **BYE**               | An empty bracket slot; the racer facing a BYE advances automatically.                  |
| **Passkey**           | A secure login using Face ID / Touch ID / fingerprint instead of a password.           |
| **Identity**          | An email, phone number, or name that points to a racer's account.                      |
| **Accountless racer** | A racer who signs in with just a display name — no email or passkey.                   |
| **Host-assist**       | You (the host) helping a racer get back into their account via a scan-able QR code.    |
| **Tunnel**            | The secure internet link that lets phones connect from anywhere.                       |
| **cloudflared**       | The behind-the-scenes tool that creates the tunnel.                                    |
| **Simulator**         | Fake pedaling data so you can practice without real bikes.                             |
| **Sensor**            | The thing that measures real pedaling (hardware support is still being finished).      |
| **Snapshot**          | The live picture of the event the app sends to all three screens to keep them in sync. |
| **AppSnapshot**       | The technical name for that live picture. You'll rarely need this word.                |

---

## What's next

Now that you know the pieces, the next page walks through **first-time setup**: installing the app,
the settings file, generating the keys you'll need, and getting Roller Rumble running for the first
time.

> **Tip:** If you ever get stuck, the last page in this handbook is a dedicated **Troubleshooting**
> guide that lists common problems and exactly what to check.
