# Phase 2 — Establishing the Implementation Baseline

The implementation is the thing under test. Read its styles from source when source exists, from the bundle when only the bundle exists, and from the browser in both cases to confirm what actually renders.

## 1. Prefer the source repo when it exists

Source gives selector names and the conflicting declaration, which is what the fix column needs.

- **Vue / SFC** — read `<style scoped>` blocks in the component files, plus any shared style file the component imports. Note whether the styles are `scoped`, and whether a deep selector (`::v-deep`, `:deep()`) is overriding the child.
- **CSS Modules / Sass / Less** — resolve the variable or mixin to its literal value before comparing. A design value of `#34C724` and a source value of `$success` may be the same color, or may not; resolve first.
- **Token files** — locate the theme or token module first. Many findings collapse into "the implementation has two greens and should keep only one", which is only visible from the token file.
- **Utility frameworks** — expand the utility classes to declarations while reading, or the diff will compare a class name against a pixel value.

Do not run a build to answer a styling question. Read the source.

## 2. Reading styles out of a live bundle

Frameworks bundle CSS into the JavaScript payload as string literals. The CSS survives intact and is readable — the work is only in getting to the right file.

**Step one — the entry document.**

```bash
curl -s "$PAGE_URL" -o entry.html
```

Look for the entry script and any stylesheet links. A Vite build typically emits `/assets/index-<hash>.js` plus `/assets/index-<hash>.css`. If a separate CSS file exists, fetch it and skip to step three — that is the fast path.

**Step two — resolve the chunk names.** The entry module contains a map from logical chunk name to hashed filename. Regex it rather than parsing it as JSON; the map is usually a fragment of a larger object literal, and a naive `JSON.parse` on a slice of it will fail.

```
/"?(pages-<module>-<component>)"?\s*:\s*"([A-Za-z0-9_-]+)"/
```

Locate the chunk that owns the component under test, download it, and grep it for the class names you already saw in the DOM. Finding the selector in the chunk confirms you have the right file.

**Step three — extract the CSS.** The payload is one long string literal with escaped quotes. Extract contiguous CSS-looking runs (`{ ... }` blocks preceded by a selector) into a readable file, or simply grep the raw chunk for the selector of interest and read the surrounding ±400 characters. For a targeted diff, the grep approach is usually enough and avoids pulling 1 MB of JavaScript into context.

**Step four — convert units.** See the next section before writing any number down.

## 3. Unit conversion — get this right or every number is wrong

Frameworks that use device-relative units store them as placeholders or as their own unit. Two shapes are common:

- **Placeholder form** — the bundled CSS contains `%?28?%`, which the runtime replaces with the computed value. The number inside is the design-unit value.
- **Literal unit** — the CSS reads `28rpx`.

Both mean the same thing. The conversion depends on the framework's configuration, so read the config rather than assuming:

| Config | Meaning | Conversion at target width |
|---|---|---|
| `rpxCalcBaseDeviceWidth: 375`, `rpxCalcIncludeWidth: 750` | 750 design units span the base device width 375 | **1 unit = 0.5 px** for any device width ≥ 375 |
| Base width and include width equal | 1 unit = 1 px at base | device-pixel-ratio dependent |

For the first configuration — by far the most common in Chinese mobile H5 builds — the rule is: **divide the stored number by 2 to get CSS px**, at any viewport of 375 or wider. Verify once empirically by comparing one value against `getComputedStyle()` in the browser before trusting the whole table.

A shortcut worth taking: if you can open the page, measure the element's rendered size and the design's value and check the ratio. One confirmed pair validates the whole conversion.

## 4. Enumerate and check every static asset

Components reference raster assets for status badges, avatar corners, and timeline dots. Enumerate the referenced names from the bundle and **request each one**:

```bash
for n in green red orange grey; do
  printf "%s " "$n"
  curl -s -o /dev/null -w "%{http_code}\n" "$ASSET_BASE/<asset-prefix>_state_${n}.png"
done
```

A 404 is a finding. It usually means the component expects a variant that was never shipped, and in the UI it renders as a blank gap that is easy to miss in a screenshot and impossible to miss in a status-code sweep. Record the 404s explicitly — "the pending-state badge has no asset and renders empty" is a concrete, fixable defect.

## 5. Read the rendered result in a real browser

Rendered values are the authority. Source and bundle explain *why*; the DOM says *what*.

```js
// playwright-core driving an already-installed browser
const { chromium } = require('playwright-core');
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
});
const page = await browser.newPage({ viewport: { width: 375, height: 900 } });
await page.goto(fileUrlOrHttpUrl);
```

Use `playwright-core` with an explicitly installed browser rather than downloading a bundled Chromium. Write the driver as a `.cjs` file so `require` works regardless of the project's module type.

Then measure:

```js
const m = await page.evaluate(() => {
  const r = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      x: +b.x.toFixed(1), y: +b.y.toFixed(1),
      w: +b.width.toFixed(1), h: +b.height.toFixed(1),
      right: +b.right.toFixed(1), bottom: +b.bottom.toFixed(1),
      fontSize: s.fontSize, fontWeight: s.fontWeight, lineHeight: s.lineHeight,
      color: s.color, background: s.backgroundColor,
      boxShadow: s.boxShadow, border: s.border, borderRadius: s.borderRadius,
      paddingLeft: s.paddingLeft, marginLeft: s.marginLeft,
    };
  };
  return { avatar: r('.avatar'), name: r('.name'), bubble: r('.bubble') };
});
```

Record `x`/`right` for every element in the same row. **Alignment findings are almost always a comparison of two `x` values**, and a "looks off by a little" report turns into "12px" the moment both are measured.

For a hollow ring versus a filled dot, `getComputedStyle` is not enough — check `boxShadow` for an `inset` entry, or read the center pixel. To judge a raster asset, draw it to a canvas and sample the middle pixel; a `rgba(255,255,255,1)` center means the bitmap is a hollow ring, not a filled disc.

## 6. Case study: how the "misaligned bubble" finding was actually located

Recorded because the shape recurs. A report said the approval comment box "looked crooked and unaligned". Measuring three elements in the same row gave:

| Element | `x` | `marginLeft` |
|---|---|---|
| Name row | `X` | `24rpx` = 12px |
| Status row | `X` | `12rpx` + `12rpx` = 12px |
| Comment bubble container | **`X − 15`** | `0` |

The bubble's left edge lands on the avatar's right edge; the text column starts 12px further right. The container had no indent at all while both text rows did. The fix is one declaration on the container — and it must be `padding-left`, not `margin-left`, because the bubble inside it is already `width:100%` and a margin would push its right edge out of the container.

Generalised: **when a block is misaligned, measure the left edge of every element in the row and diff them pairwise.** The odd one out is the finding, and its `marginLeft`/`paddingLeft` value is the root cause.

## 7. Reading CSS out of a compiled build directory

When the user hands over a `dist/` directory instead of a URL, the same logic applies with no network:

1. Find the entry HTML and follow it to the JS/CSS assets.
2. Extract CSS by regex over the JS files, or read the emitted `.css` directly.
3. Convert units using the framework config found in the project (look for `pages.json`, `vue.config.js`, `vite.config.*`, `manifest.json`).
4. Measure the rendered result by opening the entry HTML from `file://` — a static build usually renders identically from disk.
