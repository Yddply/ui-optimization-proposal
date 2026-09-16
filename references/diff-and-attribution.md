# Phase 3 — Diff, Root-Cause, Attribute

This phase converts two datasets into something a team can act on. It is where most of the value is created and where most reports quietly fail.

## 1. The precision table

One row per measurable item. Three columns plus a verdict, and a fourth column reserved for the owner (filled in step 4).

| 项目 | 设计稿实测 | 线上实测 | 判定 |
|---|---|---|---|
| 头像尺寸 | 32×32 | 32×32 | 一致 |
| 头像白环 | 有，1px inside | 无 | **偏差** |
| 状态词字号 | 12px | 28rpx = 14px | **偏差** |
| 头像上边距 | 3px | 4rpx = 2px | **偏差** |
| 姓名行高 | 20px | 36rpx = 18px | 偏差 |

Rules:

- **Exactly three verdicts.** `一致`, `偏差`, `不可比`. `不可比` is for rows where the two sides genuinely cannot be compared (different unit systems with an unverified conversion, or a value only one side publishes). It is not an escape hatch for "I did not check".
- **Every `偏差` carries a number and a direction.** "Too small by 2px", not "smaller than it should be".
- **Show the raw stored value alongside the converted one when a conversion happened.** `28rpx = 14px` lets a reviewer audit the arithmetic; `14px` alone does not.
- **Include rows that match.** A table of only failures reads as an attack and gives no sense of how much is right. Rows of agreement establish that the measurement method is sound.

## 2. Root cause, not symptom

Every deviation gets a code-level cause. The cause names a selector and the declaration responsible.

| Weak | Strong |
|---|---|
| 气泡没对齐 | `<comment-bubble container>` 无左缩进（0），而姓名行 `margin-left:24rpx`、状态行两条各 `12rpx`（合计 12px），气泡左缘落在头像右缘而非文字列，差 **12px** |
| 字号偏大 | 线上状态词 `28rpx`（=14px），设计稿 `12px`，**大 2px**；这是全表唯一"字号本身"不符项 |
| 圆点颜色不对 | 线上圆点是 24×24 位图，环色绿 `#1ECE88`，而状态文字绿是 `#34C724` —— 同一语义两套绿 |

The test of a good root cause: an engineer can make the change without re-deriving anything, and can tell when it is done.

## 3. Classification drives sequencing

Sort every deviation into one of three layers:

| Layer | Nature | Risk | Batching |
|---|---|---|---|
| **令牌层** | Color, font size, radius, weight — a value swapped for another value | Low | Ship the whole batch together |
| **结构层** | Geometry, nesting, alignment, missing elements, container mechanism | Medium | Ship separately, verify with measurement |
| **文案层** | Labels, wording, order of words | Low | Bundle with tokens, but keep it reviewable by the writer |

This ordering is also the rollout order. Token-layer fixes cannot shift layout, so they can go out without re-verifying geometry. Structure-layer fixes change positions and must be re-measured against the alignment equations after the change.

## 4. Ownership — every row gets one

| Tag | Meaning | Typical cases |
|---|---|---|
| **前端** | Achievable entirely in the presentation layer with data already available | Color, size, spacing, ordering, conditional rendering, alignment |
| **后端可选** | Data exists but not in the convenient shape; a field would simplify the frontend but is not required | Status enum vs boolean; a pre-joined list |
| **后端** | The data does not exist client-side and cannot be derived | A state that only the workflow engine knows |
| **设计** | The source itself is ambiguous or self-inconsistent | Two greens for one semantic; a state with no defined color |
| **数据** | Content or configuration, not code | A missing asset file, a copy string |

Two heuristics that keep the split honest:

**Default to 前端.** Most visual findings are presentation-layer. Tagging something 后端 because the frontend "would need to branch" is almost always wrong — branching on existing data is a frontend concern.

**One dependency, named precisely.** If a finding genuinely needs backend work, the proposal should name the exact thing needed and its fallback. Example: "the flow node must expose the transferred-to person and that person's current status; when absent, degrade to a neutral grey (meaning 'result unknown') and never fall back to a single uniform color for the whole block." A single, precisely scoped backend ask is easy to approve. A vague one invites a redesign of the whole thing.

## 5. The safest-least-effort procedure

Run this against every proposed fix before it enters the document. Any fix that fails a step is either reworked or explicitly excluded with a reason.

```
1. Can it be done with an existing token?
   yes → use it, do not introduce a new one
   no  → step 2

2. Is a new token genuinely unavoidable?
   no  → find the nearest existing token and state the substitution
   yes → step 3

3. Does the new token leak outside this component?
   yes → reject, or scope it to the component rather than the global theme
   no  → step 4

4. Does the change alter geometry?
   yes → re-measure after, and check every alignment equation that touches it
   no  → step 5

5. Can it ship behind the existing release process without coordination?
   no  → list the coordination required
   yes → it belongs in the first batch
```

A worked rejection: an early proposal added a dedicated accent color for transfer actions (`TONE.MOVE`). It failed step 3 — a global token spreads to the desktop portal, the print/PDF template, and message cards, none of which were in scope. It was excluded, and the semantic was moved into text color instead (muted verb + accent noun), which needs no new token. The rule that came out of it: **express action semantics through text, express state semantics through the state dot** — one channel each, no new colors.

## 6. When two sources of truth conflict

The design occasionally contradicts itself. When it does, the proposal must say which value wins and declare the duplication itself a defect.

Worked example: a design used one green for a status dot (`#1ECE88`) and a different green for the status label (`#34C724`) for the same state. Averaging them is wrong, and silently keeping both keeps the defect alive. The correct output is: pick the label's color (it is the semantically named one and appears more often), collapse both to it, and record the original inconsistency under 设计 as a finding.

## 7. What the findings table looks like in the deliverable

Columns, in this order:

| Column | Content |
|---|---|
| 编号 | Sequential, matching the annotation badges in the before/after panels |
| 位置 | Selector, token key, or node name — specific enough to locate |
| 改前 | What ships today, described concretely including the mechanism |
| 改后 | The target state, plus the numbers |
| 改法 | The declarations or the data requirement; must be copy-pasteable where possible |
| 归属 | One of the five tags |

Two conventions that keep the table usable:

- **The numbers in the panel annotations and the numbers in the table are the same numbers.** A reader must be able to pair a red circle with a row by number alone.
- **`改法` explains the trap, not just the value.** "Use `padding-left:24rpx` and not `margin-left`, because the inner bubble is `width:100%`" is worth three lines; the value alone is worth one and will be implemented wrong.

## 8. Presenting a contradiction honestly

If the implementation and the design disagree for a legitimate reason — a platform constraint, an accessibility requirement, a loading state the design never drew — say so and keep the row. Suppressing it produces a proposal that looks tidy and gets rejected during review when someone else finds it. Keep the row, mark the deviation, and record the reason in the notes.
