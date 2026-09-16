---
name: ui-review
description: This skill should be used when an existing UI implementation must be compared against a design reference — a high-res screenshot by default (no account, no token needed), escalating to a hi-fi static HTML prototype from the designer only after repeated rounds still fail to satisfy, or a Figma link only when a token already exists — and turned into a reviewable before/after optimization proposal — pixel-grounded findings, item-by-item fix recipes, frontend/backend ownership split, required resources, and an offline single-file HTML deliverable that can be published to a Feishu/Lark cloud doc with rendered HTML blocks plus code blocks. Trigger on: 优化方案, 改前改后对比, 设计稿 vs 线上, UI 还原度比对, 样式偏差排查, 把差异整理成文档, 同步到飞书云文档, design QA report, design-vs-implementation audit, before/after UI diff, UI regression proposal.
agent_created: true
---

# UI Review

Turn "the implementation does not match the design" into a document a frontend engineer can execute and a backend lead can sign off on. The output is never a screenshot deck or a vague list of complaints — it is a measured diff, a root cause per item, an ownership column, and a runnable deliverable.

## Core contract

Six rules. They are not stylistic preferences; breaking any one of them has produced a wrong document before.

1. **Measure, never eyeball — and label what you could not measure.** The implementation side is *always* machine-read (`getBoundingClientRect()` + `getComputedStyle()` in a real browser). The baseline side is machine-read whenever its form allows it: hi-fi HTML → the DOM, Figma link → `absoluteBoundingBox` / `style.*`. A screenshot is the default baseline precisely because everyone has one, but it cannot be machine-read: every value derived from it is tagged `估算` in the precision table and echoed under 待确认. Never let an estimated number travel as if it were measured.
2. **The design reference is the only baseline.** The implementation is the thing under test. Do not "average" the two, and do not treat the live page as correct because it ships today.
3. **Reconstruct real DOM, not screenshots.** The before/after comparison in the deliverable is live HTML/CSS — same markup, two style layers. It must reflow, select, and measure like the real thing. Screenshots cannot be diffed, annotated by number, or trusted after a zoom.
4. **Safest-least-effort is the default.** Prefer pure presentation-layer changes. Do not introduce new design tokens when an existing one fits. Reject any change that leaks into adjacent surfaces (desktop portal, print/PDF export, message cards, admin views) unless the user has explicitly asked for that reach.
5. **Every row carries an owner.** Each finding is tagged `前端` / `后端` / `后端可选` / `设计` / `数据`. A finding without an owner is an unfinished finding.
6. **Clean up after yourself.** Working scripts, dumps, and intermediate reports are deleted at the end of the run. The user's project directory must look untouched except for the deliverable.

## On first load: announce the skill, then apply the certainty gate

The moment this skill is loaded — before doing any work, and even if the user has already pasted partial inputs — emit a short usage notice. It is what makes the skill self-serve for someone who has never seen it.

Required behaviour:

1. Print a compact notice covering: what the skill produces, the three things you need from them, and the screenshot-first baseline.
2. **Score the requirement certainty with the gate below before extracting anything.** The gate — not the mere presence or absence of an input — decides whether you ask anything first.
3. **Below 90% → ask about the gaps only.** Never re-ask what is already answered. Use the interactive question tool so the answers are clickable, in Simplified Chinese, at most four questions per round. Cap at four rounds, then start regardless.
4. **90% or above → do not ask.** Restate the inputs back as a one-line confirmation, record the one soft dimension (if any) in the document's open-questions section, and proceed to Phase 1 without making the user repeat themselves.

### The 90% certainty gate

Asking first is an interruption, justified only when a missing answer would change the output. Score five dimensions, 20 points each:

| Dimension | 20 — explicit | 10 — vague | 0 — absent |
|---|---|---|---|
| Target | names the page / component / flow | "the app", or only a rough area | not stated |
| Baseline | a usable design reference — a high-res screenshot is enough on its own; hi-fi HTML or a Figma link with `node-id` is better if already at hand | "it's in the design somewhere", or only a compressed 1x grab | none |
| Current state | live URL, repo path, or built `dist/` | only a screenshot | none |
| Destination | local HTML / Feishu / both | "you decide" | not stated |
| Constraints | names at least one no-touch surface, or the allowed change depth | implied only | not stated |

