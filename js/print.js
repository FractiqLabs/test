/* 帳票印刷（第1〜5表、利用票・別表）。ブラウザの印刷機能で PDF 保存も可能 */
(function (g) {
  'use strict';
  const KC = g.KC;
  const U = KC.util;
  const S = KC.store;
  const UI = KC.ui;
  const P = (KC.print = {});
  const esc = U.esc;
  const br = (s) => esc(s || '').replace(/\n/g, '<br>');
  const wk = (iso) => (iso ? U.wareki(iso) : '');
  const wks = (iso) => (iso ? U.wareki(iso, 'short') : '');

  function show(html, landscape = false) {
    const area = document.getElementById('print-area');
    area.innerHTML = `<style>@page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 10mm; }</style>` + html;
    setTimeout(() => {
      window.print();
      area.innerHTML = '';
    }, 50);
  }

  function header(title, user, extra = '') {
    const st = S.state.settings;
    const cert = S.certOn(user, U.today()) || S.latestCert(user);
    return `<div class="p-title">${esc(title)}</div>
      <table class="p-head"><tr>
        <td>利用者名：<b>${esc(user.name)}</b> 殿</td><td>生年月日：${wk(user.birth)}</td><td>住所：${esc(user.address || '')}</td></tr>
        <tr><td>要介護状態区分：${esc(UI.levelLabel(cert?.level))}</td><td colspan="2">認定の有効期間：${cert ? `${wk(cert.start)} 〜 ${wk(cert.end)}` : ''}</td></tr>
        <tr><td colspan="2">居宅介護支援事業者・事業所名：${esc(st.officeName)}</td><td>${extra}</td></tr></table>`;
  }

  P.plan = (user, plan) => {
    const staff = UI.staffName(plan.staffId);
    const t1 = `<section class="p-page">
      ${header('居宅サービス計画書(1)　第1表', user, `作成年月日：${wk(plan.createdDate)}`)}
      <table class="p-box"><tr><th>計画作成区分</th><td>${['初回', '紹介', '継続'].map((x) => (x === plan.planType ? `<b>【${x}】</b>` : x)).join('・')}</td>
        <th>認定状況</th><td>${['認定済', '申請中'].map((x) => (x === plan.certStatus ? `<b>【${x}】</b>` : x)).join('・')}</td></tr>
        <tr><th>居宅サービス計画作成者</th><td colspan="3">${esc(staff)}</td></tr>
        <tr><th>利用者及び家族の生活に対する意向を踏まえた課題分析の結果</th><td colspan="3" class="tall">${br(plan.intention)}</td></tr>
        <tr><th>介護認定審査会の意見及びサービスの種類の指定</th><td colspan="3">${br(plan.committee)}</td></tr>
        <tr><th>総合的な援助の方針</th><td colspan="3" class="tall">${br(plan.policy)}</td></tr>
        <tr><th>生活援助中心型の算定理由</th><td colspan="3">${esc(plan.lifeReason || '')} ${esc(plan.lifeReasonOther || '')}</td></tr></table>
      <div class="p-consent">居宅サービス計画について説明を受け、内容に同意し交付を受けました。　説明・同意日：${wk(plan.consentDate) || '　　年　　月　　日'}　利用者署名：＿＿＿＿＿＿＿＿＿＿</div>
    </section>`;
    const rows = [];
    (plan.needs || []).forEach((n) => {
      const svcCount = (n.shorts || []).reduce((a, s) => a + Math.max(1, (s.services || []).length), 0) || 1;
      let firstNeed = true;
      (n.shorts.length ? n.shorts : [{ services: [] }]).forEach((s) => {
        const svcs = s.services?.length ? s.services : [{}];
        svcs.forEach((v, k) => {
          rows.push(`<tr>
            ${firstNeed ? `<td rowspan="${svcCount}">${br(n.need)}</td><td rowspan="${svcCount}">${br(n.longGoal)}</td><td rowspan="${svcCount}">${wks(n.longStart)}<br>〜${wks(n.longEnd)}</td>` : ''}
            ${k === 0 ? `<td rowspan="${svcs.length}">${br(s.goal)}</td><td rowspan="${svcs.length}">${wks(s.start)}<br>〜${wks(s.end)}</td>` : ''}
            <td>${br(v.content)}</td><td class="c">${v.insured ? '○' : ''}</td><td>${esc(v.type || '')}</td><td>${esc(v.provider || '')}</td><td>${esc(v.freq || '')}</td><td>${wks(v.start)}<br>〜${wks(v.end)}</td></tr>`);
          firstNeed = false;
        });
      });
    });
    const t2 = `<section class="p-page">
      ${header('居宅サービス計画書(2)　第2表', user, `作成年月日：${wk(plan.createdDate)}`)}
      <table class="p-grid"><thead><tr><th rowspan="2">生活全般の解決すべき課題（ニーズ）</th><th colspan="4">目標</th><th colspan="6">援助内容</th></tr>
        <tr><th>長期目標</th><th>（期間）</th><th>短期目標</th><th>（期間）</th><th>サービス内容</th><th>※1</th><th>サービス種別</th><th>※2</th><th>頻度</th><th>期間</th></tr></thead>
        <tbody>${rows.join('')}</tbody></table>
      <div class="p-note">※1「保険給付の対象となるかどうかの区分」について、保険給付対象内サービスについては○印を付す。※2「当該サービス提供を行う事業所」について記入する。</div>
    </section>`;
    const t3 = `<section class="p-page">
      ${header('週間サービス計画表　第3表', user, `作成年月日：${wk(plan.createdDate)}`)}
      ${KC.views.weeklyGrid(plan.weekly || { items: [] })}
      <table class="p-box"><tr><th>主な日常生活上の活動</th><td>${br(plan.weekly?.daily)}</td></tr>
      <tr><th>週単位以外のサービス</th><td>${br(plan.weekly?.other)}</td></tr></table>
    </section>`;
    show(t1 + t2 + t3, true);
  };

  P.notes = (user, notes) => {
    show(
      `<section class="p-page">${header('居宅介護支援経過　第5表', user, `作成者：${esc(UI.staffName(S.state.settings.currentStaff))}`)}
      <table class="p-grid"><thead><tr><th style="width:18%">年月日</th><th style="width:12%">項目</th><th>内容</th></tr></thead><tbody>
      ${notes.map((n) => `<tr><td>${wk(n.date)}<br>${esc(n.time || '')}</td><td>${esc(n.method)}<br>${esc(n.category)}</td><td>${br(n.content)}</td></tr>`).join('')}
      </tbody></table></section>`
    );
  };

  P.meeting = (user, m) => {
    show(
      `<section class="p-page">${header('サービス担当者会議の要点　第4表', user, `作成年月日：${wk(U.today())}`)}
      <table class="p-box"><tr><th>開催日</th><td>${wk(m.date)}</td><th>開催場所</th><td>${esc(m.place || '')}</td><th>開催時間</th><td>${esc(m.time || '')}</td></tr></table>
      <table class="p-box"><tr><th rowspan="${Math.ceil((m.attendees || []).length / 2) + 1}">会議出席者</th><th>所属（職種）</th><th>氏名</th><th>所属（職種）</th><th>氏名</th></tr>
      ${(() => {
        const a = m.attendees || [];
        const out = [];
        for (let i = 0; i < a.length; i += 2) out.push(`<tr><td>${esc(a[i]?.org)}</td><td>${esc(a[i]?.name)}</td><td>${esc(a[i + 1]?.org || '')}</td><td>${esc(a[i + 1]?.name || '')}</td></tr>`);
        return out.join('');
      })()}</table>
      <table class="p-box"><tr><th>検討した項目</th><td class="tall">${br(m.topic)}${m.absent ? '<br>【欠席者・照会】' + br(m.absent) : ''}</td></tr>
      <tr><th>検討内容</th><td class="tall">${br(m.discussion)}</td></tr>
      <tr><th>結論</th><td class="tall">${br(m.conclusion)}</td></tr>
      <tr><th>残された課題<br>（次回の開催時期）</th><td>${br(m.remaining)}</td></tr></table></section>`
    );
  };

  P.schedule = (user, ym, sch, res) => {
    const n = U.daysInMonth(ym);
    const days = Array.from({ length: n }, (_, i) => i + 1);
    const t = res.totals;
    show(
      `<section class="p-page">
      <div class="p-title">${esc(U.warekiYM(ym))}分　サービス利用票（兼居宅（介護予防）サービス計画）　第6表</div>
      <table class="p-head"><tr><td>被保険者番号：${esc(user.insuredNo || '')}</td><td>被保険者氏名：<b>${esc(user.name)}</b> 殿</td><td>要介護状態区分：${esc(res.limitLevel?.label || '')}</td>
        <td>区分支給限度基準額：${U.fmt(res.limit)}単位/月</td></tr>
        <tr><td colspan="2">居宅介護支援事業者：${esc(S.state.settings.officeName)}</td><td colspan="2">作成年月日：${wk(U.today())}　（${res.mode === 'plan' ? '予定' : '実績'}）</td></tr></table>
      <table class="p-grid p-sched"><thead><tr><th>サービス内容</th><th>事業所</th>${days.map((d) => `<th>${d}<br>${U.WD[U.weekday(U.dayISO(ym, d))]}</th>`).join('')}<th>合計</th></tr></thead><tbody>
      ${res.rows
        .map((r) => {
          const set = new Set(r.days);
          const cells = r.svc?.kind === 'monthly' ? `<td colspan="${n}" class="c">${r.count ? '月額' : ''}</td>` : days.map((d) => `<td class="c">${set.has(d) ? '1' : ''}</td>`).join('');
          return `<tr><td>${esc(r.svc?.name || '')}</td><td>${esc(r.provider?.name || '')}</td>${cells}<td class="c">${r.count}</td></tr>`;
        })
        .join('')}</tbody></table>
      <div class="p-title small">サービス利用票別表　第7表</div>
      <table class="p-grid"><thead><tr><th>事業所</th><th>種類</th><th>単位数</th><th>限度超過</th><th>限度内</th><th>処遇改善等</th><th>単価</th><th>費用総額</th><th>保険給付額</th><th>利用者負担</th><th>全額負担分</th></tr></thead><tbody>
      ${res.groups.map((gr) => `<tr><td>${esc(gr.provider?.name || '')}</td><td>${esc(gr.type)}</td><td>${U.fmt(gr.total)}</td><td>${U.fmt(gr.over)}</td><td>${U.fmt(gr.inLimit)}</td><td>${U.fmt(gr.shogu)}</td><td>${gr.price.toFixed(2)}</td><td>${U.fmt(gr.fee)}</td><td>${U.fmt(gr.benefit)}</td><td>${U.fmt(gr.userPay)}</td><td>${U.fmt(gr.overFee)}</td></tr>`).join('')}
      </tbody><tfoot><tr><th colspan="7">合計</th><th>${U.fmt(t.fee)}</th><th>${U.fmt(t.benefit)}</th><th>${U.fmt(t.userPay)}</th><th>${U.fmt(t.overFee)}</th></tr></tfoot></table>
      <div class="p-consent">上記の計画について説明を受け、同意します。　　年　　月　　日　利用者署名：＿＿＿＿＿＿＿＿＿＿</div>
      </section>`,
      true
    );
  };
})(globalThis);
