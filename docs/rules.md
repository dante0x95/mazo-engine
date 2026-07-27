# Mazo — Rules Specification

> Status: **frozen for v0.1**. Every test in `packages/engine` MUST reference a rule ID
> from this document. If an implementation needs behaviour not described here, the
> document is amended **first**, then the test, then the code. No exceptions.

**Conventions**

| Prefix | Meaning |
|---|---|
| `R-n` | Gameplay rule |
| `V-n` | RuleSet coherence rule (validated at construction time) |
| `I-n` | Runtime invariant (asserted after every action in simulation mode) |
| `T-n` | Named edge case that must have a dedicated test |
| ⚑ | Decision made by inference, not explicitly specified by the product owner — review before freezing |

---

## 1. Card model

### R-01 — Deck composition

The deck is exactly **108** cards.

| Per colour (red, yellow, green, blue) | Count |
|---|---|
| `0` | 1 |
| `1`–`9` | 2 each (18) |
| `skip` | 2 |
| `reverse` | 2 |
| `draw2` | 2 |
| **Subtotal per colour** | **25** |

4 colours × 25 = 100, plus **4 `wild`** and **4 `wild4`** = **108**.

### R-02 — Card identity

Every card carries a stable unique `id` assigned at deck construction
(e.g. `R-7-b`, `G-skip-a`, `W4-c`). Ids exist **only** for accounting
(see `I-01`, `I-02`) and for replay determinism. They are never used in
gameplay logic.

### R-03 — Gameplay equality

Two cards are gameplay-equivalent iff they share `(colour, rank)`.
Wild cards have `colour === null`.

### R-04 — Active colour

`activeColor` is always one of the four colours after setup completes. It is
**never** `null`, and there is no "wild" colour value. When a wild is played,
`activeColor` becomes the declared colour (see `R-30`).

---

## 2. RuleSet

The `RuleSet` is a frozen plain object stored **inside** `GameState` at game
creation. Changes to a room's configuration mid-game have no effect on a game
already in progress.

The reproducible identity of a game is `{ seed, ruleSetHash, actions[] }`.

### Preset table

| Flag | `standard` | `gt` |
|---|---|---|
| `draw2OnDraw2` | `false` | `true` |
| `draw4OnDraw4` | `false` | `true` |
| `draw4OnDraw2` | `false` | `true` |
| `draw2OnDraw4` | `false` | `true` |
| `stackResponseIgnoresColor` | `false` | `true` |
| `maxStackAmount` | `null` | `null` |
| `wildFourRequiresNoMatch` | `true` | `false` |
| `challengeWildFour` | `true` | `false` |
| `drawRule` | `{ type: 'one' }` | `{ type: 'untilPlayable', max: 3 }` |
| `drawnCardPlayableImmediately` | `true` | `true` |
| `unoPenaltyCards` | `4` | `2` |
| `jumpIn` | `false` | `false` |
| `sevenZero` | `false` | `false` |
| `initialDrawCardOpensChain` | `false` | `true` |
| `scoring` | `'standard'` | `'standard'` |

`standard` is the reference implementation of the published Mattel rules and
serves as the regression baseline. Its tests are never modified to accommodate a
variant.

### R-05 — Player count

2 to 10 players inclusive. Seat order is fixed at creation.

---

## 3. RuleSet coherence (validator)

Validation runs at `createRuleSet()` and returns `Result<RuleSet, ConfigError[]>`.
An invalid RuleSet can never reach the reducer.

| ID | Rule | Rationale |
|---|---|---|
| `V-01` | `challengeWildFour === true` requires `wildFourRequiresNoMatch === true` | The challenge exists to verify compliance with the restriction. With no restriction there is nothing to challenge. |
| `V-02` | `drawRule.type === 'untilPlayable'` requires `max` to be an integer ≥ 1 | |
| `V-03` | `drawRule.type === 'untilPlayable'` requires `drawnCardPlayableImmediately === true` | Otherwise the player draws until a playable card appears and then cannot play it — the mechanism is inert. |
| `V-04` | If all four stacking flags are `false`, `maxStackAmount` MUST be `null` | A cap on a chain that can never form is dead configuration. |
| `V-05` | If `maxStackAmount !== null`, it MUST be an integer ≥ 2 | |
| `V-06` | `unoPenaltyCards` MUST be an integer ≥ 0 | |
| `V-07` | `playerCount` MUST satisfy `R-05` | |
| `V-08` | `sevenZero === true` requires `playerCount >= 3` ⚑ | With 2 players, `0` (rotate all hands) and `7` (swap hands) are the same operation. Not blocking for v0.1 since both are `false`. |

