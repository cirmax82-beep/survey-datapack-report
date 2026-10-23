/* 그래프 카드: 종류·계열·항목·정렬·크기 조절, PNG·SVG·CSV 받기 */
(function () {
  'use strict';
  const DP = window.DP;
  const { h, esc } = DP;

  const TYPES = [
    ['bar', '세로 막대'],
    ['hbar', '가로 막대'],
    ['stack', '누적 막대'],
    ['hstack', '누적 가로 막대'],
    ['pct', '100% 누적 막대'],
    ['pie', '원'],
    ['donut', '도넛'],
    ['line', '꺾은선'],
    ['table', '표만'],
  ];
  const TYPE_OK = new Set(TYPES.map((t) => t[0]));

  // 기본 색: 색각 이상(적록·청황)에서도 이웃한 색끼리 구별되는 순서(검증함)
  DP.PALETTES = {
    cb: { name: '색각 친화(기본)', colors: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'] },
    oi: { name: 'Okabe-Ito', colors: ['#0072b2', '#e69f00', '#009e73', '#d55e00', '#56b4e9', '#cc79a7', '#f0e442', '#000000'] },
    gray: { name: '회색조(흑백 인쇄)', colors: ['#1f1f1f', '#8a8a8a', '#4d4d4d', '#b8b8b8', '#333333', '#a1a1a1', '#666666', '#d0d0d0'] },
  };
  const OTHER = '#9a9893';
  const INK = '#1f1f1d';
  const INK2 = '#52514e';
  const GRID = '#e6e5df';
  const AXIS = '#b9b8ae';
  const FONT = '"Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo",sans-serif';
  const MAX_SERIES = 8;
  const MAX_PIES = 4;
  const MAX_SLICES = 8;

  DP.isPct = (s) => /%|비율|구성비/.test(String(s));

  // 보이는 계열에 원래 열 순서대로 1번 색부터 줌(검증한 이웃 색 순서를 그대로 쓰려고)
  function pickColors(idxs, pal) {
    return idxs.map((_, k) => pal[k] || OTHER);
  }

  // 막대 안 글자색: 밝은 칸엔 검정, 어두운 칸엔 흰색
  function inkOn(hex) {
    const n = parseInt(String(hex).slice(1), 16);
    const lin = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
    return L > 0.179 ? INK : '#ffffff';
  }

  // 글자 너비는 실제 글꼴로 잼(범례 줄 수·여백 계산용)
  let measureCtx = null;
  function textW(s, fs) {
    measureCtx = measureCtx || document.createElement('canvas').getContext('2d');
    measureCtx.font = fs + 'px ' + FONT;
    return measureCtx.measureText(String(s)).width;
  }

  function legendRows(names, fs, W) {
    let rows = 1;
    let x = 0;
    const max = W - 24;
    names.forEach((n) => {
      const w = textW(n, fs) + 18 + 5 + 14;
      if (x > 0 && x + w > max) {
        rows++;
        x = w;
      } else x += w;
    });
    return rows;
  }

  // 기본값 지정: 이름·정규식·함수 목록
  function matchNames(spec, names) {
    if (spec == null) return null;
    if (typeof spec === 'function') return new Set(spec(names));
    const out = new Set();
    [].concat(spec).forEach((p) =>
      names.forEach((n) => {
        if (p instanceof RegExp ? p.test(n) : p === n) out.add(n);
      })
    );
    return out;
  }

  function autoSeries(f) {
    const names = f.series.map((s) => s.name);
    const cnt = names.filter((n) => !DP.isPct(n));
    return new Set((cnt.length ? cnt : names).slice(0, cnt.length ? 4 : 1));
  }

  function barOption(ds, st, S, W, H, top0, pal) {
    const fs = S.font;
    const fmt = DP.fmtNum;
    const type = st.type;
    const horiz = type === 'hbar' || type === 'hstack';
    const stacked = type === 'stack' || type === 'hstack' || type === 'pct';
    const names = ds.ser.map((s) => s.name);
    const multi = names.length > 1;
    const colors = pickColors(
      ds.ser.map((s) => s.idx),
      pal
    );
    const legendH = multi ? legendRows(names, fs, W) * (fs + 10) + 8 : 0;
    let values = ds.ser.map((s) => s.values);
    if (type === 'pct') {
      const tot = ds.cats.map((_, k) => ds.ser.reduce((a, s) => a + (s.values[k] || 0), 0));
      values = ds.ser.map((s) => s.values.map((v, k) => (tot[k] ? ((v || 0) / tot[k]) * 100 : 0)));
    }
    const catNames = ds.cats.map((c) => c.name);
    let rotate = 0;
    if (!horiz && catNames.length) {
      const slot = (W * 0.86) / catNames.length;
      const longest = Math.max(...catNames.map((n) => textW(n, fs)));
      if (longest > slot * 0.95) rotate = catNames.length > 24 ? 90 : 40;
    }
    const single = !multi && ds.ser[0] ? ds.ser[0].name : null;
    let top = top0 + legendH + 10;
    let bottom = 10;
    // 기울인 첫 항목 이름이 왼쪽으로 잘리지 않게
    let left = 12;
    if (rotate === 40) left = Math.max(12, Math.min(W * 0.3, textW(catNames[0], fs) * 0.77 - (W * 0.86) / catNames.length / 2 - 4));
    const catAxis = {
      type: 'category',
      data: catNames,
      inverse: horiz,
      axisLabel: { interval: 0, rotate, color: INK2, fontSize: fs },
      axisTick: { alignWithLabel: true, lineStyle: { color: AXIS } },
      axisLine: { lineStyle: { color: AXIS } },
    };
    const valAxis = {
      type: 'value',
      max: type === 'pct' ? 100 : null,
      axisLabel: { color: INK2, fontSize: fs, formatter: type === 'pct' ? '{value}%' : (v) => fmt(v) },
      splitLine: { lineStyle: { color: GRID } },
      axisLine: { show: false },
    };
    if (single && type !== 'pct') {
      valAxis.name = single;
      valAxis.nameTextStyle = { color: INK2, fontSize: Math.round(fs * 0.95) };
      if (horiz) {
        valAxis.nameLocation = 'middle';
        valAxis.nameGap = Math.round(fs * 1.6 + 10);
        bottom += fs + 14;
      } else {
        valAxis.nameLocation = 'end';
        valAxis.nameGap = 10;
        valAxis.nameTextStyle.align = 'left';
        top += fs + 6;
      }
    }
    const labFmt = (p) => {
      const v = p.value && typeof p.value === 'object' ? p.value.value : p.value;
      if (v == null || (stacked && !v)) return '';
      return type === 'pct' ? Math.round(v) + '%' : fmt(v);
    };
    const series = ds.ser.map((s, i) => {
      const line = type === 'line';
      const data = values[i].map((v) => {
        if (v == null) return null;
        const n = +(+v).toFixed(6);
        // 음수 막대는 값 글자를 막대 끝(아래·왼쪽)에
        if (!line && !stacked && n < 0) return { value: n, label: { position: horiz ? 'left' : 'bottom' } };
        return n;
      });
      // 값 글자가 겹치면 겹친 것만 숨김(좁은 화면)
      const o = { name: s.name, type: line ? 'line' : 'bar', data, itemStyle: { color: colors[i] }, emphasis: { focus: 'series' }, labelLayout: { hideOverlap: true } };
      if (line) {
        Object.assign(o, {
          symbol: 'circle',
          symbolSize: 8,
          lineStyle: { width: 2, color: colors[i] },
          label: { show: st.labels, position: 'top', fontSize: Math.round(fs * 0.88), color: INK, formatter: labFmt },
        });
      } else {
        o.barMaxWidth = horiz ? 34 : 56;
        if (stacked) {
          o.stack = 'all';
          o.itemStyle.borderColor = '#ffffff';
          o.itemStyle.borderWidth = 1;
        } else {
          o.itemStyle.borderRadius = horiz ? [0, 3, 3, 0] : [3, 3, 0, 0];
        }
        o.label = {
          show: st.labels,
          position: stacked ? 'inside' : horiz ? 'right' : 'top',
          fontSize: Math.round(fs * 0.88),
          color: INK,
          formatter: labFmt,
        };
        if (stacked) o.label.color = inkOn(colors[i]);
      }
      return o;
    });
    const maxLab = st.labels && !stacked && horiz ? Math.max(0, ...values.flat().map((v) => textW(fmt(v), fs * 0.88))) : 0;
    return {
      legend: multi
        ? { top: top0, left: 'center', itemWidth: 18, itemHeight: 12, itemGap: 14, textStyle: { fontSize: fs, color: INK }, data: names }
        : { show: false },
      grid: { left, right: 18 + maxLab, top, bottom, containLabel: true },
      xAxis: horiz ? valAxis : catAxis,
      yAxis: horiz ? catAxis : valAxis,
      tooltip: {
        trigger: 'axis',
        confine: true,
        axisPointer: { type: type === 'line' ? 'line' : 'shadow' },
        textStyle: { fontSize: Math.max(12, fs - 1) },
        formatter: (ps) => {
          const k = ps[0].dataIndex;
          const c = ds.cats[k];
          let s = '<b>' + esc(c.name) + '</b>';
          ps.forEach((p) => {
            const raw = ds.ser[p.seriesIndex].values[k];
            s += '<br>' + p.marker + esc(p.seriesName) + ': ' + (raw == null ? '-' : fmt(raw));
            if (type === 'pct') s += ' (' + fmt(values[p.seriesIndex][k]) + '%)';
          });
          if (c.info) s += '<br><span style="color:#666">' + esc(c.info) + '</span>';
          return s;
        },
      },
      series,
    };
  }

  function pieOption(ds, st, S, W, H, top0, pal) {
    const fs = S.font;
    const fmt = DP.fmtNum;
    const donut = st.type === 'donut';
    const k = ds.ser.length;
    // 조각은 8개까지, 나머지는 ‘기타’로 묶음
    const pies = ds.ser.map((s) => {
      let items = ds.cats.map((c, j) => ({ name: c.name, idx: c.idx, value: s.values[j] || 0 })).filter((x) => x.value > 0);
      if (items.length > MAX_SLICES) {
        const keep = new Set(
          items
            .slice()
            .sort((a, b) => b.value - a.value)
            .slice(0, MAX_SLICES - 1)
        );
        const rest = items.filter((x) => !keep.has(x));
        items = items.filter((x) => keep.has(x));
        items.push({ name: '기타', idx: -1, value: rest.reduce((a, x) => a + x.value, 0) });
      }
      return { name: s.name, items };
    });
    const legendNames = [];
    const legendIdx = [];
    pies.forEach((p) =>
      p.items.forEach((it) => {
        if (it.idx >= 0 && !legendNames.includes(it.name)) {
          legendNames.push(it.name);
          legendIdx.push(it.idx);
        }
      })
    );
    const cols = pickColors(legendIdx, pal);
    const colorOf = (it) => (it.idx < 0 ? OTHER : cols[legendNames.indexOf(it.name)]);
    if (pies.some((p) => p.items.some((it) => it.idx < 0))) legendNames.push('기타');
    const showLegend = k > 1;
    const legendH = showLegend ? legendRows(legendNames, fs, W) * (fs + 10) + 8 : 0;
    const subH = k > 1 ? fs + 14 : 0;
    const top = top0 + legendH + subH;
    const slotW = W / Math.max(1, k);
    const cy = top + (H - top) / 2;
    const r = Math.max(30, Math.min((H - top - 24) / 2 - fs * 1.6, slotW / 2 - fs * 4.2));
    const title = [];
    const series = pies.map((p, j) => {
      const cx = slotW * (j + 0.5);
      if (k > 1) title.push({ text: p.name, left: cx, top: top0 + legendH, textAlign: 'center', textStyle: { fontSize: fs, fontWeight: 'bold', color: INK, fontFamily: FONT } });
      return {
        type: 'pie',
        name: p.name,
        center: [cx, cy],
        radius: donut ? [r * 0.56, r] : [0, r],
        startAngle: 90,
        avoidLabelOverlap: true,
        data: p.items.map((it) => ({ name: it.name, value: it.value, itemStyle: { color: colorOf(it) } })),
        label: {
          fontSize: fs,
          color: INK,
          formatter: (q) => q.name + (st.labels ? '\n' + fmt(q.value) + ' (' + (+q.percent).toFixed(1) + '%)' : ''),
        },
        labelLine: { length: 8, length2: 8, lineStyle: { color: AXIS } },
        itemStyle: { borderColor: '#ffffff', borderWidth: 2 },
      };
    });
    return {
      extraTitle: title,
      legend: showLegend
        ? { top: top0, left: 'center', itemWidth: 14, itemHeight: 12, itemGap: 14, textStyle: { fontSize: fs, color: INK }, data: legendNames }
        : { show: false },
      tooltip: {
        trigger: 'item',
        confine: true,
        textStyle: { fontSize: Math.max(12, fs - 1) },
        formatter: (q) => (k > 1 ? '<b>' + esc(q.seriesName) + '</b><br>' : '') + q.marker + esc(q.name) + ': ' + fmt(q.value) + ' (' + (+q.percent).toFixed(1) + '%)',
      },
      series,
    };
  }

  function buildOption(ds, st, S, W, H, title) {
    const pal = (DP.PALETTES[S.palette] || DP.PALETTES.cb).colors;
    const fs = S.font;
    const top0 = title ? Math.round(fs * 1.3 + 22) : 10;
    const body = st.type === 'pie' || st.type === 'donut' ? pieOption(ds, st, S, W, H, top0, pal) : barOption(ds, st, S, W, H, top0, pal);
    const titles = [];
    if (title) titles.push({ text: title, left: 'center', top: 8, textStyle: { fontFamily: FONT, fontSize: Math.round(fs * 1.3), fontWeight: 'bold', color: INK } });
    (body.extraTitle || []).forEach((t) => titles.push(t));
    delete body.extraTitle;
    return Object.assign(
      {
        animation: false,
        backgroundColor: '#ffffff',
        color: pal,
        textStyle: { fontFamily: FONT, fontSize: fs, color: INK },
        aria: { enabled: true, decal: { show: !!S.decal || S.palette === 'gray' } },
        title: titles,
      },
      body
    );
  }

  class Card {
    constructor(spec, ctx) {
      this.spec = spec;
      this.ctx = ctx;
      this.key = 'card:' + ctx.groupKey + ':' + spec.id;
      this.st = this.load();
      this.chart = null;
      this.ds = null;
    }

    load() {
      const d = this.spec.defaults || {};
      const st = Object.assign(
        { type: d.type || 'bar', sort: d.sort || 'none', topN: d.topN || 0, labels: d.labels !== false, transpose: !!d.transpose, title: null, w: null, h: null, ex: {}, data: !!this.spec.showData, sel: [{}, {}] },
        DP.store.get(this.key) || {}
      );
      if (!TYPE_OK.has(st.type)) st.type = d.type || 'bar';
      if (!Array.isArray(st.sel) || st.sel.length !== 2) st.sel = [{}, {}];
      (this.spec.extras || []).forEach((x) => {
        if (!x.options.some((o) => o.value === st.ex[x.key])) st.ex[x.key] = x.default;
      });
      return st;
    }

    save() {
      DP.store.set(this.key, this.st);
    }

    reset() {
      DP.store.del(this.key);
      this.st = this.load();
      this.syncControls();
      this.update();
    }

    titleText() {
      if (!DP.settings.showTitle) return '';
      return this.st.title != null ? this.st.title : this.defaultTitle();
    }

    defaultTitle() {
      return typeof this.spec.titleFn === 'function' ? this.spec.titleFn(this.st.ex) : this.spec.title;
    }

    // 계산된 전체 자료(행·열 바꾸기 반영)
    full() {
      const f0 = this.spec.compute(this.st.ex) || { categories: [], series: [] };
      f0.catFlags = f0.catFlags || f0.categories.map(() => ({}));
      if (!this.st.transpose) return f0;
      return {
        catHeader: '구분',
        categories: f0.series.map((s) => s.name),
        catFlags: f0.series.map(() => ({})),
        series: f0.categories.map((c, i) => ({ name: c, values: f0.series.map((s) => s.values[i]) })),
        t0: f0,
      };
    }

    visible(f, o, t) {
      const d = this.spec.defaults || {};
      const sNames = f.series.map((s) => s.name);
      const cNames = f.categories;
      let ds;
      let dc;
      if (t === 0) {
        ds = matchNames(d.series, sNames) || autoSeries(f);
        dc = matchNames(d.cats, cNames) || new Set(cNames.filter((_, i) => !f.catFlags[i].total && !f.catFlags[i].sub));
      } else {
        const t1 = d.t1 || {};
        const v0 = this.visible(f.t0, this.st.sel[0], 0);
        ds = matchNames(t1.series, sNames) || new Set([...v0.cats].slice(0, MAX_SERIES));
        dc = matchNames(t1.cats, cNames) || v0.series;
      }
      const eff = (names, def, on, off) => new Set(names.filter((n) => (on || []).includes(n) || (def.has(n) && !(off || []).includes(n))));
      return { series: eff(sNames, ds, o.sOn, o.sOff), cats: eff(cNames, dc, o.cOn, o.cOff), defS: ds, defC: dc };
    }

    dataset() {
      const st = this.st;
      const f = this.full();
      const t = st.transpose ? 1 : 0;
      const vis = this.visible(f, st.sel[t], t);
      const note = [];
      const pieLike = st.type === 'pie' || st.type === 'donut';
      const maxS = pieLike ? MAX_PIES : MAX_SERIES;
      let ser = f.series.map((s, i) => ({ name: s.name, values: s.values, idx: i })).filter((s) => vis.series.has(s.name));
      if (ser.length > maxS) {
        ser = ser.slice(0, maxS);
        note.push(pieLike ? '원그래프는 계열 ' + maxS + '개까지 나란히 그립니다.' : '계열은 ' + maxS + '개까지 그립니다.');
      }
      let cats = f.categories.map((c, i) => ({ name: c, idx: i, info: f.catInfo ? f.catInfo[i] : null })).filter((c) => vis.cats.has(c.name));
      const sum = (c) => ser.reduce((a, s) => a + (s.values[c.idx] || 0), 0);
      if (st.sort === 'desc') cats.sort((a, b) => sum(b) - sum(a));
      else if (st.sort === 'asc') cats.sort((a, b) => sum(a) - sum(b));
      else if (st.sort === 'name') cats.sort((a, b) => DP.natCmp(a.name, b.name));
      if (st.topN > 0 && cats.length > st.topN) {
        note.push('전체 ' + cats.length + '개 항목 중 ' + st.topN + '개만 표시');
        cats = cats.slice(0, st.topN);
      }
      return {
        f,
        vis,
        note,
        catHeader: f.catHeader || '항목',
        cats,
        ser: ser.map((s) => ({ name: s.name, idx: s.idx, values: cats.map((c) => (s.values[c.idx] == null ? null : s.values[c.idx])) })),
      };
    }

    mount(host) {
      const st = this.st;
      const spec = this.spec;
      const lab = (txt, ...kids) => h('label', { class: 'ctl' }, h('span', null, txt), ...kids);
      this.titleIn = h('input', {
        class: 'card-title',
        'aria-label': '그림 제목',
        placeholder: '그림 제목(비우면 제목 없음)',
        oninput: (e) => {
          st.title = e.target.value;
          this.save();
          this.draw();
        },
      });
      this.typeSel = h(
        'select',
        {
          onchange: (e) => {
            st.type = e.target.value;
            this.save();
            this.update();
          },
        },
        ...TYPES.map(([k, n]) => h('option', { value: k }, n))
      );
      const btn = (t, f, title) => h('button', { type: 'button', class: 'btn sm', title, onclick: f }, t);
      const head = h(
        'div',
        { class: 'card-head' },
        this.titleIn,
        lab('종류', this.typeSel),
        h(
          'div',
          { class: 'card-acts' },
          btn('PNG', () => this.savePNG(), '그림(PNG) 받기'),
          btn('SVG', () => this.saveSVG(), '확대해도 깨지지 않는 그림(SVG) 받기'),
          btn('그림 복사', () => this.copyPNG(), '복사해서 한글·워드에 바로 붙여넣기'),
          btn('CSV', () => this.saveCSV(), '그래프 자료를 CSV로 받기')
        )
      );

      const ctl = h('div', { class: 'card-ctl' });
      this.exSel = {};
      (spec.extras || []).forEach((x) => {
        const s = h(
          'select',
          {
            onchange: (e) => {
              st.ex[x.key] = e.target.value;
              this.save();
              this.update();
            },
          },
          ...x.options.map((o) => h('option', { value: o.value }, o.label))
        );
        this.exSel[x.key] = s;
        ctl.append(lab(x.label, s));
      });
      this.sortSel = h(
        'select',
        {
          onchange: (e) => {
            st.sort = e.target.value;
            this.save();
            this.update();
          },
        },
        h('option', { value: 'none' }, '원래 순서'),
        h('option', { value: 'desc' }, '큰 값 순'),
        h('option', { value: 'asc' }, '작은 값 순'),
        h('option', { value: 'name' }, '이름 순')
      );
      this.topIn = h('input', {
        type: 'number',
        min: 0,
        max: 999,
        class: 'num',
        placeholder: '전체',
        onchange: (e) => {
          st.topN = Math.max(0, parseInt(e.target.value, 10) || 0);
          this.save();
          this.update();
        },
      });
      const chk = (txt, key) => {
        const i = h('input', {
          type: 'checkbox',
          onchange: (e) => {
            st[key] = e.target.checked;
            this.save();
            this.update();
          },
        });
        this['chk_' + key] = i;
        return h('label', { class: 'chk' }, i, txt);
      };
      ctl.append(lab('정렬', this.sortSel), lab('상위', this.topIn, '개'), chk('값 표시', 'labels'), chk('행·열 바꾸기', 'transpose'), chk('자료표', 'data'));

      this.serBox = h('div', { class: 'chips' });
      this.catBox = h('div', { class: 'chips' });
      const sizeIn = (key, ph, min, max) =>
        h('input', {
          type: 'number',
          class: 'num',
          min,
          max,
          placeholder: ph,
          onchange: (e) => {
            const v = parseInt(e.target.value, 10);
            st[key] = v >= min && v <= max ? v : null;
            this.save();
            this.draw();
          },
        });
      this.wIn = sizeIn('w', '전체', 20, 100);
      this.hIn = sizeIn('h', '전체', 150, 2400);
      const more = h(
        'details',
        { class: 'card-more' },
        h('summary', null, '항목 고르기·이 그래프 크기'),
        h(
          'div',
          { class: 'more-row' },
          h('span', { class: 'lbl' }, '항목'),
          btn('모두', () => this.setAll('c', true), '모든 항목 보이기'),
          btn('모두 끄기', () => this.setAll('c', false), '모든 항목 숨기기')
        ),
        this.catBox,
        h(
          'div',
          { class: 'more-row' },
          lab('너비', this.wIn, '%'),
          lab('높이', this.hIn, 'px'),
          h('span', { class: 'muted' }, '비우면 위쪽 전체 설정을 따릅니다.'),
          h('span', { class: 'grow' }),
          btn('이 그래프 처음 설정으로', () => this.reset(), '이 그래프에서 바꾼 것을 모두 되돌림')
        )
      );
      this.noteEl = h('div', { class: 'card-note' });
      this.chartEl = h('div', { class: 'chart' });
      this.box = h('div', { class: 'chart-box' }, this.chartEl);
      this.dataEl = h('div', { class: 'card-data' });
      this.el = h(
        'section',
        { class: 'card' },
        head,
        ctl,
        h('div', { class: 'ser-row' }, h('span', { class: 'lbl' }, '계열'), this.serBox),
        more,
        this.noteEl,
        this.box,
        this.dataEl
      );
      host.append(this.el);
      this.syncControls();
      this.lastW = 0;
      this.ro = new ResizeObserver(() => {
        const w = this.box.clientWidth;
        if (!this.chart || Math.abs(w - this.lastW) < 2) return;
        cancelAnimationFrame(this.raf);
        this.raf = requestAnimationFrame(() => this.draw());
      });
      this.ro.observe(this.box);
      this.update();
    }

    syncControls() {
      const st = this.st;
      this.titleIn.value = st.title != null ? st.title : this.defaultTitle();
      this.typeSel.value = st.type;
      this.sortSel.value = st.sort;
      this.topIn.value = st.topN || '';
      this.chk_labels.checked = !!st.labels;
      this.chk_transpose.checked = !!st.transpose;
      this.chk_data.checked = !!st.data;
      this.wIn.value = st.w || '';
      this.hIn.value = st.h || '';
      Object.entries(this.exSel).forEach(([k, s]) => (s.value = st.ex[k]));
    }

    setAll(kind, on) {
      if (!this.ds) return;
      const o = this.st.sel[this.st.transpose ? 1 : 0];
      const names = kind === 'c' ? this.ds.f.categories : this.ds.f.series.map((s) => s.name);
      o[kind + 'On'] = on ? names.slice() : [];
      o[kind + 'Off'] = on ? [] : names.slice();
      this.save();
      this.update();
    }

    toggle(kind, name, on, isDef) {
      const o = this.st.sel[this.st.transpose ? 1 : 0];
      const onK = kind + 'On';
      const offK = kind + 'Off';
      o[onK] = (o[onK] || []).filter((x) => x !== name);
      o[offK] = (o[offK] || []).filter((x) => x !== name);
      if (on && isDef) o[offK].push(name);
      else if (!on && !isDef) o[onK].push(name);
      this.save();
      this.update();
    }

    update() {
      try {
        this.ds = this.dataset();
      } catch (e) {
        console.error(e);
        this.ds = null;
        this.noteEl.textContent = '이 그래프를 만들지 못했습니다: ' + e.message;
        this.box.hidden = true;
        return;
      }
      if (this.titleIn && this.st.title == null) this.titleIn.value = this.defaultTitle();
      this.draw();
    }

    renderChips(colors) {
      const { f, vis } = this.ds;
      const mk = (kind, names, set, def, flags) =>
        names.map((n, i) => {
          const on = set.has(n);
          const sw = kind === 's' && on && colors[n] ? h('span', { class: 'sw', style: { background: colors[n] } }) : null;
          return h(
            'button',
            {
              type: 'button',
              class: 'chip' + (on ? ' on' : '') + (flags && flags[i] && (flags[i].total || flags[i].sub) ? ' tot' : ''),
              'aria-pressed': on ? 'true' : 'false',
              onclick: () => this.toggle(kind, n, on, def.has(n)),
            },
            sw,
            n
          );
        });
      const sNames = f.series.map((s) => s.name);
      this.serBox.replaceChildren(...(sNames.length ? mk('s', sNames, vis.series, vis.defS) : [h('span', { class: 'muted' }, '그릴 수 있는 숫자 열이 없습니다.')]));
      if (f.categories.length > 120) this.catBox.replaceChildren(h('span', { class: 'muted' }, '항목이 많아 ‘상위 N개’와 정렬로 고릅니다.'));
      else this.catBox.replaceChildren(...mk('c', f.categories, vis.cats, vis.defC, f.catFlags));
    }

    size() {
      const S = DP.settings;
      const st = this.st;
      let hPx = st.h || S.chartH;
      if (!st.h && this.ds && (st.type === 'hbar' || st.type === 'hstack')) {
        const n = this.ds.cats.length;
        const per = Math.max(18, S.font * 1.7) * (st.type === 'hbar' ? Math.max(1, this.ds.ser.length * 0.75) : 1);
        hPx = Math.max(hPx, Math.min(90 + n * per, 2400));
      }
      return { wPct: st.w || S.chartW, hPx: Math.round(hPx) };
    }

    draw() {
      const st = this.st;
      const ds = this.ds;
      if (!ds) return;
      const S = DP.settings;
      const pal = (DP.PALETTES[S.palette] || DP.PALETTES.cb).colors;
      const pieLike = st.type === 'pie' || st.type === 'donut';
      const colors = {};
      if (!pieLike) {
        const cs = pickColors(
          ds.ser.map((s) => s.idx),
          pal
        );
        ds.ser.forEach((s, i) => (colors[s.name] = cs[i]));
      }
      this.renderChips(colors);
      const notes = ds.note.slice();
      if (this.spec.note) notes.unshift(this.spec.note);
      const allZero = ds.ser.every((s) => s.values.every((v) => !v));
      if (!ds.ser.length) notes.push('계열을 하나 이상 고르세요.');
      else if (!ds.cats.length) notes.push('보일 항목이 없습니다. ‘항목 고르기’에서 켜세요.');
      else if (allZero) notes.push('값이 모두 0입니다.');
      this.noteEl.textContent = notes.join(' · ');
      const show = st.type !== 'table' && ds.cats.length > 0 && ds.ser.length > 0 && !(pieLike && allZero);
      const { wPct, hPx } = this.size();
      this.box.hidden = !show;
      this.box.style.width = wPct + '%';
      this.chartEl.style.height = hPx + 'px';
      if (show) {
        if (!this.chart) this.chart = echarts.init(this.chartEl, null, { renderer: 'canvas' });
        const W = this.chartEl.clientWidth || 800;
        this.lastW = this.box.clientWidth;
        this.option = buildOption(ds, st, S, W, hPx, this.titleText());
        this.chart.setOption(this.option, true);
        this.chart.resize();
      } else if (this.chart) {
        this.chart.dispose();
        this.chart = null;
      }
      if (st.data || st.type === 'table') this.renderData();
      else this.dataEl.replaceChildren();
    }

    tableRows() {
      const ds = this.ds;
      return [[ds.catHeader].concat(ds.ser.map((s) => s.name))].concat(ds.cats.map((c, k) => [c.name].concat(ds.ser.map((s) => s.values[k]))));
    }

    renderData() {
      const m = this.tableRows();
      const block = DP.parse.analyze(m[0], m.slice(1));
      this.dataEl.replaceChildren();
      DP.renderTable(this.dataEl, block, { key: this.key + ':data', name: this.fileBase(), compact: true });
    }

    fileBase() {
      return DP.safeName((this.ctx.sheetTitle ? this.ctx.sheetTitle + '_' : '') + (this.titleText() || this.defaultTitle()));
    }

    pngURL() {
      return this.chart.getDataURL({ type: 'png', pixelRatio: DP.settings.res, backgroundColor: '#ffffff' });
    }

    svgString() {
      const { hPx } = this.size();
      const tmp = echarts.init(null, null, { renderer: 'svg', ssr: true, width: this.chartEl.clientWidth, height: hPx });
      // 화면 밖 렌더링에서는 접근성 설명(DOM 속성)을 달 곳이 없음 — 무늬 설정만 넘김
      tmp.setOption(Object.assign({}, this.option, { aria: { enabled: true, label: { enabled: false }, decal: this.option.aria.decal } }));
      const s = tmp.renderToSVGString();
      tmp.dispose();
      return s;
    }

    savePNG() {
      if (!this.chart) return DP.toast('그래프가 없습니다. 종류를 ‘표만’ 말고 다른 것으로 고르세요.');
      DP.download(this.pngURL(), this.fileBase() + '.png');
    }

    saveSVG() {
      if (!this.chart) return DP.toast('그래프가 없습니다.');
      DP.download(new Blob([this.svgString()], { type: 'image/svg+xml' }), this.fileBase() + '.svg');
    }

    async copyPNG() {
      if (!this.chart) return DP.toast('그래프가 없습니다.');
      try {
        // 누른 즉시 쓰기를 시작해야 브라우저가 허락함(그림은 약속으로 넘김)
        const url = this.pngURL();
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': fetch(url).then((r) => r.blob()) })]);
        DP.toast('그림을 복사했습니다. 한글·워드에 붙여넣으세요.');
      } catch (e) {
        console.warn('그림 복사 실패:', e);
        DP.toast('브라우저가 그림 복사를 막았습니다. PNG로 받아 붙여넣으세요.');
      }
    }

    saveCSV() {
      if (!this.ds) return;
      const rows = this.tableRows().map((r) => r.map((v) => (typeof v === 'number' ? DP.csvNum(v) : v == null ? '' : v)));
      DP.download(new Blob([DP.csv(rows)], { type: 'text/csv;charset=utf-8' }), this.fileBase() + '.csv');
    }

    dispose() {
      if (this.ro) this.ro.disconnect();
      if (this.chart) this.chart.dispose();
      this.chart = null;
    }
  }

  DP.Card = Card;
})();
