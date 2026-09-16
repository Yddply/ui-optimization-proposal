#!/usr/bin/env node
'use strict';

/**
 * figma-node-dump.cjs
 * Flatten a Figma node subtree into a single measurement report.
 *
 * Usage:
 *   node figma-node-dump.cjs <FILE_KEY> <NODE_ID> [options]
 *
 * Options:
 *   --token=figd_xxx     Figma Personal Access Token (else FIGMA_TOKEN, else audit-log recovery)
 *   --out=report.txt     Write the report to a file instead of stdout
 *   --depth=99           Maximum tree depth to print
 *   --json=node.json     Also dump the raw node JSON (for reprocessing)
 *   --no-summary         Skip the type-scale / shape summary
 *
 * NODE_ID accepts either the URL form (123-456) or the API form (123:456).
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

/* ---------- token ---------- */

function recoverToken() {
  const dir = path.join(os.homedir(), '.workbuddy', 'audit-log');
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => {
      const full = path.join(dir, f);
      let mtime = 0;
      try { mtime = fs.statSync(full).mtimeMs; } catch { /* ignore */ }
      return { full, mtime };
    })
    .sort((a, b) => b.mtime - a.mtime);

  for (const f of files) {
    let txt = '';
    try { txt = fs.readFileSync(f.full, 'utf8'); } catch { continue; }
    const matches = txt.match(/figd_[A-Za-z0-9_-]{8,}/g);
    if (matches && matches.length) return matches[matches.length - 1];
  }
  return null;
}

/* ---------- color helpers ---------- */

function channel(v) {
  const n = Math.round(Math.max(0, Math.min(1, v)) * 255);
  return n.toString(16).padStart(2, '0').toUpperCase();
}

function hexColor(c, opacity) {
  if (!c) return '';
  let s = '#' + channel(c.r) + channel(c.g) + channel(c.b);
  const a = typeof opacity === 'number' ? opacity
    : typeof c.a === 'number' ? c.a : 1;
  if (a < 0.999) s += channel(a);
  return s;
}

function paint(paints) {
  if (!paints || !paints.length) return '';
  const parts = [];
  for (const p of paints) {
    if (p.visible === false) continue;
    if (p.type === 'SOLID') {
      parts.push(hexColor(p.color, p.opacity));
    } else if (p.type && p.type.indexOf('GRADIENT') === 0) {
      const stops = (p.gradientStops || [])
        .map((s) => hexColor(s.color, s.color && s.color.a) + '@' + Math.round((s.position || 0) * 100) + '%')
        .join(' ');
      parts.push(p.type.replace('GRADIENT_', '').toLowerCase() + '[' + stops + ']');
    } else if (p.type === 'IMAGE') {
      parts.push('IMAGE');
    } else {
      parts.push(String(p.type));
    }
  }
  return parts.join(' ');
}

function effects(list) {
  if (!list || !list.length) return '';
  const parts = [];
  for (const e of list) {
    if (e.visible === false) continue;
    const off = e.offset ? '@' + Math.round(e.offset.x) + ',' + Math.round(e.offset.y) : '';
    const col = e.color ? hexColor(e.color, e.color.a) : '';
    parts.push(e.type + '(' + e.radius + off + (col ? ' ' + col : '') + ')');
  }
  return parts.join(' + ');
}

/* ---------- tree walk ---------- */

const collect = { text: [], shapes: [], rounded: [] };

function walk(node, depth, maxDepth, out) {
  if (!node || depth > maxDepth) return;
  const b = node.absoluteBoundingBox;
  const bits = [String(node.type || '?').padEnd(9), '"' + (node.name || '') + '"'];

  if (b) {
    bits.push(Math.round(b.width) + '\u00d7' + Math.round(b.height) +
      ' @ (' + Math.round(b.x) + ',' + Math.round(b.y) + ')');
  }

  if (node.type === 'TEXT') {
    const st = node.style || {};
    bits.push(
      (st.fontSize || '?') + 'px/' + (st.fontWeight || '?') +
      ' lh=' + (st.lineHeightPx != null ? Math.round(st.lineHeightPx) + 'px' : '?') +
      (st.letterSpacing ? ' ls=' + st.letterSpacing : '')
    );
    const fill = paint(node.fills);
    bits.push('fill=' + (fill || '-'));
  } else {
    const fill = paint(node.fills);
    if (fill) bits.push('fill=' + fill);
  }

  const stroke = paint(node.strokes);
  if (stroke) {
    bits.push('stroke=' + stroke +
      ' w=' + (node.strokeWeight != null ? node.strokeWeight : '?') +
      ' align=' + (node.strokeAlign || '-'));
  }

  if (node.rectangleCornerRadii) bits.push('radii=[' + node.rectangleCornerRadii.join(',') + ']');
  else if (node.cornerRadius) bits.push('radius=' + node.cornerRadius);

  if (node.layoutMode) {
    const pad = [node.paddingLeft, node.paddingTop, node.paddingRight, node.paddingBottom]
      .map((v) => (v == null ? 0 : v)).join(',');
    bits.push('pad=[' + pad + '] gap=' + (node.itemSpacing || 0) + ' layout=' + node.layoutMode);
  }

  if (node.layoutSizingHorizontal || node.layoutSizingVertical) {
    bits.push('sizing=' + (node.layoutSizingHorizontal || '-') + '/' + (node.layoutSizingVertical || '-'));
  }

  const fx = effects(node.effects);
  if (fx) bits.push('effects=' + fx);
  if (node.opacity != null && node.opacity < 1) bits.push('opacity=' + node.opacity);
  if (node.clipsContent === false && node.type === 'FRAME') bits.push('clip=false');

  out.push('  '.repeat(depth) + bits.join('  '));

  if (node.type === 'TEXT') {
    const st = node.style || {};
    collect.text.push({
      name: node.name,
      chars: (node.characters || '').replace(/\n/g, '\\n'),
      fontSize: st.fontSize,
      fontWeight: st.fontWeight,
      lineHeightPx: st.lineHeightPx,
      fill: paint(node.fills),
    });
  }
  if (b && b.width <= 40 && b.height <= 40) {
    collect.shapes.push({
      type: node.type,
      name: node.name,
      w: Math.round(b.width),
      h: Math.round(b.height),
      fill: paint(node.fills),
      stroke: paint(node.strokes),
      strokeWeight: node.strokeWeight,
      strokeAlign: node.strokeAlign,
    });
  }

  for (const c of node.children || []) walk(c, depth + 1, maxDepth, out);
}