---

## 4. State and phase machine

### GameState (shape)

```ts
type GameState = {
  ruleSet: RuleSet;
  seed: string;
  rngState: number;              // advanced only through the RNG module
  players: Array<{
    id: PlayerId;
    hand: CardId[];
    saidUno: boolean;
  }>;
  drawPile: CardId[];            // index 0 === next card drawn
  discardPile: CardId[];         // last element === top card
  activeColor: Colour;
  currentPlayerIndex: number;
  direction: 1 | -1;
  pendingDraw: { amount: number; lastType: 'draw2' | 'draw4' } | null;
  phase: Phase;
  turnDrawCount: number;         // cards drawn by current player this turn (R-40)
  unoWindow: { playerIndex: number } | null;  // R-71
  winner: PlayerId | null;
  turnCounter: number;
};
```

### R-06 — Phases

```
                  play wild / wild4
  ┌──────────┐ ─────────────────────────▶ ┌────────────────┐
  │  NORMAL  │                            │ AWAITING_COLOR │
  └──────────┘ ◀───────────────────────── └────────────────┘
       ▲   │      choose_color (no pendingDraw)     │
       │   │                                        │ choose_color
       │   │ play draw2 / draw4                     │ (pendingDraw set)
       │   │  (pendingDraw set)                     │
       │   ▼                                        ▼
       │  ┌──────────────────────────────────────────┐
       └──│        AWAITING_STACK_RESPONSE           │
  accept  └──────────────────────────────────────────┘
   _draw          │                        ▲
                  │ play stackable draw    │
                  └────────────────────────┘

  any phase ──▶ ENDED  (a player reaches 0 cards, R-80)
```

- `AWAITING_COLOR` does **not** advance the turn. The player who played the wild
  is still `currentPlayerIndex`.
- The turn advances on `CHOOSE_COLOR`, on a non-wild `PLAY_CARD`, on `PASS`, and
  on `ACCEPT_DRAW`.

### R-07 — Actions

```ts
type Action =
  | { type: 'PLAY_CARD'; player: PlayerId; cardId: CardId; callUno?: boolean }
  | { type: 'CHOOSE_COLOR'; player: PlayerId; colour: Colour }
  | { type: 'DRAW'; player: PlayerId }
  | { type: 'PLAY_DRAWN'; player: PlayerId; cardId: CardId }
  | { type: 'PASS'; player: PlayerId }
  | { type: 'ACCEPT_DRAW'; player: PlayerId }
  | { type: 'CHALLENGE_UNO'; player: PlayerId; target: PlayerId }
  | { type: 'CHALLENGE_WILD4'; player: PlayerId };
```

### R-08 — Errors as values

The reducer returns `Result<{ state, events }, RuleViolation>`. `RuleViolation`
is a tagged union (`NOT_YOUR_TURN`, `CARD_NOT_IN_HAND`, `ILLEGAL_PLAY`,
`WRONG_PHASE`, `WILD4_RESTRICTED`, …). `throw` is reserved for broken invariants
(programmer error) and never for rule enforcement.

### R-09 — Events

Every successful action emits an ordered `GameEvent[]`. This stream is the
**only** contract exposed to the rooms service; consumers never read `GameState`
directly. Minimum event set:

`GAME_STARTED`, `CARD_PLAYED`, `COLOR_CHOSEN`, `PLAYER_DREW`, `TURN_PASSED`,
`DIRECTION_REVERSED`, `PLAYER_SKIPPED`, `DRAW_CHAIN_EXTENDED`,
`DRAW_CHAIN_ACCEPTED`, `PILE_RESHUFFLED`, `UNO_CALLED`, `UNO_PENALTY_APPLIED`,
`WILD4_CHALLENGED`, `ROUND_ENDED`.

### R-10 — Per-player projection

`view(state, playerId)` returns the player's own hand plus, for every other
player, only the **count** of cards held, the discard top, `activeColor`,
`direction`, `pendingDraw`, and `drawPile.length`. Hidden information must never
cross this boundary. This exists from day one even though the CLI does not
require it.

---

## 5. Setup

### R-11 — Deal

Each player receives 7 cards, dealt one at a time in seat order starting at
seat 0.

### R-12 — Initial card

The top card of the draw pile is flipped to start the discard pile.

### R-13 — Initial `wild4`

If the flipped card is a `wild4`, it is returned to the draw pile, the pile is
reshuffled, and a new card is flipped. Repeat until the flipped card is not a
`wild4`.

### R-14 — Initial action cards

