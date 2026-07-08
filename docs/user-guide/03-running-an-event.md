# 3. Running an Event

This is the heart of it: creating an event, adding racers, building the queue, and running races
from start to finish. Everything here happens on the **Admin Display** (the host's screen on the
laptop).

By the end of this page you'll be able to run a full casual "open time trial" session — racers line
up, you start each race, a winner is crowned on the projector, and the next race is ready to go.
(Structured **tournaments** get their own page.)

> **The race controls live in a bar at the bottom of the Admin Display.** No matter which tab you're
> on, a **race control tray** appears across the bottom whenever there's a race to act on. That's
> where you'll click **Stage**, **Start Countdown**, and **Finalize**. Keep an eye on it.

---

## The 60-second version

For anyone who just wants the loop:

1. **Event** tab → make sure the right event is active (or create one).
2. **Racers** tab → add your riders.
3. **Race Desk** tab → set the race distance, then add racers to the **queue**.
4. Bottom tray → **Stage Next Race**, then **Start Countdown**.
5. Riders pedal; first to the finish wins; the winner shows on the projector.
6. **Move On**, then repeat from step 4.

The rest of this page explains each step in detail.

---

## Step 1 — Have the right event active

Everything you do attaches to the **active event**. Only one event is active at a time.

1. Click the **Event** tab.
2. Look at the **Event Control** card. The **Active Event** pill shows the current event's name.
3. If you want a fresh session, type a name in the box (for example, `Friday Finals`) and click
   **Create Event**. That new event becomes the active one.

> **Careful:** Creating a new event switches the app to that new, empty event. Your old event isn't
> deleted — its racers and history are kept — but the queue and "current session" now point at the
> new one. Don't click **Create Event** mid-session by accident.

The Event tab also shows quick totals: how many **Racers**, how many **Upcoming** (queued), the
current **Theme**, and the **Tunnel** status.

---

## Step 2 — Add your racers

Racers can get into the system two ways:

- **You add them** on the Racers tab (fastest for a walk-up desk).
- **They add themselves** from their phones on the Racer Page (covered on the next page).

To add a racer yourself:

1. Click the **Racers** tab.
2. In the **Quick Add Racer** card, fill in:
   - **Name** — required (this is their display name, e.g. `Alex Fast`).
   - **Email** — optional.
   - **Phone** — optional.
3. Click **Add Racer**.

They immediately appear in the **Registered Racers** list below, which shows each racer's race
count and wins. Use the **Search racers** box to find someone in a long list.

> **Do I need email/phone?** Not to race. Email/phone matter for racers who want a secure account
> and history on their own phone (see the Racer Page page). For a quick desk add, a name is enough.

---

## Step 3 — Set the race distance

Every race runs to a **target distance**. The first rider to reach it wins.

1. Go to the **Race Desk** tab.
2. In the **Race Distance** card, type a distance in meters (for example, `250`).
3. Click **Apply Distance**.

