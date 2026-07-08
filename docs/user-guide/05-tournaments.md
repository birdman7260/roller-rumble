# 5. Tournaments & Brackets

A **tournament** is a structured competition — a bracket or standings — instead of the casual,
racer-driven queue. This page covers picking a format, starting a tournament, running its matches,
and (importantly) **everything that changes about the rest of the app while a tournament is
running.**

All of this happens on the **Tournaments** tab of the Admin Display.

> **Read the "What changes in tournament mode" section below carefully.** A tournament isn't just
> another feature — turning one on changes how the queue, the race controls, and the racer phones all
> behave. If you skip that part, the app will seem to have "broken" the normal flow.

---

## Open queue vs. tournament — which to use

- **Open Time Trial (the queue):** casual, rolling racing where riders add themselves and challenge
  each other. This is the everyday mode covered in _Running an Event_. It's technically also listed
  as a tournament "format," but it's really just the normal queue.
- **A real tournament:** a fixed field of racers competing in a bracket or standings to crown a
  winner. Use this for a finals night or a structured competition.

You run one at a time. Starting a bracket tournament **pauses** the open queue (details below).

---

## The tournament formats

When you start a tournament you pick a **Format**. Here's each in plain English:

| Format                           | What it is                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Single Elimination**           | Classic knockout bracket. Lose once and you're out. Winner advances each round until one racer is left. |
| **Double Elimination**           | Two lives. A loss drops you into a "losers' bracket"; you're only out after losing twice.               |
| **Round Robin**                  | Everyone races everyone. No knockout — riders earn a **standings** rank from their results.             |
| **Groups to Single Elimination** | A round-robin **group stage** first, then the top finishers feed a knockout **finals bracket**.         |
| **Open Time Trial**              | Not a real tournament — this is the normal casual queue.                                                |

---

## How the field is seeded

A tournament **seeds** (fills) its slots from the racers registered for the current event, ranked by
their event results. When you set a bracket size, the app tells you exactly what will happen, for
example:

- _"Seed the top 8 racers from the 12 registered for this event."_ — if the bracket is smaller than
  the field, only the top-ranked racers get in.
- _"16-slot bracket with 12 registered racers. Empty slots become byes."_ — if the bracket is bigger
  than the field, the extra slots become **BYEs** (a free pass; the racer facing a BYE advances
  automatically). You can fill BYE slots by hand later.

> **Tip:** Run a few open-time-trial races first so racers have results to seed from. Seeding a
> bracket before anyone has raced gives the app nothing to rank by.

---

## Starting a tournament

1. Go to the **Tournaments** tab.
2. In the **Start Tournament** card:
   - **Tournament name** — e.g. `Bracket Night`.
   - **Format** — pick from the list above.
   - **Bracket size** — for bracket formats, choose how many slots (e.g. 8, 16). The card explains
     how your racer count maps onto that size.
   - **Bracket layout** — for bracket formats, how the tree is drawn. **Auto** is a safe default;
     larger single brackets can use a **center-converging** board where both sides meet in the
     middle. (Double elimination stays on a standard layout for now.)
3. Click **Start Tournament**.

The bracket (or group matches) appears, and the app is now in **tournament mode**.

---

## ⚠️ What changes when a tournament is active

This is the part to understand. The moment a tournament starts, several things behave differently
until it ends:

### 1. The open queue is paused

- Racers **can't add themselves** to the open queue from their phones. Their Queue tab shows a
  **Tournament Mode — Open queue paused** notice. The existing lineup stays _visible_ for reference,
  but no one can join it.
- On the admin side, the **Active Tournament** card reminds you: _"Open time trial is paused while
  this tournament is active."_

### 2. A staged open-time-trial race is cleared

- If you had an open-queue race **staged but not yet started** when you hit Start Tournament, the app
  **unstages it** and returns that racer's entry to the queue — so the tournament and a leftover
  casual race don't fight over the screen. (A race that's already _live_ isn't interrupted.)

### 3. You stage races from the bracket, not the queue

- In normal mode you click **Stage Next Race** in the bottom tray. In tournament mode that button is
  gone. Instead, you **click a match on the bracket board** and choose **Stage Match**. That loads
  the tournament matchup as the current race.
