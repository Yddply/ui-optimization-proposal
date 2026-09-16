#!/usr/bin/env node
'use strict';

/**
 * build-side-by-side.cjs
 * Extract the "before" and "after" comparison panels from a self-contained proposal
 * document and emit each as its own standalone single-file HTML, ready for a
 * Feishu/Lark html5-block.
 *
 * Usage:
 *   node build-side-by-side.cjs --src=<document.html> --outdir=<dir> [options]
 *
 * Selecting the panels — three ways, in order of preference:
 *   1. Modifier classes. If the document uses `.col.before` / `.col.after`, select directly:
 *        --before-selector=".ba-col.before" --after-selector=".ba-col.after"
 *   2. A shared selector plus a content marker. When both panels carry the same class and are
 *      distinguished by a label inside them:
 *        --before-selector=".ba-col" --before-contains=".k.b"
 *        --after-selector=".ba-col"  --after-contains=".k.a"
 *   3. An occurrence index appended to the selector:
 *        --before-selector=".ba-col#1" --after-selector=".ba-col#2"
 *
 * If nothing matches (or a selector is ambiguous), the script prints every candidate it found
 * so the right selector can be chosen in one step.
 *
 * Other options:
 *   --before-title="..." --after-title="..."     Caption above each panel
 *   --desc-before="..."  --desc-after="..."      <meta name="description"> for each block
 *   --wrap-class="a,b"                           Classes for the wrapper, if the panel is
 *                                                styled through an ancestor selector
 *   --auto-ancestors                             Reproduce ancestor classes as nested wrappers
 *   --no-fluid                                   Keep the panel's fixed width (default: make it
 *                                                fill the block width)
 *   --background=#FFFFFF  --pad=16
 *   --max-kb=500                                 Warn threshold per output file
 *
 * Outputs: <outdir>/preview-before.html and <outdir>/preview-after.html
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

/* ---------- raw-text masking ---------- */

// Replace the bodies of <script>/<style>/<textarea> with spaces of equal length so that
// markup-looking text inside them cannot be matched. Indices stay aligned with the source.
function maskRawText(html) {
  const chars = html.split('');
  const re = /<(script|style|textarea)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const bodyStart = m.index + m[0].indexOf('>') + 1;
    const bodyEnd = m.index + m[0].lastIndexOf('</');
    for (let i = bodyStart; i < bodyEnd; i++) chars[i] = ' ';
  }
  return chars.join('');
}

/* ---------- element matching ---------- */

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'textarea', 'title']);

function classesOf(attrs) {
  const m = /\bclass\s*=\s*"([^"]*)"/i.exec(attrs) || /\bclass\s*=\s*'([^']*)'/i.exec(attrs);
  return m ? m[1].split(/\s+/).filter(Boolean) : [];
}

function findMatchingClose(html, openStart, tag) {
  const re = new RegExp('<' + tag + '(?=[\\s/>])|</' + tag + '\\s*>', 'gi');
  re.lastIndex = openStart;
  const lower = tag.toLowerCase();
  let depth = 0;
  let m;
  while ((m = re.exec(html))) {
    const isClose = m[0][1] === '/';
    if (isClose) {
      depth--;
      if (depth === 0) {
        const gt = html.indexOf('>', m.index);
        return gt === -1 ? -1 : gt + 1;
      }
      continue;
    }
    if (RAW.has(lower)) {
      const closeIdx = html.toLowerCase().indexOf('</' + lower, m.index);
      if (closeIdx === -1) return -1;
      re.lastIndex = closeIdx;
      depth++;
      continue;
    }
    const gt = html.indexOf('>', m.index);
    if (gt === -1) return -1;
    if (html[gt - 1] === '/') continue;
    if (VOID.has(lower)) continue;
    depth++;
  }
  return -1;
}

