/*
 * 計算ロジック：利用票の単位数・限度額管理・利用者負担、居宅介護支援費、各種チェック
 * DOM に依存しないので node でテストできる（tests/run.js）。
 */
(function (g) {
  'use strict';
  const KC = (g.KC = g.KC || {});
  const U = KC.util;
  const M = KC.master;
  const S = KC.store;
  const C = (KC.calc = {});

  // 1回あたり単位数（要介護度別単位のサービスはその日の要介護度で決まる）
  C.unitsFor = (svc, level, line) => {
    if (!svc) return 0;
    if (svc.manualUnits) return U.num(line?.units);
    if (line && line.unitsOverride !== '' && line.unitsOverride != null) return U.num(line.unitsOverride);
    if (svc.levelUnits) return level ? svc.levelUnits[level] ?? 0 : 0;
    return svc.units || 0;
  };

  C.typeOf = (svc) => M.serviceTypes[svc?.type] || M.serviceTypes['その他'];
  C.isLimitTarget = (svc) => (svc?.limitTarget != null ? !!svc.limitTarget : C.typeOf(svc).limitTarget);

  /*
   * 月の利用票を計算する。mode = 'plan'（予定）| 'actual'（実績）
   * 区分支給限度基準額を超えた単位は overflowLineId の行から優先して割り当て、
   * 残りは下の行から順に割り当てる（全額自己負担）。
   */
  C.computeMonth = (user, ym, sch, mode = 'plan') => {
    const st = S.state;
    const warnings = [];
    const limitLevel = S.limitLevelForMonth(user, ym);
    const limit = limitLevel ? limitLevel.limit : 0;
    if (!limitLevel) warnings.push('この月に有効な認定がありません（限度額 0 として計算）');
    const lines = sch?.lines || [];
    const rows = lines.map((line) => {
      const svc = S.service(line.serviceId);
      const provider = S.byId('providers', line.providerId);
      const days = (line[mode] || []).slice().sort((a, b) => a - b);
      let count = 0;
      let total = 0;
      let unitPer = 0;
      if (!svc) warnings.push('サービスマスタに存在しない行があります');
      else if (svc.kind === 'monthly') {
        count = days.length ? 1 : 0;
        unitPer = C.unitsFor(svc, S.levelAtMonthEnd(user, ym), line);
        total = unitPer * count;
      } else {
        count = days.length;
        for (const d of days) {
          const lv = S.levelOn(user, U.dayISO(ym, d));
          const u = C.unitsFor(svc, lv, line);
          if (svc.levelUnits && !lv) warnings.push(`${svc.name}：${d}日は認定期間外のため単位を算定できません`);
          total += u;
        }
        unitPer = count ? Math.round(total / count) : C.unitsFor(svc, S.levelAtMonthEnd(user, ym), line);
      }
      return { line, svc, provider, days, count, unitPer, total, limitTarget: C.isLimitTarget(svc), over: 0 };
    });

    const targetTotal = rows.filter((r) => r.limitTarget).reduce((a, r) => a + r.total, 0);
    const over = Math.max(0, targetTotal - limit);
    let remain = over;
    if (remain > 0) {
      const targets = rows.filter((r) => r.limitTarget && r.total > 0);
      const first = targets.find((r) => r.line.id === sch?.overflowLineId);
      const order = [...(first ? [first] : []), ...targets.filter((r) => r !== first).reverse()];
      for (const r of order) {
        if (remain <= 0) break;
        const take = Math.min(r.total, remain);
        r.over = take;
        remain -= take;
      }
    }

    // 事業所 × サービス種類ごとに請求額を計算（端数処理は請求明細の単位で行う）
    const groupMap = new Map();
    for (const r of rows) {
      if (!r.svc) continue;
      const key = (r.line.providerId || '-') + '|' + r.svc.type;
      if (!groupMap.has(key)) {
        groupMap.set(key, { provider: r.provider, type: r.svc.type, total: 0, over: 0, inLimit: 0, limitTarget: r.limitTarget, rows: [] });
      }
      const gr = groupMap.get(key);
      gr.total += r.total;
      gr.over += r.over;
      gr.inLimit += r.total - r.over;
      gr.rows.push(r);
    }
    const burden = U.num(user.burden, 1) || 1;
    const groups = [...groupMap.values()].map((gr) => {
      const grade = gr.provider?.areaGrade || st.settings.areaGrade;
      const price = M.unitPrice(C.typeOf({ type: gr.type }).ratio, grade);
      // 処遇改善加算：限度額内の単位数 × 加算率（1単位未満四捨五入）。限度額管理の対象外。
      const shoguRate = U.num(gr.provider?.shogu);
      const shogu = shoguRate ? Math.round(gr.inLimit * shoguRate / 100) : 0;
      const billUnits = gr.inLimit + shogu;
      const fee = Math.floor(billUnits * price);
      const benefit = Math.floor((fee * (10 - burden)) / 10);
      const userPay = fee - benefit;
      const overFee = Math.floor(gr.over * price);
      return { ...gr, grade, price, shoguRate, shogu, billUnits, fee, benefit, userPay, overFee };
    });
    const sum = (k) => groups.reduce((a, x) => a + x[k], 0);
    const shortStayDays = rows.filter((r) => r.svc?.shortStay).reduce((a, r) => a + r.count, 0);
    return {
      ym,
      mode,
      limitLevel,
      limit,
      rows,
      groups,
      targetTotal,
      over,
      shortStayDays,
      totals: { fee: sum('fee'), benefit: sum('benefit'), userPay: sum('userPay'), overFee: sum('overFee'), userTotal: sum('userPay') + sum('overFee') },
      warnings: [...new Set(warnings)],
    };
  };

  // 給付管理に使う方（実績確定済みなら実績、そうでなければ予定）
  C.billingMode = (sch) => (sch?.confirmed ? 'actual' : 'plan');

  /*
   * 居宅介護支援費（月単位）
   * 取扱件数＝要介護者数＋要支援者数×1/3 を常勤換算数で割った値。
   * 並び順は介護予防支援の利用者を先頭に、次に居宅介護支援の利用者を契約日順。
   */
  C.kyotakuMonth = (ym) => {
    const st = S.state;
    const fee = M.kyotakuFees[st.settings.feeType] || M.kyotakuFees.I;
    const fte = Math.max(0.1, U.num(st.settings.fte, 1));
    const price = M.unitPrice(70, st.settings.areaGrade);
    const tokutei = M.tokuteiAddons.find((t) => t.id === st.settings.tokutei) || M.tokuteiAddons[0];
    const items = [];
    for (const user of st.users) {
      if (user.startDate && user.startDate > U.monthEnd(ym)) continue;
      if (user.endDate && user.endDate < U.monthStart(ym)) continue;
      const level = S.levelAtMonthEnd(user, ym);
      if (!level) continue;
      const sch = S.getSchedule(user.id, ym);
      const mode = C.billingMode(sch);
      const res = C.computeMonth(user, ym, sch, mode);
      const hasService = res.rows.some((r) => r.limitTarget && r.total > 0);
      items.push({ user, level, group: M.level(level).group, sch, mode, res, hasService });
    }
    const billable = items.filter((x) => x.hasService);
    const support = billable.filter((x) => x.group === 'support');
    const care = billable
      .filter((x) => x.group === 'care')
      .sort((a, b) => (a.user.startDate || '').localeCompare(b.user.startDate || ''));
    const caseCount = care.length + support.length / 3;
    let cum = support.length / 3;
    const out = [];
    for (const x of care) {
      cum += 1;
      const per = cum / fte;
      const tier = per < fee.th[0] ? 'i' : per < fee.th[1] ? 'ii' : 'iii';
      const heavy = ['c3', 'c4', 'c5'].includes(x.level) ? 1 : 0;
      const base = fee[tier][heavy];
      const k = S.kyotakuOf(x.user.id, ym);
      const msgs = [];
      let units = k.genzan ? Math.round(base * 0.5) : base; // 運営基準減算（50%）
      if (st.settings.shuchuGenzan) units -= 200; // 特定事業所集中減算
      let addUnits = 0;
      for (const id of k.addons || []) {
        const a = M.kyotakuAddons.find((z) => z.id === id);
        if (!a) continue;
        if (k.genzan && id === 'initial') {
          msgs.push('運営基準減算中は初回加算を算定できません');
          continue;
        }
        if ((a.excl || []).some((e) => (k.addons || []).includes(e))) msgs.push(`${a.name}と併算定できない加算が選択されています`);
        addUnits += a.units;
      }
      const taiin = (k.addons || []).filter((id) => M.kyotakuAddons.find((z) => z.id === id)?.group === 'taiin');
      if (taiin.length > 1) msgs.push('退院・退所加算は月に1区分のみ算定できます');
      if (tokutei.units && !k.genzan) addUnits += tokutei.units;
      const total = units + addUnits;
      out.push({ ...x, tier, base, units, addUnits, total, yen: Math.floor(total * price), genzan: !!k.genzan, addons: k.addons || [], msgs: [...new Set(msgs)] });
    }
    return {
      ym,
      fee,
      fte,
      price,
      caseCount,
      perCm: caseCount / fte,
      items: out,
      support,
      notBillable: items.filter((x) => !x.hasService),
      totalUnits: out.reduce((a, x) => a + x.total, 0),
      totalYen: out.reduce((a, x) => a + x.yen, 0),
    };
  };

  // ---------- ケアプランの整合性チェック ----------
  C.validatePlan = (plan, user) => {
    const errs = [];
    const warns = [];
    const cert = plan.createdDate ? S.certOn(user, plan.createdDate) || S.latestCert(user) : S.latestCert(user);
    if (!plan.createdDate) errs.push('作成日が未入力です');
    if (!plan.intention) warns.push('利用者及び家族の生活に対する意向が未入力です');
    if (!plan.policy) warns.push('総合的な援助の方針が未入力です');
    if (plan.status === 'final' && !plan.consentDate) errs.push('確定済みですが利用者同意日が未入力です');
    if (plan.consentDate && plan.createdDate && plan.consentDate < plan.createdDate) errs.push('同意日が作成日より前です');
    const usesLife = (plan.needs || []).some((n) =>
      (n.shorts || []).some((s) => (s.services || []).some((v) => /生活援助/.test(v.content + v.type)))
    );
    if (usesLife && user.livesWithFamily && !plan.lifeReason) warns.push('生活援助中心型の算定理由が未入力です（同居家族あり）');
    if (!(plan.needs || []).length) warns.push('第2表の課題（ニーズ）が未入力です');
    (plan.needs || []).forEach((n, i) => {
      const label = `課題${i + 1}`;
      if (!n.need) warns.push(`${label}：生活全般の解決すべき課題が未入力です`);
      if (n.longStart && n.longEnd && n.longStart > n.longEnd) errs.push(`${label}：長期目標の期間が逆転しています`);
      if (cert && n.longEnd && n.longEnd > cert.end) warns.push(`${label}：長期目標の期間が認定有効期間（〜${U.wareki(cert.end)}）を超えています`);
      (n.shorts || []).forEach((s, j) => {
        const sl = `${label}-短期目標${j + 1}`;
        if (s.start && s.end && s.start > s.end) errs.push(`${sl}：期間が逆転しています`);
        if (n.longStart && s.start && s.start < n.longStart) warns.push(`${sl}：長期目標の開始より前に始まっています`);
        if (n.longEnd && s.end && s.end > n.longEnd) warns.push(`${sl}：長期目標の期間を超えています`);
        if (cert && s.end && s.end > cert.end) warns.push(`${sl}：認定有効期間を超えています`);
        (s.services || []).forEach((v, k) => {
          if (!v.content) warns.push(`${sl}-サービス${k + 1}：サービス内容が未入力です`);
          if (s.start && v.start && v.start < s.start) warns.push(`${sl}-サービス${k + 1}：短期目標の期間外から開始しています`);
          if (s.end && v.end && v.end > s.end) warns.push(`${sl}-サービス${k + 1}：短期目標の期間を超えています`);
        });
      });
    });
    return { errs, warns, cert };
  };

  // ---------- ダッシュボードのアラート ----------
  // level: danger（期限切れ・算定に影響）/ warn（近日対応）/ info
  C.alerts = (today = U.today()) => {
    const st = S.state;
    const out = [];
    const ym = U.ym(today);
    const dom = Number(today.slice(8, 10));
    const add = (level, cat, user, text, link) => out.push({ level, cat, userId: user?.id, userName: user?.name, text, link });
    for (const user of S.activeUsers()) {
      const base = `#/user/${user.id}`;
      const cert = S.certOn(user, today);
      const latest = S.latestCert(user);
      if (!cert) {
        if (latest && latest.status === '申請中') add('warn', '認定', user, '認定申請中（暫定ケアプランで対応中か確認）', base + '/info');
        else add('danger', '認定', user, '有効な認定がありません', base + '/info');
      } else {
        const left = U.diffDays(today, cert.end);
        const next = (user.certs || []).find((c) => c.start > cert.end || (c.status === '申請中' && c !== cert));
        if (!next && left <= 60) {
          add(left <= 30 ? 'danger' : 'warn', '認定', user, `認定有効期間満了まで${left}日（${U.wareki(cert.end, 'short')}）。更新申請を確認`, base + '/info');
        }
      }
      // ケアプラン
      const plan = S.currentPlan(user.id, today);
      const drafts = S.userPlans(user.id).filter((p) => p.status !== 'final');
      if (!plan) add('danger', 'ケアプラン', user, '確定済みのケアプランがありません', base + '/plan');
      else {
        const ends = (plan.needs || []).flatMap((n) => (n.shorts || []).map((s) => s.end)).filter(Boolean).sort();
        const minEnd = ends[0];
        if (minEnd) {
          const left = U.diffDays(today, minEnd);
          if (left < 0) add('danger', 'ケアプラン', user, `短期目標の期間が終了しています（${U.wareki(minEnd, 'short')}）`, base + '/plan');
          else if (left <= 30) add('warn', 'ケアプラン', user, `短期目標の期間終了まで${left}日`, base + '/plan');
        }
        if (!plan.consentDate) add('danger', 'ケアプラン', user, 'ケアプランの同意日が未記録です', base + '/plan/' + plan.id);
        const met = st.meetings.some((m) => m.userId === user.id && m.planId === plan.id);
        if (!met) add('warn', '担当者会議', user, '現行プランに紐づくサービス担当者会議の記録がありません', base + '/meeting');
      }
      if (drafts.length) add('info', 'ケアプラン', user, `作成中のケアプランが${drafts.length}件あります`, base + '/plan');
      // モニタリング（月1回以上の居宅訪問。テレビ電話は条件付きで2月に1回まで）
      {
        const mons = S.monitoringFor(user.id, ym);
        if (!mons.length) {
          add(dom >= 20 ? 'danger' : 'warn', 'モニタリング', user, `${U.warekiYM(ym)}のモニタリング未実施`, base + '/monitoring');
        } else if (!mons.some((m) => m.method === '居宅訪問')) {
          const prev = S.monitoringFor(user.id, U.ymAdd(ym, -1));
          if (!prev.some((m) => m.method === '居宅訪問')) add('danger', 'モニタリング', user, 'テレビ電話が2ヶ月連続です（2月に1回は居宅訪問が必要）', base + '/monitoring');
        }
      }
      // 利用票
      const sch = S.getSchedule(user.id, ym);
      if (!sch || !sch.lines.length) add('warn', '利用票', user, `${U.warekiYM(ym)}の利用票が未作成です`, base + '/schedule/' + ym);
      else {
        const res = C.computeMonth(user, ym, sch, 'plan');
        if (res.over > 0) add('warn', '利用票', user, `区分支給限度基準額を${U.fmt(res.over)}単位超過（自己負担 ${U.fmt(res.totals.overFee)}円）`, base + '/schedule/' + ym);
      }
      const prevYm = U.ymAdd(ym, -1);
      const prevSch = S.getSchedule(user.id, prevYm);
      if (prevSch && prevSch.lines.length && !prevSch.confirmed && dom <= 10) {
        add('danger', '給付管理', user, `${U.warekiYM(prevYm)}の実績が未確定（給付管理票の提出期限は10日）`, base + '/schedule/' + prevYm);
      }
      // 短期入所が認定有効期間のおおむね半数を超えていないか
      if (cert) {
        const days = C.shortStayDaysInCert(user, cert);
        const half = Math.floor((U.diffDays(cert.start, cert.end) + 1) / 2);
        if (days > half) add('warn', '利用票', user, `短期入所の利用日数（${days}日）が認定有効期間の半数（${half}日）を超えています`, base + '/schedule');
      }
      // 年齢到達（65歳：第2号→第1号）
      if (user.birth) {
        const d65 = U.ageReachDate(user.birth, 65);
        const left = U.diffDays(today, d65);
        if (left >= 0 && left <= 60) add('info', '資格', user, `${U.wareki(d65, 'short')}に65歳到達（第1号被保険者へ移行）`, base + '/info');
      }
    }
    const order = { danger: 0, warn: 1, info: 2 };
    return out.sort((a, b) => order[a.level] - order[b.level]);
  };

  C.shortStayDaysInCert = (user, cert) => {
    let total = 0;
    for (let ym = U.ym(cert.start); ym <= U.ym(cert.end); ym = U.ymAdd(ym, 1)) {
      const sch = S.getSchedule(user.id, ym);
      if (!sch) continue;
      for (const line of sch.lines) {
        const svc = S.service(line.serviceId);
        if (!svc?.shortStay) continue;
        const days = line.actual?.length ? line.actual : line.plan || [];
        total += days.filter((d) => {
          const iso = U.dayISO(ym, d);
          return iso >= cert.start && iso <= cert.end;
        }).length;
      }
    }
    return total;
  };

  // 前月の利用票から曜日パターンを引き継いで翌月の予定を作る
  C.copyByWeekday = (srcSch, destYm) => {
    const lines = (srcSch?.lines || []).map((l) => {
      const svc = S.service(l.serviceId);
      const n = U.daysInMonth(destYm);
      let plan = [];
      if (svc?.kind === 'monthly') plan = (l.plan || []).length ? [1] : [];
      else {
        const wds = new Set((l.plan || []).map((d) => U.weekday(U.dayISO(srcSch.ym, d))));
        for (let d = 1; d <= n; d++) if (wds.has(U.weekday(U.dayISO(destYm, d)))) plan.push(d);
      }
      return { ...U.clone(l), id: U.uid(), plan, actual: [] };
    });
    return lines;
  };
})(globalThis);
