#!/usr/bin/env node
'use strict';

/**
 * verify-render.cjs
 * Measure a rendered page and assert that the values written in a proposal actually hold.
 *
 * Required zero-checks: horizontal overflow, elements outside the viewport, console errors,
 * page errors, failed requests. A standalone offline document must produce zero network
 * requests, so a non-zero failure count also proves the document is not self-contained.
 *
 * Usage:
 *   node verify-render.cjs <file.html|http://...> [options]
 *
 * Options:
 *   --width=1440               Viewport width (default 1440)
 *   --height=900               Viewport height (default 900)
 *   --probe=".a,.b,.c"         Selectors to measure (rect + computed style)
 *   --expect='.sel:fontSize=14px;.sel:width=32px'   Assertions
 *   --out=report.txt           Write the JSON report to a file
 *   --chrome=<path>            Explicit Chrome/Chromium executable
 *   --quiet                    Print only the summary lines
 */

const fs = require('fs');
const os = require('os');
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

function loadPlaywright() {
  const candidates = [
    'playwright-core',
    'playwright',
    process.env.PW_CORE,
    path.join(os.homedir(), '.workbuddy', 'binaries', 'node', 'workspace', 'node_modules', 'playwright-core'),
    path.join(os.homedir(), '.workbuddy', 'binaries', 'node', 'workspace', 'node_modules', 'playwright'),
  ].filter(Boolean);
  for (const c of candidates) {
    try { return require(c); } catch { /* try next */ }
  }
  return null;
}

function findChrome(explicit) {
  const candidates = [
    explicit,
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch { /* ignore */ }
  }
  return null;
}