| Flipped card | Behaviour |
|---|---|
| `wild` | Phase starts as `AWAITING_COLOR`; seat 0 declares the colour, then plays normally. |
| `skip` | Seat 0 is skipped; play begins with seat 1. |
| `reverse` | `direction` becomes `-1`; play begins with the last seat. With 2 players this means seat 1 begins. |
| `draw2` | Seat 0 faces a `pendingDraw` of 2. |

⚑ **`draw2` and `initialDrawCardOpensChain`.** In `standard` the flag is `false`:
seat 0 draws 2 and is skipped, matching published rules. In `gt` the flag is
`true`: `pendingDraw` is opened as if any player had played it, phase becomes
`AWAITING_STACK_RESPONSE`, and seat 0 may stack. Rationale: it reuses the
`pendingDraw` code path instead of introducing a special case, and matches how
the opening card is treated at the table. The "attacker" is undefined but no
rule depends on the attacker's identity.

### R-15 — Initial `activeColor`

Equal to the colour of the flipped card, or the colour declared under `R-14`
when the flipped card is a `wild`.

---

## 6. Legality in `NORMAL` phase

### R-20 — Playable predicate

`canPlay(card, topCard, activeColor, hand, ruleSet)` returns `true` iff:

1. `card.rank === 'wild'`, **or**
2. `card.rank === 'wild4'` and `R-21` is satisfied, **or**
3. `card.colour === activeColor`, **or**
4. `card.rank === topCard.rank` and `topCard` is not a wild.

Clause 4 is deliberately guarded: when the top card is a wild, matching happens
through `activeColor` only.

### R-21 — Wild Draw Four restriction

If `wildFourRequiresNoMatch === true`, a `wild4` may be played only when the
player holds **no card whose colour equals `activeColor`**. Wilds and cards of
other colours do not block the play. Matching by rank is irrelevant — the
restriction concerns colour only.

If the flag is `false` (`gt`), a `wild4` is always playable.

### R-22 — Turn ownership

Only `currentPlayerIndex` may act, except for `CHALLENGE_UNO` (`R-71`) and
`CHALLENGE_WILD4` (`R-25`).

---

## 7. Action card effects

### R-23 — Skip

The next player in the current direction loses their turn. Turn advances by two
positions.

### R-24 — Reverse

`direction` flips. **With exactly 2 players, `reverse` behaves as `skip`** —
the player who played it takes another turn.

### R-25 — Wild Draw Four challenge

Only when `challengeWildFour === true` (i.e. `standard` only, by `V-01`).

The player about to draw may issue `CHALLENGE_WILD4` before drawing:

- The challenged player's hand is revealed to the challenger.
- If they held a card of `activeColor` at the time of play (bluff proven): the
  **challenged** player draws 4, the challenger's turn proceeds normally.
- If not: the **challenger** draws 6 and loses their turn.

Verification requires the `activeColor` as it stood **before** the `wild4` was
played. This must be recorded in state or reconstructed from the event log —
`T-14`.

---

## 8. Draw chains (`pendingDraw`)

### R-26 — Chain opening

Playing a `draw2` or `draw4` sets `pendingDraw = { amount, lastType }`
(`amount` = 2 or 4). This happens even in `standard`; the difference is that in
`standard` the only legal response is `ACCEPT_DRAW`.

### R-27 — Stack response matrix

While `phase === 'AWAITING_STACK_RESPONSE'`, the only legal actions are
`ACCEPT_DRAW`, `CHALLENGE_WILD4` (per `R-25`), and playing a draw card
permitted by:

| Played on top of → | `draw2` | `draw4` |
|---|---|---|
| **`draw2`** | `draw2OnDraw2` | `draw2OnDraw4` |
| **`draw4`** | `draw4OnDraw2` | `draw4OnDraw4` |

In `gt` all four are `true`: any draw card answers any draw card.

### R-28 — Colour is ignored inside a chain

When `stackResponseIgnoresColor === true`, `R-20` does **not** apply to a stack
response. A blue `draw2` legally answers a red `draw2` or a `wild4` that
declared green. `R-21` likewise does not apply inside a chain.

### R-29 — Chain accumulation

Each stacked card adds its value to `pendingDraw.amount` (+2 or +4) and updates
`lastType`. No theoretical cap; the arithmetic maximum is 32 (8 × `draw2` +
4 × `draw4`). `maxStackAmount` stays `null` in v0.1 — the distribution is
measured by the simulation harness before any cap is considered.

### R-30 — Colour after a chain

`activeColor` is determined by the **last card played** in the chain:

- last card is a coloured `draw2` → its own colour;
- last card is a `wild4` → the colour declared by the player who played it.

