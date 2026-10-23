/* 표: 찾기·걸러보기·정렬·열 고르기·표 모양, CSV 받기·복사 */
(function () {
  'use strict';
  const DP = window.DP;
  const { h, esc } = DP;

  const STYLES = [
    ['grid', '격자(보고서형)'],
    ['lines', '가로줄'],
    ['zebra', '줄무늬'],
  ];

  const cellText = (v) => (DP.parse.blank(v) ? '' : typeof v === 'number' ? DP.fmtNum(v) : String(v).trim());
  const cellCsv = (v) => (DP.parse.blank(v) ? '' : typeof v === 'number' ? DP.csvNum(v) : String(v).trim());

  DP.renderTable = function (host, block, opt) {
    opt = opt || {};
    const P = DP.parse;
    const key = 'tbl:' + opt.key;
    const st = Object.assign({ hidden: [], sort: null, style: 'grid', filters: {} }, DP.store.get(key) || {});
    const save = () => DP.store.set(key, st);
    let q = '';
    let view = { cols: [], rows: [] };

    // 걸러보기: 현지·문헌 칸은 있음/없음, 값 종류가 적은 글자 열은 값 고르기
    const fdefs = [];
    if (!opt.compact && block.rows.length > 8) {
      block.header.forEach((hd, j) => {
        if (fdefs.length >= 8) return;
        const t = block.types[j];
        const vals = block.rows.map((r) => r[j]);
        if (/^(현지|문헌)/.test(hd) || t === 'mark') {
          if (vals.some(P.filled) && vals.some((v) => !P.filled(v))) fdefs.push({ hd, j, kind: 'has' });
          return;
        }
        if (t !== 'text') return;
        const set = [...new Set(vals.filter(P.filled).map((v) => String(v).trim()))];
        if (set.length >= 2 && set.length <= 30) fdefs.push({ hd, j, kind: 'val', opts: set.sort(DP.natCmp) });
      });
    }
    Object.keys(st.filters).forEach((k) => {
      if (!fdefs.some((f) => f.hd === k)) delete st.filters[k];
    });

    const root = h('div', { class: 'tbl' + (opt.compact ? ' compact' : '') });
    const bar = h('div', { class: 'tbl-bar' });
    const info = h('span', { class: 'tbl-info' });
    if (!opt.compact && block.rows.length > 15) {
      bar.append(
        h('input', {
          type: 'search',
          class: 'tbl-q',
          placeholder: '찾기(국명·학명 등)',
          'aria-label': '표에서 찾기',
          oninput: (e) => {
            q = e.target.value.trim().toLowerCase();
            draw();
          },
        })
      );
    }
    fdefs.forEach((fd) => {
      const opts =
        fd.kind === 'has'
          ? [h('option', { value: 'has' }, '있음'), h('option', { value: 'none' }, '없음')]
          : fd.opts.map((o) => h('option', { value: o }, o));
      const sel = h(
        'select',
        {
          onchange: (e) => {
            st.filters[fd.hd] = e.target.value;
            save();
            draw();
          },
        },
        h('option', { value: '' }, '전체'),
        ...opts
      );
      sel.value = st.filters[fd.hd] || '';
      bar.append(h('label', { class: 'ctl' }, h('span', null, fd.hd), sel));
    });

    const styleSel = h(
      'select',
      {
        onchange: (e) => {
          st.style = e.target.value;
          save();
          draw();
        },
      },
      ...STYLES.map(([k, n]) => h('option', { value: k }, n))
    );
    styleSel.value = st.style;

    const colList = h('div', { class: 'col-list' });
    const colSum = h('summary', null, '열');
    block.header.forEach((hd) => {
      colList.append(
        h(
          'label',
          { class: 'chk' },
          h('input', {
            type: 'checkbox',
            checked: !st.hidden.includes(hd),
            onchange: (e) => {
              st.hidden = st.hidden.filter((x) => x !== hd);
              if (!e.target.checked) st.hidden.push(hd);
              save();
              draw();
            },
          }),
          hd
        )
      );
    });
    const colPick = h('details', { class: 'col-pick' }, colSum, colList);

    bar.append(
      h('label', { class: 'ctl' }, h('span', null, '표 모양'), styleSel),
      colPick,
      h('span', { class: 'grow' }),
      info,
      h('button', { type: 'button', class: 'btn sm', title: '보이는 행·열을 CSV로 받기', onclick: () => saveCSV() }, 'CSV'),
      h('button', { type: 'button', class: 'btn sm', title: '한글·워드에 붙여넣을 수 있게 복사', onclick: () => copy() }, '표 복사')
    );

    const scroller = h('div', { class: 'tbl-scroll' });
    scroller.addEventListener('click', (e) => {
      const th = e.target.closest('th[data-c]');
      if (!th) return;
      const hd = block.header[+th.dataset.c];
      if (!st.sort || st.sort.col !== hd) st.sort = { col: hd, dir: 'asc' };
      else if (st.sort.dir === 'asc') st.sort.dir = 'desc';
      else st.sort = null;
      save();
      draw();
    });
    root.append(bar, scroller);
    host.append(root);

    function viewRows() {
      const all = block.rows.map((_, i) => i);
      let idx = all.filter((i) => !block.flags[i].total);
      const totals = all.filter((i) => block.flags[i].total);
      const active = fdefs.filter((fd) => st.filters[fd.hd]);
      if (q) idx = idx.filter((i) => block.rows[i].some((v) => !P.blank(v) && String(v).toLowerCase().includes(q)));
      active.forEach((fd) => {
        const want = st.filters[fd.hd];
        idx = idx.filter((i) => {
          const c = block.rows[i][fd.j];
          if (fd.kind === 'has') return want === 'has' ? P.filled(c) : !P.filled(c);
          return String(c == null ? '' : c).trim() === want;
        });
      });
      if (st.sort) {
        const j = block.header.indexOf(st.sort.col);
        if (j >= 0) {
          const t = block.types[j];
          const key = (v) => (t === 'fs' ? (P.parseFS(v) || {}).sp : t === 'num' || t === 'dash' ? P.toNum(v) : v);
          idx.sort((a, b) => {
            const x = block.rows[a][j];
            const y = block.rows[b][j];
            const bx = !P.filled(x);
            const by = !P.filled(y);
            if (bx || by) return bx - by; // 빈칸은 늘 아래로
            const kx = key(x);
            const ky = key(y);
            const c = typeof kx === 'number' && typeof ky === 'number' ? kx - ky : DP.natCmp(kx, ky);
            return st.sort.dir === 'desc' ? -c : c;
          });
        }
      }
      // 걸러 본 상태에서는 합계 행이 맞지 않으므로 숨김
      return idx.concat(q || active.length ? [] : totals);
    }

    const sci = (j) => /학명|scientific/i.test(block.header[j]);
    function cls(j) {
      const t = block.types[j];
      return t === 'num' || t === 'fs' || t === 'dash' ? 'n' : t === 'mark' ? 'm' : sci(j) ? 'sci' : '';
    }

    function draw() {
      const cols = block.header.map((_, j) => j).filter((j) => !st.hidden.includes(block.header[j]));
      const rows = viewRows();
      let s = '<table class="t-' + st.style + '"><thead><tr>';
      cols.forEach((j) => {
        const hd = block.header[j];
        const so = st.sort && st.sort.col === hd ? (st.sort.dir === 'asc' ? ' ▲' : ' ▼') : '';
        s += '<th data-c="' + j + '" class="' + cls(j) + '" title="눌러서 정렬">' + esc(hd) + '<span class="so">' + so + '</span></th>';
      });
      s += '</tr></thead><tbody>';
      rows.forEach((i) => {
        const r = block.rows[i];
        const f = block.flags[i];
        s += '<tr' + (f.total ? ' class="total"' : '') + '>';
        cols.forEach((j) => {
          let c = cls(j);
          if (j === block.catCol && f.sub) c += ' sub';
          s += '<td' + (c ? ' class="' + c.trim() + '"' : '') + '>' + esc(cellText(r[j])) + '</td>';
        });
        s += '</tr>';
      });
      if (!rows.length) s += '<tr><td class="none" colspan="' + Math.max(1, cols.length) + '">' + (block.rows.length ? '맞는 행이 없습니다.' : '자료 행이 없습니다.') + '</td></tr>';
      s += '</tbody></table>';
      scroller.innerHTML = s;
      colSum.textContent = '열 ' + cols.length + '/' + block.header.length;
      info.textContent = rows.length === block.rows.length ? block.rows.length + '행' : block.rows.length + '행 중 ' + rows.length + '행';
      view = { cols, rows };
    }

    function matrix(fmt) {
      return [view.cols.map((j) => block.header[j])].concat(view.rows.map((i) => view.cols.map((j) => fmt(block.rows[i][j]))));
    }

    function saveCSV() {
      DP.download(new Blob([DP.csv(matrix(cellCsv))], { type: 'text/csv;charset=utf-8' }), DP.safeName(opt.name || '표') + '.csv');
    }

    async function copy() {
      const m = matrix(cellText);
      const grid = st.style === 'grid';
      const bd = '1px solid #000';
      const cell = (txt, j, head, last) => {
        const t = block.types[view.cols[j]];
        const align = head ? 'center' : t === 'num' || t === 'fs' || t === 'dash' ? 'right' : t === 'mark' ? 'center' : 'left';
        const b = grid
          ? 'border:' + bd + ';'
          : (head ? 'border-top:' + bd + ';border-bottom:' + bd + ';' : '') + (last ? 'border-bottom:' + bd + ';' : '');
        const it = !head && sci(view.cols[j]) ? 'font-style:italic;' : '';
        return (
          '<' + (head ? 'th' : 'td') + ' style="' + b + it + 'padding:2px 6px;text-align:' + align + ';' + (head ? 'background:#f2f2f2;font-weight:bold;' : '') + '">' + esc(txt) + '</' + (head ? 'th' : 'td') + '>'
        );
      };
      const html =
        '<table style="border-collapse:collapse;font-size:10pt;">' +
        m.map((r, i) => '<tr>' + r.map((c, j) => cell(c, j, i === 0, i === m.length - 1)).join('') + '</tr>').join('') +
        '</table>';
      const text = m.map((r) => r.join('\t')).join('\n');
      const ok = await DP.copyRich(html, text);
      DP.toast(ok ? '표를 복사했습니다. 한글·워드·엑셀에 붙여넣으세요.' : '복사하지 못했습니다. CSV로 받아 주세요.');
    }

    draw();
    return { el: root, redraw: draw, csvRows: () => matrix(cellCsv) };
  };
})();
