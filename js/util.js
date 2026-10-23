/* 공통 도구: DOM 만들기, 저장, 받기, 복사, 숫자 표기 */
(function () {
  'use strict';
  const DP = (window.DP = window.DP || {});

  DP.h = function (tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k === 'html') e.innerHTML = v;
        else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
        else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
        else if (v === true) e.setAttribute(k, '');
        else e.setAttribute(k, v);
      }
    }
    for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : String(k));
    return e;
  };

  DP.esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // localStorage는 막혀 있을 수 있으니 실패해도 화면은 그대로 동작
  const PFX = 'dpv:';
  DP.store = {
    get(k) {
      try {
        const s = localStorage.getItem(PFX + k);
        return s ? JSON.parse(s) : null;
      } catch (e) {
        return null;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(PFX + k, JSON.stringify(v));
        return true;
      } catch (e) {
        return false;
      }
    },
    del(k) {
      try {
        localStorage.removeItem(PFX + k);
      } catch (e) {}
    },
    clear(prefix) {
      try {
        Object.keys(localStorage)
          .filter((x) => x.startsWith(PFX + prefix))
          .forEach((x) => localStorage.removeItem(x));
      } catch (e) {}
    },
  };

  DP.fmtNum = (v) => {
    if (v == null || !isFinite(v)) return '';
    if (Number.isInteger(v)) return v.toLocaleString('ko-KR');
    return (Math.round(v * 100) / 100).toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  };
  DP.csvNum = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100));

  DP.natCmp = (a, b) => String(a).localeCompare(String(b), 'ko', { numeric: true });

  DP.safeName = (s) =>
    String(s || '그림')
      .replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);

  // 엑셀에서 한글이 깨지지 않게 BOM을 붙임
  DP.csv = (rows) =>
    '﻿' +
    rows
      .map((r) =>
        r
          .map((c) => {
            const s = c == null ? '' : String(c);
            return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
          })
          .join(',')
      )
      .join('\r\n');

  DP.download = function (data, name) {
    const url = typeof data === 'string' ? data : URL.createObjectURL(data);
    const a = DP.h('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    if (typeof data !== 'string') setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  // 표를 한글·워드에 붙일 수 있게 HTML과 텍스트를 함께 복사
  DP.copyRich = async function (html, text) {
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([text], { type: 'text/plain' }),
          }),
        ]);
        return true;
      }
    } catch (e) {}
    const box = DP.h('div', { html, style: { position: 'fixed', left: '-9999px', top: '0' } });
    document.body.append(box);
    const r = document.createRange();
    r.selectNodeContents(box);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e) {}
    sel.removeAllRanges();
    box.remove();
    return ok;
  };

  let toastT = null;
  DP.toast = function (msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 2800);
  };
})();