**≥ 90 → do not ask.** With 20 points per dimension, 90 means "four clear, one vague" or better. Start working, and record that one soft dimension under 待确认.

**< 90 → ask.** Two or more dimensions are vague/absent. Ask only about those; never re-ask what is already answered; cap at four rounds.

Skip the questions entirely when the request already carries all the information, when the user asks to continue an existing document (re-read it instead of re-collecting the baseline), or when they say 先别问，按你的判断做.

Notice template (Simplified Chinese, keep it under ~15 lines):

> **UI 优化方案技能已就绪。**
>
> 我会产出一份可评审的改前/改后优化方案：逐项给出设计稿值 vs 线上实测值的差异、每一项的代码级改法、归属前端还是后端、需要协调的资源，并生成一份可离线打开的单文件 HTML，最后同步到飞书云文档（含渲染版 HTML 区块与代码块）。
>
> 开始前需要三样东西：
> 1. **基准** —— 一张 **高清截图**就够了。不需要 Figma 账号，也不需要任何令牌。
> 2. **现状** —— 线上页面链接 / 源码或构建产物目录 / 现状截图。
> 3. **范围与去向** —— 要优化的具体模块、交付给谁看、是否要同步飞书。
>
> 缺哪条就补哪条。信息够我就直接开工，不会多问；缺得较多时我会先问你几个点选题。若调了几轮你仍觉得不像，我再请你找设计同学导一份高保真静态 HTML 把基线钉死。

## Phase 0 — Intake

Entry is gated by the certainty score above: **≥ 90%** arrives here directly, **< 90%** closes the gaps by asking about them first. Either way, once the three inputs exist in any form, do not keep asking questions.

### Required inputs

| # | Input | Why it is required | Acceptable forms |
|---|-------|--------------------|------------------|
| 1 | Baseline | Defines "correct" | A high-res (2x) screenshot is the default and is enough to start. A hi-fi HTML prototype, or a Figma link with `node-id`, is better if one is already at hand. |
| 2 | Current state | The thing under test | Live URL, source repo path, built `dist/` directory, screenshot |
| 3 | Scope + destination | Keeps the diff bounded and sets the deliverable form | Named component/page/section; audience; local-only or Feishu |

### Optional inputs worth asking for once

- Existing design tokens / theme file, so the proposal can reuse names instead of inventing colors.
- List of adjacent surfaces that must **not** regress (desktop, print, message cards, admin).
- Anything already known-broken and out of scope, so it does not get re-litigated.
- The language for the deliverable body (default: Simplified Chinese).

### When an input is missing

Never stall. Degrade explicitly and record the degradation in the document's open-questions section:

| Missing | Degradation |
|---|---|
| No machine-readable baseline (the normal case) | Ask for the largest, cleanest screenshot available — a 2x export, not a downscaled screen grab. Record that exact font size, stroke width/alignment, padding and near-identical colour pairs stay unverifiable, and tag every derived number `估算`. **Do not ask the user to create a Figma token.** If the estimate-only route later stalls, go to the escalation ladder in `references/design-source-extraction.md` §11. |
| Live URL | Ask for the built `dist/` directory or repo path. If neither, work from a screenshot and label all numbers `估算`. |
| Source of truth for a design token (a colour, a radius) | Read it off the design reference when it is machine-readable; on a screenshot baseline it is inside the estimate band, so propose a value and flag it as a proposal, not a fact. |

## Phase 1 — Establish the design baseline

Read `references/design-source-extraction.md` for the recipe per baseline kind and for the escalation ladder.

### The baseline ladder: screenshot first

Most people do not have a Figma seat, and sending a stranger off to generate an API token is a worse trade than accepting a slightly coarser baseline. So the default is the thing everyone already has — a screenshot — and higher-fidelity baselines are *earned by need*, never requested up front.

| Tier | Baseline | How to read it | Fidelity | When to use it |
|---|---|---|---|---|
| **1 — default** | High-res screenshot (2x export) | Read it as an image: ordering, relative size, approximate colour, qualitative layout | estimates on exact metrics | Always. Start here. No account, no token, no permission. |
| **2 — escalation** | Hi-fi static HTML prototype from the designer | Load it and read `getBoundingClientRect()` / `getComputedStyle()`, exactly as in Phase 2 | exact — Figma-level fidelity, still no token | Only after the escalation trigger below fires. |
| **3 — only if already available** | Figma design link | Figma REST API; `absoluteBoundingBox` / `style.*` | exact | Only when a token already exists on this machine, or the user volunteers one. |
| — | Written spec | One row per statement; leave the omitted numbers blank | varies | When it is all you have; never fill a gap with a guess. |

