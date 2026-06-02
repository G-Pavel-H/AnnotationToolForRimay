# Rimay Annotation Guide

## What you are doing

You are converting natural-language (NL) feature requests into **Rimay**, a controlled, structured form of English for requirements. For each requirement you do two things at once:

1. **Write the Rimay conversion** in the text box.
2. **Mark which structural slots are present, implied, or missing** in the slot grid.

One task, but it produces two things we measure: the conversion itself, and a record of what the source requirement was missing. You do not need to record an overall "complete / incomplete" verdict. The app computes that for you from your slot choices and shows it as a chip.

---

## What is Rimay?

Rimay is a controlled natural language. It takes ordinary requirement text and restricts it into a fixed, readable structure, so that every requirement follows the same shape and nothing important is left implicit. It stays readable for a human, but it removes the vagueness that free text allows.

A Rimay requirement is built from up to three segments, always in this order:

```
[ Scope ]   [ Condition ]   Actor   Modal verb   Action phrase
 optional     optional      |________ mandatory ___________|
```

- **Scope** and **Condition** are optional. Many requirements have neither.
- **Actor**, **Modal verb**, and **Action phrase** are mandatory. Every valid Rimay requirement has all three.

---

## The five structural slots

For each requirement you judge each of these five slots.

**SCOPE** — A "For each / For all ..." clause that limits what the requirement applies to.
Example: *"For all the depositories, System-A must create a MT530 transaction processing command."*
The scope is *"For all the depositories"*.

**CONDITION** — A clause that gates when the system response happens. Comes in three types (see below).
Example: *"When CCS creates a contract note for a Migrated_Client, then CCS must add the settlement indicator."*
The condition is the "When ..." clause.

**ACTOR** — The entity that performs the system response (the subject of the "must" clause).
Examples: *System-A*, *the App*, *the notification service*.

**MODAL_VERB** — The obligation word.
Allowed values in Rimay: *must*, *shall*, *will*.

**ACTION_PHRASE** — The specific action the actor performs. This is the heart of the requirement.
Examples: *create a MT530 command*, *display the error*, *ignore the message*.

---

## Judging each slot: Present, Implied, Missing

For every slot, choose one of three values.

**P — Present.** The information is explicitly stated in the NL. No inference needed.

**I — Implied.** Not explicitly stated, but a reasonable reader can infer it from context. For example, in *"I'd like a preview shown in the notification bar"* the actor (the app) is never named, but it is obviously the app. That is Implied, not Missing.

**M — Missing.** Not stated, and cannot be reasonably inferred. A developer reading this would have to ask a clarifying question to fill the slot.

**Why the Implied vs Missing distinction is the most important judgment you make:** an LLM filling in an Implied slot is doing the right thing (it understood the context). An LLM filling in a Missing slot is inventing information. Your P / I / M judgments are what let us tell those two cases apart, so take the I-vs-M call seriously.

### Which slots make a requirement incomplete

Only the **mandatory** slots matter for incompleteness:

- A missing **SCOPE** does **not** make a requirement incomplete (scope is optional).
- A missing **CONDITION** does **not** make a requirement incomplete (condition is optional).
- A missing **ACTOR**, **MODAL_VERB**, or **ACTION_PHRASE** **does** make it incomplete.

The app applies this rule automatically. If you mark any mandatory slot as Missing, the verdict chip flips to "Incomplete." You do not set the verdict yourself.

---

## Condition types

If CONDITION is Present or Implied, also pick its type:

- **precondition** — a state that must hold. *"If the message contains 'FISN', then ..."*
- **trigger** — an event that initiates the requirement. *"When the user clicks submit, then ..."*
- **temporal** — a time-based condition. *"Before sending the report ..."*, *"After 24 hours ..."*, *"Every day ..."*

If CONDITION is Missing, leave the type as none / NA.

---

## Atomicity (the non-atomic flag)

This is **separate from incompleteness.** A non-atomic requirement is not missing anything; it has *too much*, namely more than one action packed into a single statement.

- Flag **non-atomic = Yes** when the NL asks for two or more distinct actions. Example: *"validate the order **and** put it in the queue"* (two actions: validate, enqueue).
- Flag **No** for a single action.

**Important distinction.** Multiple *objects* of one action is **not** non-atomic. *"send a confirmation message and a settlement instruction to System-D"* is a single action (*send*) with two objects, so it is atomic. *"send the message and delete the draft"* is two different actions, so it is non-atomic.

When something is non-atomic, write the Rimay for the primary action only and note the others in the notes field.

---

## Writing the Rimay conversion

Follow these rules when filling the conversion text box.

**Segment order:** Scope (if any), then Condition (if any), then Actor + Modal verb + Action phrase.

**Modal verb default:** if the NL is a wish with no explicit obligation word ("I'd like...", "it would be great if..."), use **must**. Mark the modal slot as **Implied** in the grid in that case, because the obligation is intended but not written.

**Quote specific values:** put concrete names, values, fields, and UI elements in double quotes. Example: *show a "preview of the message" in the "notification bar"*.

**Name actors plainly:** use *the App*, *the System*, or *System-A* / *System-B* for unnamed systems.

**Mark missing slots in the text too:** if you judged a slot Missing, use the matching placeholder in the conversion so the text and the grid line up: `<MISSING_SCOPE>`, `<MISSING_CONDITION>`, `<MISSING_ACTOR>`, `<MISSING_MODAL_VERB>`, `<MISSING_ACTION>`. The quick-insert buttons above the text box add these for you.