Declaration timing: the player declares **at the moment of playing** the
`wild4` (`AWAITING_COLOR` resolves before the turn advances). If a later player
stacks on top, that declaration is overwritten and becomes irrelevant. This
keeps one action per player-turn and avoids prompting a player out of turn
order. ⚑

### R-31 — Accepting

`ACCEPT_DRAW`: the player draws exactly `pendingDraw.amount` cards, forfeits
their turn, `pendingDraw` becomes `null`, phase returns to `NORMAL`, turn
advances by one.

### R-32 — Accepting is not drawing

`drawRule` and `drawnCardPlayableImmediately` **do not apply** to
`ACCEPT_DRAW`. Cards taken from a chain are never playable on the spot and
never stop early. These are two separate mechanisms and conflating them is the
canonical bug in this area — `T-08`.

---

## 9. Drawing

### R-40 — `drawRule: { type: 'one' }` (standard)

The player draws exactly one card. If it is playable and
`drawnCardPlayableImmediately === true`, they **may** play it (`PLAY_DRAWN`) or
`PASS`. If it is not playable, they must `PASS`.

### R-41 — `drawRule: { type: 'untilPlayable', max: 3 }` (gt)

1. The player draws one card at a time, stopping **as soon as** a playable card
   appears (`R-20`).
2. If a playable card appears on draw 1, 2, or 3, the player **may** play it or
   `PASS`. Playing is optional.
3. If 3 cards are drawn with none playable, all 3 are kept and the turn passes.
4. `turnDrawCount` tracks progress and resets on turn advance.

### R-42 — Optionality leaks information

Declining to play a drawn playable card is legal and observable. Bots differ
here by design: `GreedyBot` always plays it, `StrategicBot` may hold. This is an
analysis dimension in the harness, not a rule.

### R-43 — Reshuffle

When the draw pile is empty and a card must be drawn: the discard pile minus
its top card is shuffled (using the seeded RNG, `R-44`) and becomes the new draw
pile. The top card remains in place. Emits `PILE_RESHUFFLED`.

### R-44 — Determinism

All shuffles use the injected PRNG seeded from `state.seed`. `Math.random`,
`Date.now`, and any other ambient source are forbidden in `packages/engine`.

### R-45 — Exhaustion

If after `R-43` there are still no cards available (draw pile empty and discard
pile holds only the top card), the player draws as many as exist — possibly
zero — and the turn passes. The game does not deadlock. Rare but reachable
with long chains — `T-10`.

---

## 10. UNO

### R-70 — Calling

A player must declare UNO when playing the card that leaves them with exactly
one. Modelled as `PLAY_CARD { callUno: true }` — a single atomic action, which
removes any race between playing and calling.

### R-71 — Catching

If a player reaches one card without `callUno`, `unoWindow` opens. Any other
player may issue `CHALLENGE_UNO` targeting them. The window closes when the
**next player's action is successfully applied**. A successful challenge makes
the target draw `unoPenaltyCards` (4 in `standard`, 2 in `gt`).

### R-72 — Late self-call

The offending player may not retroactively call UNO. Once `unoWindow` is open,
only a challenge or the window closing resolves it.

### R-73 — False call

Calling UNO while holding more than one card after the play is a
`RuleViolation` (`ILLEGAL_UNO_CALL`); the action is rejected outright and state
is unchanged. No penalty card is applied — rejecting the action is cheaper to
reason about than a partially applied turn. ⚑

---

## 11. Round end and scoring

### R-80 — Round end

The round ends the moment a player's hand reaches 0 cards. `phase` becomes
`ENDED`, `winner` is set, `ROUND_ENDED` is emitted. No further action is legal.

### R-81 — Winning with an action card

Playing `skip` or `reverse` as the final card ends the round; the effect is not
applied.

### R-82 — Winning with a draw card

Playing `draw2` or `wild4` as the final card ends the round. The next player
**does** draw the pending amount (it counts toward scoring), then `ENDED`.

### R-83 — No stacking on a winning card ⚑

In `gt`, a chain cannot be extended over a winning card. The round is already
decided; allowing a chain to continue past the winner creates an undefined
turn order among the remaining players. `R-82` resolves the draw immediately
instead.

### R-84 — Scoring

Implemented as a **pure function outside the reducer**: `score(state)`.

| Card | Points |
|---|---|
| `0`–`9` | face value |
| `skip`, `reverse`, `draw2` | 20 |
| `wild`, `wild4` | 50 |

The winner scores the sum of all opponents' remaining hands. Match play to 500
points is the **rooms service's** responsibility, not the engine's — the engine
knows only about a single round.

---

## 12. Runtime invariants

