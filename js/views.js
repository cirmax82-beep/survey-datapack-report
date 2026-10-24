/* 시트별 그래프 구성. 시트 이름(번호·차수 뺀 부분)으로 고르고, 모르는 시트는 숫자 열로 일반 구성 */
(function () {
  'use strict';
  const DP = window.DP;
  const P = DP.parse;

  const col = (b, re) => b.header.findIndex((hd) => re.test(hd));
  const str = (v) => (P.blank(v) ? '' : String(v).trim());
  const dataRows = (b) => b.rows.filter((_, i) => !b.flags[i].total);
  // 분류군은 보고서 순서대로(모르는 이름은 뒤에 나온 순서대로)
  const TAXA = ['식물상', '식물', '포유류', '조류', '양서파충류', '양서류', '파충류', '육상곤충류', '곤충류', '어류', '저서성대형무척추동물', '저서무척추동물'];
  const taxRank = (v) => (TAXA.indexOf(v) + 1 || 99);
  const distinct = (b, j) => {
    const out = [];
    if (j < 0) return out;
    dataRows(b).forEach((r) => {
      const v = str(r[j]);
      if (v && !P.isDash(v) && !out.includes(v)) out.push(v);
    });
    if (/분류군/.test(b.header[j])) out.sort((a, c) => taxRank(a) - taxRank(c));
    return out;
  };
  const uniq = (list) => {
    const n = new Map();
    return list.map((l) => {
      const k = (n.get(l) || 0) + 1;
      n.set(l, k);
      return k > 1 ? l + ' (' + k + ')' : l;
    });
  };
  const opts = (list) => list.map((v) => ({ value: v, label: v }));
  const nice = (hd) => hd.replace(/_/g, ' ');
  // 나눠 세는 그래프(쌓기 등)는 계열을 빼면 합이 틀어지므로 처음엔 모두(8개까지) 켬
  const ALL = (names) => names.slice(0, 8);

  /* ── 시트 표를 그대로 그리는 카드 ── */
  function fromTable(b, o = {}) {
    return () => ({
      catHeader: b.header[b.catCol],
      categories: o.label ? uniq(b.rows.map(o.label)) : b.labels.slice(),
      catFlags: b.flags,
      catInfo: o.info ? b.rows.map(o.info) : null,
      series: b.numCols.map((c) => ({ name: b.header[c], values: b.rows.map((r) => P.numOf(r[c], b.types[c])) })),
    });
  }
  function tableCard(b, id, title, defaults, o) {
    if (!b || !b.rows.length || !b.numCols.length) return null;
    return { id, title, compute: fromTable(b, o), defaults: Object.assign({ type: 'bar' }, defaults), note: o && o.note };
  }

  function autoType(nCats, nSeries) {
    if (nSeries === 1 && nCats <= 6) return 'pie';
    return nCats > 12 ? 'hbar' : 'bar';
  }

  function generic(b, bi, title) {
    const out = [];
    if (!b.rows.length) return out;
    if (b.numCols.length) {
      const names = b.numCols.map((c) => b.header[c]);
      const cnt = names.filter((n) => !DP.isPct(n));
      const def = (cnt.length ? cnt : names).slice(0, 4);
      const nCats = b.flags.filter((f) => !f.total && !f.sub).length;
      const d = { type: autoType(nCats, def.length), series: def };
      if (nCats > 20) Object.assign(d, { sort: 'desc', topN: 20 });
      out.push(tableCard(b, 'b' + bi, title, d));
    }
    const marks = b.types.map((t, j) => (t === 'mark' ? j : -1)).filter((j) => j >= 0);
    if (marks.length >= 2) {
      out.push({
        id: 'm' + bi,
        title: title + ' — 열별 표시 수',
        defaults: { type: 'bar' },
        compute: () => ({
          catHeader: '열',
          categories: marks.map((j) => b.header[j]),
          series: [{ name: '표시된 행 수', values: marks.map((j) => dataRows(b).filter((r) => P.filled(r[j])).length) }],
        }),
      });
    }
    return out;
  }

  /* ── 출현종 목록(마스터)에서 세는 카드 ── */
  // 범위: 전체 목록 / 현지(차수별) / 문헌
  function scopes(b) {
    const field = b.header.map((hd, j) => (/^현지/.test(hd) ? j : -1)).filter((j) => j >= 0);
    const lit = b.header.findIndex((hd) => /^문헌\s*조사/.test(hd));
    const litN = b.header.map((hd, j) => (/^문헌\s*\d+$/.test(hd) ? j : -1)).filter((j) => j >= 0);
    const out = [{ name: '전체 목록', test: () => true }];
    if (field.length > 1) out.push({ name: '현지조사(전 차수)', test: (r) => field.some((j) => P.filled(r[j])), main: 'field' });
    field.forEach((j) => out.push({ name: nice(b.header[j]), test: (r) => P.filled(r[j]), main: field.length === 1 ? 'field' : null }));
    if (lit >= 0) out.push({ name: '문헌조사', test: (r) => P.filled(r[lit]), main: 'lit' });
    else if (litN.length) {
      out.push({ name: '문헌(전체)', test: (r) => litN.some((j) => P.filled(r[j])), main: 'lit' });
      litN.forEach((j) => out.push({ name: b.header[j], test: (r) => P.filled(r[j]) }));
    }
    return out;
  }
  const mainScopes = (sc) => {
    const m = sc.filter((s) => s.main).map((s) => s.name);
    return m.length ? m : ['전체 목록'];
  };
  const scopeExtra = (sc) => ({ key: 'scope', label: '범위', options: opts(sc.map((s) => s.name)), default: (sc.find((s) => s.main === 'field') || sc[0]).name });
  const pickScope = (sc, name) => sc.find((s) => s.name === name) || sc[0];

  function byExtra(b, choices) {
    const js = choices.map((re) => col(b, re)).filter((j) => j >= 0);
    return { js, extra: js.length > 1 ? { key: 'by', label: '기준', options: opts(js.map((j) => b.header[j])), default: b.header[js[0]] } : null };
  }
  function filterExtra(b, re, def) {
    const fj = re ? col(b, re) : -1;
    if (fj < 0) return { fj, extra: null };
    const vals = distinct(b, fj);
    return { fj, extra: { key: 'f', label: b.header[fj], options: opts(['전체'].concat(vals)), default: vals.includes(def) ? def : '전체' } };
  }

  // 기준 열 값별 종 수. 계열 = 범위(현지·문헌 등)
  function countCard(b, o) {
    const sc = scopes(b);
    const by = byExtra(b, o.choices || [o.group]);
    if (!by.js.length) return null;
    const fl = filterExtra(b, o.filter, o.filterDefault);
    const map = o.mapVal || ((v) => v);
    return {
      id: o.id,
      title: o.title,
      titleFn: by.extra ? (ex) => (ex.by ? ex.by + '별 ' : '') + (o.titleTail || '출현종수') + (ex.f && ex.f !== '전체' ? ' (' + ex.f + ')' : '') : null,
      extras: [by.extra, fl.extra].filter(Boolean),
      defaults: Object.assign({ series: mainScopes(sc) }, o.defaults),
      compute: (ex) => {
        const gj = by.extra ? b.header.indexOf(ex.by) : by.js[0];
        let rows = dataRows(b);
        if (fl.fj >= 0 && ex.f && ex.f !== '전체') rows = rows.filter((r) => str(r[fl.fj]) === ex.f);
        const key = (r) => {
          const v = str(r[gj]);
          return v && !P.isDash(v) ? map(v) : '';
        };
        const cats = [];
        rows.forEach((r) => {
          const g = key(r);
          if (g && !cats.includes(g)) cats.push(g);
        });
        if (o.order) cats.sort(o.order);
        const pos = new Map(cats.map((c, i) => [c, i]));
        return {
          catHeader: b.header[gj],
          categories: cats,
          series: sc.map((s) => {
            const v = cats.map(() => 0);
            rows.forEach((r) => {
              const g = key(r);
              if (pos.has(g) && s.test(r)) v[pos.get(g)]++;
            });
            return { name: s.name, values: v };
          }),
        };
      },
    };
  }

  // 현지·문헌 겹침: 모두 / 현지만 / 문헌만
  function overlapCard(b, o) {
    const field = b.header.map((hd, j) => (/^현지/.test(hd) ? j : -1)).filter((j) => j >= 0);
    const lit = b.header.findIndex((hd) => /^문헌\s*조사/.test(hd));
    const by = byExtra(b, o.choices);
    if (!field.length || lit < 0 || !by.js.length) return null;
    const kinds = ['현지·문헌 모두', '현지만', '문헌만'];
    return {
      id: o.id,
      title: o.title,
      extras: [by.extra].filter(Boolean),
      defaults: Object.assign({ type: 'stack', series: ALL }, o.defaults),
      compute: (ex) => {
        const gj = by.extra ? b.header.indexOf(ex.by) : by.js[0];
        const rows = dataRows(b);
        const cats = distinct(b, gj);
        const v = kinds.map(() => cats.map(() => 0));
        rows.forEach((r) => {
          const c = cats.indexOf(str(r[gj]));
          if (c < 0) return;
          const f = field.some((j) => P.filled(r[j]));
          const l = P.filled(r[lit]);
          if (f && l) v[0][c]++;
          else if (f) v[1][c]++;
          else if (l) v[2][c]++;
        });
        return { catHeader: b.header[gj], categories: cats, series: kinds.map((k, i) => ({ name: k, values: v[i] })) };
      },
    };
  }

  // 표시 열(희귀·특산…)별 종 수. 계열 = 범위
  function flagsCard(b, o) {
    const fl = o.flags.map((re) => col(b, re)).filter((j) => j >= 0);
    if (!fl.length) return null;
    const sc = scopes(b);
    return {
      id: o.id,
      title: o.title,
      defaults: { type: 'bar', series: mainScopes(sc) },
      compute: () => {
        const rows = dataRows(b);
        return {
          catHeader: '구분',
          categories: fl.map((j) => b.header[j]),
          series: sc.map((s) => ({ name: s.name, values: fl.map((j) => rows.filter((r) => P.filled(r[j]) && s.test(r)).length) })),
        };
      },
    };
  }

  // 분류군별 표시 열 수(법정보호종·교란·고유). 범위는 골라서
  function flagsByGroup(b, o) {
    const gj = col(b, o.group);
    const fl = o.flags.map((re) => col(b, re)).filter((j) => j >= 0);
    if (gj < 0 || !fl.length) return null;
    const sc = scopes(b);
    return {
      id: o.id,
      title: o.title,
      extras: [scopeExtra(sc)],
      defaults: { type: 'bar', series: ALL },
      compute: (ex) => {
        const s = pickScope(sc, ex.scope);
        const rows = dataRows(b).filter(s.test);
        const cats = distinct(b, gj);
        return {
          catHeader: b.header[gj],
          categories: cats,
          series: fl.map((j) => ({ name: b.header[j], values: cats.map((c) => rows.filter((r) => str(r[gj]) === c && P.filled(r[j])).length) })),
        };
      },
    };
  }

  // 비고처럼 쉼표로 여러 표시가 들어간 열: 표시별 종 수(표시는 해석하지 않고 그대로 셈)
  function tokenCard(b, o) {
    const j = col(b, o.col);
    if (j < 0 || !dataRows(b).some((r) => P.filled(r[j]))) return null;
    const sc = scopes(b);
    const split = (v) =>
      str(v)
        .split(/\s*[,，/]\s*/)
        .filter((t) => t && !P.isDash(t));
    return {
      id: o.id,
      title: o.title,
      note: o.note,
      defaults: { type: 'bar', series: mainScopes(sc), sort: 'desc' },
      compute: () => {
        const rows = dataRows(b);
        const cats = [];
        rows.forEach((r) => split(r[j]).forEach((t) => !cats.includes(t) && cats.push(t)));
        cats.sort(DP.natCmp);
        return {
          catHeader: b.header[j] + ' 표시',
          categories: cats,
          series: sc.map((s) => ({ name: s.name, values: cats.map((t) => rows.filter((r) => s.test(r) && split(r[j]).includes(t)).length) })),
        };
      },
    };
  }

  // 현지조사 칸에 숫자(개체수)가 적힌 경우: 종별 합
  function sumCard(b, o) {
    const field = b.header.map((hd, j) => (/^현지/.test(hd) ? j : -1)).filter((j) => j >= 0);
    const lj = col(b, o.label);
    const isN = (v) => typeof v === 'number' || (typeof v === 'string' && /^\s*\d+(\.\d+)?\s*$/.test(v));
    const rowsN = dataRows(b).filter((r) => field.some((j) => isN(r[j])));
    if (!field.length || lj < 0 || !rowsN.length) return null;
    const fj = col(b, o.filter);
    let def = '전체';
    if (fj >= 0) {
      const cnt = new Map();
      rowsN.forEach((r) => cnt.set(str(r[fj]), (cnt.get(str(r[fj])) || 0) + 1));
      def = [...cnt.entries()].sort((a, c) => c[1] - a[1])[0][0];
    }
    const extras = fj >= 0 ? [{ key: 'f', label: b.header[fj], options: opts(['전체'].concat(distinct(b, fj).filter((v) => rowsN.some((r) => str(r[fj]) === v)))), default: def }] : [];
    return {
      id: o.id,
      title: o.title,
      titleFn: (ex) => o.title + (ex.f && ex.f !== '전체' ? ' (' + ex.f + ')' : ''),
      note: '현지조사 칸에 숫자로 적힌 값만 더했습니다.',
      extras,
      defaults: { type: 'hbar', sort: 'desc', topN: 15 },
      compute: (ex) => {
        let rows = rowsN;
        if (fj >= 0 && ex.f && ex.f !== '전체') rows = rows.filter((r) => str(r[fj]) === ex.f);
        const cats = [];
        rows.forEach((r) => {
          const n = str(r[lj]);
          if (n && !cats.includes(n)) cats.push(n);
        });
        return {
          catHeader: b.header[lj],
          categories: cats,
          series: field.map((j) => ({
            name: nice(b.header[j]),
            values: cats.map((c) => {
              let t = null;
              rows.forEach((r) => {
                if (str(r[lj]) === c && isN(r[j])) t = (t || 0) + parseFloat(r[j]);
              });
              return t;
            }),
          })),
        };
      },
    };
  }

  // 교차표: 행 기준 × 열 기준, 값 = 종 수 또는 val(r)의 합
  function pivotCard(b, o) {
    const rj = col(b, o.rows);
    const cj = typeof o.cols === 'function' ? -1 : col(b, o.cols);
    if (rj < 0 || (typeof o.cols !== 'function' && cj < 0)) return null;
    const ck = typeof o.cols === 'function' ? o.cols : (r) => str(r[cj]);
    const sc = o.scope ? scopes(b) : null;
    return {
      id: o.id,
      title: o.title,
      titleFn: o.titleFn,
      extras: [sc && sc.length > 1 ? scopeExtra(sc) : null].concat(o.extras || []).filter(Boolean),
      defaults: Object.assign({ type: 'bar', series: ALL }, o.defaults),
      compute: (ex) => {
        let rows = dataRows(b);
        if (sc) rows = rows.filter(pickScope(sc, ex.scope).test);
        const cats = distinct(b, rj);
        const sers = [];
        rows.forEach((r) => {
          const k = ck(r);
          if (k && !sers.includes(k)) sers.push(k);
        });
        if (o.colOrder) sers.sort((a, c) => (o.colOrder.indexOf(a) + 1 || 99) - (o.colOrder.indexOf(c) + 1 || 99));
        if (o.colSort) sers.sort(o.colSort);
        const val = o.metric ? o.metric(ex) : () => 1;
        return {
          catHeader: b.header[rj],
          categories: cats,
          series: sers.map((sname) => ({
            name: sname,
            values: cats.map((c) => {
              const hit = rows.filter((r) => str(r[rj]) === c && ck(r) === sname);
              if (!hit.length) return o.metric ? null : 0;
              return hit.reduce((a, r) => a + (val(r) || 0), 0);
            }),
          })),
        };
      },
    };
  }

  // 확인 출처 열(현지·문헌N)별 종 수, 쌓는 기준은 분류군 등
  function sourceCard(b, o) {
    const src = b.header.map((hd, j) => (/^(현지|문헌\s*\d)/.test(hd) ? j : -1)).filter((j) => j >= 0);
    const gj = col(b, o.group);
    if (src.length < 2 || gj < 0) return null;
    return {
      id: o.id,
      title: o.title,
      defaults: { type: 'stack', series: ALL },
      compute: () => {
        const rows = dataRows(b);
        const groups = distinct(b, gj);
        return {
          catHeader: '확인 출처',
          categories: src.map((j) => nice(b.header[j])),
          series: groups.map((g) => ({ name: g, values: src.map((j) => rows.filter((r) => str(r[gj]) === g && P.filled(r[j])).length) })),
        };
      },
    };
  }

  /* ── 시트별 구성 ── */
  function sumCol(b, re) {
    const j = col(b, re);
    return j < 0 ? null : dataRows(b).reduce((a, r) => a + (P.numOf(r[j], b.types[j]) || 0), 0);
  }

  function overview(item) {
    const [b0, b1] = item.blocks;
    const cards = [];
    let tiles = [];
    if (b0 && b0.rows.length) {
      cards.push(tableCard(b0, 'fgs', '분류군별 현지조사 과·속·종 수', { type: 'bar', series: [/^현지_?과/, /^현지_?속/, /^현지_?종/] }));
      cards.push(tableCard(b0, 'fl', '분류군별 현지·문헌 출현종수', { type: 'bar', series: [/^현지_?종/, /^문헌_?종/] }));
      cards.push(tableCard(b0, 'pie', '분류군별 출현종 구성', { type: 'pie', series: [/^현지_?종/, /^문헌_?종/] }));
      cards.push(tableCard(b0, 'legal', '분류군별 법정보호종·교란종·고유종 수', { type: 'bar', series: [/법정보호종_?현지/, /교란종_?현지/, /고유종_?현지/] }));
      tiles = [
        ['현지 출현종', sumCol(b0, /^현지_?종/)],
        ['문헌 출현종', sumCol(b0, /^문헌_?종/)],
        ['법정보호종(현지)', sumCol(b0, /법정보호종_?현지/)],
        ['교란종(현지)', sumCol(b0, /교란종_?현지/)],
        ['고유종(현지)', sumCol(b0, /고유종_?현지/)],
      ].filter((t) => t[1] != null);
    }
    if (b1 && b1.rows.length) cards.push(tableCard(b1, 'plant', b1.header[b1.catCol] + '별 종수', { type: 'bar' }));
    item.blocks.slice(2).forEach((b, i) => cards.push(...generic(b, i + 2, b.header[b.catCol] || '표')));
    return { cards, tiles };
  }

  function plantMaster(item) {
    const b = item.blocks[0];
    if (!b || !b.rows.length) return null;
    return {
      cards: [
        countCard(b, { id: 'fam', title: '과별 출현종수', choices: [/^과$/, /^속$/, /^대분류$/, /^생활형$/], defaults: { type: 'hbar', sort: 'desc', topN: 15 } }),
        countCard(b, { id: 'major', title: '대분류별 출현종수', group: /^대분류$/, defaults: { type: 'pie' } }),
        countCard(b, { id: 'life', title: '생활형별 출현종수', group: /^생활형$/, defaults: { type: 'bar' } }),
        overlapCard(b, { id: 'overlap', title: '현지·문헌 확인 종수', choices: [/^대분류$/, /^생활형$/, /^과$/] }),
        flagsCard(b, { id: 'special', title: '특이 식물 종수', flags: [/^희귀/, /^특산/, /특별산림/, /^귀화/] }),
        tokenCard(b, { id: 'note', title: '비고 표시별 종수', col: /^비고$/, note: '비고 칸의 표시(쉼표로 나눔)를 해석하지 않고 그대로 셉니다.' }),
      ],
    };
  }

  const ARRIVAL = { Res: '텃새(Res)', SV: '여름철새(SV)', WV: '겨울철새(WV)', PM: '나그네새(PM)', Vag: '길잃은새(Vag)' };
  const ARRIVAL_ORDER = Object.values(ARRIVAL);

  function animalMaster(item) {
    const b = item.blocks[0];
    if (!b || !b.rows.length) return null;
    return {
      cards: [
        countCard(b, { id: 'taxon', title: '분류군별 출현종수', group: /^분류군$/, defaults: { type: 'bar' } }),
        overlapCard(b, { id: 'overlap', title: '분류군별 현지·문헌 확인 종수', choices: [/^분류군$/], defaults: { type: 'hstack' } }),
        countCard(b, {
          id: 'order',
          title: '목별 출현종수',
          choices: [/^목$/, /^과$/, /^강$/],
          filter: /^분류군$/,
          filterDefault: '조류',
          defaults: { type: 'hbar', sort: 'desc', topN: 15 },
        }),
        countCard(b, {
          id: 'arrival',
          title: '조류 도래유형별 출현종수',
          group: /도래/,
          mapVal: (v) => ARRIVAL[v] || v,
          order: (a, c) => (ARRIVAL_ORDER.indexOf(a) + 1 || 99) - (ARRIVAL_ORDER.indexOf(c) + 1 || 99),
          defaults: { type: 'pie' },
        }),
        flagsByGroup(b, { id: 'legal', title: '분류군별 법정보호종·교란종·고유종 수', group: /^분류군$/, flags: [/법정보호/, /교란/, /고유/] }),
        sumCard(b, { id: 'abund', title: '현지조사 개체수 상위 종', label: /^국명$/, filter: /^분류군$/ }),
        tokenCard(b, { id: 'note', title: '비고 표시별 종수', col: /^비고$/, note: '비고 칸의 표시(쉼표로 나눔)를 해석하지 않고 그대로 셉니다.' }),
      ],
    };
  }

  const GRADES = ['멸종위기 Ⅰ급', '멸종위기 Ⅱ급', '천연기념물(멸종위기 외)'];
  function gradeClass(v) {
    const s = str(v)
      .replace(/II\s*급|2\s*급/g, 'Ⅱ급')
      .replace(/I\s*급|1\s*급/g, 'Ⅰ급');
    if (/Ⅰ급/.test(s)) return GRADES[0];
    if (/Ⅱ급/.test(s)) return GRADES[1];
    if (/천/.test(s)) return GRADES[2];
    return s || '기타';
  }

  function protectedSheet(item) {
    const b = item.blocks[0];
    if (!b || !b.rows.length) return null;
    const gj = col(b, /등급/);
    if (gj < 0) return null;
    return {
      cards: [
        pivotCard(b, { id: 'grade', title: '분류군별 법정보호종 수(등급별)', rows: /^분류군$/, cols: (r) => gradeClass(r[gj]), colOrder: GRADES, scope: true, defaults: { type: 'stack' } }),
        sourceCard(b, { id: 'src', title: '확인 출처별 법정보호종 수', group: /^분류군$/ }),
      ],
    };
  }

  function specialSheet(item) {
    const b = item.blocks[0];
    if (!b || !b.rows.length) return null;
    return {
      cards: [
        pivotCard(b, { id: 'kind', title: '분류군별 특이종 수', rows: /^분류군$/, cols: /^구분/, scope: true, defaults: { type: 'stack' } }),
        countCard(b, { id: 'bykind', title: '구분별 특이종 수', group: /^구분/, defaults: { type: 'bar' } }),
        sourceCard(b, { id: 'src', title: '확인 출처별 특이종 수', group: /^구분/ }),
      ],
    };
  }

  function litMaster(item) {
    const b = item.blocks[0];
    if (!b || !b.rows.length) return null;
    const nj = col(b, /문헌명|제목/);
    const taxa = b.header.map((_, j) => (j > Math.max(b.catCol, nj) && (b.types[j] === 'mark' || b.types[j] === 'empty') ? j : -1)).filter((j) => j >= 0);
    if (!taxa.length) return null;
    return {
      cards: [
        {
          id: 'taxa',
          title: '분류군별 참고 문헌 수',
          defaults: { type: 'bar' },
          compute: () => ({
            catHeader: '분류군',
            categories: taxa.map((j) => b.header[j]),
            series: [{ name: '문헌 수', values: taxa.map((j) => dataRows(b).filter((r) => P.filled(r[j])).length) }],
          }),
        },
        {
          id: 'perlit',
          title: '문헌별 다룬 분류군 수',
          defaults: { type: 'bar' },
          compute: () => ({
            catHeader: b.header[b.catCol],
            categories: b.labels.slice(),
            catFlags: b.flags,
            catInfo: nj >= 0 ? b.rows.map((r) => str(r[nj])) : null,
            series: [{ name: '분류군 수', values: b.rows.map((r) => taxa.filter((j) => P.filled(r[j])).length) }],
          }),
        },
      ],
    };
  }

  // 쉼표로 나열한 종 이름 수: '삵(Ⅱ급), 수달(Ⅰ급,천)' → 2 (괄호 안 쉼표는 무시)
  const countNames = (v) =>
    str(v)
      .split(/,(?![^()]*\))/)
      .map((s) => s.trim())
      .filter((s) => s && !P.isDash(s)).length;

  function litOccurrence(item) {
    const b = item.blocks[0];
    if (!b || !b.rows.length) return null;
    const tj = col(b, /^분류군$/);
    const kj = col(b, /^구분/);
    if (tj < 0 || kj < 0) return null;
    const metrics = [];
    b.header.forEach((hd, j) => {
      if (j === tj || j === kj) return;
      const t = b.types[j];
      const sp = /종수$/.test(hd) ? hd : hd + ' 종수';
      if (t === 'fs') {
        metrics.push({ value: hd + '|sp', label: hd + ' — 종수', title: sp }, { value: hd + '|fam', label: hd + ' — 과수', title: sp.replace(/종수$/, '과수') });
      } else if (t === 'num' || t === 'dash') metrics.push({ value: hd + '|n', label: hd, title: hd });
      else if (t === 'text') metrics.push({ value: hd + '|list', label: hd + ' — 종 수', title: sp });
    });
    if (!metrics.length) return null;
    const metric = (ex) => {
      const [hd, m] = String(ex.metric).split('|');
      const j = b.header.indexOf(hd);
      return (r) => {
        const v = r[j];
        if (!P.filled(v)) return 0;
        if (m === 'sp' || m === 'fam') {
          const f = P.parseFS(v);
          return f ? f[m] : 0;
        }
        if (m === 'n') return P.toNum(v) || 0;
        return countNames(v);
      };
    };
    const mtitle = (ex) => (metrics.find((m) => m.value === ex.metric) || metrics[0]).title;
    return {
      cards: [
        pivotCard(b, {
          id: 'pivot',
          title: '분류군·문헌별 출현종수',
          titleFn: (ex) => '분류군·문헌별 ' + mtitle(ex),
          rows: /^분류군$/,
          cols: /^구분/,
          // 문헌1·문헌2… 다음에 종합
          colSort: (a, c) => (/종합|전체/.test(a) ? 1 : 0) - (/종합|전체/.test(c) ? 1 : 0) || DP.natCmp(a, c),
          metric,
          extras: [{ key: 'metric', label: '값', options: metrics, default: metrics[0].value }],
          defaults: { type: 'bar' },
        }),
      ],
    };
  }

  function lifeformLabel(b) {
    const sj = col(b, /기호/);
    const nj = col(b, /명칭/);
    return (r) => {
      if (nj >= 0 && P.filled(r[nj])) return str(r[nj]) + (sj >= 0 && P.filled(r[sj]) ? '(' + str(r[sj]) + ')' : '');
      return str(r[sj >= 0 ? sj : b.catCol]);
    };
  }
  function lifeform(item) {
    const b = item.blocks[0];
    if (!b || !b.rows.length) return null;
    const o = { label: lifeformLabel(b) };
    return {
      label: o.label,
      cards: [
        tableCard(b, 'ratio', '생활형 구성비 비교(%)', { type: 'bar', series: [/^현지.*구성비/, /남한.*구성비/, /한반도.*구성비/, /Raunk/i] }, o),
        tableCard(b, 'count', '생활형별 출현종수', { type: 'pie', series: [/출현종수/] }, o),
        tableCard(b, 'diff', '남한 대비 구성비 차이(%p)', { type: 'bar', series: [/차이/] }, o),
      ],
    };
  }

  /* ── 지점 이름에 차수가 붙은 시트('1차_W-1', 'W-1_2차') → 지점 × 차수 ── */
  function splitRound(v) {
    const s = str(v);
    let m = s.match(/^(\d+)\s*차\s*[_\-.:\s]*\s*(\S.*)$/);
    if (m) return { round: m[1] + '차', site: m[2].trim() };
    m = s.match(/^(.*\S)\s*[_\-.\s(]\s*(\d+)\s*차\)?$/);
    if (m) return { round: m[2] + '차', site: m[1].trim() };
    return null;
  }
  function siteRounds(b) {
    const data = b.rows.map((r, i) => ({ r, i })).filter((x) => !b.flags[x.i].total);
    data.forEach((x) => (x.p = splitRound(x.r[b.catCol])));
    if (!data.length || data.some((x) => !x.p)) return null;
    const rounds = [...new Set(data.map((x) => x.p.round))].sort(DP.natCmp);
    const sites = [...new Set(data.map((x) => x.p.site))].sort(DP.natCmp);
    if (rounds.length < 2) return null;
    const get = (site, round) => {
      const x = data.find((d) => d.p.site === site && d.p.round === round);
      return x ? x.r : null;
    };
    return { rounds, sites, get };
  }

  // 지점(항목) × 차수(계열), 값 열은 골라서
  function siteRoundCard(b, sr, o) {
    const names = b.numCols.map((c) => b.header[c]);
    if (!names.length) return null;
    const def = names.find((n) => o.def && o.def.test(n)) || names[0];
    return {
      id: o.id,
      title: '지점·차수별 ' + def,
      titleFn: (ex) => '지점·차수별 ' + ex.metric,
      extras: [{ key: 'metric', label: '값', options: opts(names), default: def }],
      defaults: { type: 'bar', series: ALL },
      compute: (ex) => {
        const c = b.header.indexOf(ex.metric);
        return {
          catHeader: '조사지점',
          categories: sr.sites.slice(),
          catInfo: o.info
            ? sr.sites.map((s) =>
                sr.rounds
                  .map((rd) => {
                    const r = sr.get(s, rd);
                    const t = r && o.info(r, ex.metric);
                    return t ? rd + ' ' + t : '';
                  })
                  .filter(Boolean)
                  .join(' / ')
              )
            : null,
          series: sr.rounds.map((rd) => ({
            name: rd,
            values: sr.sites.map((s) => {
              const r = sr.get(s, rd);
              return r && c >= 0 ? P.numOf(r[c], b.types[c]) : null;
            }),
          })),
        };
      },
    };
  }

  // 보고서용 표: 지점 한 줄에 1차·2차 값을 나란히
  function siteRoundTable(b, sr) {
    const cols = b.header.map((_, j) => j).filter((j) => j !== b.catCol);
    const header = ['조사지점'].concat(...sr.rounds.map((rd) => cols.map((j) => rd + ' ' + b.header[j])));
    const rows = sr.sites.map((s) =>
      [s].concat(
        ...sr.rounds.map((rd) => {
          const r = sr.get(s, rd);
          return cols.map((j) => (r ? r[j] : null));
        })
      )
    );
    return { title: '지점 × 차수 표', key: 'site-round', block: P.analyze(header, rows) };
  }

  function dominance(item) {
    const b = item.blocks[0];
    if (!b || !b.rows.length) return { cards: [] };
    const d1 = col(b, /^우점종$/);
    const d2 = col(b, /^아우점종$/);
    const info = (r) =>
      [d1 >= 0 && P.filled(r[d1]) ? '우점종: ' + str(r[d1]) : '', d2 >= 0 && P.filled(r[d2]) ? '아우점종: ' + str(r[d2]) : ''].filter(Boolean).join(' / ');
    const cards = [];
    const tables = [];
    const sr = siteRounds(b);
    if (sr) {
      // 고른 값이 '우점종 개체수'면 툴팁에 그 차수의 우점종 이름
      const spInfo = (r, metric) => {
        const j = b.header.indexOf(metric.replace(/\s*개체수$/, ''));
        return j >= 0 && P.filled(r[j]) ? str(r[j]) : '';
      };
      cards.push(siteRoundCard(b, sr, { id: 'dom-round', def: /^우점종\s*개체수/, info: spInfo }));
      tables.push(siteRoundTable(b, sr));
    }
    cards.push(tableCard(b, 'dom', '지점별 우점종·아우점종 개체수', { type: 'bar', series: [/^우점종\s*개체수/, /^아우점종\s*개체수/] }, { info }));
    return { cards, tables };
  }

  function water(item) {
    const b = item.blocks[0];
    if (!b || !b.rows.length) return { cards: [] };
    const sr = siteRounds(b);
    const cards = [];
    const tables = [];
    if (sr) {
      const sj = col(b, /환경상태/);
      cards.push(siteRoundCard(b, sr, { id: 'idx-round', def: /^TESB/i, info: (r) => (sj >= 0 && P.filled(r[sj]) ? str(r[sj]) : '') }));
      tables.push(siteRoundTable(b, sr));
    }
    cards.push(tableCard(b, 'idx', '지점별 생물 지수', { type: 'bar', series: [/^TESB/i] }));
    ['환경상태', 'CLASS', '생물다양성', '관리수역'].forEach((nm) => {
      const j = col(b, new RegExp('^' + nm, 'i'));
      if (j < 0) return;
      cards.push({
        id: 'cnt-' + nm,
        title: b.header[j] + '별 지점 수',
        defaults: { type: 'bar', series: ALL },
        compute: () => {
          const cats = distinct(b, j).sort(DP.natCmp);
          const count = (test) => cats.map((c) => dataRows(b).filter((r) => str(r[j]) === c && test(r)).length);
          // 차수가 있으면 차수별로 나눠 셈
          const series = sr
            ? sr.rounds.map((rd) => ({ name: rd, values: count((r) => (splitRound(r[b.catCol]) || {}).round === rd) }))
            : [{ name: '지점 수', values: count(() => true) }];
          return { catHeader: b.header[j], categories: cats, series };
        },
      });
    });
    return { cards, tables };
  }

  function vascular(item) {
    const b = item.blocks[0];
    if (!b || !b.rows.length) return null;
    const ti = b.flags.findIndex((f) => f.total);
    return {
      cards: [
        tableCard(b, 'fgs', '분류체계별 과·속·종·분류군 수', { type: 'bar', series: [/^과/, /^속/, /^종/, /^분류군$/] }),
        ti >= 0
          ? tableCard(b, 'rank', '분류 계급별 구성(' + b.labels[ti] + ')', {
              type: 'pie',
              transpose: true,
              t1: { series: [b.labels[ti]], cats: [/^종/, /^아종/, /^변종/, /^품종/] },
            })
          : null,
      ],
    };
  }

  function benthicTax(item) {
    const b = item.blocks[0];
    if (!b || !b.rows.length) return null;
    return {
      cards: [
        tableCard(b, 'sp', '생태유형·목별 출현종수', { type: 'hbar', series: [/현지조사\s*종수/, /전체\s*출현종수/] }),
        tableCard(b, 'ind', '생태유형·목별 현지조사 개체수', { type: 'hbar', series: [/개체수/] }),
      ],
    };
  }

  const PRESETS = [
    [/총괄/, overview],
    [/식물.*마스터/, plantMaster],
    [/동물.*마스터/, animalMaster],
    [/법정보호/, protectedSheet],
    [/특이종/, specialSheet],
    [/문헌.*마스터/, litMaster],
    [/문헌별/, litOccurrence],
    [/생활형/, lifeform],
    [/지점별.*우점/, dominance],
    [/물환경/, water],
    [/관속식물|집계표/, vascular],
    [/저서.*분류/, benthicTax],
  ];

  function runPreset(group, item) {
    const hit = PRESETS.find(([re]) => re.test(group.base));
    if (!hit) return null;
    try {
      return hit[1](item, group);
    } catch (e) {
      console.warn('시트 구성 실패, 일반 구성으로 그림:', group.base, e);
      return null;
    }
  }

  DP.views = {
    build(group, item) {
      let res = runPreset(group, item) || {};
      res.cards = (res.cards || []).filter(Boolean);
      if (!res.cards.length) {
        item.blocks.forEach((b, i) => res.cards.push(...generic(b, i, item.blocks.length > 1 ? b.header[b.catCol] || group.title : group.title)));
        res.cards = res.cards.filter(Boolean);
      }
      return res;
    },

    // 1차·2차… 같은 시트를 한 그래프로
    compare(group) {
      const items = group.items.filter((it) => it.blocks[0] && it.blocks[0].rows.length && it.blocks[0].numCols.length);
      if (items.length < 2) return [];
      const pre = runPreset(group, items[0]);
      const label = pre && pre.label;
      const b0 = items[0].blocks[0];
      const metricNames = [];
      items.forEach((it) => it.blocks[0].numCols.forEach((c) => !metricNames.includes(it.blocks[0].header[c]) && metricNames.push(it.blocks[0].header[c])));
      const def =
        metricNames.find((n) => /종수/.test(n) && !DP.isPct(n)) || metricNames.find((n) => /^종/.test(n)) || metricNames.find((n) => !DP.isPct(n)) || metricNames[0];
      const compute = (ex) => {
        const cats = [];
        const flags = [];
        const ser = items.map((it) => {
          const b = it.blocks[0];
          const c = b.header.indexOf(ex.metric);
          const m = new Map();
          b.rows.forEach((r, i) => {
            const lab = label ? label(r) : b.labels[i];
            if (!cats.includes(lab)) {
              cats.push(lab);
              flags.push(b.flags[i]);
            }
            m.set(lab, c >= 0 ? P.numOf(r[c], b.types[c]) : null);
          });
          return { name: it.label, m };
        });
        return {
          catHeader: b0.header[b0.catCol],
          categories: cats,
          catFlags: flags,
          series: ser.map((s) => ({ name: s.name, values: cats.map((c) => (s.m.has(c) ? s.m.get(c) : null)) })),
        };
      };
      const probe = compute({ metric: def });
      const n = probe.catFlags.filter((f) => !f.total && !f.sub).length;
      const short = group.title.replace(/\s*분석$/, '');
      return [
        {
          id: 'compare',
          title: short + ' 차수 비교',
          titleFn: (ex) => short + ' 차수 비교(' + ex.metric + ')',
          extras: [{ key: 'metric', label: '값', options: opts(metricNames), default: def }],
          defaults: { type: n > 12 ? 'hbar' : 'bar' },
          compute,
        },
      ];
    },
  };
})();
