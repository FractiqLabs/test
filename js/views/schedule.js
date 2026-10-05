/* 利用票・提供票（第6表・第7表）：月間予定／実績、限度額管理、利用者負担 */
(function (g) {
  'use strict';
  const KC = g.KC;
  const U = KC.util;
  const M = KC.master;
  const S = KC.store;
  const C = KC.calc;
  const UI = KC.ui;
  const V = (KC.views = KC.views || {});
  V.tabs = V.tabs || {};
  const esc = U.esc;

  let mode = 'plan';

  V.tabs.schedule = (el, user, ymParam) => {
    const ym = /^\d{4}-\d{2}$/.test(ymParam || '') ? ymParam : U.ym(U.today());
    const sch = S.getSchedule(user.id, ym) ? U.clone(S.getSchedule(user.id, ym)) : { userId: user.id, ym, lines: [], overflowLineId: '', confirmed: false };
    const n = U.daysInMonth(ym);
    const days = Array.from({ length: n }, (_, i) => i + 1);
    let addType = '';

    const persist = () => {
      S.saveSchedule(sch);
    };

    const draw = () => {
      const res = C.computeMonth(user, ym, sch, mode);
      const plan = C.computeMonth(user, ym, sch, 'plan');
      const lv = res.limitLevel;
      const pct = res.limit ? Math.min(100, Math.round((res.targetTotal / res.limit) * 100)) : 0;
      const locked = sch.confirmed;
      el.innerHTML = `
        <div class="sched-head">
          <div class="month-nav">
            <a class="btn small" href="#/user/${user.id}/schedule/${U.ymAdd(ym, -1)}">← 前月</a>
            <b>${esc(U.warekiYM(ym))}</b> <small>(${ym})</small>
            <a class="btn small" href="#/user/${user.id}/schedule/${U.ymAdd(ym, 1)}">翌月 →</a>
          </div>
          <div class="seg">
            <button class="${mode === 'plan' ? 'on' : ''}" data-mode="plan">予定を入力</button>
            <button class="${mode === 'actual' ? 'on' : ''}" data-mode="actual">実績を入力</button>
          </div>
          <div class="limit-box">
            <div>限度額 ${lv ? `${esc(lv.label)} ${U.fmt(res.limit)}単位` : '<span class="badge danger">認定なし</span>'}
              ${S.certsInMonth(user, ym).length > 1 ? '<span class="badge info" title="月途中で認定が変わる場合は重い方の限度額">月途中変更</span>' : ''}</div>
            <div class="bar big ${res.over ? 'over' : pct > 90 ? 'near' : ''}"><span style="width:${pct}%"></span></div>
            <div>${mode === 'plan' ? '予定' : '実績'} ${U.fmt(res.targetTotal)}単位 ／ 残り ${U.fmt(Math.max(0, res.limit - res.targetTotal))}単位
              ${res.over ? `<b class="danger-text">超過 ${U.fmt(res.over)}単位</b>` : ''}</div>
          </div>
        </div>
        ${res.warnings.map((w) => `<div class="alert warn">${esc(w)}</div>`).join('')}
        ${locked ? `<div class="alert info">この月は実績確定済みです。修正する場合は「確定を解除」してください。</div>` : ''}
        <div class="toolbar">
          ${locked ? '' : addLineForm()}
          <span class="spacer"></span>
          ${locked ? '' : `<button class="btn small" id="copy-prev" title="前月の曜日パターンで予定を作成">前月からコピー</button>`}
          ${locked ? '' : `<button class="btn small" id="plan-to-actual">予定→実績へ反映</button>`}
          <button class="btn small ${locked ? '' : 'primary'}" id="confirm">${locked ? '確定を解除' : '実績を確定'}</button>
          <button class="btn small" id="print">印刷（利用票・別表）</button>
        </div>
        ${sch.lines.length ? gridHTML(res, locked) : UI.empty('サービス行がありません。上の「サービスを追加」または「前月からコピー」から作成してください。')}
        ${sch.lines.length ? summaryHTML(res, plan) : ''}`;
      bind(res);
    };

    function addLineForm() {
      const types = M.typeNames.filter((t) => S.allServices().some((s) => s.type === t));
      const svcs = S.allServices().filter((s) => s.type === addType);
      const provs = S.state.providers.filter((p) => !addType || p.serviceType === addType);
      return `<div class="add-line">
        ${UI.select({ id: 'al-type' }, [['', 'サービス種類…'], ...types], addType)}
        ${UI.select({ id: 'al-svc' }, [['', 'サービス内容…'], ...svcs.map((s) => [s.id, s.name + (s.units != null && !s.levelUnits ? `（${s.units}）` : '')])], '')}
        ${UI.select({ id: 'al-prov' }, [['', '事業所…'], ...provs.map((p) => [p.id, p.name])], provs.length === 1 ? provs[0].id : '')}
        <button class="btn small primary" id="al-add">＋ サービスを追加</button>
      </div>`;
    }

    function gridHTML(res, locked) {
      const today = U.today();
      return `<div class="sched-wrap"><table class="sched ${mode}">
        <thead><tr>
          <th class="sticky-col">サービス内容／事業所</th><th>単位</th>
          ${days
            .map((d) => {
              const iso = U.dayISO(ym, d);
              const wd = U.weekday(iso);
              return `<th class="d wd${wd} ${iso === today ? 'today' : ''}">${d}<br><small>${U.WD[wd]}</small></th>`;
            })
            .join('')}
          <th>回数</th><th>単位計</th><th title="区分支給限度基準額の超過分を優先して割り当てる行">超過<br>充当</th><th></th>
        </tr></thead><tbody>
        ${res.rows
          .map((r, i) => {
            const l = r.line;
            const svc = r.svc;
            const monthly = svc?.kind === 'monthly';
            const plan = new Set(l.plan || []);
            const act = new Set(l.actual || []);
            const unitCell = svc?.manualUnits
              ? `<input class="units" data-units="${i}" data-type="number" value="${esc(l.units ?? '')}" placeholder="単位" ${locked ? 'disabled' : ''}>`
              : `<input class="units" data-override="${i}" value="${esc(l.unitsOverride ?? '')}" placeholder="${esc(svc?.levelUnits ? '度別' : svc?.units ?? '')}" title="空欄ならマスタの単位数" ${locked ? 'disabled' : ''}>`;
            const cells = monthly
              ? `<td class="monthly" colspan="${n}"><label><input type="checkbox" data-monthly="${i}" ${(l[mode] || []).length ? 'checked' : ''} ${locked ? 'disabled' : ''}> 月額で算定（${mode === 'plan' ? '予定' : '実績'}）</label>
                 ${mode === 'actual' && (l.plan || []).length && !(l.actual || []).length ? '<span class="badge warn">予定あり・実績なし</span>' : ''}</td>`
              : days
                  .map((d) => {
                    const wd = U.weekday(U.dayISO(ym, d));
                    const p = plan.has(d);
                    const a = act.has(d);
                    const cls = ['d', 'wd' + wd, p ? 'p' : '', a ? 'a' : '', mode === 'actual' && p && !a ? 'miss' : '', mode === 'actual' && a && !p ? 'extra' : ''].join(' ');
                    const mark = mode === 'plan' ? (p ? '○' : '') : a ? '●' : p ? '○' : '';
                    return `<td class="${cls}" data-cell="${i}:${d}">${mark}</td>`;
                  })
                  .join('');
            return `<tr class="${r.over ? 'has-over' : ''} ${r.limitTarget ? '' : 'nolimit'}">
              <td class="sticky-col"><div class="svc-name">${esc(svc?.name || '（不明なサービス）')} ${r.limitTarget ? '' : '<span class="badge muted">限度額対象外</span>'}</div>
                <div class="sub">${esc(svc?.type || '')}／${esc(r.provider?.name || '事業所未設定')}</div>
                ${monthly || locked ? '' : `<div class="wd-fill">${[1, 2, 3, 4, 5, 6, 0].map((wd) => `<button class="link" data-fill="${i}:${wd}" title="毎週${U.WD[wd]}曜を一括で入れる／外す">${U.WD[wd]}</button>`).join('')}<button class="link" data-clear="${i}">消</button></div>`}
              </td>
              <td>${unitCell}</td>
              ${cells}
              <td class="num">${r.count}</td><td class="num">${U.fmt(r.total)}${r.over ? `<div class="danger-text">超過${U.fmt(r.over)}</div>` : ''}</td>
              <td class="c">${r.limitTarget ? `<input type="radio" name="overflow" data-overflow="${l.id}" ${sch.overflowLineId === l.id ? 'checked' : ''} ${locked ? 'disabled' : ''}>` : ''}</td>
              <td>${locked ? '' : `<button class="link" data-up="${i}">↑</button><button class="link danger-text" data-del="${i}">×</button>`}</td>
            </tr>`;
          })
          .join('')}
        </tbody></table></div>
        <p class="note">セルをクリック（ドラッグで連続入力）。${mode === 'actual' ? '●＝実績、○＝予定のみ（赤枠は予定ありで実績なし、青は予定外の実績）。' : '○＝予定。'}曜日ボタンで毎週同じ曜日を一括入力できます。</p>`;
    }

    function summaryHTML(res, plan) {
      const t = res.totals;
      return `<div class="card">
        <h2>別表（区分支給限度管理・利用者負担計算）<small>${mode === 'plan' ? '予定' : '実績'}ベース</small></h2>
        <table class="grid num-right"><thead><tr><th>事業所</th><th>サービス種類</th><th>単位数計</th><th>限度超過</th><th>限度内</th><th>処遇改善等</th><th>単価</th><th>費用総額</th><th>保険給付</th><th>利用者負担</th><th>超過分（全額負担）</th></tr></thead><tbody>
          ${res.groups
            .map(
              (gr) => `<tr><td>${esc(gr.provider?.name || '未設定')}</td><td>${esc(gr.type)}</td><td>${U.fmt(gr.total)}</td><td>${gr.over ? U.fmt(gr.over) : ''}</td><td>${U.fmt(gr.inLimit)}</td>
              <td>${gr.shogu ? `${U.fmt(gr.shogu)}<small>(${gr.shoguRate}%)</small>` : ''}</td><td>${gr.price.toFixed(2)}</td><td>${U.fmt(gr.fee)}</td><td>${U.fmt(gr.benefit)}</td><td>${U.fmt(gr.userPay)}</td><td>${gr.overFee ? U.fmt(gr.overFee) : ''}</td></tr>`
            )
            .join('')}
        </tbody><tfoot><tr><th colspan="7">合計（負担割合 ${user.burden || 1}割）</th><th>${U.fmt(t.fee)}</th><th>${U.fmt(t.benefit)}</th><th>${U.fmt(t.userPay)}</th><th>${U.fmt(t.overFee)}</th></tr></tfoot></table>
        <div class="total-line">利用者負担見込み：<b>${UI.yen(t.userTotal)}</b>
          ${mode === 'actual' && plan.totals.userTotal !== t.userTotal ? `<small>（予定比 ${t.userTotal - plan.totals.userTotal >= 0 ? '+' : ''}${U.fmt(t.userTotal - plan.totals.userTotal)}円）</small>` : ''}
          ${res.shortStayDays ? `／短期入所 ${res.shortStayDays}日` : ''}</div>
        <p class="note">費用総額＝単位数×単価（円未満切捨て）、保険給付＝費用総額×給付率（円未満切捨て）、利用者負担＝差額。処遇改善加算等は限度額管理の対象外で、限度内単位数×加算率（四捨五入）で計算。高額介護サービス費・公費・食費等は含みません。</p>
      </div>`;
    }

    function bind(res) {
      const q = (s) => el.querySelector(s);
      const redraw = () => {
        persist();
        draw();
      };
      el.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => ((mode = b.dataset.mode), draw())));
      q('#al-type')?.addEventListener('change', (e) => ((addType = e.target.value), draw()));
      q('#al-add')?.addEventListener('click', () => {
        const serviceId = q('#al-svc').value;
        if (!serviceId) return UI.toast('サービス内容を選択してください', 'error');
        const svc = S.service(serviceId);
        sch.lines.push({ id: U.uid(), serviceId, providerId: q('#al-prov').value, plan: [], actual: [], units: svc.manualUnits ? '' : undefined });
        redraw();
      });
      q('#copy-prev')?.addEventListener('click', () => {
        const prev = S.getSchedule(user.id, U.ymAdd(ym, -1));
        if (!prev?.lines.length) return UI.toast('前月の利用票がありません', 'error');
        if (sch.lines.length && !confirm('現在の行を前月の内容で置き換えます。よろしいですか？')) return;
        sch.lines = C.copyByWeekday(prev, ym);
        const idx = prev.lines.findIndex((l) => l.id === prev.overflowLineId);
        sch.overflowLineId = idx >= 0 ? sch.lines[idx].id : '';
        UI.toast('前月の曜日パターンで予定を作成しました');
        redraw();
      });
      q('#plan-to-actual')?.addEventListener('click', () => {
        const has = sch.lines.some((l) => (l.actual || []).length);
        if (has && !confirm('入力済みの実績を予定で上書きします。よろしいですか？')) return;
        sch.lines.forEach((l) => (l.actual = [...(l.plan || [])]));
        mode = 'actual';
        UI.toast('予定を実績に反映しました。変更があった日だけ修正してください');
        redraw();
      });
      q('#confirm')?.addEventListener('click', () => {
        if (!sch.confirmed) {
          const missing = sch.lines.some((l) => (l.plan || []).length && !(l.actual || []).length);
          if (!sch.lines.some((l) => (l.actual || []).length)) return UI.toast('実績が入力されていません', 'error');
          if (missing && !confirm('予定があるのに実績がない行があります。このまま確定しますか？')) return;
        }
        sch.confirmed = !sch.confirmed;
        UI.toast(sch.confirmed ? '実績を確定しました' : '確定を解除しました');
        redraw();
      });
      q('#print')?.addEventListener('click', () => KC.print.schedule(user, ym, sch, C.computeMonth(user, ym, sch, mode)));
      el.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => {
        const l = sch.lines[Number(b.dataset.del)];
        if (((l.plan || []).length || (l.actual || []).length) && !confirm('この行を削除しますか？')) return;
        sch.lines.splice(Number(b.dataset.del), 1);
        redraw();
      }));
      el.querySelectorAll('[data-up]').forEach((b) => (b.onclick = () => {
        const i = Number(b.dataset.up);
        if (i > 0) [sch.lines[i - 1], sch.lines[i]] = [sch.lines[i], sch.lines[i - 1]];
        redraw();
      }));
      el.querySelectorAll('[data-overflow]').forEach((r) => (r.onchange = () => ((sch.overflowLineId = r.dataset.overflow), redraw())));
      el.querySelectorAll('[data-monthly]').forEach((cb) => (cb.onchange = () => {
        sch.lines[Number(cb.dataset.monthly)][mode] = cb.checked ? [1] : [];
        redraw();
      }));
      el.querySelectorAll('[data-units]').forEach((inp) => (inp.onchange = () => {
        sch.lines[Number(inp.dataset.units)].units = U.num(inp.value);
        redraw();
      }));
      el.querySelectorAll('[data-override]').forEach((inp) => (inp.onchange = () => {
        sch.lines[Number(inp.dataset.override)].unitsOverride = inp.value.trim() === '' ? '' : U.num(inp.value);
        redraw();
      }));
      el.querySelectorAll('[data-fill]').forEach((b) => (b.onclick = () => {
        const [i, wd] = b.dataset.fill.split(':').map(Number);
        const l = sch.lines[i];
        const target = days.filter((d) => U.weekday(U.dayISO(ym, d)) === wd);
        const cur = new Set(l[mode] || []);
        const allOn = target.every((d) => cur.has(d));
        target.forEach((d) => (allOn ? cur.delete(d) : cur.add(d)));
        l[mode] = [...cur].sort((a, b) => a - b);
        redraw();
      }));
      el.querySelectorAll('[data-clear]').forEach((b) => (b.onclick = () => {
        sch.lines[Number(b.dataset.clear)][mode] = [];
        redraw();
      }));

      // ドラッグで連続入力
      if (sch.confirmed) return;
      let painting = null;
      const apply = (td) => {
        const [i, d] = td.dataset.cell.split(':').map(Number);
        const l = sch.lines[i];
        const cur = new Set(l[mode] || []);
        if (painting.value) cur.add(d);
        else cur.delete(d);
        l[mode] = [...cur].sort((a, b) => a - b);
        td.classList.toggle(mode === 'plan' ? 'p' : 'a', painting.value);
        td.textContent = mode === 'plan' ? (painting.value ? '○' : '') : painting.value ? '●' : (l.plan || []).includes(d) ? '○' : '';
      };
      const table = el.querySelector('.sched');
      if (!table) return;
      table.addEventListener('mousedown', (e) => {
        const td = e.target.closest('td[data-cell]');
        if (!td) return;
        e.preventDefault();
        const [i, d] = td.dataset.cell.split(':').map(Number);
        painting = { row: i, value: !(sch.lines[i][mode] || []).includes(d) };
        apply(td);
        document.addEventListener('mouseup', end, { once: true });
      });
      table.addEventListener('mouseover', (e) => {
        if (!painting) return;
        const td = e.target.closest('td[data-cell]');
        if (td && Number(td.dataset.cell.split(':')[0]) === painting.row) apply(td);
      });
      const end = () => {
        if (!painting) return;
        painting = null;
        redraw();
      };
      table.addEventListener('mouseleave', () => painting && end());
    }

    draw();
  };
})(globalThis);
