# Phase 1 — Establishing the Design Baseline

The baseline is the ground truth. Everything downstream is measured against it, so an error here propagates into every row of the precision table.

## 0. Which kind of design reference do you have?

The route depends entirely on this. Identify it before fetching anything.

| Tier | Kind | Route | Token needed | Fidelity |
|---|---|---|---|---|
| **1 — default** | High-res screenshot | Section 8 | no | estimates on exact metrics |
| **2 — escalation** | Hi-fi static HTML prototype | Section 10 | no | exact |
| **3 — if already available** | Figma design link | Sections 1–7 (Figma REST) | yes, and never solicited | exact |
| — | Written spec | Section 9 | no | depends how it is written |

**Start at tier 1.** A screenshot needs no account, no permission and no meeting — which is exactly why it is the default, and why this skill is usable by anyone who can see the page. Move to tier 2 only when the escalation trigger in §11 fires. Tier 3 exists for people who already hold a token; do not send anyone to Figma's settings to obtain one.

If the user offers two of them, use the higher tier and say which you used. State the tier-1 caveat honestly: a screenshot cannot resolve exact font size, stroke width or alignment, container padding, or two near-identical colours — those stay `估算`.

## 1. Figma link — resolve the file key and node id

From a Figma URL:

```
https://www.figma.com/design/<FILE_KEY>/<doc-name>?node-id=<A-B>&t=...
```

- `<FILE_KEY>` — the file key
- `<A-B>` — the node id, written with a hyphen in the URL

The URL writes the node id with a hyphen (`123-456`); the API takes it with a colon (`123:456`). Convert.

If the URL has no `node-id`, do not guess a node. Fetch the top level at shallow depth, read the names out loud to the user, and let them pick.

## 2. Figma token — use one if it already exists, never ask for one

**Do not ask the user for a token.** Obtaining one is a multi-screen detour through Figma settings, and for anyone outside the design org it is an outright blocker. A screenshot baseline costs nothing and is the default for precisely this reason.

The single exception: a token used previously *on this machine* can be recovered from the local audit log. Try that, silently, and only when you are already on the Figma route:

```bash
grep -ohE "figd_[A-Za-z0-9_-]{8,}" ~/.workbuddy/audit-log/*.jsonl | sort -u | tail -1
```

On Windows, use the Grep tool over `C:\Users\<user>\.workbuddy\audit-log\` with pattern `figd_[A-Za-z0-9_-]{8,}`, output mode `content`.

If recovery yields nothing and the user has not volunteered a token, **do not ask for one — stay on the screenshot tier** and record in the document that exact stroke and font metrics are estimates. If the user volunteers a token unprompted, accept it, and ask them to scope it **File content: Read-only** — write scope is more access than this task needs.

## 3. Fetch the node subtree in two steps

Never start with a whole-file fetch. Large design systems return multi-megabyte payloads and will consume the context window for no benefit.

**Step one — shallow outline:**

```bash
curl -s -H "X-Figma-Token: $FIGMA_TOKEN" \
  "https://api.figma.com/v1/files/$FILE_KEY?depth=2" -o outline.json
```

Read the names and ids at depth 2, show them to the user, confirm which frame is the target.

**Step two — the target node, full detail:**

```bash
curl -s -H "X-Figma-Token: $FIGMA_TOKEN" \
  "https://api.figma.com/v1/files/$FILE_KEY/nodes?ids=$NODE_ID" -o node.json
