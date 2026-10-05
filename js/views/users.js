/* 利用者一覧・利用者ワークスペース（ヘッダー＋タブ）・基本情報／認定 */
(function (g) {
  'use strict';
  const KC = g.KC;
  const U = KC.util;
  const M = KC.master;
  const S = KC.store;
  const UI = KC.ui;
  const V = (KC.views = KC.views || {});
  V.tabs = V.tabs || {};
  const esc = U.esc;

  const listState = { q: '', staff: '', status: 'active', sort: 'kana' };

  // ---------- 利用者一覧 ----------
  V.userList = (el) => {
    const today = U.today();
    const ym = U.ym(today);
    el.innerHTML = `
      <div class="page-head"><h1>利用者一覧</h1><a class="btn primary" href="#/users/new">＋ 新規登録</a></div>
      <div class="toolbar">
        <input type="search" id="ul-q" placeholder="絞り込み（かな・氏名・番号）" value="${esc(listState.q)}">
        ${UI.select({ id: 'ul-staff' }, [['', '担当：すべて'], ...S.state.settings.staff.map((s) => [s.id, s.name])], listState.staff)}
        ${UI.select({ id: 'ul-status' }, [['active', '利用中'], ['ended', '終了'], ['all', 'すべて']], listState.status)}
        ${UI.select({ id: 'ul-sort' }, [['kana', 'かな順'], ['certEnd', '認定期限が近い順'], ['level', '要介護度順']], listState.sort)}
      </div>
      <div id="ul-body"></div>`;
    const draw = () => {
      const n = U.norm(listState.q);
      let rows = S.state.users.filter((u) => {
        if (listState.status === 'active' && u.status === 'ended') return false;
        if (listState.status === 'ended' && u.status !== 'ended') return false;
        if (listState.staff && u.cmId !== listState.staff) return false;
        return !n || [u.name, u.kana, u.insuredNo].some((f) => U.norm(f).includes(n));
      });
      const certEnd = (u) => S.certOn(u, today)?.end || '9999';
      const rank = (u) => M.level(S.levelOn(u, today))?.rank ?? -1;
      rows.sort((a, b) =>
        listState.sort === 'certEnd' ? certEnd(a).localeCompare(certEnd(b)) : listState.sort === 'level' ? rank(b) - rank(a) : (a.kana || '').localeCompare(b.kana || '', 'ja')
      );
      el.querySelector('#ul-body').innerHTML = rows.length
        ? `<table class="grid clickable"><thead><tr><th>氏名</th><th>年齢</th><th>要介護度</th><th>認定有効期間</th><th>負担</th><th>担当</th><th>今月モニタ</th><th>今月利用票</th></tr></thead><tbody>
          ${rows
            .map((u) => {
              const c = S.certOn(u, today);
              const mon = S.monitoringFor(u.id, ym).length;
              const sch = S.getSchedule(u.id, ym);
              return `<tr data-href="#/user/${u.id}">
                <td><b>${esc(u.name)}</b><div class="sub">${esc(u.kana || '')}</div></td>
                <td>${U.age(u.birth) ?? '—'}歳</td>
                <td>${UI.levelBadge(c?.level)}</td>
                <td>${c ? `${esc(U.wareki(c.start, 'short'))}〜${esc(U.wareki(c.end, 'short'))} ${UI.daysBadge(U.diffDays(today, c.end))}` : '<span class="badge danger">認定なし</span>'}</td>
                <td>${u.burden || 1}割</td>
                <td>${esc(UI.staffName(u.cmId))}</td>
                <td>${mon ? '<span class="badge ok">済</span>' : '<span class="badge warn">未</span>'}</td>
                <td>${sch?.lines.length ? (sch.confirmed ? '<span class="badge ok">実績確定</span>' : '<span class="badge muted">予定</span>') : '<span class="badge warn">未作成</span>'}</td>
              </tr>`;
            })
            .join('')}</tbody></table>`
        : UI.empty('該当する利用者はいません');
      el.querySelectorAll('tr[data-href]').forEach((tr) => (tr.onclick = () => KC.app.go(tr.dataset.href)));
    };
    el.querySelector('#ul-q').addEventListener('input', (e) => ((listState.q = e.target.value), draw()));
    ['staff', 'status', 'sort'].forEach((k) => el.querySelector('#ul-' + k).addEventListener('change', (e) => ((listState[k] = e.target.value), draw())));
    draw();
  };

  // ---------- 新規登録 ----------
  V.userNew = (el) => {
    const user = {
      id: '',
      name: '',
      kana: '',
      sex: '',
      birth: '',
      burden: 1,
      status: 'active',
      cmId: S.state.settings.currentStaff || '',
      startDate: U.today(),
      certs: [],
      emergency: [{}, {}],
      doctor: {},
    };
    el.innerHTML = `<div class="page-head"><h1>利用者の新規登録</h1></div><div id="info-body"></div>`;
    renderInfoForm(el.querySelector('#info-body'), user, true);
  };

  // ---------- 利用者ワークスペース ----------
  const TABS = [
    ['info', '基本情報・認定'],
    ['plan', 'ケアプラン'],
    ['schedule', '利用票'],
    ['notes', '支援経過'],
    ['monitoring', 'モニタリング'],
    ['meeting', '担当者会議'],
  ];
  V.userWorkspace = (el, [id, tab = 'notes', sub]) => {
    const user = S.byId('users', id);
    if (!user) {
      el.innerHTML = UI.empty('利用者が見つかりません');
      return;
    }
    S.touchRecent(id);
    el.innerHTML = `${V.userHeader(user)}
      <nav class="tabs">${TABS.map(([k, l], i) => `<a href="#/user/${id}/${k}" class="${k === tab ? 'active' : ''}" title="Alt+${i + 1}">${l}</a>`).join('')}</nav>
      <div id="tab-body"></div>`;
    const body = el.querySelector('#tab-body');
    (V.tabs[tab] || V.tabs.notes)(body, user, sub);
  };

  V.userHeader = (user) => {
    const today = U.today();
    const c = S.certOn(user, today);
    const lv = M.level(c?.level);
    const plan = S.currentPlan(user.id);
    return `<section class="user-head">
      <div class="uh-main">
        <div class="uh-name">${esc(user.name)} <small>${esc(user.kana || '')}</small> ${user.status === 'ended' ? '<span class="badge muted">終了</span>' : ''}</div>
        <div class="uh-meta">
          ${user.birth ? `${esc(U.wareki(user.birth, 'short'))}生 ${U.age(user.birth)}歳` : '生年月日未登録'}
          ${user.sex ? '・' + esc(user.sex) : ''}・被保険者番号 ${esc(user.insuredNo || '未登録')}・担当 ${esc(UI.staffName(user.cmId) || '—')}
        </div>
      </div>
      <div class="uh-facts">
        <div><label>要介護度</label>${UI.levelBadge(c?.level)}</div>
        <div><label>認定有効期間</label>${c ? `${esc(U.wareki(c.start, 'short'))}〜${esc(U.wareki(c.end, 'short'))} ${UI.daysBadge(U.diffDays(today, c.end))}` : '<span class="badge danger">なし</span>'}</div>
        <div><label>限度額</label>${lv ? U.fmt(lv.limit) + '単位' : '—'}</div>
        <div><label>負担割合</label>${user.burden || 1}割</div>
        <div><label>現行プラン</label>${plan ? `${esc(U.wareki(plan.createdDate, 'short'))}作成` : '<span class="badge danger">なし</span>'}</div>
      </div>
    </section>`;
  };

  // ---------- 基本情報・認定タブ ----------
  V.tabs.info = (el, user) => renderInfoForm(el, U.clone(user), false);

  function certPeriodEnd(start, months) {
    // 月の初日開始なら開始月を含めて months ヶ月、月途中開始ならその月の残り＋ months ヶ月
    const ym = U.ym(start);
    return U.monthEnd(U.ymAdd(ym, start.endsWith('-01') ? months - 1 : months));
  }

  function renderInfoForm(el, draft, isNew) {
    draft.certs = draft.certs || [];
    draft.emergency = draft.emergency?.length ? draft.emergency : [{}, {}];
    draft.doctor = draft.doctor || {};
    const draw = () => {
      const f = (path, label, extra = {}) =>
        `<label class="fld"><span>${label}</span><input ${UI.attrs({ 'data-path': path, value: U.getPath(draft, path) ?? '', ...extra })}></label>`;
      const d = (path, label) => `<label class="fld"><span>${label}</span>${UI.dateInput({ 'data-path': path }, U.getPath(draft, path))}</label>`;
      const certs = draft.certs
        .map((c, i) => ({ c, i }))
        .sort((a, b) => (b.c.start || '').localeCompare(a.c.start || ''));
      el.innerHTML = `
        <div class="form-actions sticky">
          <button class="btn primary" data-primary-save id="save">保存 <kbd>Ctrl+S</kbd></button>
          ${isNew ? '' : `<button class="btn ghost danger-text" id="del">利用者を削除</button>`}
          <span id="msgs"></span>
        </div>
        <div class="cols">
          <div class="card">
            <h2>基本情報</h2>
            <div class="form-grid">
              ${f('name', '氏名 *', { placeholder: '介護 太郎' })}
              ${f('kana', 'ふりがな', { placeholder: 'かいご たろう' })}
              <label class="fld"><span>性別</span>${UI.select({ 'data-path': 'sex' }, ['', '男', '女'], draft.sex)}</label>
              ${d('birth', '生年月日')}
              ${f('insurerNo', '保険者番号（6桁）', { inputmode: 'numeric', maxlength: 6 })}
              ${f('insuredNo', '被保険者番号（10桁）', { inputmode: 'numeric', maxlength: 10 })}
              <label class="fld"><span>負担割合</span>${UI.select({ 'data-path': 'burden', 'data-type': 'number' }, [[1, '1割'], [2, '2割'], [3, '3割']], draft.burden)}</label>
              <label class="fld"><span>担当ケアマネ</span>${UI.select({ 'data-path': 'cmId' }, UI.staffOptions(), draft.cmId)}</label>
              ${d('startDate', '契約日')}
              <label class="fld"><span>状態</span>${UI.select({ 'data-path': 'status' }, [['active', '利用中'], ['ended', '終了']], draft.status)}</label>
              ${d('endDate', '終了日')}
              <label class="fld"><span>終了理由</span>${UI.select({ 'data-path': 'endReason' }, ['', '入院', '施設入所', '死亡', '転居', '事業所変更', '自立', 'その他'], draft.endReason)}</label>
              ${f('zip', '郵便番号')}
              ${f('address', '住所', { class: 'wide' })}
              ${f('tel', '電話番号')}
              <label class="fld chk"><input type="checkbox" data-path="livesWithFamily" ${draft.livesWithFamily ? 'checked' : ''}><span>同居家族あり（生活援助の算定理由に関係）</span></label>
            </div>
          </div>
          <div class="card">
            <h2>緊急連絡先・主治医</h2>
            <div class="form-grid">
              ${draft.emergency
                .map(
                  (e, i) => `${f(`emergency.${i}.name`, `連絡先${i + 1} 氏名`)}${f(`emergency.${i}.relation`, '続柄')}${f(`emergency.${i}.tel`, '電話')}`
                )
                .join('')}
              ${f('doctor.name', '主治医')}${f('doctor.clinic', '医療機関')}${f('doctor.tel', '電話')}
            </div>
            <label class="fld"><span>メモ（生活歴・留意事項など）</span><textarea data-path="memo" rows="4">${esc(draft.memo || '')}</textarea></label>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h2>要介護認定</h2>
            <div><button class="btn small" id="add-cert">＋ 認定を追加</button>
            <button class="btn small" id="add-renew" ${draft.certs.length ? '' : 'disabled'}>＋ 更新申請（直近の翌日から）</button></div>
          </div>
          ${
            certs.length
              ? `<table class="grid"><thead><tr><th>区分</th><th>状態</th><th>申請種別</th><th>申請日</th><th>認定日</th><th>有効期間（開始）</th><th>有効期間（終了）</th><th></th></tr></thead><tbody>
            ${certs
              .map(
                ({ c, i }) => `<tr>
                <td>${UI.select({ 'data-path': `certs.${i}.level` }, UI.levelOptions(), c.level)}</td>
                <td>${UI.select({ 'data-path': `certs.${i}.status` }, ['認定済', '申請中'], c.status)}</td>
                <td>${UI.select({ 'data-path': `certs.${i}.applyType` }, ['新規', '更新', '区分変更'], c.applyType)}</td>
                <td>${UI.dateInput({ 'data-path': `certs.${i}.applyDate` }, c.applyDate)}</td>
                <td>${UI.dateInput({ 'data-path': `certs.${i}.certDate` }, c.certDate)}</td>
                <td>${UI.dateInput({ 'data-path': `certs.${i}.start` }, c.start)}</td>
                <td>${UI.dateInput({ 'data-path': `certs.${i}.end` }, c.end)}
                  <div class="quick">${[6, 12, 24, 36, 48].map((m) => `<button class="link" data-period="${i}:${m}">${m}ヶ月</button>`).join('')}</div></td>
                <td><button class="btn small ghost" data-del-cert="${i}">削除</button></td></tr>`
              )
              .join('')}</tbody></table>`
              : UI.empty('認定情報がありません。「＋ 認定を追加」から登録してください。')
          }
          <p class="note">有効期間の上限：新規・区分変更は原則6ヶ月（3〜12ヶ月）、更新は原則12ヶ月（3〜36ヶ月、直前と同じ要介護度なら48ヶ月まで）。ボタンで終了日を自動計算します（月途中開始はその月を含めない）。</p>
        </div>`;

      el.querySelector('#save').onclick = save;
      el.querySelector('#del')?.addEventListener('click', () => {
        if (!confirm(`${draft.name} さんと関連するすべての記録を削除します。元に戻せません。よろしいですか？`)) return;
        const st = S.state;
        st.users = st.users.filter((u) => u.id !== draft.id);
        ['plans', 'notes', 'monitorings', 'meetings'].forEach((k) => (st[k] = st[k].filter((x) => x.userId !== draft.id)));
        Object.keys(st.schedules).forEach((k) => k.startsWith(draft.id + '_') && delete st.schedules[k]);
        st.recent = st.recent.filter((x) => x !== draft.id);
        S.save();
        UI.setDirty(false);
        KC.app.go('#/users');
      });
      el.querySelector('#add-cert').onclick = () => {
        draft.certs.push({ id: U.uid(), level: '', status: '認定済', applyType: draft.certs.length ? '区分変更' : '新規' });
        UI.setDirty(true);
        draw();
      };
      el.querySelector('#add-renew').onclick = () => {
        const last = S.latestCert(draft);
        const start = last?.end ? U.addDays(last.end, 1) : '';
        draft.certs.push({ id: U.uid(), level: '', status: '申請中', applyType: '更新', start, end: start ? certPeriodEnd(start, 12) : '' });
        UI.setDirty(true);
        draw();
      };
      el.querySelectorAll('[data-del-cert]').forEach(
        (b) =>
          (b.onclick = () => {
            if (!confirm('この認定情報を削除しますか？')) return;
            draft.certs.splice(Number(b.dataset.delCert), 1);
            UI.setDirty(true);
            draw();
          })
      );
      el.querySelectorAll('[data-period]').forEach(
        (b) =>
          (b.onclick = () => {
            const [i, m] = b.dataset.period.split(':').map(Number);
            const c = draft.certs[i];
            if (!c.start) return UI.toast('先に有効期間の開始日を入力してください', 'error');
            c.end = certPeriodEnd(c.start, m);
            UI.setDirty(true);
            draw();
          })
      );
    };

    function validate() {
      const errs = [];
      const warns = [];
      if (!draft.name?.trim()) errs.push('氏名は必須です');
      const ins = U.digits(draft.insuredNo);
      if (draft.insuredNo && ins.length !== 10) errs.push('被保険者番号は10桁です');
      const isr = U.digits(draft.insurerNo);
      if (draft.insurerNo && isr.length !== 6) errs.push('保険者番号は6桁です');
      if (ins && S.state.users.some((u) => u.id !== draft.id && U.digits(u.insuredNo) === ins)) warns.push('同じ被保険者番号の利用者が既に登録されています');
      draft.certs.forEach((c, i) => {
        const n = `認定${i + 1}`;
        if (!c.level) errs.push(`${n}：要介護度を選択してください`);
        if (!c.start || !c.end) errs.push(`${n}：有効期間を入力してください`);
        else {
          if (c.start > c.end) errs.push(`${n}：有効期間が逆転しています`);
          const months = (U.diffDays(c.start, c.end) + 1) / 30.4;
          const max = c.applyType === '更新' ? 48 : 12;
          if (months > max + 1) warns.push(`${n}：有効期間が${c.applyType}の上限（${max}ヶ月）を超えている可能性があります`);
        }
        draft.certs.forEach((d, j) => {
          if (j > i && c.start && c.end && d.start && d.end && U.overlaps(c.start, c.end, d.start, d.end) && c.status === '認定済' && d.status === '認定済')
            warns.push(`認定${i + 1}と認定${j + 1}の有効期間が重なっています（区分変更なら旧認定の終了日を調整）`);
        });
      });
      if (draft.status === 'ended' && !draft.endDate) warns.push('終了日が未入力です');
      return { errs, warns };
    }

    function save() {
      document.activeElement?.blur?.();
      draft.insuredNo = U.digits(draft.insuredNo);
      draft.insurerNo = U.digits(draft.insurerNo);
      const { errs, warns } = validate();
      const msgs = el.querySelector('#msgs');
      if (errs.length) {
        msgs.innerHTML = `<span class="err">${errs.map(esc).join(' / ')}</span>`;
        UI.toast(errs[0], 'error');
        return;
      }
      if (warns.length && !confirm('確認してください：\n・' + warns.join('\n・') + '\n\nこのまま保存しますか？')) return;
      S.upsert('users', draft);
      UI.setDirty(false);
      UI.toast('保存しました');
      if (isNew) KC.app.go(`#/user/${draft.id}/info`);
      else KC.app.render();
    }

    draw();
    UI.bindPath(el, draft, (path, v, e) => {
      if (e.type === 'change' && /^certs\.\d+\.(start|end|status)$/.test(path)) {
        // 並び順が変わるので再描画
        draw();
      }
    });
  }
})(globalThis);
