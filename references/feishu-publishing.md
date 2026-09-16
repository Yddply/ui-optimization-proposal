# Phase 5 — Publishing to a Feishu / Lark Cloud Doc

Publish **after** the offline deliverable has passed verification. The cloud doc is the distribution channel, not the drafting surface.

## 0. Prerequisites

Load the Feishu document connector skill first (`lark-doc`). It owns the CLI contract; the notes below are the parts that matter for this workflow.

Confirm the CLI is authenticated and the account can create documents:

```bash
lark-cli auth status
```

The identity must hold `docx:document:create`. If it does not, stop and tell the user which permission is missing rather than attempting a workaround.

## 1. Create the drafting workspace

```bash
lark-cli docs +script --command init-draft --presentation-decision '<JSON>' --format json
```

The presentation decision declares the block types the document will use, so that the pipeline knows to expect the HTML blocks. Include one entry per HTML block and state its purpose:

```json
{
  "audience": "前端工程师、审批产品与后端接口负责人",
  "reader_task": "逐项确认样式改动的改法、归属前端还是后端，并据此排期实施与灰度发布",
  "genre_contract": null,
  "adapter": null,
  "presentation_mode": "rich",
  "visual_plan": {
    "reason": "需要并排呈现优化前后的实际渲染，并提供可直接复制的令牌表与函数代码块",
    "blocks": [
      { "type": "html5-block", "min_count": 2, "purpose": "分别呈现优化前 / 优化后的真实渲染" }
    ]
  }
}
```

This creates a workspace directory named `draft_<hash>_folder/` in the working directory. All resources referenced by the XML live relative to it.

## 2. Prepare the HTML blocks

The HTML block holds **one complete standalone HTML document**, not a fragment. Extract the two comparison columns from the offline deliverable into their own self-contained files:

```bash
node scripts/build-side-by-side.cjs --src <deliverable.html> --outdir <workspace>
```

Each output file must carry this head:

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="use-iframe" content="true">
  <meta name="html-box-height-mode" content="auto">
  <meta name="description" content="内容摘要，会导出为 html5-block 的 alt 属性">
  <title></title>
</head>
<body>
  ...