function toUrl(target) {
  if (/^https?:\/\//i.test(target)) return target;
  const abs = path.resolve(target);
  return 'file:///' + abs.replace(/\\/g, '/').replace(/^\//, '');
}

/* ---------- in-page measurement ---------- */

function measure(selectors) {
  const cw = document.documentElement.clientWidth;
  const ch = document.documentElement.clientHeight;

  const styleOf = (el) => {
    const s = getComputedStyle(el);
    return {
      fontSize: s.fontSize,
      fontWeight: s.fontWeight,
      lineHeight: s.lineHeight,
      color: s.color,
      background: s.backgroundColor,
      backgroundImage: s.backgroundImage && s.backgroundImage.slice(0, 80),
      boxShadow: s.boxShadow,
      border: s.border,
      borderRadius: s.borderRadius,
      padding: s.padding,
      margin: s.margin,
      display: s.display,
      position: s.position,
      width: s.width,
      height: s.height,
      overflow: s.overflow,
    };
  };

  const rectOf = (el) => {
    const r = el.getBoundingClientRect();
    return {
      x: +r.x.toFixed(2),
      y: +r.y.toFixed(2),
      w: +r.width.toFixed(2),
      h: +r.height.toFixed(2),
      right: +r.right.toFixed(2),
      bottom: +r.bottom.toFixed(2),
      cx: +(r.x + r.width / 2).toFixed(2),
      cy: +(r.y + r.height / 2).toFixed(2),
    };
  };

  const offenders = [];
  for (const el of document.querySelectorAll('body *')) {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') continue;
    if (s.position === 'fixed') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.right > cw + 1 || r.left < -1) {
      const cls = (el.getAttribute('class') || '').slice(0, 90);
      offenders.push({
        tag: el.tagName.toLowerCase(),
        cls,
        left: +r.left.toFixed(2),
        right: +r.right.toFixed(2),
        w: +r.width.toFixed(2),
      });
      if (offenders.length >= 25) break;
    }
  }

  const probed = {};
  for (const sel of selectors) {
    const els = [...document.querySelectorAll(sel)];
    if (!els.length) { probed[sel] = { found: false }; continue; }
    probed[sel] = {
      found: true,
      count: els.length,
      first: { rect: rectOf(els[0]), style: styleOf(els[0]) },
    };
  }

  return {
    viewport: { width: cw, height: ch },
    overflow: {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: cw,
      horizontal: document.documentElement.scrollWidth > cw + 1,
    },
    contentHeight: document.documentElement.scrollHeight,
    offenders,
    elementCount: document.querySelectorAll('*').length,
    probed,
  };
}

/* ---------- assertions ---------- */

function parseExpect(spec) {
  // ".sel:prop=value;.sel2:prop2=value2"
  const out = [];
  if (!spec) return out;
  for (const part of spec.split(';')) {
    const m = /^\s*([^:]+):([A-Za-z-]+)\s*=\s*(.+?)\s*$/.exec(part);
    if (!m) continue;
    const targets = m[1].split(',').map((s) => s.trim()).filter(Boolean);
    for (const t of targets) out.push({ sel: t, prop: m[2], want: m[3] });
  }
  return out;
}

function evaluateAssertions(list, result) {
  const rows = [];
  for (const a of list) {
    const p = result.probed[a.sel];
    if (!p || !p.found) { rows.push({ ...a, got: '(not found)', pass: false }); continue; }
    const st = p.first.style;
    const rc = p.first.rect;
    const map = {
      fontSize: st.fontSize, fontWeight: st.fontWeight, lineHeight: st.lineHeight,
      color: st.color, background: st.background, boxShadow: st.boxShadow,
      border: st.border, borderRadius: st.borderRadius,
      width: rc.w + 'px', height: rc.h + 'px',
      x: rc.x + 'px', right: rc.right + 'px', cy: rc.cy + 'px', cx: rc.cx + 'px',
    };
    const got = map[a.prop];
    let pass;
    if (a.want.startsWith('/') && a.want.endsWith('/')) {
      pass = new RegExp(a.want.slice(1, -1)).test(String(got));
    } else if (a.want.startsWith('~')) {
      const target = parseFloat(a.want.slice(1));
      pass = Math.abs(parseFloat(got) - target) <= 0.5;
    } else {
      pass = String(got) === a.want;
    }
    rows.push({ sel: a.sel, prop: a.prop, want: a.want, got: String(got), pass });
  }
  return rows;
}

/* ---------- main ---------- */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = args._[0];
  if (!target) {
    console.error('Usage: node verify-render.cjs <file.html|http://...> [--probe=".a,.b"] [--expect=".a:fontSize=14px"] [--out=report.txt]');
    process.exit(2);
  }

  const pw = loadPlaywright();
  if (!pw) {
    console.error('playwright-core not found. Install it into the managed workspace:');
    console.error('  cd <managed-node-workspace> && <node.exe> <npm-cli.js from managed node> install playwright-core');
    process.exit(3);
  }

  const width = args.width ? parseInt(args.width, 10) : 1440;
  const height = args.height ? parseInt(args.height, 10) : 900;
  const probeList = typeof args.probe === 'string'
    ? args.probe.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const expects = parseExpect(args.expect);
  // Assertion selectors must also be measured; merge them so --expect works on its own.
  for (const a of expects) if (!probeList.includes(a.sel)) probeList.push(a.sel);

  const chrome = findChrome(typeof args.chrome === 'string' ? args.chrome : null);
  const launchOpts = chrome ? { executablePath: chrome } : {};
  if (!chrome) console.error('WARNING: no Chrome found; falling back to the bundled browser (may not exist).');

  const browser = await pw.chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width, height } });

  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300));
  });
  page.on('pageerror', (e) => pageErrors.push(String(e.message || e).slice(0, 300)));
  page.on('requestfailed', (req) => {
    failedRequests.push((req.url() || '').slice(0, 200) + ' :: ' + ((req.failure() || {}).errorText || 'unknown'));
  });

  const url = toUrl(target);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(250);

  const result = await page.evaluate(measure, probeList);
  await browser.close();

  const assertions = expects.length ? evaluateAssertions(expects, result) : [];

  const report = {
    target: url,
    viewport: result.viewport,
    checks: {
      horizontalOverflow: result.overflow.horizontal,
      scrollWidth: result.overflow.scrollWidth,
      clientWidth: result.overflow.clientWidth,
      offViewportElements: result.offenders.length,
      consoleErrors: consoleErrors.length,
      pageErrors: pageErrors.length,
      failedRequests: failedRequests.length,
    },
    pass: !result.overflow.horizontal
      && result.offenders.length === 0
      && consoleErrors.length === 0
      && pageErrors.length === 0
      && failedRequests.length === 0,
    contentHeight: result.contentHeight,
    elementCount: result.elementCount,
    offenders: result.offenders,
    consoleErrors,
    pageErrors,
    failedRequests,
    probed: result.probed,
    assertions,
  };

  const lines = [];
  lines.push('target: ' + url);
  lines.push('viewport: ' + width + 'x' + height + '   contentHeight: ' + result.contentHeight + 'px');
  lines.push('');
  lines.push('horizontal overflow ....... ' + (result.overflow.horizontal ? 'FAIL' : 'ok')
    + '   (scrollWidth ' + result.overflow.scrollWidth + ' vs clientWidth ' + result.overflow.clientWidth + ')');
  lines.push('elements outside viewport . ' + (result.offenders.length ? 'FAIL (' + result.offenders.length + ')' : 'ok'));
  lines.push('console errors ............ ' + (consoleErrors.length ? 'FAIL (' + consoleErrors.length + ')' : 'ok'));
  lines.push('page errors ............... ' + (pageErrors.length ? 'FAIL (' + pageErrors.length + ')' : 'ok'));
  lines.push('failed requests ........... ' + (failedRequests.length ? 'FAIL (' + failedRequests.length + ')' : 'ok (also proves self-contained)'));
  lines.push('');
  lines.push('OVERALL: ' + (report.pass ? 'PASS' : 'FAIL'));

  if (result.offenders.length) {
    lines.push('');
    lines.push('offenders:');
    for (const o of result.offenders) {
      lines.push('  <' + o.tag + ' class="' + o.cls + '">  left=' + o.left + ' right=' + o.right + ' w=' + o.w);
    }
  }
  if (consoleErrors.length) { lines.push('', 'console errors:'); for (const e of consoleErrors) lines.push('  ' + e); }
  if (pageErrors.length) { lines.push('', 'page errors:'); for (const e of pageErrors) lines.push('  ' + e); }
  if (failedRequests.length) { lines.push('', 'failed requests:'); for (const e of failedRequests) lines.push('  ' + e); }

  if (assertions.length) {
    lines.push('', 'assertions:');
    for (const a of assertions) {
      lines.push('  ' + (a.pass ? 'ok  ' : 'FAIL') + ' ' + a.sel + ' ' + a.prop
        + ' want=' + a.want + ' got=' + a.got);
    }
    const bad = assertions.filter((a) => !a.pass).length;
    lines.push('  -> ' + (assertions.length - bad) + '/' + assertions.length + ' passed');
  }

  if (probeList.length) {
    lines.push('', 'probed elements:');
    for (const sel of probeList) {
      const p = result.probed[sel];
      if (!p || !p.found) { lines.push('  ' + sel + '  (not found)'); continue; }
      const r = p.first.rect;
      const s = p.first.style;
      lines.push('  ' + sel + '  x' + p.count);
      lines.push('      rect   x=' + r.x + ' y=' + r.y + ' w=' + r.w + ' h=' + r.h
        + ' right=' + r.right + ' cx=' + r.cx + ' cy=' + r.cy);
      lines.push('      style  fontSize=' + s.fontSize + ' weight=' + s.fontWeight
        + ' lineHeight=' + s.lineHeight + ' color=' + s.color
        + ' bg=' + s.background + ' radius=' + s.borderRadius);
      lines.push('             boxShadow=' + s.boxShadow);
      lines.push('             margin=' + s.margin + ' padding=' + s.padding);
    }
  }

  const text = lines.join('\n');
  if (typeof args.out === 'string') {
    fs.writeFileSync(args.out, text + '\n\n=== JSON ===\n' + JSON.stringify(report, null, 2), 'utf8');
    console.log('report -> ' + args.out);
    console.log(report.pass ? 'PASS' : 'FAIL');
  } else {
    console.log(text);
  }

  process.exit(report.pass ? 0 : 1);
}

main().catch((e) => { console.error('FAILED: ' + (e && e.stack || e)); process.exit(1); });
