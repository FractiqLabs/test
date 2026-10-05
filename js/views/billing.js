/* 給付管理・居宅介護支援費の請求 */
(function (g) {
  'use strict';
  const KC = g.KC;
  const U = KC.util;
  const M = KC.master;
  const S = KC.store;
  const C = KC.calc;
  const UI = KC.ui;
  const V = (KC.views = KC.views || {});
  const esc = U.esc;

  V.billing = (el, [ymParam]) => {
    const today = U.today();
    // 10日までは前月分の請求作業が中心なので前月を初期表示
    const ym = ymParam || (Number(today.slice(8, 10)) <= 10 ? U.ymAdd(U.ym(today), -1) : U.ym(today));
    const k = C.kyotakuMonth(ym);
    const st = S.state;
    const unconfirmed = [...k.items, ...k.notBillable].filter((x) => x.sch?.lines.length && !x.sch.confirmed);

    el.innerHTML = `
      <div class="page-head"><h1>給付管理・請求</h1>
        <div class="month-nav"><a class="btn small" href="#/billing/${U.ymAdd(ym, -1)}">← 前月</a><b>${esc(U.warekiYM(ym))}</b>サービス提供分<a class="btn small" href="#/billing/${U.ymAdd(ym, 1)}">翌月 →</a></div>
      </div>
      ${unconfirmed.length ? `<div class="alert warn">実績未確定の利用者が${unconfirmed.length}名います（予定で仮計算しています）：${unconfirmed.map((x) => `<a href="#/user/${x.user.id}/schedule/${ym}">${esc(x.user.name)}</a>`).join('、')}</div>` : ''}
      <div class="kpis">
        <div class="kpi"><div class="kpi-label">取扱件数</div><div class="kpi-value">${(Math.round(k.caseCount * 100) / 100).toFixed(2)}件</div><div class="sub">要介護${k.items.length}名＋要支援${k.support.length}名×1/3</div></div>
        <div class="kpi"><div class="kpi-label">介護支援専門員1人当たり</div><div class="kpi-value ${k.perCm >= k.fee.th[0] ? 'danger-text' : ''}">${(Math.round(k.perCm * 100) / 100).toFixed(2)}件</div><div class="sub">常勤換算 ${k.fte}人・逓減 ${k.fee.th[0]}件〜</div></div>
        <div class="kpi"><div class="kpi-label">居宅介護支援費 合計</div><div class="kpi-value">${U.fmt(k.totalUnits)}単位</div><div class="sub">${UI.yen(k.totalYen)}（単価 ${k.price.toFixed(2)}円）</div></div>
      </div>

      <div class="card">
        <div class="card-head"><h2>居宅介護支援費</h2>
          <div><button class="btn small" id="csv-k">CSV出力</button></div></div>
        ${
          k.items.length
            ? `<table class="grid num-right"><thead><tr><th>利用者</th><th>要介護度</th><th>区分</th><th>基本</th><th>運営基準減算</th><th>加算</th><th>単位数</th><th>金額</th><th>確認事項</th></tr></thead><tbody>
          ${k.items
            .map((x) => {
              const noMon = !S.monitoringFor(x.user.id, ym).length;
              return `<tr>
                <td class="l"><a href="#/user/${x.user.id}/schedule/${ym}">${esc(x.user.name)}</a> ${x.mode === 'plan' ? '<span class="badge warn">予定</span>' : ''}</td>
                <td class="l">${UI.levelBadge(x.level)}</td><td class="l">${esc(x.tier)}</td><td>${U.fmt(x.base)}</td>
                <td class="c"><input type="checkbox" data-genzan="${x.user.id}" ${x.genzan ? 'checked' : ''}>${noMon && !x.genzan ? ' <span class="badge danger" title="モニタリング記録がありません">要確認</span>' : ''}</td>
                <td class="l"><details class="addons"><summary>${x.addons.length ? x.addons.map((a) => esc(M.kyotakuAddons.find((z) => z.id === a)?.name || a)).join('、') : '選択'}</summary>
                  ${M.kyotakuAddons.map((a) => `<label><input type="checkbox" data-addon="${x.user.id}:${a.id}" ${x.addons.includes(a.id) ? 'checked' : ''}> ${esc(a.name)}（${a.units}）</label>`).join('')}
                </details></td>
                <td>${U.fmt(x.total)}</td><td>${U.fmt(x.yen)}</td>
                <td class="l">${x.msgs.map((m) => `<div class="danger-text">${esc(m)}</div>`).join('')}${initialHint(x, ym)}</td></tr>`;
            })
            .join('')}</tbody></table>`
            : UI.empty('この月に請求対象となる要介護者はいません')
        }
        ${k.notBillable.length ? `<p class="note">給付管理の対象サービスがないため算定しない利用者：${k.notBillable.map((x) => esc(x.user.name)).join('、')}（居宅介護支援費は給付管理票の提出が前提）</p>` : ''}
        <p class="note">${esc(k.fee.label)}。取扱件数は、介護予防支援の利用者を先頭に、居宅介護支援の利用者を契約日順に並べて逓減区分（i/ii/iii）を判定しています。${st.settings.tokutei ? '特定事業所加算を含みます。' : ''}${st.settings.shuchuGenzan ? '特定事業所集中減算（−200単位）を適用中。' : ''}</p>
      </div>

      <div class="card">
        <div class="card-head"><h2>給付管理票（事業所別 計画単位数）</h2><button class="btn small" id="csv-b">CSV出力</button></div>
        ${benefitTable(k, ym)}
        <p class="note">CSV は確認・転記用です。国保連への伝送には、国保連の「インタフェース仕様書」に準拠した伝送ソフトが別途必要です。</p>
      </div>`;

    el.querySelectorAll('[data-genzan]').forEach((cb) => (cb.onchange = () => {
      const v = S.kyotakuOf(cb.dataset.genzan, ym);
      S.setKyotaku(cb.dataset.genzan, ym, { ...v, genzan: cb.checked });
      V.billing(el, [ym]);
    }));
    el.querySelectorAll('[data-addon]').forEach((cb) => (cb.onchange = () => {
      const [uid, id] = cb.dataset.addon.split(':');
      const v = S.kyotakuOf(uid, ym);
      const set = new Set(v.addons || []);
      cb.checked ? set.add(id) : set.delete(id);
      S.setKyotaku(uid, ym, { ...v, addons: [...set] });
      V.billing(el, [ym]);
      el.querySelector(`[data-addon="${uid}:${id}"]`)?.closest('details')?.setAttribute('open', '');
    }));
    el.querySelector('#csv-k')?.addEventListener('click', () => {
      const rows = [['サービス提供年月', '被保険者番号', '氏名', '要介護度', '区分', '基本単位', '運営基準減算', '加算', '合計単位', '金額(円)']];
      k.items.forEach((x) =>
        rows.push([ym, x.user.insuredNo, x.user.name, UI.levelLabel(x.level), x.tier, x.base, x.genzan ? '有' : '', x.addons.map((a) => M.kyotakuAddons.find((z) => z.id === a)?.name).join('／'), x.total, x.yen])
      );
      U.download(`居宅介護支援費_${ym}.csv`, U.csv(rows), 'text/csv');
    });
    el.querySelector('#csv-b')?.addEventListener('click', () => {
      const rows = [['サービス提供年月', '被保険者番号', '氏名', '要介護度', '区分支給限度基準額', '事業所番号', '事業所名', 'サービス種類コード', 'サービス種類', '計画単位数（限度内）', '限度超過単位数', '実績確定']];
      k.items.forEach((x) =>
        x.res.groups.filter((gr) => gr.limitTarget).forEach((gr) =>
          rows.push([ym, x.user.insuredNo, x.user.name, x.res.limitLevel?.label || '', x.res.limit, gr.provider?.number || '', gr.provider?.name || '', M.serviceTypes[gr.type]?.code || '', gr.type, gr.inLimit, gr.over, x.mode === 'actual' ? '済' : '未'])
        )
      );
      U.download(`給付管理票_${ym}.csv`, U.csv(rows), 'text/csv');
    });
  };

  function initialHint(x, ym) {
    // 新規契約月や要介護度が2段階以上変わった月は初回加算の対象になり得る
    const isStart = x.user.startDate && U.ym(x.user.startDate) === ym;
    if (isStart && !x.addons.includes('initial')) return '<div class="warn-text">新規契約月：初回加算の対象か確認</div>';
    return '';
  }

  function benefitTable(k, ym) {
    if (!k.items.length) return UI.empty('対象者はいません');
    return `<table class="grid num-right"><thead><tr><th>利用者</th><th>限度額</th><th>事業所</th><th>種類</th><th>計画単位（限度内）</th><th>超過</th><th>利用者負担</th></tr></thead><tbody>
      ${k.items
        .map((x) => {
          const gs = x.res.groups.filter((gr) => gr.limitTarget);
          return gs
            .map(
              (gr, i) => `<tr>${i === 0 ? `<td class="l" rowspan="${gs.length}"><a href="#/user/${x.user.id}/schedule/${ym}">${esc(x.user.name)}</a></td><td rowspan="${gs.length}">${U.fmt(x.res.limit)}</td>` : ''}
              <td class="l">${esc(gr.provider?.name || '未設定')}${gr.provider?.number ? '' : ' <span class="badge warn">番号未登録</span>'}</td><td class="l">${esc(gr.type)}</td>
              <td>${U.fmt(gr.inLimit)}</td><td>${gr.over ? `<span class="danger-text">${U.fmt(gr.over)}</span>` : ''}</td><td>${U.fmt(gr.userPay + gr.overFee)}</td></tr>`
            )
            .join('');
        })
        .join('')}</tbody></table>`;
  }
})(globalThis);
