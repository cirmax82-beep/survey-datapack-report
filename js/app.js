/* 화면: 파일 불러오기(브라우저 안에서만), 시트 목록, 보기 설정 */
(function () {
  'use strict';
  const DP = window.DP;
  const { h } = DP;
  const $ = (s) => document.querySelector(s);

  const DEF = { chartW: 100, chartH: 400, font: 14, tableFont: 13, res: 2, palette: 'cb', decal: false, showTitle: true, watch: true };
  DP.settings = Object.assign({}, DEF, DP.store.get('settings') || {});

  let model = null;
  let cur = { key: null, round: null };
  let cards = [];
  DP.activeCards = () => cards;
  let handle = null;
  let lastMod = 0;
  let watchT = null;

  /* ── 파일 핸들 보관(다시 읽기용, 크롬·엣지) ── */
  const idb = {
    open() {
      return new Promise((res, rej) => {
        const r = indexedDB.open('dpv', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    },
    async get(k) {
      try {
        const db = await this.open();
        return await new Promise((res) => {
          const q = db.transaction('kv').objectStore('kv').get(k);
          q.onsuccess = () => res(q.result || null);
          q.onerror = () => res(null);
        });
      } catch (e) {
        return null;
      }
    },
    async set(k, v) {
      try {
        const db = await this.open();
        db.transaction('kv', 'readwrite').objectStore('kv').put(v, k);
      } catch (e) {}
    },
  };

  function setHandle(fh) {
    handle = fh || null;
    if (handle) idb.set('handle', handle);
    $('#btn-reread').hidden = !handle;
    $('#watch-wrap').hidden = !handle;
    startWatch();
  }

  async function readFile(file, fh, quiet) {
    let raw;
    try {
      raw = DP.readWorkbook(await file.arrayBuffer(), file.name);
    } catch (e) {
      if (!quiet) DP.toast('엑셀을 읽지 못했습니다: ' + (e.message || e));
      return false;
    }
    raw.lastModified = file.lastModified;
    lastMod = file.lastModified;
    if (fh !== undefined) setHandle(fh);
    useRaw(raw);
    DP.toast(file.name + ' — 다시 그렸습니다.');
    return true;
  }

  function useRaw(raw, restored) {
    try {
      model = DP.buildModel(raw);
    } catch (e) {
      console.error(e);
      DP.toast('엑셀 구조를 읽지 못했습니다.');
      return;
    }
    if (!restored && !DP.store.set('wb', raw)) DP.toast('파일이 커서 다음 방문 때는 다시 불러와야 합니다.');
    const when = new Date(raw.loadedAt);
    $('#file-info').textContent =
      raw.fileName + ' · ' + when.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + (restored ? ' 불러온 것' : ' 읽음');
    $('#file-info').title = '시트 ' + raw.sheets.length + '개';
    $('#setbar').hidden = false;
    $('#side').hidden = false;
    document.body.classList.add('has-data');
    renderNav();
    const want = decodeURIComponent(location.hash.replace(/^#g=/, ''));
    const key = model.groups.some((g) => g.key === want) ? want : model.groups.some((g) => g.key === cur.key) ? cur.key : model.groups[0] && model.groups[0].key;
    if (key) go(key, cur.key === key ? cur.round : null, true);
  }

  async function openFile() {
    if (window.showOpenFilePicker) {
      try {
        const [fh] = await window.showOpenFilePicker({
          types: [
            {
              description: '엑셀 파일',
              accept: {
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
                'application/vnd.ms-excel.sheet.macroEnabled.12': ['.xlsm'],
                'application/vnd.ms-excel': ['.xls'],
              },
            },
          ],
        });
        await readFile(await fh.getFile(), fh);
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    $('#file-input').click();
  }

  async function reread() {
    if (!handle) return openFile();
    try {
      let p = await handle.queryPermission({ mode: 'read' });
      if (p !== 'granted') p = await handle.requestPermission({ mode: 'read' });
      if (p !== 'granted') return;
      await readFile(await handle.getFile(), handle);
    } catch (e) {
      DP.toast('파일을 다시 읽지 못했습니다. 엑셀 불러오기로 다시 골라 주세요.');
    }
  }

  // 엑셀에서 저장하면 자동으로 다시 그림(파일 핸들이 있을 때)
  function startWatch() {
    clearInterval(watchT);
    $('#chk-watch').checked = !!DP.settings.watch;
    if (!handle || !DP.settings.watch) return;
    watchT = setInterval(async () => {
      if (document.hidden || !handle) return;
      try {
        if ((await handle.queryPermission({ mode: 'read' })) !== 'granted') return;
        const f = await handle.getFile();
        if (f.lastModified !== lastMod) await readFile(f, undefined, true);
      } catch (e) {}
    }, 2500);
  }

  /* ── 시트 목록 ── */
  function rowsOf(g) {
    return g.items.reduce((a, it) => a + it.blocks.reduce((x, b) => x + b.rows.length, 0), 0);
  }

  function renderNav() {
    const nav = $('#nav');
    nav.replaceChildren(
      ...model.groups.map((g) =>
        h(
          'a',
          { href: '#g=' + encodeURIComponent(g.key), class: 'nav-i' + (rowsOf(g) ? '' : ' empty'), 'data-k': g.key, title: g.items.map((i) => i.sheetName).join(', ') },
          h('span', { class: 'nav-n' }, g.num != null ? String(g.num) : '·'),
          h('span', { class: 'nav-t' }, g.title),
          g.items.length > 1 ? h('span', { class: 'nav-r' }, g.items.map((i) => i.label).join('·')) : null,
          rowsOf(g) ? null : h('span', { class: 'nav-r' }, '빈 시트')
        )
      )
    );
    const sel = $('#nav-sel');
    sel.replaceChildren(...model.groups.map((g) => h('option', { value: g.key }, (g.num != null ? g.num + '. ' : '') + g.title)));
  }

  function go(key, round, force) {
    const g = model && model.groups.find((x) => x.key === key);
    if (!g) return;
    const labels = g.items.map((i) => i.label);
    const canCompare = DP.views.compare(g).length > 0;
    const saved = DP.store.get('round:' + key);
    if (round == null) round = saved;
    if (!(labels.includes(round) || (round === 'compare' && canCompare))) round = labels[0];
    if (!force && cur.key === key && cur.round === round) return;
    cur = { key, round };
    DP.store.set('round:' + key, round);
    const hash = '#g=' + encodeURIComponent(key);
    if (location.hash !== hash) history.replaceState(null, '', hash);
    document.querySelectorAll('.nav-i').forEach((a) => a.classList.toggle('on', a.dataset.k === key));
    $('#nav-sel').value = key;
    renderPage(g, canCompare);
  }

  function renderPage(g, canCompare) {
    cards.forEach((c) => c.dispose());
    cards = [];
    const main = $('#main');
    main.replaceChildren();
    const compare = cur.round === 'compare';
    const item = g.items.find((i) => i.label === cur.round) || g.items[0];
    const head = h(
      'div',
      { class: 'page-head' },
      h('h2', null, (g.num != null ? g.num + '. ' : '') + g.title),
      h('div', { class: 'page-sub' }, '시트: ' + (compare ? g.items.map((i) => i.sheetName).join(', ') : item.sheetName))
    );
    if (g.items.length > 1) {
      const tab = (val, txt) =>
        h('button', { type: 'button', role: 'tab', class: 'tab' + (cur.round === val ? ' on' : ''), 'aria-selected': cur.round === val ? 'true' : 'false', onclick: () => go(g.key, val) }, txt);
      head.append(h('div', { class: 'tabs', role: 'tablist' }, ...g.items.map((i) => tab(i.label, i.label)), canCompare ? tab('compare', '차수 비교') : null));
    }
    main.append(head);

    const sheetTitle = g.title + (g.items.length > 1 ? ' ' + (compare ? '차수비교' : cur.round) : '');
    const res = compare ? { cards: DP.views.compare(g) } : DP.views.build(g, item);
    if (res.tiles && res.tiles.length) {
      main.append(
        h('div', { class: 'tiles' }, ...res.tiles.map(([k, v]) => h('div', { class: 'tile' }, h('div', { class: 'tile-v' }, DP.fmtNum(v)), h('div', { class: 'tile-k' }, k))))
      );
    }
    const grid = h('div', { class: 'cards' });
    main.append(grid);
    res.cards.forEach((spec) => {
      const c = new DP.Card(spec, { groupKey: g.key, sheetTitle });
      cards.push(c);
      c.mount(grid);
    });

    // 시트를 다시 짠 표(예: 지점 × 차수)
    (res.tables || []).forEach((t) => {
      const sec = h('section', { class: 'tbl-sec' }, h('h3', null, t.title));
      main.append(sec);
      DP.renderTable(sec, t.block, { key: g.key + ':' + t.key, name: sheetTitle + '_' + t.title });
    });

    if (!compare) {
      if (!item.blocks.length) main.append(h('p', { class: 'empty' }, '빈 시트입니다.'));
      item.blocks.forEach((b, bi) => {
        const multi = item.blocks.length > 1;
        const sec = h('section', { class: 'tbl-sec' }, h('h3', null, multi ? '표 ' + (bi + 1) + '. ' + b.header[b.catCol] : '표'));
        if (!b.rows.length) sec.append(h('p', { class: 'empty' }, '이번 파일의 이 시트에는 머리글만 있고 자료 행이 없습니다.'));
        main.append(sec);
        DP.renderTable(sec, b, { key: g.key + ':' + bi, name: sheetTitle + (multi ? '_표' + (bi + 1) : '') });
      });
    }
    main.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  /* ── 보기 설정 ── */
  const OUT = { chartW: (v) => v + '%', chartH: (v) => v + 'px', font: (v) => v + 'px', tableFont: (v) => v + 'px' };
  let drawT = null;
  function applySettings(k) {
    DP.store.set('settings', DP.settings);
    document.documentElement.style.setProperty('--tbl-font', DP.settings.tableFont + 'px');
    if (k === 'tableFont') return;
    clearTimeout(drawT);
    drawT = setTimeout(() => cards.forEach((c) => c.draw()), 50);
  }
  function syncSettingInputs() {
    document.querySelectorAll('[data-set]').forEach((inp) => {
      const k = inp.dataset.set;
      if (inp.type === 'checkbox') inp.checked = !!DP.settings[k];
      else inp.value = DP.settings[k];
      const out = document.querySelector('[data-out="' + k + '"]');
      if (out) out.textContent = OUT[k] ? OUT[k](DP.settings[k]) : '';
    });
  }
  function bindSettings() {
    const pal = document.querySelector('[data-set="palette"]');
    if (!DP.PALETTES[DP.settings.palette]) DP.settings.palette = DEF.palette;
    Object.entries(DP.PALETTES).forEach(([k, p]) => pal.append(h('option', { value: k }, p.name)));
    document.querySelectorAll('[data-set]').forEach((inp) => {
      const k = inp.dataset.set;
      inp.addEventListener('input', () => {
        DP.settings[k] = inp.type === 'checkbox' ? inp.checked : inp.type === 'range' || k === 'res' ? +inp.value : inp.value;
        const out = document.querySelector('[data-out="' + k + '"]');
        if (out && OUT[k]) out.textContent = OUT[k](DP.settings[k]);
        applySettings(k);
      });
    });
    syncSettingInputs();
    applySettings('tableFont');
    $('#btn-reset').addEventListener('click', () => {
      DP.settings = Object.assign({}, DEF, { watch: DP.settings.watch });
      syncSettingInputs();
      applySettings();
      cards.forEach((c) => c.draw());
    });
    $('#btn-clear').addEventListener('click', () => {
      if (!confirm('모든 그래프·표에서 고른 종류·항목·정렬을 처음 상태로 되돌릴까요?')) return;
      DP.store.clear('card:');
      DP.store.clear('tbl:');
      DP.store.clear('round:');
      if (model) go(cur.key, null, true);
    });
  }

  /* ── 시작 ── */
  function init() {
    bindSettings();
    $('#btn-open').addEventListener('click', openFile);
    $('#btn-reread').addEventListener('click', reread);
    $('#chk-watch').addEventListener('change', (e) => {
      DP.settings.watch = e.target.checked;
      DP.store.set('settings', DP.settings);
      startWatch();
    });
    $('#file-input').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) readFile(f, null);
      e.target.value = '';
    });
    $('#nav-sel').addEventListener('change', (e) => go(e.target.value));
    window.addEventListener('hashchange', () => {
      const k = decodeURIComponent(location.hash.replace(/^#g=/, ''));
      if (model && k && k !== cur.key) go(k);
    });

    // 끌어다 놓기
    const drop = $('#drop');
    let depth = 0;
    const isFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    document.addEventListener('dragenter', (e) => {
      if (!isFiles(e)) return;
      depth++;
      drop.hidden = false;
    });
    document.addEventListener('dragleave', () => {
      depth = Math.max(0, depth - 1);
      if (!depth) drop.hidden = true;
    });
    document.addEventListener('dragover', (e) => {
      if (isFiles(e)) e.preventDefault();
    });
    document.addEventListener('drop', async (e) => {
      if (!isFiles(e)) return;
      e.preventDefault();
      depth = 0;
      drop.hidden = true;
      const f = e.dataTransfer.files[0];
      const it = e.dataTransfer.items && e.dataTransfer.items[0];
      // 핸들은 놓는 순간에 받아야 함
      const hp = it && it.getAsFileSystemHandle ? it.getAsFileSystemHandle().catch(() => null) : Promise.resolve(null);
      if (!f) return;
      const fh = await hp;
      readFile(f, fh && fh.kind === 'file' ? fh : null);
    });

    const raw = DP.store.get('wb');
    if (raw && raw.sheets) {
      lastMod = raw.lastModified || 0;
      useRaw(raw, true);
    }
    idb.get('handle').then((fh) => {
      if (fh && !handle) setHandle(fh);
    });
    // 웹 글꼴이 늦게 오면 그래프 글자를 다시 맞춤
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => cards.forEach((c) => c.draw()));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