**Implied slots are filled, not flagged.** If a slot is Implied (e.g., the actor is obviously the app), write the inferred value into the Rimay. Do not use a placeholder. Placeholders are only for Missing slots.

---

## What canonical Rimay looks like (from the source paper)

These are real Rimay requirements from the formal banking domain Rimay was built for. They show the target structure. Your data is more informal, but the shape is the same.

**With a scope:**
> For all the depositories, System-A must create a "MT530 transaction processing command".

**With a "When" trigger:**
> When CCS creates a "SWIFT 15022 format contract note" for a Migrated_Client, then CCS must add "Settlement option indicator (STCO/CEDE/MANU)" to "sequence D" of MT515_Message.

**With an "If" precondition:**
> If the message contains "FISN", then the System must ignore the message.

**With a negative action and a channel:**
> System-I shall not forward Inx1 of type Instruction to System-J through System-K.

**With multiple objects (still atomic, one action):**
> System-C must send a "confirmation message" and a "settlement instruction" to System-D.

### How action phrases are structured

The action phrase is a verb followed by its object (usually quoted) and optional prepositional detail (`to`, `from`, `through`, `by using`, `based on`, `in`). Examples from the paper:

- compute the "Trade Dated balance (TDB)" in compliance with "Trade Dated balance"
- cancel the "request of Validation"
- restore "FundsHandler archived data" for a period of "10 years" starting from "Nov-2017"
- exclude the "Gregorian dates that are not business days" in the System based on "the relevant calendar"
- validate Settlement_Request by checking that "Transaction Type" contains "SWIT"

---

## Your data is informal: what to expect

The requirements you are annotating are GitHub feature requests, not formal banking specs. The Rimay structure still applies, but the typical slot pattern is different:

- **Actor** is almost always **Implied**. "I'd like..." implies the app or system, even though it is rarely named.
- **Modal verb** is usually **Implied**. Wishes ("it would be nice if...") carry the intent of an obligation without the word "must."
- **Action phrase** is usually **Present**, though informally worded. Reword it into a clean verb + object.
- **Condition** is sometimes Present ("when I open the app...") and sometimes Missing.
- **Scope** is almost never present. Feature requests rarely say "for all X."

This means genuine incompleteness in your data usually shows up as a **missing or unstateable action** (the request describes a desire but no concrete thing the system should do, e.g. "the notifications are annoying"), not a missing actor or modal.

---

## Rimay patterns (reference only)

A Rimay "pattern" is just a name for which segments a requirement contains. You do **not** need to identify the pattern while annotating. It is fully determined by the slot choices you already make (is there a scope? is there a condition, and of what type?). This section exists only so you understand the valid shapes a Rimay requirement can take.

| # | Segments | Applies to your data? |
|---|---|---|
| 1 | Scope + system response | Rare (needs scope) |
| 2 | Scope + precondition + system response | Rare (needs scope) |
| 3 | Scope + trigger + system response | Rare (needs scope) |
| 4 | Scope + temporal + system response | Rare (needs scope) |
| 5 | System response only | **Common** |
| 6 | Precondition + system response | **Common** |
| 7 | Trigger + system response | **Common** |
| 8 | Temporal + system response | **Occasional** |
| 9 | Scope + multiple conditions + system response | Rare |
| 10 | Multiple conditions + system response | Occasional |

The takeaway: because your data almost never has a scope, you will mostly be producing patterns **5, 6, 7, and 8**. Patterns 1 to 4 (all of which start with a scope) will hardly ever apply. Focus on getting the slots and the conversion right; the pattern follows automatically.

---

## Worked examples (your kind of data)

**Example 1 — a bare wish, complete**

NL: *"It would be great to have a dark mode option in settings."*

- Scope: Missing (optional, fine)
- Condition: Missing (optional, fine)
- Actor: Implied (the app)
- Modal verb: Implied (a wish, intent is clear)
- Action phrase: Present (provide a dark mode option)
- Verdict (computed): **Complete** (all mandatory slots are P or I)
- Rimay: `The App must provide a "dark mode" option in "settings".`

**Example 2 — missing action, incomplete**

NL: *"The notification experience needs improvement."*

- Scope: Missing
- Condition: Missing
- Actor: Implied (the app)
- Modal verb: Implied
- Action phrase: **Missing** (no concrete action; "needs improvement" is not something the system can do)
- Verdict (computed): **Incomplete** (a mandatory slot is Missing)
- Rimay: `The App must <MISSING_ACTION>.`

**Example 3 — trigger present, complete**

NL: *"When I receive a new message, play a notification sound."*

- Scope: Missing
- Condition: Present, type **trigger** ("When I receive a new message")
- Actor: Implied (the app plays the sound)
- Modal verb: Implied
- Action phrase: Present (play a notification sound)
- Verdict (computed): **Complete**
- Rimay: `When the user receives a "new message", then the App must play a "notification sound".`

Note in Example 3 that the trigger has its own actor (the user, who receives the message), while the system response has its own actor (the app, which plays the sound). That is normal.

---

## Quick recap of your steps in the app

1. Read the NL requirement.
2. Write the Rimay conversion in the text box. Use the placeholder buttons for any Missing slot.
3. Mark each of the five slots: Present, Implied, or Missing.
4. If there is a condition, set its type.
5. If the NL has more than one action, flag it non-atomic and note the extra actions.
6. Add any judgment calls to the notes field.
7. Check the computed verdict chip, then submit.