The card shows two numbers: **Configured** (your default for new races) and **Current Race** (the
distance of the race that's staged right now, if any). Set this before you start staging races. You
can change it between races, but changing it won't alter a race that's already staged.

---

## Step 4 — Build the queue

The **queue** is the lineup of upcoming races. There are two easy ways to add people.

### From the Race Desk (Add To Queue card)

1. In **Add To Queue**, pick a **Racer** (start typing to filter the list).
2. Choose **Queue as**:
   - **Auto head-to-head** — the app pairs this racer with another waiting racer automatically.
   - **Solo run** — this racer races alone against the clock.
3. If you want a _specific_ matchup, leave it on head-to-head and pick an **Opponent**. (For a solo
   run, the opponent box is disabled — solo runs don't need one.)
4. Click **Add To Queue**.

### From the Racers list (quick buttons)

On the **Racers** tab, each racer in the **Registered Racers** list has quick buttons:

- **Add To Queue** — adds them as an auto head-to-head entry.
- **Solo Run** — adds them as a solo entry.
- **Remove from Upcoming** — takes them back out of the queue.

Either method lands them in the same queue.

---

## Step 5 — Understand the queue

Back on the **Race Desk**, the **Queue** card shows the full lineup in order. Each row shows:

- **#position** — where it sits in line (#1 is next).
- A **Staged** pill — if that entry is the race currently loaded into the control tray.
- The racer name(s) and the matchup type.
- A **Remove [name]** button for each rider, to pull someone out of that entry.

A few things the queue does automatically, so you don't have to babysit it:

- **It protects the next few races.** When new people join, the app won't shove the races that are
  about to happen further back. The immediate lineup stays stable.
- **It keeps challenge matches together.** If two specific people are set to race each other, the
  app keeps that pairing intact rather than splitting them up.
- **It pairs flexible racers as it goes.** People who joined as "auto head-to-head" get matched up
  when a slot needs two riders.

You don't need to understand the internals — just know the top of the queue is what happens next.

---

## Step 6 — Run a race (the control tray)

This is the main loop. All of it happens in the **race control tray** at the bottom of the screen.

### 6a. Stage the next race

When there's a race ready to go, the tray shows **Next Open Time Trial Race** with the matchup.

- Click **Stage Next Race**.

Staging loads that matchup as the current race and puts it on the projector's "on deck" state. The
queue row for it now shows the **Staged** pill.

> **Prefer it automatic?** In **Settings → Settings**, turn on **Auto-stage the next queued open
> time trial race**. Then, after each race finishes, the app stages the next one for you and you
> only need to press **Start Countdown**.

Once staged, you have two choices in the tray:

- **Start Countdown** — begin the race (see next step).
- **Unstage Race** — put it back and un-load it (nothing happens to the racers; the entry returns
  to the queue).

### 6b. Start the countdown and race

- Click **Start Countdown**.

Now:

1. The projector shows the countdown (**3… 2… 1… GO**).
2. At **GO**, pedaling starts counting. Rider markers move down their lanes on the projector as
   they pedal, with live speed and effort lights.
3. The **first rider to reach the target distance wins.** When that happens, the race **finalizes
   automatically** and the winner is shown.

While a race is live, the tray gives you two safety controls:

- **Reset To Staged** — abort the current run and put the race back to the staged (not-started)
  state, so you can start the countdown again. Use this for a false start.
- **Finalize Current** — force the race to end _now_ and record the result as it stands, even if no
  one has hit the target distance yet. Use this if a rider quits or the finish needs to be called
  manually.

### 6c. The winner is shown

When a race finalizes, a **winner modal appears on the projector**. The tray shows **Race Results
Showing** and tells you the modal is live.

- It clears **automatically after about 15 seconds**.
- Or click **Move On** in the tray to advance immediately.

After that, either the next race auto-stages (if you enabled that setting) or you press **Stage
Next Race** again. That's the loop — repeat for the whole session.

---

## Step 7 — The projector (Race Display)

The **Race Display** window opens automatically alongside the admin window when the app launches.
Drag it onto your projector or second screen and make it full-screen.

You control how it looks from **Settings → Projector Display**:

- **720p / 1080p buttons** — quickly resize the window to check your projector layout.
- **Show event name under the Roller Rumble title** — display the event name on the projector.
- **Flip projector lane colors** — swap which color is on which side, to match your physical setup.
- **Lane glow** — how the lanes light up during a race:
  - **Rivalry** — lights the lane that's currently winning the speed duel (the default).
  - **Surge** — lights a lane based on the rider's own bursts of acceleration. (Solo races always
    use Surge, since there's no opponent to compare against.)
- **Ticker messages** — scrolling messages along the display. Type one message per line, set the
  **Ticker speed**, then **Save Ticker Messages** (or **Clear Messages** to remove them).

The Race Display is view-only — there are no controls on it. Everything is driven from the admin
window.

---

## Step 8 — If a race gets interrupted

If the app is closed (or crashes) while a race is live, it doesn't lose the race. When you reopen
Roller Rumble, the tray shows the interrupted race with three choices:

- **Resume Interrupted** — pick the race back up where it left off and keep going.
- **Restart Race** — throw out the partial run and start that same matchup over from the countdown.
- **Finalize As-Is** — end it now and record whatever progress was made as the final result.

Pick whichever fits what happened. For a brief accidental close, **Resume Interrupted** is usually
right.

---

## Step 9 — Payments at the desk (only if you charge a fee)

If your event requires an entrance fee (set up on the **Payments** page), the **Racers** tab shows
each racer's fee status and gives you host overrides:

- **Mark Paid** — record that they paid (for example, they paid cash at the desk).
- **Waive** — let them race without paying.
- **Unpaid** — undo a "paid" mark.

Host queue actions (adding someone to the queue from the admin window) **bypass** the payment gate
on purpose, so you can always handle cash and comps at the desk. The fee is only enforced when a
racer tries to join _from their own phone_.

---

## A few settings worth knowing

Found under **Settings → Settings**:

| Setting                                 | What it does                                                            |
| --------------------------------------- | ----------------------------------------------------------------------- |
| **Theme**                               | Changes the whole look across all screens.                              |
| **Auto-stage the next queued race**     | Loads the next race automatically after each finish.                    |
| **Allow accountless racer signup**      | Lets racers sign up with just a name on their phone (no email/passkey). |
| **Show race info before racer sign-in** | Whether phones can see the queue before signing in.                     |
| **Max active queue entries per racer**  | How many times one racer can be waiting in the queue at once.           |
| **Enable VirtualDJ cue start**          | Lets a DJ trigger the countdown from music software (advanced).         |

---

## Common problems running an event

| What you see                                 | Likely cause                                              | What to do                                                     |
| -------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------- |
| The bottom tray is empty                     | No race staged and nothing queued                         | Add racers to the queue (Step 4)                               |
| **Stage Next Race** doesn't appear           | A race is already staged/live, or a tournament is running | Finish or unstage the current race first                       |
| Race won't start                             | Nothing staged                                            | Click **Stage Next Race**, then **Start Countdown**            |
| A rider quit mid-race                        | Race can't reach the finish on its own                    | Click **Finalize Current** to record the result                |
| False start                                  | Need to redo the countdown                                | Click **Reset To Staged**, then **Start Countdown** again      |
| Winner modal is stuck on the projector       | It's on its 15-second timer                               | Wait, or click **Move On**                                     |
| Reopened the app and a race is "interrupted" | The app closed mid-race                                   | Choose **Resume**, **Restart**, or **Finalize As-Is** (Step 8) |
| Projector shows the wrong colors/side        | Lane colors flipped from your setup                       | **Settings → Projector Display → Flip projector lane colors**  |

For anything not covered here, see the dedicated **Troubleshooting** page.

---

**Next:** [The Racer Phone Page](04-racer-phone-page.md) — how racers sign in, join the queue,
challenge each other, and recover their account.