### Escalation trigger — when to ask for the hi-fi HTML

Do **not** ask for a hi-fi HTML prototype on the first pass, and do not ask for a Figma token at all. Escalate only when both conditions hold:

1. **At least three rounds** of fix → re-measure → still-not-right have run, and the user is still dissatisfied.
2. The remaining disagreement sits on a metric a screenshot cannot settle — exact font size or weight, stroke width or alignment, container padding, or two nearly identical colours.

Make the ask small, specific, and addressed to whoever can actually produce it:

> 剩下这几处分歧都落在「截图看不出来的量」上（精确字号、描边宽度与对齐、内边距、相近色差），再改下去只能靠猜。
> 能否请设计同学把这一屏导出一份**高保真静态 HTML demo**（单文件、能直接打开即可）？我会用与量线上**完全相同**的方式去量它 —— `getBoundingClientRect()` / `getComputedStyle()` —— 基线就钉死了，后面每一处偏差都能双向归因。

Two things to say when you ask, because they are what make the request easy to say yes to: **the designer owns the export** (it is one export, not a rebuild), and **what it buys** is an HTML-vs-HTML diff, where both sides are code and "the design tool drew it that way" stops being an available excuse.

### The Figma route (tier 3, never solicited)

A token used previously on this machine is recoverable from the local audit log — try that, silently, and only when someone has actually handed you a Figma link. **Never send a user — especially someone outside the design org — into Figma's token settings.** If there is no token and no hi-fi HTML either, keep working from the screenshot tier.

When a Figma link *is* in play, the shape of the work:

1. Resolve the file key and node id from the Figma URL: `/design/<FILE_KEY>/<name>?node-id=<A-B>` → node id `A:B`.
2. Fetch the node subtree. Prefer the node-scoped endpoint over the whole file — whole-file dumps for a large design system will blow up the context window.
3. Build a flat inventory of everything that carries geometry or typography: frames, text nodes, ellipses/rects that represent avatars, badges and dots.
4. Record, per node: bounding box, font size / weight / line height, fill and stroke colors with opacity, stroke weight **and stroke align**, corner radius, padding, item spacing.
5. Sort text nodes by font size to recover the type scale. Sort small ellipses to recover avatar / badge / dot sizes.

Steps 1–4 apply to a Figma link only. **Tiers 1 and 2 skip all of them** — a hi-fi HTML baseline gives equal fidelity with one fewer moving part, while a screenshot baseline skips them at a real loss of precision. Say which you used and what it cost you, rather than quietly filling the gap.

Two geometry facts that repeatedly cause wrong conclusions — check both before drawing any alignment inference:

- **Figma strokes are centered or inside by default; HTML borders are outside.** A stroke-aligned-inside border reproduced as a CSS `border` changes the element's box. Reproduce it with `box-shadow: inset`.
- **A container's padding is not the same as a child's margin.** When the implementation indents a text column with `margin-left` and the design indents it with container padding, the two are visually equivalent but code-different. The fix recipe must match the implementation's actual mechanism.

## Phase 2 — Establish the implementation baseline

Read `references/implementation-extraction.md` for the recipes, including the rpx conversion table and how to read CSS out of a bundled JS chunk.

Three implementation shapes, three strategies:

- **Live URL.** Fetch the entry document, resolve the asset manifest to real chunk filenames, download the chunk, and extract the embedded stylesheet. Bundlers inline CSS into JS string literals; the CSS survives intact. Convert framework-relative units (uni-app `rpx`, `vw`, `rem`) to px before comparing.
- **Source repo.** Read the style layer directly — SFC `<style>` blocks, CSS modules, token files. Prefer this path when it exists; it gives selector names for the fix recipes.
- **Screenshot only.** Fall back to proportional measurement and label everything `估算`.

Then measure the rendered result in a real browser at the target viewport. `getBoundingClientRect()` for geometry, `getComputedStyle()` for font size / weight / color / box-shadow / border. Screenshot only to confirm the DOM reading is plausible, never as the source of a number.

