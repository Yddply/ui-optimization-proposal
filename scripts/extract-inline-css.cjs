#!/usr/bin/env node
'use strict';

/**
 * extract-inline-css.cjs
 * Pull readable CSS out of a live bundle, a built dist directory, or a single JS/CSS file,
 * and normalise framework-relative units to CSS px.
 *
 * Bundlers inline stylesheets into JavaScript string literals. This script gathers the
 * candidate text, unescapes it, recovers CSS rule blocks, and converts units so the result
 * can be compared against design values directly.
 *
 * Usage:
 *   node extract-inline-css.cjs --url=https://example.com/page
 *   node extract-inline-css.cjs --dir=./dist
 *   node extract-inline-css.cjs --file=./dist/assets/index-abc123.js
 *
 * Options:
 *   --out=css.txt            Write to a file instead of stdout
 *   --filter=<substring>     Only keep rules whose selector contains this substring
 *   --grep=<substring>       Print <context> chars around each raw occurrence, no parsing
 *   --context=400            Chars of context for --grep (default 400)
 *   --rpx-base=375           Device base width used at build time
 *   --rpx-include=750        Design width that spans the base (1 unit = base/include px)
 *   --max-assets=24          Cap on assets fetched from a URL or directory
 *   --keep-data-uris         Do not collapse data: URIs (off by default)
 */

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const a = { _: [] };
  for (const t of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(t);
    if (m) a[m[1]] = m[2] === undefined ? true : m[2];
    else a._.push(t);
  }
  return a;
}

/* ---------- gathering ---------- */

function unescapeJs(s) {
  return s.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g, (m, g) => {
    if (g[0] === 'u' || g[0] === 'x') {
      const n = parseInt(g.slice(1), 16);
      return Number.isFinite(n) ? String.fromCharCode(n) : m;
    }
    switch (g) {
      case 'n': return '\n';
      case 'r': return '';
      case 't': return '\t';
      default: return g;
    }
  });
}

function refsFromHtml(html, baseUrl) {
  const out = [];
  const push = (u) => {
    if (!u) return;
    if (/^(data:|blob:|mailto:|javascript:)/i.test(u)) return;
    try { out.push(new URL(u, baseUrl).href); } catch { /* ignore */ }
  };
  for (const m of html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) push(m[1]);
  for (const m of html.matchAll(/<link[^>]+href=["']([^"']+)["']/gi)) {
    if (/stylesheet|\.css(\?|$)/i.test(m[0]) || /\.css(\?|$)/i.test(m[1])) push(m[1]);
  }
  return [...new Set(out)];
}

async function gatherFromUrl(url, maxAssets, log) {
  const chunks = [];
  const res = await fetch(url);
  if (!res.ok) throw new Error('entry fetch failed: ' + res.status);
  const html = await res.text();
  log('entry ' + url + ' (' + html.length + ' chars)');
  chunks.push({ name: url, text: html });

  const refs = refsFromHtml(html, url).slice(0, maxAssets);
  for (const r of refs) {
    try {
      const rr = await fetch(r);
      if (!rr.ok) { log('  skip ' + r + ' -> ' + rr.status); continue; }
      const txt = await rr.text();
      chunks.push({ name: r, text: txt });
      log('  ok   ' + r + ' (' + txt.length + ' chars)');
    } catch (e) {
      log('  fail ' + r + ' :: ' + e.message);
    }
  }
  if (refs.length === 0) {
    log('  no asset refs found in entry document');
    const guessed = refsFromHtml(html, url);
    log('  (parsed ' + guessed.length + ' refs)');
  }
  return chunks;
}

function gatherFromDir(dir, maxAssets, log) {
  const chunks = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const html = entries.filter((e) => e.isFile() && /\.html?$/i.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.localeCompare(b)));

  if (html.length) {
    const entryPath = path.join(dir, html[0]);
    const text = fs.readFileSync(entryPath, 'utf8');
    log('entry ' + entryPath + ' (' + text.length + ' chars)');
    chunks.push({ name: entryPath, text });
  }

  const all = fs.readdirSync(dir, { recursive: true })
    .map((f) => path.join(dir, String(f)))
    .filter((f) => { try { return fs.statSync(f).isFile(); } catch { return false; } })
    .filter((f) => /\.(js|mjs|cjs|css)$/i.test(f));

  const wanted = all.slice(0, maxAssets);
  for (const f of wanted) {
    if (chunks.some((c) => c.name === f)) continue;
    const txt = fs.readFileSync(f, 'utf8');
    chunks.push({ name: f, text: txt });
    log('  ok   ' + f + ' (' + txt.length + ' chars)');
  }
  if (all.length > wanted.length) {
    log('  (' + (all.length - wanted.length) + ' more js/css files not read; raise --max-assets if needed)');
  }
  return chunks;
}

/* ---------- css recovery ---------- */

// Keyframe step selectors (`from`, `to`, `50%`) are valid CSS but are noise here.
const KEYFRAME_STEP = /^(from|to|\d+(\.\d+)?%)(\s*,\s*(from|to|\d+(\.\d+)?%))*$/i;

