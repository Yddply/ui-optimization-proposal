# Phase 4 — The Offline Deliverable

One file. Opens from `file://` on a machine with no network, no login, and no build step.

## 1. Section order

The order is not decorative. It is the order a reviewer needs the information, and it should survive the reader stopping at any point.

| # | Section | Purpose | Must contain |
|---|---|---|---|
| 1 | 结论先行 | The verdict and the three highest-value fixes, above the fold | A one-paragraph verdict, a short list, and a count ("9 处偏差，其中 4 处为像素级") |
| 2 | 范围与基准 | What is being compared against what | File key + node id + frame name; the implementation URL/path; the viewport used |
| 3 | 决定性技术约束 | The constraints that shape the fix | Unit conversion rule, token file location, framework conventions, forbidden surfaces |
| 4 | 线上现状 | The current state, described neutrally | Grouped defect categories, with counts |
| 5 | 改前 / 改后 并排对照 | The centrepiece | Two live HTML columns, numbered annotations |
| 6 | 精确规格表 | Item-by-item measurement | The precision table from Phase 3 |
| 7 | 取色与语义规则 | The rules that outlive this change | Any color/semantics mapping the fix establishes |
| 8 | 逐处对照表 | The actionable list | 编号 / 位置 / 改前 / 改后 / 改法 / 归属 |
| 9 | 收敛方案 | How the fixes are batched | Layer grouping and rollout order |
| 10 | 分工与资源清单 | Who does what | The worksheet from SKILL.md |
| 11 | 灰度与回滚 | How it ships safely | Flag or no flag; what to watch |
| 12 | 验收清单 | How completion is judged | Machine-checkable assertions |
| 13 | 待确认 | What is unresolved | Each item with the specific question to ask |
| 14 | 附录 | Reference material | Token tables, code, measurement scripts |

Sections 1, 5, 8, and 13 are mandatory. The rest can merge when the change is small, but never drop 13 — an empty-looking section headed "待确认" is impossible; there is always at least one assumption.

## 2. Self-containment rules

- All CSS in a `<style>` block. No `<link>`.
- All scripts, if any, inline. Prefer none — the document should be static.
- Icons inline as SVG, not as `<img>` with a remote URL and not as a data URI built from a font.
- No web fonts. Use a system font stack so it renders identically offline.
- No analytics, no external requests at all. Verify with the network-failure counter in Phase 6 — the required result is `0` failed requests, which is also a self-containment test.
- Set an explicit color scheme rather than inheriting `prefers-color-scheme`. The document must look the same on every machine it is reviewed on.

## 3. Component conventions

Use a namespaced prefix for the comparison panel so its styles never collide with the document chrome. Below, `ba-` (before/after) is the convention used by the bundled scripts.

### Avatar

```css
.ba-av2{
  width:32px;height:32px;border-radius:50%;
  display:flex;align-items:center;justify-content:center;
  color:#fff;font-size:13px;
  box-shadow:inset 0 0 0 1px #fff;   /* the 1px inside ring — NOT a border */
  background:linear-gradient(135deg,#1678FF,#4B9BFF);
}
```

The ring is `box-shadow: inset`, not `border`. A border would make the avatar 34px and break every downstream alignment equation. This is the single most common reproduction error.

### Status badge on the avatar

Positioned absolutely at the avatar's lower-right, sized 12×12, with a 1px white ring so it separates from the avatar edge it overlaps.

**The alignment equation:**

```
badge centre  = avatar top + 32 − 6  =  avatar top + 26
status row centre = status top + row height / 2
```

For a 32px avatar with a 12px badge at `right:0; bottom:0`, the badge centre sits 26px below the avatar's top. The status text row must be positioned so that its vertical centre lands on the same line. State this equation in the document — it is what turns "looks aligned" into "is aligned to within 0.5px", and it is what a reviewer can re-check.

### Timeline dot — hollow ring

```css
.ba-rail .dt{
  width:9px;height:9px;border-radius:50%;
  background:#fff;flex:none;
  box-shadow:inset 0 0 0 1.5px var(--dc, #1678FF);
}
```

Driven by a per-instance custom property: `style="--dc:#34C724"`. This is what makes "the dot takes its color from the state" expressible without inventing a class per state.

A hollow ring and a filled disc are semantically different and must not be substituted for each other. A hollow ring reads as "a state on a path"; a filled disc reads as "a marker". If the design uses rings, reproduce rings.

### Rail and connector line

The vertical line is a child of each row rather than one tall element, so that rows can size independently. The last row uses a variant that omits the line (`no-line`), and a deliberate visual break uses a different variant rather than a color change — a gap should read as an absence of line, not as a differently colored line.

When a terminal node is appended, the previous row must switch from "last" to "continues" so the line actually reaches the new node. Forgetting this leaves the line stopping one row short, which is immediately visible and usually ships unnoticed.

### Annotation badges

Circled numbers overlaid on the panels, red on the before column, green on the after column. Implemented as an inline `<span>` in the block, not as an absolutely positioned overlay — an overlay breaks the moment the text reflows.

Pair by number, never by row: the two columns have different heights because the proposal removes a wrapped line or adds a node, so a given finding drifts vertically. Say this in the document, next to the numbering legend.

### Ownership tags

```css
.tag{display:inline-block;padding:1px 6px;border-radius:4px;font-size:11px}
.tag.fe{background:#E8F3FF;color:#1678FF}     /* 前端 */
.tag.be{background:#FFF1E8;color:#FA8500}     /* 后端 */
.tag.both{background:#F2F3F5;color:#8F959E}   /* 后端可选 */
```

Use a `<br>` between the tag and its qualifier when a row needs both, so the cell stays narrow.

### Before/after text inside a table cell

```css
.x{color:#F54A45}   /* 改前 */
.y{color:#1ECE88}   /* 改后 */
```

Colors here follow the "problem / resolved" convention, not the market convention. State the convention in the legend so a reader who expects red=up does not misread it.

## 4. Prose conventions

- **Neutral tone.** Describe the current state as data, not as a failure. "线上状态词为 28rpx（14px）" rather than "错误地把字号设成了 14px".
- **Numbers with units and provenance.** `12px（设计稿）` vs `24rpx = 12px（线上）`.
- **Every rule that outlives the change gets a highlighted note.** Rules like "action semantics go in text, state semantics go in the dot" will be re-derived wrongly next quarter if they live only in a table cell.
- **Say when something is out of scope.** "本次不改动 PC 门户，改动已按此约束收敛" prevents the reviewer from having to ask.
- **Rewrite loaded wording.** Replace surveillance-flavored phrasing with neutral operational wording when the surrounding copy uses it; a proposal that reads as monitoring will meet resistance unrelated to the change.

## 5. Size discipline

The document should stay openable. Under 300 KB is comfortable. Past that, check whether a stylesheet has been duplicated or a base64 asset embedded that should have been inline SVG.

If the document is destined for a Feishu HTML block, remember the block limit applies to the **extracted preview**, not to the whole document — the two comparison columns get extracted into their own small files. Do not compress the deliverable to fit a limit that does not apply to it.

## 6. Height difference is a result, not a defect

The two panels will not be the same height. That difference is usually the point — the proposal removes a wrapped line, tightens a row, or drops a redundant node. Annotate it: "两栏高度不同（改前 [xxx]px / 改后 [xxx]px），这个高度差本身就是优化收益". An unexplained mismatch reads as an error.