```

`geometry=paths` adds vector data, which is useful only when reconstructing icons. Omit it for a layout diff — it multiplies the payload for no measurement benefit.

If a single node was requested but the frame that matters is a sibling, go back to the outline rather than pulling the whole file.

## 4. Flatten the subtree

```bash
node scripts/figma-node-dump.cjs <FILE_KEY> <NODE_ID> --out report.txt
```

The script walks the tree and emits one line per node with everything this skill needs. Read the report; do not read the raw JSON into context.

Per-node fields that matter, and what they are for:

| Field | Where it lives | What it decides |
|---|---|---|
| `absoluteBoundingBox` | every node | Position and size. The source of every px value. |
| `style.fontSize` | TEXT | Type scale. |
| `style.fontWeight` | TEXT | Weight. Figma uses numeric weights (400/500/700). |
| `style.lineHeightPx` | TEXT | Row height. Often the true cause of a "spacing looks wrong" report. |
| `style.letterSpacing` | TEXT | Rarely relevant, but explains odd widths. |
| `fills[]` | most nodes | Color. `{type:"SOLID", color:{r,g,b}, opacity}` — color channels are 0–1, opacity is separate. |
| `strokes[]` + `strokeWeight` + `strokeAlign` | most nodes | Border color, width, **and alignment**. See the warning below. |
| `cornerRadius` / `rectangleCornerRadii` | rects, frames | Radius. Per-corner when the array form is present. |
| `paddingLeft/Top/Right/Bottom`, `itemSpacing`, `layoutMode` | auto-layout frames | The container's internal rhythm. |
| `effects[]` | most nodes | Drop shadows and inner shadows. |
| `clipsContent` | frames | Whether children are clipped — determines what an overflow actually looks like. |

Convert floats to hex yourself: `Math.round(c * 255)`. Compose `opacity` into an alpha channel separately; forgetting it turns a 6% overlay into a solid block.

## 5. Two geometry facts that cause wrong conclusions

**Stroke alignment.** Figma strokes are drawn **inside or centered** by default; CSS `border` is drawn **outside** the box. Reproducing an inside stroke with a CSS border enlarges the element, which then shifts everything measured relative to it. Reproduce inside strokes with `box-shadow: inset 0 0 0 <w>px <color>`.

This exact mistake appeared as a missing 1px avatar ring in one audit: the design had `strokeAlign: INSIDE`, the implementation had no stroke at all, and the "obvious" fix of adding a border would have changed the avatar's rendered size and broken two downstream alignment equations.

**Padding is not margin.** A design that indents a text column via the container's `paddingLeft` and an implementation that indents via the child's `margin-left` look identical but are code-different. When a whole column is misaligned, check which mechanism each side uses before writing the fix — and note that if the child already has `width:100%`, switching it to a margin will push its right edge out of the container. That is a real regression, and it has happened.

## 6. Recover the type scale and the component sizes

Sort the TEXT nodes by `style.fontSize`. The distinct values are the type scale. For each distinct size, note which semantic role uses it — that mapping is what lets the proposal say "status word should be 12px" rather than "some text is too big".

Then collect the small shapes:

- The largest circle in a person row is the avatar. Note its size and whether it has a stroke.
- A small square or circle overlapping the avatar's lower-right corner is a status badge. Note its size, fill, and stroke.
- Small circles sitting on the timeline rail are state dots. Note fill, stroke color, and stroke weight — **a filled circle and a hollow ring with the same outer size read completely differently**, so record which it is rather than just the diameter.

## 7. Exporting assets

```bash
curl -s -H "X-Figma-Token: $FIGMA_TOKEN" \
  "https://api.figma.com/v1/images/$FILE_KEY?ids=$NODE_IDS&format=svg" -o images.json
```

The response maps node id to a short-lived URL. Download immediately; the URLs expire.

**A single `VECTOR` node frequently returns `null`.** This is not an error in the request. Export the node's parent `FRAME` instead and crop, or export the frame's `INSTANCE` and accept the extra padding. Trying the same vector id repeatedly will not produce a different result.

When an icon must become part of a self-contained document, prefer inlining its SVG source over embedding a rasterized copy — inline SVG stays sharp and adds no request.

## 8. Screenshot baseline (the default)

This is where most runs start, and it is a workable baseline rather than a degraded mode to apologise for. Read it with the image-reading capability, but be explicit about what it can and cannot yield:

- **Can** establish: ordering, relative sizes and spacing ratios, colours within a few units, component boundaries, and every qualitative layout problem worth fixing.
- **Cannot** establish: exact font size, exact stroke weight and alignment, exact padding, or the difference between `#F5F6F7` and `#F2F3F8`.

Get the best image available before reading it:

- Ask for a **2x export of the frame**, not a screen grab that was scaled down to fit someone's monitor. A downscaled grab loses exactly the edges you need.
- Ask for the **whole component in one image**, with browser chrome cropped out. A shot with a device frame or a scrollbar in it invites measuring the wrong thing.
- If the source design is a Figma frame, a 2x PNG export costs the requester one click and beats any screen grab. Say that plainly — it is a much lighter ask than a token.

Deriving numbers from a screenshot is ratio work, not guesswork. Anchor on the largest unambiguous dimension in the image (usually the avatar, or the full card width), take its implementation-side counterpart as the known value, and scale everything else off that ratio. Then:

- Tag every derived number `估算` in the precision table — no exceptions, even when it looks obvious.
- List the metrics that stay unverified in the open-questions section under "需设计源确认".
- Never present an estimated number as measured. A reader who cannot tell the two apart will re-litigate the whole document.

If the estimate-only route stalls, go to §11 and escalate to a hi-fi HTML baseline rather than grinding on guesses.

## 9. Written-spec baseline

Written specs are usually complete on intent and incomplete on numbers. Convert each statement into a row, and for any row without a number, record the number as `待确认` with the question to ask. Do not invent a value to fill the cell — a fabricated number in a baseline table is worse than a blank one, because the reader cannot tell which is which.

## 10. Hi-fi HTML baseline

**This is the escalation target — reach for it when the trigger in §11 fires, not on the first pass.** A hi-fi HTML prototype is the highest-fidelity baseline that costs the requester nothing: no token, no API, no export step, no rate limit. Read it with **exactly the Phase 2 procedure** — `getBoundingClientRect()` for geometry, `getComputedStyle()` for font size / weight / colour / box-shadow / border — at the viewport it was authored for.

```bash
node scripts/verify-render.cjs <reference.html> --width=375
```

Confirm four things before you trust it:

- **Is it current?** A prototype built from an older design carries that design's deviations. Ask which revision it represents; if nobody knows, say so in the open-questions section.
- **Same viewport and scale?** A 1440px prototype cannot be compared against a 375px implementation without deciding which measurements are proportional and which are absolute. Record the conversion you used.
- **Is it fully reachable?** Folded panels, dialogs and hover states may not be present in the markup. Measure what is reachable and mark the rest `待实测`.
- **Whose styles are they?** A prototype exported from a design tool often ships absolute positioning and per-node classes. Fine for reading values — but do not carry that structure into the fix recipe. The engineer has to edit the implementation's own mechanism, not the prototype's.

One asymmetry worth stating in the document: when the baseline is itself HTML, the design-vs-implementation diff becomes an HTML-vs-HTML diff, so both sides are code and every deviation is attributable on both sides. That is a feature — it removes the "the design tool drew it that way" escape hatch.

## 11. Escalation ladder — when to stop estimating and ask for more

Escalating is a judgement call with a concrete trigger, not a way to avoid work. Both conditions must hold:

1. **Three or more rounds** of fix → re-measure → the user is still dissatisfied.
2. The remaining disagreement sits on a metric a screenshot cannot settle: exact font size or weight, stroke width or alignment, container padding, or two near-identical colours.

Do not escalate because the numbers feel hard, because a token would be convenient, or because the design team happens to be reachable. Escalating early turns a two-hour job into a two-day one, and it trains the user to expect a design handoff for every small audit.

The ask, verbatim — small, specific, and addressed to whoever can actually produce it:

> 剩下这几处分歧都落在「截图看不出来的量」上（精确字号、描边宽度与对齐、内边距、相近色差），再改下去只能靠猜。
> 能否请设计同学把这一屏导出一份**高保真静态 HTML demo**（单文件、能直接打开即可）？我会用与量线上**完全相同**的方式去量它，基线就钉死了。

Two things to state when you ask, because they are what make the ask easy to say yes to:

- **Who produces it**: the designer who owns the file — not the person reporting the bug. Say that it is one export, not a rebuild.
- **What it buys**: the diff becomes HTML-vs-HTML, both sides measurable, every deviation attributable in both directions. That is the sentence that ends the "the design tool drew it that way" loop.

If a hi-fi HTML genuinely cannot be produced after the trigger fires, the next best step is a 2x PNG export of the frame — still no token, still a real fidelity gain over a screen grab. Never fall back to requesting a token.