Asserted after every action when `simulationMode === true`. A violation is a
`throw` (`R-08`), never a `RuleViolation`.

| ID | Invariant |
|---|---|
| `I-01` | `sum(hands) + drawPile.length + discardPile.length === 108` |
| `I-02` | The multiset of all card ids in state equals the initial deck exactly — no duplicates, no losses |
| `I-03` | `activeColor` is one of the four colours (never `null`, never `'wild'`) after setup |
| `I-04a` | `phase === 'AWAITING_STACK_RESPONSE'` ⟹ `pendingDraw !== null` |
| `I-04b` | `pendingDraw !== null` ⟹ `phase ∈ { 'AWAITING_STACK_RESPONSE', 'AWAITING_COLOR' }`. A `wild4` sets `pendingDraw` at play time, before the colour is declared (`R-30`), so the biconditional does not hold. |
| `I-04c` | `phase ∈ { 'NORMAL', 'ENDED' }` ⟹ `pendingDraw === null` |
| `I-05` | Every played card was present in the acting player's hand immediately before the action |
| `I-06` | `0 <= currentPlayerIndex < players.length` |
| `I-07` | No action succeeds while `phase === 'ENDED'` |
| `I-08` | `discardPile.length >= 1` after setup |
| `I-09` | `phase === 'AWAITING_COLOR'` implies the top discard card is a `wild` or `wild4` |
| `I-10` | The round terminates within `maxTurns` (default 2000); exceeding it flags a deadlock and dumps `{ seed, actions }` |
| `I-11` | Replaying `{ seed, ruleSetHash, actions }` yields a byte-identical state hash |

---

## 13. Required edge-case tests

| ID | Case | Rules |
|---|---|---|
| `T-01` | `reverse` with exactly 2 players acts as `skip` | `R-24` |
| `T-02` | Reshuffle preserves the discard top and conserves all 108 ids | `R-43`, `I-01` |
| `T-03` | Initial card is `wild4` → reshuffle and reflip | `R-13` |
| `T-04` | Initial card is `wild` → seat 0 declares before playing | `R-14` |
| `T-05` | Initial `draw2` in `gt` opens a stackable chain; in `standard` it does not | `R-14` |
| `T-06` | `wild4` declared green, answered by a red `draw2` in `gt` | `R-28` |
| `T-07` | Chain of 4 players reaching amount ≥ 12 resolves correctly | `R-29` |
| `T-08` | `ACCEPT_DRAW` of 6 never triggers `untilPlayable` or immediate play | `R-32` |
| `T-09` | Draw pile exhausts mid-`ACCEPT_DRAW`; reshuffle occurs and the full amount is drawn | `R-43`, `R-31` |
| `T-10` | Both piles exhausted → player draws fewer than required, no deadlock | `R-45` |
| `T-11` | `untilPlayable` stops at the first playable card, not after 3 | `R-41` |
| `T-12` | `untilPlayable` finds nothing in 3 → keeps 3, passes | `R-41` |
| `T-13` | `wild4` restriction in `standard`: holding an off-colour match does not block | `R-21` |
| `T-14` | Successful and failed `wild4` challenge, using pre-play `activeColor` | `R-25` |
| `T-15` | UNO caught within the window; window closes on the next player's action | `R-71` |
| `T-16` | `callUno: true` with 2+ cards remaining is rejected, state unchanged | `R-73` |
| `T-17` | Winning with `draw2`: next player draws, round ends, no stacking | `R-82`, `R-83` |
| `T-18` | Same seed + same actions → identical final state hash | `I-11` |
| `T-19` | Validator rejects `challengeWildFour` without `wildFourRequiresNoMatch` | `V-01` |
| `T-20` | Validator rejects `untilPlayable` with `drawnCardPlayableImmediately: false` | `V-03` |
| `T-21` | Colour declared on a `wild4` is overwritten when stacked over | `R-30` |
| `T-22` | `view()` never exposes another player's card ids | `R-10` |
| `T-23` | `wild4` played into `AWAITING_COLOR` already carries `pendingDraw`; a plain `wild` does not | `R-30`, `I-04b` |

---

## 14. Explicitly out of scope for v0.1

Flags exist in the type but are `false` in both presets and have no
implementation:

- **`jumpIn`** — breaks the one-turn-one-actor model in the reducer and
  complicates optimistic concurrency in the deployed service. Revisit after the
  simulation harness is in place.
- **`sevenZero`** — hand swapping/rotation. Mechanically simple but interacts
  with `R-10` projections and UNO state.
- Match play across multiple rounds (rooms service responsibility, `R-84`).
- Player disconnection, timeouts, and turn clocks (rooms service).