</body>
</html>
```

Constraints that apply to every HTML block:

| Constraint | Value |
|---|---|
| Total HTML length | **≤ 500KB** — do not inline large images, base64, fonts, or long JSON/CSV/mock data |
| Height mode | `<meta name="html-box-height-mode" content="auto">` for full expansion in the document flow; `viewport` only for content that scrolls or fits one screen |
| Root container | `width:100%; max-width:100%; box-sizing:border-box` |
| Usable width | ~820px in a normal document, ~1020px in wide mode |
| Under `auto` | Do not set a fixed height or `overflow:hidden` on the root. If a region needs a fixed height, set it on an inner container, never in the meta |
| Dynamic height | Content appended after load does **not** refresh the block height. Do not look for a CLI flag that does this |

## 3. Write the document XML

Reference an HTML block from the XML by path, relative to the workspace:

```xml
<html5-block path="@./preview-before.html"/>
```

### Structural rules

- The document opens with exactly one `<title>`, then body headings use `<h1>`–`<h9>`.
- **Heading levels must be continuous — never skip.** After an `<h1>` the next level down is `<h2>`, not `<h3>`. Skipping is the most common parse failure.
- Add `seq="auto"` to a heading to get automatic numbering (`1`, `1.1`, …).
- Code goes inside `<code>`, never directly under `<pre>`:
  ```xml
  <pre lang="js" caption="令牌表"><code>export const TONE = { ... }</code></pre>
  ```
- Tables use `<thead>`/`<tbody>`; cells contain block content, so wrap text in `<p>`:
  ```xml
  <table>
    <thead><tr><th><p>编号</p></th><th><p>归属</p></th></tr></thead>
    <tbody><tr><td><p>1</p></td><td><p>前端</p></td></tr></tbody>
  </table>
  ```
- Two-column layouts use `<grid><column width-ratio="0.5">…</column><column width-ratio="0.5">…</column></grid>`; the ratios must sum to 1.
- Callouts: `<callout emoji="💡" background-color="light-blue"><p>…</p></callout>`. **Callouts accept only `p`, `ol`, `ul`, `checkbox` and inline tags.** No tables, images, `<pre>`, `<hr>`, `<grid>`, or `<whiteboard>` inside.

### Escaping

Escape text content only, never the tags themselves. `<` becomes `&lt;`, `>` becomes `&gt;`, `&` becomes `&amp;`, and a literal newline in text becomes `<br/>`.

```xml
<!-- wrong -->
&lt;p&gt;内容&lt;/p&gt;
<!-- right -->
<p>A &amp; B 的对比：1 &lt; 2</p>
```

### Colour semantics

Colours carry meaning and must stay consistent. Available hues: `red, orange, yellow, green, blue, purple, gray`. Table headers use `light-gray` or `medium-gray`; a coloured cell is reserved for expressing a state or a category, never for decoration. Callouts default to `light-*`; `medium-*` is for strong alerts only.

A useful mapping for this skill's content:

| Content | Treatment |
|---|---|
| 结论 / 判定 | `callout` with `light-blue` |
| 待确认 / 风险 | `callout` with `light-orange` |
| 归属标签 | Table cell text, not a coloured cell |
| 改前 / 改后 preview | `html5-block`, not a table |
| 令牌表、函数 | `<pre lang="js">` |
| 逐项对照 | `<table>` with a 归属 column |

## 4. Parse-check before creating

```bash
lark-cli docs +script --command parse --content "@./draft_<hash>_folder/draft.xml" --format json
```

Read the result and confirm the block inventory matches intent — the expected number of headings, tables, code blocks and HTML blocks. **A parse error found here costs one edit; the same error at create time costs a cleanup.**

## 5. Create the document

```bash
lark-cli docs +create --doc-format xml --content "@./draft_<hash>_folder/draft.xml"
```

The response carries the document URL and a `new_blocks` breakdown. Confirm:

- `ok` is true,
- the HTML block count matches what was declared,
- `warnings` is empty.

Report the URL to the user.

## 6. Verifying after creation — and what to do when you cannot

A read-back (`docs +fetch`) is the ideal confirmation. If the sandbox blocks it (it may ask for permission to read an unrelated credential path), **do not retry** — accept the block, and fall back to the creation response as the evidence of record. Then say so plainly in the hand-off: state that the HTML block count and the absence of warnings come from the creation response, and that the reader should open the link to confirm rendering.

Do not claim a read-back verification you did not perform.

## 7. Windows / PowerShell invocation notes

The CLI is a native executable but the shell wrapper is unreliable in this environment. Every invocation needs three things:

1. Force UTF-8 output, or Chinese content arrives as mojibake:
   ```powershell
   [Console]::OutputEncoding=[System.Text.Encoding]::UTF8
   ```
2. Redirect with `*>`, not a pipe. Piping a native command's output yields zero bytes in this shell.
3. Write the command on **one line**. Multi-line PowerShell scripts fail wholesale with exit 1.

Working pattern:

```powershell
[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; lark-cli docs +create --doc-format xml --content "@./draft_<hash>_folder/draft.xml" *> 'D:\path\_out.txt'; "exit=$LASTEXITCODE" | Out-File -Append -Encoding utf8 'D:\path\_out.txt'
```

Then read the output file. Arguments containing commas must be quoted (`"--types=p2p,group"`), and a JSON argument should be assigned to a variable first rather than inlined.

## 8. What to keep in the workspace

The drafting workspace (`draft_<hash>_folder/`) holds the XML and the HTML blocks. Leave it in place — the pipeline expects it and it is the editable source for the next revision. Delete only your own scratch files.
