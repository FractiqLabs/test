/* 共通ユーティリティ：日付（和暦）、文字列正規化、CSV など */
(function (g) {
  'use strict';
  const KC = (g.KC = g.KC || {});
  const U = (KC.util = {});

  U.esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  U.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  U.pad = (n, w = 2) => String(n).padStart(w, '0');
  U.clone = (o) => JSON.parse(JSON.stringify(o));
  U.num = (v, d = 0) => {
    const n = Number(String(v ?? '').normalize('NFKC').replace(/,/g, ''));
    return Number.isFinite(n) ? n : d;
  };
  U.fmt = (n) => (Number(n) || 0).toLocaleString('ja-JP');

  // ---------- 日付 ----------
  // 内部表現は常に 'YYYY-MM-DD'（ローカル日付）。
  let fixedToday = null;
  U.setToday = (iso) => (fixedToday = iso);
  U.toISO = (d) => `${d.getFullYear()}-${U.pad(d.getMonth() + 1)}-${U.pad(d.getDate())}`;
  U.parseISO = (s) => {
    if (!s) return null;
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  U.today = () => fixedToday || U.toISO(new Date());
  U.nowTime = () => {
    const d = new Date();
    return `${U.pad(d.getHours())}:${U.pad(d.getMinutes())}`;
  };
  U.isValidYMD = (y, m, d) => {
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  };
  const mk = (y, m, d) => (U.isValidYMD(y, m, d) ? `${y}-${U.pad(m)}-${U.pad(d)}` : null);
  U.addDays = (iso, n) => {
    const d = U.parseISO(iso);
    d.setDate(d.getDate() + n);
    return U.toISO(d);
  };
  // 月末を超える場合は月末に丸める（1/31 + 1ヶ月 = 2/28 or 29）
  U.addMonths = (iso, n) => {
    const [y, m, d] = iso.split('-').map(Number);
    const t = new Date(y, m - 1 + n, 1);
    const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    t.setDate(Math.min(d, last));
    return U.toISO(t);
  };
  U.diffDays = (a, b) => Math.round((U.parseISO(b) - U.parseISO(a)) / 86400000);
  U.ym = (iso) => iso.slice(0, 7);
  U.ymAdd = (ym, n) => U.addMonths(ym + '-01', n).slice(0, 7);
  U.daysInMonth = (ym) => {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  };
  U.monthStart = (ym) => ym + '-01';
  U.monthEnd = (ym) => `${ym}-${U.pad(U.daysInMonth(ym))}`;
  U.dayISO = (ym, day) => `${ym}-${U.pad(day)}`;
  U.weekday = (iso) => U.parseISO(iso).getDay();
  U.WD = ['日', '月', '火', '水', '木', '金', '土'];
  U.overlaps = (aStart, aEnd, bStart, bEnd) => aStart <= bEnd && bStart <= aEnd;

  // ---------- 和暦 ----------
  U.ERAS = [
    { name: '令和', abbr: 'R', start: '2019-05-01' },
    { name: '平成', abbr: 'H', start: '1989-01-08' },
    { name: '昭和', abbr: 'S', start: '1926-12-25' },
    { name: '大正', abbr: 'T', start: '1912-07-30' },
    { name: '明治', abbr: 'M', start: '1868-01-25' },
  ];
  U.eraOf = (iso) => U.ERAS.find((e) => iso >= e.start) || null;
  // style: 'long' 令和6年4月1日 / 'short' R6.4.1 / 'ym' 令和6年4月 / 'nengo' 令和6年
  U.wareki = (iso, style = 'long') => {
    if (!iso) return '';
    const e = U.eraOf(iso);
    const [y, m, d] = iso.split('-').map(Number);
    if (!e) return iso;
    const ey = y - Number(e.start.slice(0, 4)) + 1;
    const eyS = ey === 1 && style !== 'short' ? '元' : String(ey);
    if (style === 'short') return `${e.abbr}${ey}.${m}.${d}`;
    if (style === 'ym') return `${e.name}${eyS}年${m}月`;
    if (style === 'nengo') return `${e.name}${eyS}年`;
    return `${e.name}${eyS}年${m}月${d}日`;
  };
  U.warekiYM = (ym) => {
    // 月の末日で元号を決める（2019年5月 → 令和元年5月）
    return U.wareki(U.monthEnd(ym), 'ym');
  };
  // 西暦・和暦・略記などを柔軟に解釈して ISO を返す。解釈不能なら null。
  U.parseDate = (input) => {
    if (input == null) return null;
    let s = String(input).normalize('NFKC').trim().replace(/\s+/g, '');
    if (!s) return null;
    let m;
    if ((m = s.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/))) return mk(+m[1], +m[2], +m[3]);
    if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return mk(+m[1], +m[2], +m[3]);
    if ((m = s.match(/^(明治|大正|昭和|平成|令和|[MTSHR])(\d{1,2}|元)[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/i))) {
      const key = m[1].toUpperCase();
      const era = U.ERAS.find((e) => e.name === key || e.abbr === key);
      const n = m[2] === '元' ? 1 : +m[2];
      if (!era || n < 1) return null;
      return mk(Number(era.start.slice(0, 4)) + n - 1, +m[3], +m[4]);
    }
    if ((m = s.match(/^(\d{1,2})[-/.月](\d{1,2})日?$/))) return mk(Number(U.today().slice(0, 4)), +m[1], +m[2]);
    return null;
  };
  U.age = (birth, at = U.today()) => {
    if (!birth) return null;
    const [by, bm, bd] = birth.split('-').map(Number);
    const [y, m, d] = at.split('-').map(Number);
    return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
  };
  // 介護保険上の年齢到達日は誕生日の前日
  U.ageReachDate = (birth, years) => U.addDays(U.addMonths(birth, years * 12), -1);

  // ---------- 文字列 ----------
  U.toHira = (s) => String(s ?? '').replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  U.norm = (s) => U.toHira(String(s ?? '').normalize('NFKC').toLowerCase()).replace(/\s+/g, '');
  U.digits = (s) => String(s ?? '').normalize('NFKC').replace(/\D/g, '');

  // ---------- CSV / ファイル ----------
  U.csv = (rows) =>
    rows
      .map((r) =>
        r
          .map((v) => {
            const s = String(v ?? '');
            return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
          })
          .join(',')
      )
      .join('\r\n');
  U.download = (filename, text, mime = 'text/plain') => {
    const bom = mime.includes('csv') ? '﻿' : ''; // Excel で文字化けしないように BOM を付ける
    const blob = new Blob([bom + text], { type: mime + ';charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 0);
  };

  // data-path="needs.0.goal" のようなパスでオブジェクトを読み書きする
  U.getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
  U.setPath = (obj, path, value) => {
    const keys = path.split('.');
    const last = keys.pop();
    const target = keys.reduce((o, k) => (o[k] == null ? (o[k] = {}) : o[k]), obj);
    target[last] = value;
  };
})(globalThis);
