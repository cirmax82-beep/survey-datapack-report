/* 종합 데이터 팩 엑셀 → 시트 묶음(차수별)·표 블록 */
(function () {
  'use strict';
  const DP = (window.DP = window.DP || {});

  const MARKS = new Set(['○', '●', '◎', '■', '□', '◆', '◇', '▲', '△', '√', '✓', '✔']);
  const blank = (v) => v == null || (typeof v === 'string' && v.trim() === '');
  const isDash = (v) => typeof v === 'string' && /^[-–—]+$/.test(v.trim());
  const filled = (v) => !blank(v) && !isDash(v);

  function toNum(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v !== 'string' || blank(v) || isDash(v)) return null;
    const s = v.trim().replace(/,/g, '');
    return /^[-+]?\d+(\.\d+)?%?$/.test(s) ? parseFloat(s) : null;
  }

  // '91과 306종' 같은 칸
  const FS_RE = /^(\d+)\s*과\s*(\d+)\s*종$/;
  function parseFS(v) {
    const m = typeof v === 'string' && v.trim().match(FS_RE);
    return m ? { fam: +m[1], sp: +m[2] } : null;
  }

  // 그래프 값: '-'는 0, 빈칸은 값 없음
  function numOf(v, type) {
    if (isDash(v)) return 0;
    if (type === 'fs') {
      const f = parseFS(v);
      return f ? f.sp : null;
    }
    return toNum(v);
  }

  const isTotal = (v) => {
    const t = String(v == null ? '' : v).trim();
    return /^(합\s*계|총\s*계|계|소\s*계|전\s*체|total|sum)$/i.test(t) || /(소|합)\s*계$/.test(t);
  };
  const isSub = (v) => typeof v === 'string' && /^[\s　]+\S/.test(v);

  function colType(vals) {
    const f = vals.filter((v) => !blank(v));
    if (!f.length) return 'empty';
    const nd = f.filter((v) => !isDash(v));
    if (!nd.length) return 'dash';
    if (nd.every((v) => toNum(v) != null)) return 'num';
    if (nd.every((v) => typeof v === 'string' && MARKS.has(v.trim()))) return 'mark';
    if (nd.every((v) => parseFS(v))) return 'fs';
    return 'text';
  }

  function analyze(header, rows) {
    const types = header.map((_, j) => colType(rows.map((r) => r[j])));
    let catCol = types.indexOf('text');
    if (catCol < 0) catCol = 0;
    const raw = rows.map((r) => r[catCol]);
    let labels = raw.map((v) => (blank(v) ? '' : String(v).trim()));
    // 같은 이름이 되풀이되면(예: 분류군 + 목명) 다음 글자 열을 붙임
    if (new Set(labels).size < labels.length) {
      const second = types.findIndex((t, j) => j > catCol && t === 'text');
      if (second >= 0) labels = rows.map((r, i) => (filled(r[second]) ? labels[i] + ' ' + String(r[second]).trim() : labels[i]));
    }
    const seen = new Map();
    labels = labels.map((l) => {
      const n = (seen.get(l) || 0) + 1;
      seen.set(l, n);
      return n > 1 ? l + ' (' + n + ')' : l;
    });
    const flags = raw.map((v) => ({ total: isTotal(v), sub: isSub(v) }));
    const numCols = types
      .map((t, j) => (j !== catCol && (t === 'num' || t === 'fs' || t === 'dash') ? j : -1))
      .filter((j) => j >= 0);
    return { header, rows, types, catCol, labels, flags, numCols };
  }

  function makeBlock(raw) {
    let width = 0;
    raw.forEach((r) => {
      for (let j = r.length - 1; j >= 0; j--) {
        if (!blank(r[j])) {
          width = Math.max(width, j + 1);
          break;
        }
      }
    });
    const pad = (r) => Array.from({ length: width }, (_, j) => (r[j] === undefined ? null : r[j]));
    const seen = new Map();
    let header = pad(raw[0])
      .map((v, j) => (blank(v) ? '열' + (j + 1) : String(v).trim()))
      .map((hd) => {
        const n = (seen.get(hd) || 0) + 1;
        seen.set(hd, n);
        return n > 1 ? hd + ' (' + n + ')' : hd;
      });
    let rows = raw.slice(1).map(pad);
    // 문헌5·문헌6·문헌4… 처럼 뒤섞인 열은 번호 순으로
    const lit = header.map((hd, j) => [hd, j]).filter(([hd]) => /^문헌\s*\d+$/.test(hd));
    if (lit.length > 1) {
      const slots = lit.map(([, j]) => j);
      const order = lit
        .slice()
        .sort((a, b) => DP.natCmp(a[0], b[0]))
        .map(([, j]) => j);
      const perm = header.map((_, j) => j);
      slots.forEach((s, k) => (perm[s] = order[k]));
      header = perm.map((j) => header[j]);
      rows = rows.map((r) => perm.map((j) => r[j]));
    }
    return analyze(header, rows);
  }

  // 빈 줄로 나뉜 표를 각각의 블록으로
  function splitBlocks(aoa) {
    const out = [];
    let cur = null;
    for (const row of aoa || []) {
      const r = Array.isArray(row) ? row : [];
      if (r.every(blank)) {
        if (cur) out.push(cur);
        cur = null;
        continue;
      }
      (cur = cur || []).push(r);
    }
    if (cur) out.push(cur);
    return out.map(makeBlock);
  }

  // '6_식물_생활형_분석_1차' → 번호 6, 이름 식물_생활형_분석, 1차
  function parseName(name) {
    const s = String(name).trim();
    const m = s.match(/^(?:(\d+)[_\s.-]*)?(.*?)(?:[_\s-]*(\d+)\s*차)?$/);
    const base = (m && m[2]) || s;
    return {
      num: m && m[1] != null ? +m[1] : null,
      base,
      round: m && m[3] != null ? +m[3] : null,
      title: base.replace(/_/g, ' ').trim() || s,
    };
  }

  DP.readWorkbook = function (buf, fileName) {
    const wb = XLSX.read(buf, { type: 'array', dense: true });
    const sheets = wb.SheetNames.map((name) => ({
      name,
      aoa: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: true }),
    }));
    return { fileName, loadedAt: Date.now(), sheets };
  };

  // 시트별 열 이름 바꾸기: 식물 집계표의 '소계'(종+아종+변종+품종)는 보고서 관례대로 '분류군'
  const RENAME = [[/관속식물|식물.*집계/, { 소계: '분류군' }]];
  function renameHeaders(base, blocks) {
    RENAME.forEach(([re, map]) => {
      if (!re.test(base)) return;
      blocks.forEach((b) => (b.header = b.header.map((hd) => (map[hd] && !b.header.includes(map[hd]) ? map[hd] : hd))));
    });
    return blocks;
  }

  DP.buildModel = function (raw) {
    const groups = [];
    const byKey = new Map();
    raw.sheets.forEach((s) => {
      const p = parseName(s.name);
      const key = (p.num != null ? p.num + '_' : '') + p.base;
      let g = byKey.get(key);
      if (!g) {
        g = { key, num: p.num, base: p.base, title: p.title, items: [] };
        byKey.set(key, g);
        groups.push(g);
      }
      g.items.push({ round: p.round, label: p.round != null ? p.round + '차' : '', sheetName: s.name, blocks: renameHeaders(p.base, splitBlocks(s.aoa)) });
    });
    groups.forEach((g) => g.items.sort((a, b) => (a.round || 0) - (b.round || 0)));
    return { fileName: raw.fileName, loadedAt: raw.loadedAt, groups };
  };

  DP.parse = { blank, isDash, filled, toNum, parseFS, numOf, isTotal, isSub, analyze, parseName };
})();