Also enumerate the static assets the component references (status icons, avatar badges, dot images) and **check each one resolves**. A 404 asset is a finding, and a silently-empty icon is a finding that a screenshot will hide.

## Phase 3 — Diff, root-cause, attribute

Read `references/diff-and-attribution.md` for the ownership model, the severity ladder, and the "safest-least-effort" decision procedure.

Produce, in this order:

1. **Precision table** — one row per measurable item: `item | design | implementation | verdict`. Only three verdicts: `一致`, `偏差`, `不可比`. Every `偏差` row needs a number, not "looks bigger".
2. **Root cause per deviation** — cite the exact selector and the exact conflicting declaration. "The bubble is misaligned" is not a finding. "`<bubble container>` has no left indent while the name row has `margin-left:24rpx`, so the bubble's left edge lands on the avatar's right edge — a 12px gap" is a finding.
3. **Classification** — layout-level vs token-level vs copy-level. This drives sequencing: token and copy fixes ship together as a low-risk batch; layout-level fixes get their own verification.
4. **Ownership** — tag each row. Default to `前端` for anything achievable in the style layer. Tag `后端可选` when a field would make the frontend simpler but is not required. Tag `后端` only when the data genuinely does not exist client-side.
5. **Convergence plan** — group the rows into layers (tokens → structure → copy), so the fix can be rolled out in reviewable batches rather than one large change.

A rule that has paid off: **when two sources of the same value disagree, say which one wins and why.** If the design uses one green for a status dot and a different green for the status label, the proposal should pick one token and state that the duplication is the actual defect.

## Phase 4 — Build the offline deliverable

Read `references/document-anatomy.md` for the section list, the component CSS conventions (avatar + badge geometry, hollow-ring dot, rail and connector line, annotation badges, before/after columns), and the measurement-proven alignment equations.

Non-negotiables for the deliverable:

- **One file, fully self-contained.** No external CSS, no external JS, no fonts or icons fetched over the network, no login. It must open from `file://` on an air-gapped machine.
- **Conclusion first.** The reader gets the verdict and the three highest-value fixes in the first screen.
- **Two columns, numbered, paired by number not by row.** Left is the current implementation, right is the proposal. Annotation badges are red on the left and green on the right. Because the two columns have different heights, a given finding drifts vertically between them — state that the reader must pair by number.
- **Findings table carries an ownership column.** Frontend/backend tags inline, not in a separate section.
- **Verification results are printed in the document**, with real measured numbers, so a reviewer can re-run the same check.

Build the two columns with the bundled script rather than by hand:

```
node scripts/build-side-by-side.cjs --src <document.html> --outdir <dir> \
  --before-selector ".ba-col.before" --after-selector ".ba-col.after"
```

It emits two self-contained files (styles inlined, assets inlined) sized for the Feishu HTML block limit. Verify each with `scripts/verify-render.cjs` before publishing.

## Phase 5 — Publish to Feishu/Lark

Read `references/feishu-publishing.md` for the full CLI sequence, the `html5-block` constraints, and the XML dialect.

Summary of the flow:

1. Confirm the connector is authenticated and that the account holds document-create permission.
2. Create the drafting workspace with a presentation decision that declares the HTML blocks.
3. Write the document as XML. Use `html5-block` for the rendered before/after previews and fenced code blocks for anything a reader should copy — token tables, normalizer functions, call sites.
4. Parse-check the XML before creating the document. A parse error at create time is more expensive to unwind.
5. Create the document, then confirm from the creation response that the expected number of HTML blocks landed and that there were no warnings.
6. Report the document URL.

Constraints that bite:

- One HTML block holds one **complete standalone document**, not a fragment. Budget well under the size ceiling; split into more blocks rather than trimming fidelity.
- Do not put the entire deliverable into a single HTML block. Extract the two comparison columns; keep prose as native document blocks so it stays searchable and editable.
- Code blocks in a published doc are for things people copy. Do not paste the whole style layer.

## Phase 6 — Verify, clean, hand off

