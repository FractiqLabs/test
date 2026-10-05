/* やること（ダッシュボード） */
(function (g) {
  'use strict';
  const KC = g.KC;
  const U = KC.util;
  const S = KC.store;
  const C = KC.calc;
  const UI = KC.ui;
  const V = (KC.views = KC.views || {});
  const esc = U.esc;

  let filter = '';

  V.dashboard = (el) => {
    const st = S.state;
    const today = U.today();
    const ym = U.ym(today);
    if (!st.users.length) {
      el.innerHTML = `
        <h1>はじめに</h1>
        <div class="card">
          <p>利用者がまだ登録されていません。次のどちらかから始めてください。</p>
          <ol>
            <li><a href="#/settings">設定</a>で事業所情報・地域区分・担当者を登録し、<a href="#/users/new">利用者を登録</a>する</li>
            <li>操作感を確かめるために<button class="btn small" id="load-demo">デモデータを読み込む</button></li>
          </ol>
          <p class="note">データはこのブラウザ内にのみ保存されます。定期的に「バックアップ」でファイルに保存してください。</p>
        </div>`;
      el.querySelector('#load-demo').onclick = () => {
        KC.demo.load();
        UI.toast('デモデータを読み込みました');
        KC.app.render();
      };
      return;
    }
    const active = S.activeUsers();
    const alerts = C.alerts(today);
    const cats = [...new Set(alerts.map((a) => a.cat))];
    const shown = alerts.filter((a) => !filter || a.cat === filter);
    const monDone = active.filter((u) => S.monitoringFor(u.id, ym).length).length;
    const schDone = active.filter((u) => S.getSchedule(u.id, ym)?.lines.length).length;
    const prevYm = U.ymAdd(ym, -1);
    const prevConf = active.filter((u) => S.getSchedule(u.id, prevYm)?.confirmed).length;
    const lastBackup = st.settings.lastBackup;
    const backupOld = !lastBackup || U.diffDays(lastBackup.slice(0, 10), today) > 7;
    const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

    el.innerHTML = `
      <h1>やること <small>${esc(UI.dateHint(today))}</small></h1>
      ${backupOld ? `<div class="alert warn">最後のバックアップから7日以上経過しています（${lastBackup ? esc(U.wareki(lastBackup.slice(0, 10), 'short')) : '未実施'}）。<button class="btn small" data-action="backup">今すぐバックアップ</button></div>` : ''}
      <div class="kpis">
        ${kpi('担当利用者', active.length + '名', '')}
        ${kpi(`${U.warekiYM(ym)} モニタリング`, `${monDone} / ${active.length}`, pct(monDone, active.length))}
        ${kpi(`${U.warekiYM(ym)} 利用票作成`, `${schDone} / ${active.length}`, pct(schDone, active.length))}
        ${kpi(`${U.warekiYM(prevYm)} 実績確定`, `${prevConf} / ${active.length}`, pct(prevConf, active.length))}
      </div>
      <div class="card">
        <div class="card-head">
          <h2>対応が必要な項目 <span class="badge ${alerts.some((a) => a.level === 'danger') ? 'danger' : 'muted'}">${alerts.length}</span></h2>
          <div class="chips">
            <button class="chip ${!filter ? 'on' : ''}" data-cat="">すべて</button>
            ${cats.map((c) => `<button class="chip ${filter === c ? 'on' : ''}" data-cat="${esc(c)}">${esc(c)} ${alerts.filter((a) => a.cat === c).length}</button>`).join('')}
          </div>
        </div>
        ${
          shown.length
            ? `<ul class="alerts">${shown
                .map(
                  (a) => `<li class="${a.level}"><a href="${esc(a.link)}"><span class="a-cat">${esc(a.cat)}</span>
                  <b>${esc(a.userName || '')}</b><span>${esc(a.text)}</span></a></li>`
                )
                .join('')}</ul>`
            : UI.empty('対応が必要な項目はありません')
        }
      </div>`;
    el.querySelectorAll('[data-cat]').forEach((b) => (b.onclick = () => ((filter = b.dataset.cat), V.dashboard(el))));
  };

  function kpi(label, value, pct) {
    return `<div class="kpi"><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${esc(value)}</div>
      ${pct === '' ? '' : `<div class="bar"><span style="width:${pct}%"></span></div>`}</div>`;
  }
})(globalThis);
