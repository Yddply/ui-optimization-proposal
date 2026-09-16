# Pitfalls

Accumulated the hard way. Read this before improvising when a tool misbehaves, and before drawing a geometric conclusion.

## A. Shell and environment (Windows)

### The bash shim may be partially broken

Symptom: `dirname: command not found`, `sed: command not found`, exit code 127, or a path resolved to something like `d:\c\Users\...` that does not exist.

Cause: the Git Bash shim may be missing core utilities, and Node's `fs` resolves POSIX-style paths (`/c/Users/...`) as if the first segment were a drive.

Workaround: **use PowerShell with absolute Windows-style paths** and call Node directly:

```powershell
& "C:\Users\<user>\.workbuddy\binaries\node\versions\<ver>\node.exe" "D:\path\script.cjs"
```

Never rely on `#!/usr/bin/env bash` wrapper scripts (`npm`, `pnpm`, `lark-cli` shims). They derive their own location from `$0`, which is wrong under this shell. Call the underlying JS entry point or native executable directly.

### PowerShell command output is unreliable

| Symptom | Fix |
|---|---|
| Native command output arrives empty | Redirect with `*>`, never pipe with `|` |
| Multi-line PowerShell script exits 1 wholesale | Write it on **one line** |
| Chinese text is mojibake | `[Console]::OutputEncoding=[System.Text.Encoding]::UTF8` first |
| `Remove-Item` with several paths fails silently | Use `[System.IO.File]::Delete($path)` per file |
| `echo`-style output not visible | Write to a file with `Out-File -Encoding utf8`, then read the file |

The pattern that works reliably:

```powershell
[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; <command> *> 'D:\path\_out.txt'; "exit=$LASTEXITCODE" | Out-File -Append -Encoding utf8 'D:\path\_out.txt'
```

Then read `_out.txt`. Whether a "real" tool exists for the job is beside the point — this is about getting a reliable byte stream, so redirect to a file and read the file.

### Long-running scripts

Write a `.cjs` file and run it with an absolute Node path. Do not attempt to inline a multi-statement script in a shell one-liner; the quoting alone will consume more time than writing the file.

### Browser automation

Use `playwright-core` with an existing Chrome installation rather than downloading a bundled Chromium:

```js
const { chromium } = require('playwright-core');
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
});
```

Name the file `.cjs` so `require` works regardless of the project's `"type"` field.

## B. Reading the design source

| Trap | Consequence | Correct approach |
|---|---|---|
| Figma `strokes` with `strokeAlign: INSIDE` reproduced as a CSS `border` | Element grows by 2× the stroke width; every relative measurement shifts | Use `box-shadow: inset 0 0 0 <w>px <c>` |
| Whole-file Figma fetch | Multi-megabyte payload, wasted context | Fetch `?depth=2` for the outline, then the node-scoped endpoint |
| Node id copied with a hyphen | API returns nothing | Convert `123-456` → `123:456` |
| Fill `opacity` ignored | A 6% overlay renders as a solid block | Compose alpha separately from the 0–1 color channels |
| Exporting a single `VECTOR` node as SVG | Returns `null`, repeatedly | Export the parent `FRAME` and crop, or export the containing `INSTANCE` |
| Font weight taken from the design's layer name | `Medium` is not a weight | Read `style.fontWeight` (numeric) |
| Allowing a stroke to be "close enough" | Client-visible difference | Stroke color and weight are exact values, not approximations |

## C. Reading the implementation

| Trap | Consequence | Correct approach |
|---|---|---|
| Framework units compared as px | Every number wrong by the base ratio | Convert first; confirm the ratio against one rendered value before trusting the table |
| Only the emitted `.css` read | Misses styles inlined into the JS chunk | Check both; bundlers frequently inline |
| Assets assumed present | A 404 renders as a silent blank | Request each asset and record the status code |
| The shipped page treated as the baseline | The audit becomes circular | The design is the baseline, always |
| Values read off a screenshot by eye | Off by 1–2px and by a shade or two of color | Machine-read geometry; use a screenshot only to sanity-check |
| Two sources of one value both kept | The defect survives the fix | Pick the semantically named one, collapse the other, log the duplication as a finding |

## D. Geometry reasoning

- **`margin` versus `padding` on a container whose child is `width:100%`.** Adding a margin to the container pushes the child's right edge past the container. If the goal is to indent the child's left edge, use `padding` with `box-sizing:border-box`.
- **A `border` changes the box; an inset `box-shadow` does not.** Stated twice because it is missed twice.
- **A hollow ring and a filled disc at the same diameter are not interchangeable.** Read the center pixel (or the `boxShadow`) to tell them apart; do not infer from a rendered thumbnail.
- **Alignment findings are `x`-value comparisons.** Measure the left edge of every element in the row and diff them pairwise. A "looks off" report becomes a number only after both edges are measured.
- **A centre alignment between two different-height elements requires an equation, not an eyeball.** Write it down in the document so a reviewer can re-check it.
- **The last row of a timeline.** Appending a node requires flipping the previous row from "last" (line suppressed) to "continues" (line drawn), or the connector stops one row short.

## E. Editing a large HTML document

- **Bulk scripted edits are the top source of broken nesting.** Run a tag-balance pass after every batch. The nuance is entirely in the skip list: skip `script`/`style`/`pre` contents and treat void plus self-closing SVG tags as void. A naive regex produces false positives that mask the real break.
- **Inserting a numbered row can collide with existing numbers.** After inserting, re-derive the whole sequence and check for duplicates and gaps. Re-check the legend text too.
- **Replacing a large block wholesale is riskier than several small edits**, but it is sometimes the only way to reorder. When you do it, verify structure immediately rather than at the end.
- **Delete temporary files explicitly, one path at a time.** A wildcard sweep either fails silently or removes something you meant to keep.

## F. Judgement

- **Do not add a token to avoid a conversation.** A new global token spreads to every surface; the cost is usually larger than the visual gain. Look for an existing token, or move the meaning into a channel that needs no colour.
- **Do not suppress a contradiction to make the document tidy.** Record it with a reason; someone else will find it during review.
- **Do not present an estimate as a measurement.** Mark it, or leave the cell for the user to fill.
- **Do not report a check that did not run.** If an environment blocked it, name the substitute evidence.
