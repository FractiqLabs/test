/* ルーティング・全体のキーボード操作・利用者検索 */
(function (g) {
  'use strict';
  const KC = g.KC;
  const U = KC.util;
  const S = KC.store;
  const UI = KC.ui;
  const V = KC.views;
  const esc = U.esc;

  S.load();

  const routes = [
    [/^#\/dashboard$/, () => V.dashboard],
    [/^#\/users$/, () => V.userList],
    [/^#\/users\/new$/, () => V.userNew],
    [/^#\/user\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?$/, () => V.userWorkspace],
    [/^#\/billing(?:\/(\d{4}-\d{2}))?$/, () => V.billing],
    [/^#\/providers$/, () => V.providers],
    [/^#\/settings$/, () => V.settings],
  ];

  let currentHash = '';
  function render() {
    const hash = location.hash || '#/dashboard';
    const view = document.getElementById('view');
    for (const [re, get] of routes) {
      const m = hash.match(re);
      if (!m) continue;
      UI.setDirty(false);
      currentHash = hash;
      document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', hash.startsWith('#/' + a.dataset.nav)));
      view.scrollTop = 0;
      try {
        get()(view, m.slice(1).map((x) => (x ? decodeURIComponent(x) : x)));
      } catch (e) {
        console.error(e);
        view.innerHTML = `<div class="alert danger">画面の表示中にエラーが発生しました：${esc(e.message)}</div>`;
      }
      renderChrome();
      return;
    }
    location.hash = '#/dashboard';
  }
  KC.app = { render, go: (h) => (location.hash === h ? render() : (location.hash = h)) };

  window.addEventListener('hashchange', () => {
    if (UI.dirty && location.hash !== currentHash && !UI.confirmLeave()) {
      history.replaceState(null, '', currentHash);
      return;
    }
    render();
  });
  window.addEventListener('beforeunload', (e) => {
    if (UI.dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  function renderChrome() {
    const st = S.state;
    const sel = document.getElementById('staff-select');
    sel.innerHTML = [['', '担当者を選択'], ...st.settings.staff.map((s) => [s.id, s.name])]
      .map(([v, l]) => `<option value="${esc(v)}"${v === st.settings.currentStaff ? ' selected' : ''}>${esc(l)}</option>`)
      .join('');
    document.getElementById('recent-users').innerHTML = st.recent
      .map((id) => S.byId('users', id))
      .filter(Boolean)
      .map((u) => `<a href="#/user/${u.id}">${esc(u.name)}</a>`)
      .join('');
  }
  document.getElementById('staff-select').addEventListener('change', (e) => {
    S.state.settings.currentStaff = e.target.value;
    S.save();
  });

  // ---------- 利用者検索（かな・カナ・漢字・番号） ----------
  const search = document.getElementById('global-search');
  const results = document.getElementById('search-results');
  let hit = [];
  let cursor = 0;
  KC.searchUsers = (q) => {
    const n = U.norm(q);
    if (!n) return [];
    return S.state.users
      .filter((u) => [u.name, u.kana, u.insuredNo].some((f) => U.norm(f).includes(n)))
      .sort((a, b) => (a.status === 'ended') - (b.status === 'ended'))
      .slice(0, 10);
  };
  function drawResults() {
    if (!hit.length) {
      results.innerHTML = search.value ? '<div class="sr-empty">該当なし</div>' : '';
      results.hidden = !search.value;
      return;
    }
    results.hidden = false;
    results.innerHTML = hit
      .map((u, i) => {
        const cert = S.certOn(u, U.today());
        return `<a href="#/user/${u.id}" class="${i === cursor ? 'cur' : ''}"><b>${esc(u.name)}</b> <small>${esc(u.kana || '')}</small>
          <span class="sr-meta">${UI.levelBadge(cert?.level)} ${u.status === 'ended' ? '<span class="badge muted">終了</span>' : ''}</span></a>`;
      })
      .join('');
  }
  search.addEventListener('input', () => {
    hit = KC.searchUsers(search.value);
    cursor = 0;
    drawResults();
  });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') cursor = Math.min(cursor + 1, hit.length - 1);
    else if (e.key === 'ArrowUp') cursor = Math.max(cursor - 1, 0);
    else if (e.key === 'Enter' && hit[cursor]) {
      KC.app.go('#/user/' + hit[cursor].id);
      search.value = '';
      hit = [];
      search.blur();
    } else if (e.key === 'Escape') {
      search.value = '';
      hit = [];
      search.blur();
    } else return;
    e.preventDefault();
    drawResults();
  });
  search.addEventListener('blur', () => setTimeout(() => (results.hidden = true), 150));
  results.addEventListener('click', () => {
    search.value = '';
    hit = [];
  });

  // ---------- ショートカット ----------
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    const typing = ['input', 'textarea', 'select'].includes(tag);
    if (e.key === '/' && !typing) {
      e.preventDefault();
      search.focus();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      const btn = document.querySelector('#view [data-primary-save]');
      if (btn) btn.click();
    } else if (e.altKey && /^[1-7]$/.test(e.key)) {
      const tab = document.querySelectorAll('#view .tabs a')[Number(e.key) - 1];
      if (tab) {
        e.preventDefault();
        tab.click();
      }
    }
  });

  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-action="backup"]');
    if (!a) return;
    U.download(`kaigo-backup-${U.today()}.json`, S.exportJSON(), 'application/json');
    UI.toast('バックアップを保存しました');
  });

  render();
})(globalThis);
