/* 画面共通の部品：和暦日付入力、パス束縛フォーム、トースト、変更検知など */
(function (g) {
  'use strict';
  const KC = (g.KC = g.KC || {});
  const U = KC.util;
  const M = KC.master;
  const UI = (KC.ui = {});
  const esc = U.esc;

  UI.attrs = (o = {}) =>
    Object.entries(o)
      .filter(([, v]) => v !== false && v != null)
      .map(([k, v]) => (v === true ? k : `${k}="${esc(v)}"`))
      .join(' ');

  UI.toast = (msg, type = 'ok') => {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast ' + type;
    el.hidden = false;
    clearTimeout(UI._toastTimer);
    UI._toastTimer = setTimeout(() => (el.hidden = true), type === 'error' ? 5000 : 2500);
  };

  // ---------- 和暦対応の日付入力 ----------
  UI.dateHint = (iso) => (iso ? `${U.wareki(iso)}(${U.WD[U.weekday(iso)]})` : '');
  UI.dateInput = (attrs, iso) =>
    `<span class="date-field"><input type="text" class="date-input" inputmode="numeric" placeholder="R8.4.1 / 2026-04-01" ${UI.attrs(
      attrs
    )} data-iso="${esc(iso || '')}" value="${esc(iso ? U.wareki(iso, 'short') : '')}"><small class="date-hint">${esc(
      UI.dateHint(iso)
    )}</small></span>`;
  UI.dateVal = (input) => {
    const raw = input.value.trim();
    if (!raw) return '';
    return U.parseDate(raw);
  };
  UI.normalizeDateInput = (input) => {
    const iso = UI.dateVal(input);
    const hint = input.parentElement?.querySelector('.date-hint');
    if (iso === null) {
      input.classList.add('invalid');
      if (hint) hint.textContent = '日付を解釈できません';
      return null;
    }
    input.classList.remove('invalid');
    input.dataset.iso = iso;
    input.value = iso ? U.wareki(iso, 'short') : '';
    if (hint) hint.textContent = UI.dateHint(iso);
    return iso;
  };

  UI.select = (attrs, options, value) =>
    `<select ${UI.attrs(attrs)}>${options
      .map((o) => {
        const [v, l] = Array.isArray(o) ? o : [o, o];
        return `<option value="${esc(v)}"${String(v) === String(value ?? '') ? ' selected' : ''}>${esc(l)}</option>`;
      })
      .join('')}</select>`;
  UI.levelOptions = (withEmpty = true) => [...(withEmpty ? [['', '—']] : []), ...M.levels.map((l) => [l.code, l.label])];
  UI.levelLabel = (code) => M.level(code)?.label || '—';
  UI.levelBadge = (code) => {
    const l = M.level(code);
    return l ? `<span class="lv lv-${l.code}">${esc(l.label)}</span>` : '<span class="lv">未認定</span>';
  };
  UI.daysBadge = (left) => {
    if (left == null) return '';
    const cls = left < 0 ? 'danger' : left <= 30 ? 'danger' : left <= 60 ? 'warn' : 'muted';
    return `<span class="badge ${cls}">${left < 0 ? `${-left}日超過` : `残${left}日`}</span>`;
  };
  UI.staffOptions = () => [['', '—'], ...KC.store.state.settings.staff.map((s) => [s.id, s.name])];
  UI.staffName = (id) => KC.store.state.settings.staff.find((s) => s.id === id)?.name || '';

  // ---------- data-path でオブジェクトに束縛 ----------
  UI.readInput = (el) => {
    if (el.type === 'checkbox') return el.checked;
    if (el.classList.contains('date-input')) {
      const iso = UI.normalizeDateInput(el);
      return iso === null ? undefined : iso;
    }
    if (el.dataset.type === 'number') return el.value === '' ? '' : U.num(el.value);
    return el.value;
  };
  UI.bindPath = (root, obj, onChange) => {
    const handler = (e) => {
      const el = e.target.closest('[data-path]');
      if (!el || !root.contains(el)) return;
      if (el.classList.contains('date-input') && e.type === 'input') return; // 日付は確定時のみ
      const v = UI.readInput(el);
      if (v === undefined) return;
      U.setPath(obj, el.dataset.path, v);
      UI.setDirty(true);
      onChange && onChange(el.dataset.path, v, e);
    };
    root.addEventListener('input', handler);
    root.addEventListener('change', handler);
  };
  // name 属性のフォームを読み取る
  UI.readForm = (form) => {
    const o = {};
    let bad = false;
    form.querySelectorAll('[name]').forEach((el) => {
      const v = UI.readInput(el);
      if (v === undefined) bad = true;
      o[el.name] = v ?? '';
    });
    if (bad) throw new Error('日付の入力に誤りがあります');
    return o;
  };

  // ---------- 変更検知（未保存で画面を離れるときに確認） ----------
  UI.dirty = false;
  UI.setDirty = (v) => {
    UI.dirty = v;
    document.body.classList.toggle('is-dirty', v);
  };
  UI.confirmLeave = () => !UI.dirty || confirm('保存していない変更があります。破棄して移動しますか？');

  UI.empty = (msg) => `<div class="empty">${esc(msg)}</div>`;
  UI.yen = (n) => `${U.fmt(n)}円`;

  // 共通の日付入力の確定処理（blur 時に和暦表記へ整形）
  document.addEventListener(
    'blur',
    (e) => {
      if (e.target.classList?.contains('date-input')) UI.normalizeDateInput(e.target);
    },
    true
  );
})(globalThis);