function looksLikeSelector(s) {
  if (!s) return false;
  if (s.length > 300) return false;
  if (/=>|function|return|;/.test(s)) return false;
  if (/^[\d.]/.test(s)) return false;
  if (KEYFRAME_STEP.test(s)) return false;
  if (!/[.#a-zA-Z\[]/.test(s)) return false;
  return /^[.#:\[a-zA-Z0-9_,\-\s>()*="'+~>]+$/.test(s);
}

function looksLikeDeclarations(s) {
  if (!s || !s.trim()) return false;
  if (/=>|function|return/.test(s)) return false;
  if (!/[:]/.test(s)) return false;
  const pairs = s.split(';').filter((x) => x.trim());
  if (!pairs.length) return false;
  return pairs.every((p) => /^[^:]+:.+$/.test(p.trim()));
}

function recoverRules(text) {
  const rules = [];
  const re = /([^{}]{1,320}?)\{([^{}]{1,4000}?)\}/g;
  let m;
  while ((m = re.exec(text))) {
    const sel = m[1].trim().replace(/\s+/g, ' ');
    const decl = m[2].trim().replace(/\s+/g, ' ');
    if (!looksLikeSelector(sel)) continue;
    if (!looksLikeDeclarations(decl)) continue;
    rules.push({ sel, decl });
  }
  return rules;
}

/* ---------- unit conversion ---------- */

function makeConverter(factor, keepDataUris) {
  return function convert(s) {
    let out = s;
    if (!keepDataUris) {
      out = out.replace(/url\((['"]?)data:[^)]*?\1\)/gi, (m) => 'url(<DATA_URI:' + m.length + 'b>)');
    }
    out = out.replace(/%\?(\d+(?:\.\d+)?)\?%/g, (_, n) => px(n));
    out = out.replace(/(-?\d+(?:\.\d+)?)rpx/g, (_, n) => px(n));
    out = out.replace(/(-?\d+(?:\.\d+)?)upx/g, (_, n) => px(n));
    return out;
    function px(n) {
      const v = parseFloat(n) * factor;
      return (Math.round(v * 1000) / 1000) + 'px';
    }
  };
}

/* ---------- main ---------- */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const logLines = [];
  const log = (s) => { logLines.push(s); };

  const base = args['rpx-base'] ? parseFloat(args['rpx-base']) : 375;
  const include = args['rpx-include'] ? parseFloat(args['rpx-include']) : 750;
  const factor = base / include;
  const maxAssets = args['max-assets'] ? parseInt(args['max-assets'], 10) : 24;

  let chunks = [];
  if (typeof args.url === 'string') chunks = await gatherFromUrl(args.url, maxAssets, log);
  else if (typeof args.dir === 'string') chunks = gatherFromDir(args.dir, maxAssets, log);
  else if (typeof args.file === 'string') {
    const txt = fs.readFileSync(args.file, 'utf8');
    chunks = [{ name: args.file, text: txt }];
    log('file ' + args.file + ' (' + txt.length + ' chars)');
  } else {
    console.error('Provide one of --url= / --dir= / --file=. See the header of this script.');
    process.exit(2);
  }

  const header =
    '# source chunks: ' + chunks.length + '\n' +
    '# unit conversion: 1 design unit = ' + factor + 'px  (rpx-base=' + base + ', rpx-include=' + include + ')\n' +
    '# NOTE: rules nested inside @media are not recovered by this pass; grep the raw chunk for those.\n';

  /* grep mode: raw context, no parsing */
  if (typeof args.grep === 'string') {
    const ctx = args.context ? parseInt(args.context, 10) : 400;
    const out = [header];
    let hits = 0;
    for (const c of chunks) {
      const text = unescapeJs(c.text);
      let idx = 0;
      while ((idx = text.indexOf(args.grep, idx)) !== -1) {
        hits++;
        const s = Math.max(0, idx - ctx);
        out.push('--- ' + c.name + ' @' + idx + ' ---');
        out.push(text.slice(s, idx + args.grep.length + ctx));
        out.push('');
        idx += args.grep.length;
        if (hits > 60) break;
      }
      if (hits > 60) { out.push('(truncated at 60 hits)'); break; }
    }
    out.unshift('grep "' + args.grep + '": ' + hits + ' hits');
    emit(out.join('\n'), args);
    return;
  }

  /* parse mode */
  const convert = makeConverter(factor, !!args['keep-data-uris']);
  const seen = new Set();
  const rules = [];
  for (const c of chunks) {
    for (const r of recoverRules(unescapeJs(c.text))) {
      const key = r.sel + '{' + r.decl + '}';
      if (seen.has(key)) continue;
      seen.add(key);
      rules.push({
        sel: convert(r.sel),
        decl: convert(r.decl),
        src: path.basename(c.name),
      });
    }
  }

  let kept = rules;
  if (typeof args.filter === 'string') {
    kept = rules.filter((r) => r.sel.includes(args.filter));
  }

  const out = [header, '# rules recovered: ' + rules.length + (kept.length !== rules.length ? '  (filtered: ' + kept.length + ')' : ''), ''];
  for (const r of kept) out.push(r.sel + ' { ' + r.decl + ' }');
  if (typeof args.filter === 'string') out.push('', '--- selectors matching "' + args.filter + '" ---');
  if (typeof args.filter === 'string') {
    for (const r of kept) out.push('  ' + r.sel);
  }

  const body = out.join('\n');
  if (typeof args.out === 'string') {
    fs.writeFileSync(args.out, body, 'utf8');
    console.log('css -> ' + args.out + ' (' + body.length + ' chars, ' + kept.length + ' rules)');
    console.log('conversion factor ' + factor + 'px per unit; sources: ' + chunks.length);
  } else {
    console.log('=== gather log ===');
    console.log(logLines.join('\n'));
    console.log('');
    console.log(body);
  }
}

function emit(body, args) {
  if (typeof args.out === 'string') {
    fs.writeFileSync(args.out, body, 'utf8');
    console.log('grep -> ' + args.out + ' (' + body.length + ' chars)');
  } else {
    console.log(body);
  }
}

main().catch((e) => { console.error('FAILED: ' + (e && e.stack || e)); process.exit(1); });
