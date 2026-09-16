# Phase 6 — Verification

Verification is not "I opened it and it looked fine". Every claim in the deliverable is checked against a machine reading before the document is handed over.

## 1. The required zero-checks

Run `scripts/verify-render.cjs` against the deliverable and against each extracted preview. These five must all be zero:

| Check | Why it matters |
|---|---|
| Horizontal overflow | `documentElement.scrollWidth > clientWidth` means the layout breaks at the target width. One stray `width` or a long unbreakable token causes it. |
| Elements outside the viewport | An element whose `right` exceeds the viewport width, or whose `left` is negative, is clipped or producing a scrollbar. |
| Console errors | Any `console.error` or uncaught exception. A standalone document should have none. |
| Page errors | Uncaught exceptions, same as above but a separate surface. |
| Failed requests | **This is also the self-containment test.** A document with no external dependencies produces zero requests, so zero failures. Any non-zero count means something is being fetched over the network. |

## 2. Re-assert the numbers written in the document

The document states values. The DOM must agree. Read both back and diff them:

```js
const checks = [
  { sel: '.ba-av2',    expect: { width: '32px', boxShadow: /inset/ } },
  { sel: '.ba-rail .dt', expect: { width: '9px', height: '9px', background: 'rgb(255, 255, 255)' } },
  { sel: '.ba-nm',     expect: { fontSize: '14px', fontWeight: '500' } },
  { sel: '.ba-st',     expect: { fontSize: '12px' } },
];
```

A document that claims 14px while the DOM reports 13.5px is a defect in the document. This check has caught exactly that class of error before — a proposal is a specification, and a specification that disagrees with its own artefact will be implemented wrong.

Pay particular attention to:

- **Hollow-ring dots.** Assert `background` is white and `boxShadow` contains `inset`. A filled dot that should be a ring is invisible in a review and changes the semantic.
- **Alignment equations.** For each row, compare the `x` of the name, the status, and any block that should share the text column. The difference must be 0. Compare the dot's centre against the text row's centre — sub-pixel tolerance of 0.5px is acceptable, more is a bug.
- **Border versus inset ring.** Assert the avatar is exactly 32px. If a `border` was used where an inset ring was intended, the measured size will be 34px.
- **The connector line reaches the terminal node.** Assert the second-to-last row's line is present and visible. A line that stops one row short is the classic regression when a terminal node is appended.

## 3. Tag balance

Bulk scripted edits across a large HTML document are the single most likely place to break nesting. Run a tag-balance pass after any batch edit:

- Walk the document with a tag stack.
- Skip `script`, `style`, and `pre` contents — their text is not markup.
- Treat void elements and self-closing SVG tags as void.
- Report `unclosed` and `problems` counts; both must be 0.

Do not hand-write the regex for this more than once — the nuance is entirely in the skip list, and getting it wrong produces a cascade of false positives that hides a real one.

## 4. Pairing check for the before/after panels

Confirm the annotation badges pair up:

- Every number in the before column has a counterpart in the after column and vice versa.
- Numbers form a contiguous sequence with no duplicates. (A duplicate has shipped before: a newly inserted row reused a number already taken by an existing row, and the legend then described two different things with the same digit.)
- The legend lists every number that appears.

## 5. Rendered previews for the HTML blocks

The extracted previews are their own documents and need their own pass:

- Width is fluid: the root uses `width:100%` and the content centres rather than sitting at a fixed pixel width.
- Height is measured and reported (`contentHeight`) so the reviewer knows the block will expand correctly under `auto` mode.
- No `position:fixed` or `100vh` usage, which behaves badly inside an iframe.
- Total byte size is comfortably under 500KB.

## 6. Clean up

Delete every temporary artefact: extraction scripts, dumps, reports, probe files, and any scratch directory created for the run. Use explicit per-file deletion rather than a wildcard sweep, and never touch the project's own memory or configuration directories.

Finish by listing what remains, so the user can see the project directory is in the state they left it, plus the deliverable.

## 7. Report the verification honestly

In the hand-off, state:

- what was checked and the result (the five zero-checks and the style assertions),
- what could **not** be checked and why,
- which number in the document is a proposal rather than a measurement.

If a read-back or a live check was blocked by the environment, say so and name the substitute evidence. Never describe a check that did not run as if it had.