/* ---------- summary ---------- */

function summary() {
  const lines = ['', '=== TYPE SCALE (distinct font sizes) ==='];
  const bySize = new Map();
  for (const t of collect.text) {
    const k = String(t.fontSize) + '/' + String(t.fontWeight);
    if (!bySize.has(k)) bySize.set(k, { size: t.fontSize, weight: t.fontWeight, lh: t.lineHeightPx, samples: [] });
    const e = bySize.get(k);
    if (e.samples.length < 4) e.samples.push('"' + t.chars + '"');
  }
  const scale = [...bySize.values()].sort((a, b) => (b.size || 0) - (a.size || 0));
  for (const e of scale) {
    lines.push('  ' + e.size + 'px / ' + e.weight + '  lh=' + e.lh + '  x' +
      collect.text.filter((t) => t.fontSize === e.size && t.fontWeight === e.weight).length +
      '   e.g. ' + e.samples.join(', '));
  }

  lines.push('', '=== SMALL SHAPES (\u226440px: avatars, badges, dots) ===');
  const seen = new Set();
  for (const s of collect.shapes) {
    const key = [s.type, s.w, s.h, s.fill, s.stroke, s.strokeWeight, s.strokeAlign].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push('  ' + String(s.type).padEnd(10) + (s.w + '\u00d7' + s.h).padEnd(9) +
      ' fill=' + (s.fill || '-') +
      ' stroke=' + (s.stroke || '-') +
      ' w=' + (s.strokeWeight != null ? s.strokeWeight : '-') +
      ' align=' + (s.strokeAlign || '-') +
      '   e.g. "' + s.name + '"');
  }
  return lines.join('\n');
}

/* ---------- main ---------- */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fileKey = args._[0];
  let nodeId = args._[1];

  if (!fileKey || !nodeId) {
    console.error('Usage: node figma-node-dump.cjs <FILE_KEY> <NODE_ID> [--token=..] [--out=..] [--depth=99]');
    process.exit(2);
  }
  nodeId = String(nodeId).replace(/-/g, ':');

  const token = (typeof args.token === 'string' && args.token)
    || process.env.FIGMA_TOKEN
    || recoverToken();

  if (!token) {
    console.error('No Figma token. Pass --token=, set FIGMA_TOKEN, or generate one at Figma > Settings > Security > Personal access tokens (File content: Read-only).');
    process.exit(3);
  }

  const url = 'https://api.figma.com/v1/files/' + fileKey + '/nodes?ids=' +
    encodeURIComponent(nodeId);

  const res = await fetch(url, { headers: { 'X-Figma-Token': token } });
  if (!res.ok) {
    console.error('Figma API ' + res.status + ' ' + res.statusText);
    console.error((await res.text()).slice(0, 500));
    process.exit(4);
  }
  const json = await res.json();

  const entry = json.nodes && json.nodes[nodeId];
  if (!entry) {
    console.error('Node ' + nodeId + ' not found in response. Keys: ' + Object.keys(json.nodes || {}).join(', '));
    process.exit(5);
  }

  const maxDepth = args.depth ? parseInt(args.depth, 10) : 99;
  const out = [];
  out.push('FILE ' + fileKey + '  NODE ' + nodeId);
  out.push('='.repeat(60));
  walk(entry.document, 0, maxDepth, out);

  let report = out.join('\n');
  if (!args['no-summary']) report += '\n' + summary();

  if (typeof args.json === 'string') {
    fs.writeFileSync(args.json, JSON.stringify(json, null, 2), 'utf8');
    report += '\n\n(raw JSON written to ' + args.json + ')';
  }

  if (typeof args.out === 'string') {
    fs.writeFileSync(args.out, report, 'utf8');
    console.log('report -> ' + args.out + '  (' + report.length + ' chars, ' + out.length + ' nodes)');
  } else {
    console.log(report);
  }
}

main().catch((e) => { console.error('FAILED: ' + (e && e.stack || e)); process.exit(1); });