function parseSelector(spec) {
  const m = /^(.*?)(?:#(\d+))?$/.exec(String(spec).trim());
  return {
    classes: m[1].split('.').map((s) => s.trim()).filter(Boolean),
    index: m[2] ? parseInt(m[2], 10) - 1 : 0,
  };
}

function findAll(html, masked, classes) {
  const res = [];
  const tagRe = /<([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g;
  let m;
  while ((m = tagRe.exec(masked))) {
    const tag = m[1].toLowerCase();
    const attrs = masked.slice(m.index + 1 + m[1].length, m.index + m[0].length - 1);
    const cls = classesOf(attrs);
    if (!cls.length || !classes.every((c) => cls.includes(c))) continue;

    const gt = masked.indexOf('>', m.index);
    if (gt !== -1 && masked[gt - 1] === '/') continue;
    if (VOID.has(tag)) continue;

    const end = findMatchingClose(masked, m.index, tag);
    if (end === -1) continue;

    res.push({ start: m.index, end, html: html.slice(m.index, end), tag, classes: cls });
    tagRe.lastIndex = end;
  }
  return res;
}

function containsClasses(htmlSlice, classes) {
  const re = /class\s*=\s*"([^"]*)"/gi;
  let m;
  while ((m = re.exec(htmlSlice))) {
    const list = m[1].split(/\s+/);
    if (classes.every((c) => list.includes(c))) return true;
  }
  return false;
}

function describe(cand) {
  const text = cand.html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 70);
  return '  <' + cand.tag + ' class="' + cand.classes.join(' ') + '">  "' + text + '"';
}

function resolvePanel(html, masked, spec, contains, label) {
  const parsed = parseSelector(spec);
  if (!parsed.classes.length) {
    return { error: 'no classes in ' + label + ' selector "' + spec + '"' };
  }
  let all = findAll(html, masked, parsed.classes);
  if (!all.length) {
    return { error: label + ': no element matched ".' + parsed.classes.join('.') + '"' };
  }
  if (contains) {
    const need = String(contains).split('.').map((s) => s.trim()).filter(Boolean);
    const filtered = all.filter((c) => containsClasses(c.html, need));
    if (!filtered.length) {
      return {
        error: label + ': "' + spec + '" matched ' + all.length
          + ' element(s) but none contained ".' + need.join('.') + '"',
        candidates: all,
      };
    }
    all = filtered;
  }
  if (all.length > 1 && parsed.index === 0 && !contains) {
    return {
      error: label + ': "' + spec + '" is ambiguous (' + all.length + ' matches). '
        + 'Add a modifier class, a --' + label + '-contains marker, or a #N suffix.',
      candidates: all,
    };
  }
  const pick = all[Math.min(parsed.index, all.length - 1)];
  return { pick, matched: all.length };
}

/* ---------- standalone document ---------- */

function extractStyles(html) {
  const out = [];
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) out.push(m[1]);
  return out.join('\n\n');
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

function buildDoc(o) {
  const ancestors = (o.ancestors || []).filter((a) => a && a.length);
  const l = [];
  l.push('<!doctype html>');
  l.push('<html lang="zh-CN">');
  l.push('<head>');
  l.push('<meta charset="utf-8">');
  l.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
  l.push('<meta name="use-iframe" content="true">');
  l.push('<meta name="html-box-height-mode" content="auto">');
  l.push('<meta name="description" content="' + escapeAttr(o.description) + '">');
  l.push('<title>' + escapeHtml(o.title) + '</title>');
  l.push('<style>');
  l.push('html,body{margin:0;padding:0;background:' + o.background + ';}');
  l.push('body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;}');
  l.push('.sb-wrap{width:100%;max-width:100%;box-sizing:border-box;padding:' + o.pad + 'px;}');
  l.push('.sb-cap{font-size:14px;font-weight:600;color:#1F2329;margin:0 0 12px;'
    + 'padding-bottom:8px;border-bottom:1px solid #DEE0E3;}');
  l.push('/* ---- carried over from the source document ---- */');
  l.push(o.css);
  if (o.fluid) {
    l.push('/* ---- block-width override: the panel fills the HTML block ---- */');
    l.push('.sb-wrap>.sb-body>*{width:100%!important;max-width:100%!important;box-sizing:border-box;}');
  }
  l.push('</style>');
  l.push('</head>');
  l.push('<body>');
  l.push('<div class="sb-wrap">');
  if (o.title) l.push('<div class="sb-cap">' + escapeHtml(o.title) + '</div>');
  l.push('<div class="sb-body">');
  for (const a of ancestors) l.push('<div class="' + escapeAttr(a.join(' ')) + '">');
  l.push(o.body);
  for (let i = ancestors.length; i > 0; i--) l.push('</div>');
  l.push('</div>');
  l.push('</div>');
  l.push('</body>');
  l.push('</html>');
  return l.join('\n');
}