- Once a match is staged, the bottom tray shows **Tournament Race Ready** and the usual **Start
  Countdown** / **Finalize** controls appear there — the _running_ of a race is the same as always.

### 4. The bottom tray changes its guidance

- When no match is staged, the tray shows **Tournament In Progress** and (from other tabs) an **Open
  Tournament Board** button that jumps you to the Tournaments tab to pick the next match.

### 5. You can't reshuffle the bracket mid-race

- While a race is staged or live, the bracket's editing actions are locked. If you try, the app
  tells you: _"Clear the currently staged race before changing bracket matchups."_ Finish or unstage
  the current race first.

### 6. The racer phones switch focus

- Racers use their **Tournament** tab to watch the live bracket and find their next match. Seeded
  racers also get a **"tournament starting" notification** (if notifications are set up).

**To get the normal open-queue behavior back, you end the tournament** (see the last section).

---

## Running tournament matches

The loop is: pick a match on the board → stage it → run it → the winner advances automatically.

1. On the **Bracket Board**, click the match you want to run.
2. In the little menu that pops up, click **Stage Match**.
3. Go to the bottom tray (it now says **Tournament Race Ready**) and click **Start Countdown**, just
   like a normal race.
4. The race runs; the first to the finish wins; it finalizes and the **winner advances** along the
   bracket. Completed paths are highlighted so you can see who's moving on.
5. Click the next match and repeat.

### The match menu (click any match)

Clicking a match opens a small menu with the actions that make sense for it:

- **Stage Match** — load this matchup as the next race.
- **Undo Result** — safely revert a completed match (for example, if you finalized the wrong way).
  Only available when undoing won't corrupt later rounds.
- **Fill BYE Slot** — put a racer into an empty (BYE) slot.
- **Remove [racer]** — take a racer out of an active match (you'll pick what happens to their spot).
- **Close** — dismiss the menu.

If a match shows _"No admin actions are available for this match yet,"_ it's waiting on earlier
rounds to finish before it can be played.

### Group-stage tournaments

For **Groups to Single Elimination**, you'll also see a **Tournament Matches** card listing the
round-robin group games. Stage and run those the same way (click a match → stage → run). Once the
group stage is done, the finals bracket fills in and you play it out like a normal single
elimination.

---

## The bracket display

- The **Bracket Board** can be **expanded** to fill the screen for a better view of a big bracket.
- On their phones, racers see the same live bracket on their **Tournament** tab and can **focus** it
  on the current match.
- Completed advancement paths are highlighted with theme-styled connectors, so the crowd can follow
  who beat who at a glance.

---

## Ending a tournament

When the tournament is finished (or if you need to bail out and go back to casual racing):

- Click **End Tournament Early** on the **Active Tournament** card.

This ends tournament mode and **returns the app to the normal open-queue flow** — racers can join
from their phones again, and the bottom tray goes back to **Stage Next Race**. Completed tournaments
are listed under **Tournament History** on the Tournaments tab for reference.

---

## Common tournament problems

| What you see                                  | Likely cause                                     | What to do                                               |
| --------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------- |
| Racers say they "can't join the queue"        | A tournament is active; the open queue is paused | Expected. End the tournament to reopen the queue         |
| **Stage Next Race** disappeared from the tray | You're in tournament mode                        | Stage matches from the **Bracket Board** instead         |
| Bracket won't let you change a matchup        | A race is staged or live                         | **Finalize** or **unstage** the current race first       |
| Lots of empty BYE slots                       | Bracket size is bigger than your field           | Use a smaller bracket, or **Fill BYE Slot** by hand      |
| Seeding looks random / unfair                 | Few or no race results to rank by                | Run some open races first, then start the tournament     |
| Finalized a match the wrong way               | Human error                                      | Open the match → **Undo Result** (if still safe to undo) |
| Want to get back to casual racing             | Tournament still active                          | **End Tournament Early**                                 |

For anything else, see the **Troubleshooting** page.

---

**Next:** [Payments (Stripe)](06-payments.md) — charging an entrance fee before racers can join.