1. Run `scripts/verify-render.cjs` over the deliverable and the extracted previews. Required: horizontal overflow `0`, elements outside the viewport `0`, console errors `0`, failed requests `0`.
2. Re-read the key computed styles from the DOM and confirm they match the numbers written in the proposal. A document that states 14px while the DOM says 13.5px is a defect.
3. If the document was edited by script, check tag balance — a bulk replacement across a large HTML document is the most likely place to break nesting.
4. Delete every temporary artifact. Use explicit per-file deletion, not a wildcard sweep, and do not touch the project's own memory directories.
5. Tell the user: the document link, what changed, what is still open, and which single dependency could block implementation.

## Resource and staffing worksheet

Every proposal ends with a worksheet derived from the findings, never from a template. Columns:

| Column | Content |
|---|---|
| 交付物 | The concrete artifact (code change, token, copy edit, data field) |
| 归属 | 前端 / 后端 / 设计 / 数据 |
| 依赖 | What must exist first; name the upstream owner |
| 影响面 | Only the surfaces actually touched; call out any adjacent surface explicitly |
| 风险 | What could regress, and the one check that would catch it |
| 灰度 | Whether it can ship behind a flag, or is all-or-nothing |

If a finding has no affected surface beyond one component, say so — "影响面：仅移动端审批记录卡" is a useful sentence.

## Keeping this skill and its examples clean

This skill is public, and its examples are lifted from real engagements. Anything added here — an example prompt, a case study, a screenshot caption, a default value — must survive being read by a stranger. Sweep for identifiers and replace them; never paraphrase into something still traceable.

| Sweep for | Replace with |
|---|---|
| Company / brand / product / internal system names | a neutral domain noun (`审批记录卡`, `<组件名>`) |
| Internal hostnames, portal paths, build path prefixes | `<域名>`, `<页面路径>` |
| Figma file keys and node ids | `<FILE_KEY>`, `<A-B>` |
| Real route, chunk and asset filenames | `<module>-<component>`, `<asset-prefix>_state_<n>.png` |
| Real CSS selectors from the audited codebase | `<bubble container>` or a generic class name |
| Personal names, employee ids, avatars, org names | `<姓名>`, `<工号>` |
| Tokens, cloud-doc links, repo links, tenant subdomains | delete — a live secret or a live link is never "example-ized" |
| Absolute geometry from one client's page (page-space `x`/`y`, wrapper widths) | relative offsets (`X − 15`) or `<xxx>px` |

Colour palettes are **not** identifiers: a generic blue/green/orange/grey token set names nobody, and the template needs concrete defaults to be usable. Filenames, selectors, hosts and keys are identifiers.

Re-run the sweep after any edit that lifts material out of a real project — that is the only moment identifiers enter.

## Bundled resources

| Path | Load it when |
|---|---|
| `references/design-source-extraction.md` | Phase 1 — reading a screenshot (default), hi-fi HTML (escalation), a Figma link (only if a token already exists), or a written spec |
| `references/implementation-extraction.md` | Phase 2 — reading a live bundle, repo, or built output |
| `references/diff-and-attribution.md` | Phase 3 — ownership, severity, safest-least-effort |
| `references/document-anatomy.md` | Phase 4 — section list and component CSS conventions |
| `references/feishu-publishing.md` | Phase 5 — publishing to a Feishu/Lark cloud doc |
| `references/verification.md` | Phase 6 — DOM measurement and regression checks |
| `references/pitfalls.md` | Any time a tool behaves oddly; read before improvising |
| `scripts/figma-node-dump.cjs` | Flatten a Figma node subtree into a geometry/typography report |
| `scripts/extract-inline-css.cjs` | Pull CSS out of a live bundle or a local build directory |
| `scripts/build-side-by-side.cjs` | Emit the two self-contained comparison previews |
| `scripts/verify-render.cjs` | Measure a rendered page and assert styles landed |
| `assets/document-template.html` | Skeleton for the offline deliverable |

## Failure modes to avoid

- Producing a beautiful document built on eyeballed numbers. It will be rejected on the first review.
- Treating the shipped implementation as the baseline. It is the thing being audited.
- Listing deviations without root causes, leaving the engineer to re-derive them.
- Omitting the ownership column, which turns a proposal into a discussion.
- Introducing a new token for every problem, which multiplies the review surface instead of shrinking it.
- Using screenshots in the comparison panels, which makes the document undiffable and the annotations unverifiable.
- Leaving the working scripts in the user's project directory.
- Asking for a Figma token, or demanding a hi-fi HTML prototype on the first pass. The default baseline is a screenshot; escalate only when the trigger fires.
