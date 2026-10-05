/* ケアプラン（居宅サービス計画書 第1表〜第3表） */
(function (g) {
  'use strict';
  const KC = g.KC;
  const U = KC.util;
  const S = KC.store;
  const C = KC.calc;
  const UI = KC.ui;
  const V = (KC.views = KC.views || {});
  V.tabs = V.tabs || {};
  const esc = U.esc;

  const newService = (s = {}) => ({ content: '', insured: true, type: '', provider: '', freq: '', start: s.start || '', end: s.end || '' });
  const newShort = (n = {}) => ({ goal: '', start: n.shortDefaultStart || '', end: n.shortDefaultEnd || '', services: [] });

  // 認定有効期間から目標期間の初期値を提案（長期＝認定期間、短期＝開始から6ヶ月、認定終了で頭打ち）
  function suggestPeriods(user, from) {
    const cert = S.certOn(user, from) || S.latestCert(user);
    if (!cert) return {};
    const start = from > cert.start ? from : cert.start;
    const sixEnd = U.addDays(U.addMonths(start, 6), -1);
    return { longStart: start, longEnd: cert.end, shortStart: start, shortEnd: sixEnd < cert.end ? sixEnd : cert.end };
  }

  V.tabs.plan = (el, user, planId) => {
    if (planId) return renderEditor(el, user, planId === 'new' ? null : S.byId('plans', planId));
    const plans = S.userPlans(user.id);
    el.innerHTML = `
      <div class="toolbar">
        <a class="btn primary" href="#/user/${user.id}/plan/new">＋ 新規作成</a>
        ${plans.length ? `<button class="btn" id="dup">直近のプランを複製して作成</button>` : ''}
      </div>
      ${
        plans.length
          ? `<table class="grid clickable"><thead><tr><th>作成日</th><th>区分</th><th>状態</th><th>同意日</th><th>課題数</th><th>短期目標の最短終了</th></tr></thead><tbody>
        ${plans
          .map((p) => {
            const ends = (p.needs || []).flatMap((n) => (n.shorts || []).map((s) => s.end)).filter(Boolean).sort();
            return `<tr data-href="#/user/${user.id}/plan/${p.id}">
              <td>${esc(U.wareki(p.createdDate, 'short'))}</td><td>${esc(p.planType || '')}</td>
              <td>${p.status === 'final' ? '<span class="badge ok">確定</span>' : '<span class="badge warn">作成中</span>'}</td>
              <td>${p.consentDate ? esc(U.wareki(p.consentDate, 'short')) : '<span class="badge danger">未</span>'}</td>
              <td>${(p.needs || []).length}</td><td>${ends[0] ? esc(U.wareki(ends[0], 'short')) : '—'}</td></tr>`;
          })
          .join('')}</tbody></table>`
          : UI.empty('ケアプランはまだありません')
      }`;
    el.querySelectorAll('tr[data-href]').forEach((tr) => (tr.onclick = () => KC.app.go(tr.dataset.href)));
    el.querySelector('#dup')?.addEventListener('click', () => {
      const src = plans[0];
      const copy = U.clone(src);
      Object.assign(copy, { id: U.uid(), status: 'draft', createdDate: U.today(), consentDate: '', deliveredDate: '', planType: '継続' });
      const p = suggestPeriods(user, U.today());
      // 期間は新しい認定・作成日に合わせて振り直す（内容は引き継ぐ）
      (copy.needs || []).forEach((n) => {
        if (p.longStart) Object.assign(n, { longStart: p.longStart, longEnd: p.longEnd });
        (n.shorts || []).forEach((s) => {
          if (p.shortStart) Object.assign(s, { start: p.shortStart, end: p.shortEnd });
          (s.services || []).forEach((v) => p.shortStart && Object.assign(v, { start: p.shortStart, end: p.shortEnd }));
        });
      });
      S.upsert('plans', copy);
      UI.toast('複製しました。期間を新しい認定に合わせて振り直しています');
      KC.app.go(`#/user/${user.id}/plan/${copy.id}`);
    });
  };

  function renderEditor(el, user, plan) {
    const isNew = !plan;
    const today = U.today();
    const cert = S.certOn(user, today) || S.latestCert(user);
    const draft = plan
      ? U.clone(plan)
      : {
          id: '',
          userId: user.id,
          status: 'draft',
          createdDate: today,
          planType: S.userPlans(user.id).length ? '継続' : '初回',
          certStatus: cert?.status || '認定済',
          intention: '',
          committee: '',
          policy: '',
          lifeReason: '',
          needs: [],
          weekly: { items: [], daily: '', other: '' },
          staffId: S.state.settings.currentStaff || user.cmId || '',
        };
    draft.weekly = draft.weekly || { items: [], daily: '', other: '' };
    const locked = () => draft.status === 'final';

    const draw = () => {
      const { errs, warns, cert: c } = C.validatePlan(draft, user);
      const ro = locked() ? { disabled: true } : {};
      const ta = (path, rows = 3, ph = '') =>
        `<textarea ${UI.attrs({ 'data-path': path, rows, placeholder: ph, ...ro })}>${esc(U.getPath(draft, path) || '')}</textarea>`;
      const inp = (path, extra = {}) => `<input ${UI.attrs({ 'data-path': path, value: U.getPath(draft, path) || '', ...ro, ...extra })}>`;
      const dt = (path) => UI.dateInput({ 'data-path': path, ...ro }, U.getPath(draft, path));
      el.innerHTML = `
        <div class="form-actions sticky">
          <a class="btn ghost" href="#/user/${user.id}/plan">← 一覧</a>
          ${locked() ? `<button class="btn" id="unlock">確定を解除して編集</button>` : `<button class="btn primary" data-primary-save id="save">保存</button><button class="btn" id="finalize">確定（交付）</button>`}
          <button class="btn" id="print">印刷（第1〜3表）</button>
          ${isNew ? '' : `<button class="btn ghost danger-text" id="del">削除</button>`}
          <span class="status">${locked() ? '<span class="badge ok">確定済</span>' : '<span class="badge warn">作成中</span>'}</span>
        </div>
        ${errs.length || warns.length ? `<div class="checks">${errs.map((e) => `<div class="err">✕ ${esc(e)}</div>`).join('')}${warns.map((w) => `<div class="warn">！ ${esc(w)}</div>`).join('')}</div>` : '<div class="checks ok">整合性チェック：問題は見つかりませんでした</div>'}

        <div class="card">
          <h2>第1表 居宅サービス計画書(1)</h2>
          <div class="form-grid">
            <label class="fld"><span>作成日</span>${dt('createdDate')}</label>
            <label class="fld"><span>計画作成区分</span>${UI.select({ 'data-path': 'planType', ...ro }, ['初回', '紹介', '継続'], draft.planType)}</label>
            <label class="fld"><span>認定状況</span>${UI.select({ 'data-path': 'certStatus', ...ro }, ['認定済', '申請中'], draft.certStatus)}</label>
            <label class="fld"><span>計画作成者</span>${UI.select({ 'data-path': 'staffId', ...ro }, UI.staffOptions(), draft.staffId)}</label>
            <label class="fld"><span>利用者同意日</span>${dt('consentDate')}</label>
            <label class="fld"><span>交付日</span>${dt('deliveredDate')}</label>
          </div>
          <div class="cert-line">認定：${c ? `${UI.levelBadge(c.level)} ${esc(U.wareki(c.start, 'short'))}〜${esc(U.wareki(c.end, 'short'))}` : '<span class="badge danger">なし</span>'}</div>
          <label class="fld"><span>利用者及び家族の生活に対する意向を踏まえた課題分析の結果</span>${ta('intention', 4, '本人：「…」\n家族（長女）：「…」')}</label>
          <label class="fld"><span>介護認定審査会の意見及びサービスの種類の指定</span>${ta('committee', 2, '特になし')}</label>
          <label class="fld"><span>総合的な援助の方針</span>${ta('policy', 4)}</label>
          <label class="fld"><span>生活援助中心型の算定理由</span>${UI.select({ 'data-path': 'lifeReason', ...ro }, ['', '1. 一人暮らし', '2. 家族等が障害、疾病等', '3. その他'], draft.lifeReason)}</label>
          ${draft.lifeReason === '3. その他' ? `<label class="fld"><span>その他の理由</span>${inp('lifeReasonOther')}</label>` : ''}
        </div>

        <div class="card">
          <div class="card-head"><h2>第2表 居宅サービス計画書(2)</h2>${locked() ? '' : '<button class="btn small" id="add-need">＋ 課題を追加</button>'}</div>
          ${(draft.needs || []).length ? draft.needs.map((n, i) => needBlock(n, i, ro, dt, ta, inp)).join('') : UI.empty('課題（ニーズ）を追加してください')}
          <p class="note">「※1」は保険給付の対象となるサービスにチェック。期間は認定有効期間から自動提案されます（入力済みの期間は上書きしません）。</p>
        </div>

        <div class="card">
          <div class="card-head"><h2>第3表 週間サービス計画表</h2>${locked() ? '' : '<button class="btn small" id="add-week">＋ 予定を追加</button>'}</div>
          ${weeklyEditor(draft.weekly, ro)}
          ${weeklyGrid(draft.weekly)}
          <label class="fld"><span>主な日常生活上の活動</span>${ta('weekly.daily', 2, '6:30 起床／7:30 朝食／…')}</label>
          <label class="fld"><span>週単位以外のサービス</span>${ta('weekly.other', 2, '福祉用具貸与（特殊寝台）、訪問診療（月2回）など')}</label>
        </div>`;
      bind();
    };

    function needBlock(n, i, ro, dt, ta, inp) {
      const p = `needs.${i}`;
      return `<div class="need">
        <div class="need-head"><b>課題${i + 1}</b>
          ${locked() ? '' : `<span><button class="link" data-move="${i}:-1">↑</button><button class="link" data-move="${i}:1">↓</button><button class="link danger-text" data-del-need="${i}">削除</button></span>`}</div>
        <div class="need-grid">
          <label class="fld"><span>生活全般の解決すべき課題（ニーズ）</span>${ta(p + '.need', 3)}</label>
          <div>
            <label class="fld"><span>長期目標</span>${ta(p + '.longGoal', 2)}</label>
            <div class="period">${dt(p + '.longStart')}〜${dt(p + '.longEnd')}</div>
          </div>
        </div>
        ${(n.shorts || [])
          .map(
            (s, j) => `<div class="short">
          <div class="short-head"><b>短期目標${j + 1}</b>${locked() ? '' : `<button class="link danger-text" data-del-short="${i}:${j}">削除</button>`}</div>
          <label class="fld">${ta(`${p}.shorts.${j}.goal`, 2)}</label>
          <div class="period">${dt(`${p}.shorts.${j}.start`)}〜${dt(`${p}.shorts.${j}.end`)}</div>
          <table class="grid svc"><thead><tr><th>サービス内容</th><th>※1</th><th>サービス種別</th><th>※2 事業所</th><th>頻度</th><th>期間</th><th></th></tr></thead><tbody>
          ${(s.services || [])
            .map((v, k) => {
              const q = `${p}.shorts.${j}.services.${k}`;
              return `<tr><td>${ta(q + '.content', 2)}</td>
                <td class="c"><input type="checkbox" data-path="${q}.insured" ${v.insured ? 'checked' : ''} ${locked() ? 'disabled' : ''}></td>
                <td>${inp(q + '.type', { list: 'dl-types' })}</td>
                <td>${inp(q + '.provider', { list: 'dl-providers' })}</td>
                <td>${inp(q + '.freq', { placeholder: '週2回', class: 'narrow' })}</td>
                <td class="period-cell">${dt(q + '.start')}〜${dt(q + '.end')}</td>
                <td>${locked() ? '' : `<button class="link danger-text" data-del-svc="${i}:${j}:${k}">×</button>`}</td></tr>`;
            })
            .join('')}
          </tbody></table>
          ${locked() ? '' : `<button class="btn small ghost" data-add-svc="${i}:${j}">＋ サービス</button>`}
        </div>`
          )
          .join('')}
        ${locked() ? '' : `<button class="btn small ghost" data-add-short="${i}">＋ 短期目標</button>`}
      </div>`;
    }

    function weeklyEditor(w, ro) {
      if (!w.items.length) return '';
      return `<table class="grid"><thead><tr><th>内容</th><th>曜日</th><th>開始</th><th>終了</th><th></th></tr></thead><tbody>
        ${w.items
          .map(
            (it, i) => `<tr><td><input ${UI.attrs({ 'data-path': `weekly.items.${i}.label`, value: it.label || '', list: 'dl-types', ...ro })}></td>
          <td class="wd-pick">${U.WD.map((d, wd) => `<label><input type="checkbox" data-wd="${i}:${wd}" ${(it.days || []).includes(wd) ? 'checked' : ''} ${locked() ? 'disabled' : ''}>${d}</label>`).join('')}</td>
          <td><input type="time" ${UI.attrs({ 'data-path': `weekly.items.${i}.start`, value: it.start || '', ...ro })}></td>
          <td><input type="time" ${UI.attrs({ 'data-path': `weekly.items.${i}.end`, value: it.end || '', ...ro })}></td>
          <td>${locked() ? '' : `<button class="link danger-text" data-del-week="${i}">×</button>`}</td></tr>`
          )
          .join('')}</tbody></table>`;
    }

    function bind() {
      const q = (s) => el.querySelector(s);
      const types = [...new Set([...KC.master.typeNames, ...S.state.providers.map((p) => p.serviceType)])];
      el.insertAdjacentHTML(
        'beforeend',
        `<datalist id="dl-types">${types.map((t) => `<option value="${esc(t)}">`).join('')}</datalist>
         <datalist id="dl-providers">${S.state.providers.map((p) => `<option value="${esc(p.name)}">`).join('')}</datalist>`
      );
      q('#save')?.addEventListener('click', () => save(false));
      q('#finalize')?.addEventListener('click', () => save(true));
      q('#unlock')?.addEventListener('click', () => {
        if (!confirm('確定を解除します。内容を変更した場合は、再度利用者の同意・交付が必要です。')) return;
        draft.status = 'draft';
        UI.setDirty(true);
        draw();
      });
      q('#print')?.addEventListener('click', () => KC.print.plan(user, draft));
      q('#del')?.addEventListener('click', () => {
        if (!confirm('このケアプランを削除しますか？')) return;
        S.remove('plans', draft.id);
        UI.setDirty(false);
        KC.app.go(`#/user/${user.id}/plan`);
      });
      const mutate = (fn) => () => {
        fn();
        UI.setDirty(true);
        draw();
      };
      q('#add-need')?.addEventListener(
        'click',
        mutate(() => {
          const p = suggestPeriods(user, draft.createdDate || today);
          draft.needs.push({ need: '', longGoal: '', longStart: p.longStart || '', longEnd: p.longEnd || '', shorts: [{ ...newShort(), start: p.shortStart || '', end: p.shortEnd || '' }] });
        })
      );
      q('#add-week')?.addEventListener('click', mutate(() => draft.weekly.items.push({ label: '', days: [], start: '09:00', end: '10:00' })));
      el.querySelectorAll('[data-add-short]').forEach((b) =>
        b.addEventListener(
          'click',
          mutate(() => {
            const n = draft.needs[Number(b.dataset.addShort)];
            const last = n.shorts[n.shorts.length - 1];
            n.shorts.push({ ...newShort(), start: last?.start || n.longStart || '', end: last?.end || n.longEnd || '' });
          })
        )
      );
      el.querySelectorAll('[data-add-svc]').forEach((b) =>
        b.addEventListener(
          'click',
          mutate(() => {
            const [i, j] = b.dataset.addSvc.split(':').map(Number);
            const s = draft.needs[i].shorts[j];
            s.services.push(newService(s));
          })
        )
      );
      el.querySelectorAll('[data-del-need]').forEach((b) =>
        b.addEventListener('click', () => confirm('この課題を削除しますか？') && mutate(() => draft.needs.splice(Number(b.dataset.delNeed), 1))())
      );
      el.querySelectorAll('[data-del-short]').forEach((b) =>
        b.addEventListener('click', mutate(() => {
          const [i, j] = b.dataset.delShort.split(':').map(Number);
          draft.needs[i].shorts.splice(j, 1);
        }))
      );
      el.querySelectorAll('[data-del-svc]').forEach((b) =>
        b.addEventListener('click', mutate(() => {
          const [i, j, k] = b.dataset.delSvc.split(':').map(Number);
          draft.needs[i].shorts[j].services.splice(k, 1);
        }))
      );
      el.querySelectorAll('[data-move]').forEach((b) =>
        b.addEventListener('click', mutate(() => {
          const [i, d] = b.dataset.move.split(':').map(Number);
          const j = i + d;
          if (j < 0 || j >= draft.needs.length) return;
          [draft.needs[i], draft.needs[j]] = [draft.needs[j], draft.needs[i]];
        }))
      );
      el.querySelectorAll('[data-del-week]').forEach((b) => b.addEventListener('click', mutate(() => draft.weekly.items.splice(Number(b.dataset.delWeek), 1))));
      el.querySelectorAll('[data-wd]').forEach((cb) =>
        cb.addEventListener('change', () => {
          const [i, wd] = cb.dataset.wd.split(':').map(Number);
          const it = draft.weekly.items[i];
          it.days = cb.checked ? [...new Set([...(it.days || []), wd])].sort() : (it.days || []).filter((x) => x !== wd);
          UI.setDirty(true);
          el.querySelector('.week-grid').outerHTML = weeklyGrid(draft.weekly);
        })
      );
    }

    function save(finalize) {
      document.activeElement?.blur?.();
      if (finalize) {
        const tmp = { ...draft, status: 'final' };
        if (!tmp.consentDate) {
          const v = prompt('利用者の同意日を入力してください（例：R8.10.5）', U.wareki(U.today(), 'short'));
          if (v == null) return;
          const iso = U.parseDate(v);
          if (!iso) return UI.toast('日付を解釈できません', 'error');
          draft.consentDate = iso;
          if (!draft.deliveredDate) draft.deliveredDate = iso;
        }
        const { errs } = C.validatePlan({ ...draft, status: 'final' }, user);
        if (errs.length) {
          draw();
          return UI.toast('エラーを解消してから確定してください', 'error');
        }
        draft.status = 'final';
      }
      S.upsert('plans', draft);
      UI.setDirty(false);
      UI.toast(finalize ? '確定しました（同意・交付済み）' : '保存しました');
      if (isNew) KC.app.go(`#/user/${user.id}/plan/${draft.id}`);
      else draw();
    }

    draw();
    // チェック結果をリアルタイム更新するため、構造に関わらない入力は再描画せずチェック欄だけ更新
    UI.bindPath(el, draft, (path, v, e) => {
      if (e.type !== 'change') return;
      if (path === 'lifeReason') return draw();
      if (path.startsWith('weekly.items')) {
        const grid = el.querySelector('.week-grid');
        if (grid) grid.outerHTML = weeklyGrid(draft.weekly);
      }
      const { errs, warns } = C.validatePlan(draft, user);
      const box = el.querySelector('.checks');
      if (box) {
        box.className = 'checks' + (errs.length || warns.length ? '' : ' ok');
        box.innerHTML = errs.length || warns.length ? errs.map((x) => `<div class="err">✕ ${esc(x)}</div>`).join('') + warns.map((x) => `<div class="warn">！ ${esc(x)}</div>`).join('') : '整合性チェック：問題は見つかりませんでした';
      }
    });
  }

  // 第3表：時間帯×曜日のグリッド表示（30分刻み、6時〜22時）
  function weeklyGrid(w) {
    const slots = [];
    for (let h = 6; h < 22; h++) slots.push(`${U.pad(h)}:00`, `${U.pad(h)}:30`);
    const order = [1, 2, 3, 4, 5, 6, 0];
    const cell = (wd, t) => {
      const items = (w.items || []).filter((it) => (it.days || []).includes(wd) && it.start <= t && t < (it.end || it.start));
      return items.map((it) => esc(it.label)).join('<br>');
    };
    return `<div class="week-grid"><table><thead><tr><th></th>${order.map((d) => `<th>${U.WD[d]}</th>`).join('')}</tr></thead><tbody>
      ${slots
        .map((t) => {
          const row = order.map((wd) => {
            const c = cell(wd, t);
            return `<td class="${c ? 'on' : ''}">${t.endsWith(':00') || c ? c : ''}</td>`;
          });
          return `<tr class="${t.endsWith(':00') ? 'hour' : ''}"><th>${t.endsWith(':00') ? t : ''}</th>${row.join('')}</tr>`;
        })
        .join('')}</tbody></table></div>`;
  }
  V.weeklyGrid = weeklyGrid;
})(globalThis);