/* ---------- main ---------- */

function main() {
  const args = parseArgs(process.argv.slice(2));
  const src = args.src;
  const outdir = args.outdir;

  if (!src || !outdir) {
    console.error('Usage: node build-side-by-side.cjs --src=<document.html> --outdir=<dir> [--before-selector=".c.before"] [--after-selector=".c.after"]');
    process.exit(2);
  }

  const html = fs.readFileSync(src, 'utf8');
  const masked = maskRawText(html);
  const css = extractStyles(html);
  if (!css) console.warn('WARNING: no <style> block found in ' + src);

  const wrapClass = typeof args['wrap-class'] === 'string'
    ? args['wrap-class'].split(',').map((s) => s.trim()).filter(Boolean) : [];
  const autoAncestors = !!args['auto-ancestors'];
  const fluid = !args['no-fluid'];
  const background = typeof args.background === 'string' ? args.background : '#FFFFFF';
  const pad = args.pad ? parseInt(args.pad, 10) : 16;
  const maxKb = args['max-kb'] ? parseInt(args['max-kb'], 10) : 500;

  const jobs = [
    {
      key: 'before',
      spec: args['before-selector'] || '.ba-col.before',
      contains: args['before-contains'],
      title: args['before-title'] || '优化前',
      description: args['desc-before']
        || '优化前的实际渲染：红圈标注待修的偏差位置，编号与正文的逐处对照表一一对应。',
      file: 'preview-before.html',
    },
    {
      key: 'after',
      spec: args['after-selector'] || '.ba-col.after',
      contains: args['after-contains'],
      title: args['after-title'] || '优化后',
      description: args['desc-after']
        || '优化后的目标渲染：绿圈标注对应修复位置，编号与正文的逐处对照表一一对应。',
      file: 'preview-after.html',
    },
  ];

  fs.mkdirSync(outdir, { recursive: true });

  const lines = [];
  let failures = 0;

  for (const j of jobs) {
    const r = resolvePanel(html, masked, j.spec, j.contains, j.key);
    if (r.error) {
      failures++;
      lines.push('FAIL  ' + r.error);
      if (r.candidates && r.candidates.length) {
        lines.push('      candidates for ".' + parseSelector(j.spec).classes.join('.') + '":');
        for (const c of r.candidates.slice(0, 12)) lines.push(describe(c));
      }
      continue;
    }

    // Suppress our caption if the panel already carries its own.
    const hasOwnCaption = /class\s*=\s*"[^"]*\bba-cap\b/.test(r.pick.html);
    const doc = buildDoc({
      title: hasOwnCaption ? '' : j.title,
      description: j.description,
      css,
      body: r.pick.html,
      background,
      pad,
      fluid,
      ancestors: wrapClass.length ? [wrapClass] : (autoAncestors ? [] : []),
    });

    const outPath = path.join(outdir, j.file);
    fs.writeFileSync(outPath, doc, 'utf8');
    const kb = doc.length / 1024;
    lines.push('OK    ' + j.key + ' -> ' + outPath
      + '  (' + doc.length + ' chars, ' + kb.toFixed(1) + ' KB)'
      + (r.matched > 1 ? '   [picked 1 of ' + r.matched + ' matches]' : '')
      + (kb > maxKb ? '   WARNING: exceeds ' + maxKb + 'KB' : ''));
    lines.push('      selector ".' + r.pick.classes.join('.') + '"  tag=' + r.pick.tag
      + (hasOwnCaption ? '  (panel keeps its own caption)' : ''));
  }

  console.log(lines.join('\n'));
  process.exit(failures ? 1 : 0);
}

main();
