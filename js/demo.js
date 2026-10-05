/* 操作確認用のデモデータ（今日の日付を基準に生成。氏名等はすべて架空） */
(function (g) {
  'use strict';
  const KC = g.KC;
  const U = KC.util;
  const S = KC.store;
  const C = KC.calc;

  KC.demo = {
    load() {
      const st = S.state;
      const today = U.today();
      const ym = U.ym(today);
      const prev = U.ymAdd(ym, -1);
      if (!st.settings.staff.length) {
        st.settings.staff = [
          { id: 'stf1', name: '佐藤 ケア子' },
          { id: 'stf2', name: '鈴木 支援' },
        ];
        st.settings.currentStaff = 'stf1';
      }
      if (!st.settings.officeName) st.settings.officeName = 'デモ居宅介護支援事業所';
      st.settings.areaGrade = st.settings.areaGrade || '6級地';

      const prov = (name, serviceType, number, shogu = '') => {
        const p = { id: 'demo_' + U.uid(), name, serviceType, number, tel: '000-0000-0000', fax: '000-0000-0001', areaGrade: '6級地', shogu };
        st.providers.push(p);
        return p;
      };
      const hv = prov('デモ訪問介護ステーション', '訪問介護', '0000000001', 24.5);
      const dc = prov('デモデイサービスセンター', '通所介護', '0000000002', 9.2);
      const vn = prov('デモ訪問看護ステーション', '訪問看護', '0000000003');
      const wr = prov('デモ福祉用具レンタル', '福祉用具貸与', '0000000004');
      const ss = prov('デモショートステイ', '短期入所生活介護', '0000000005');

      const cert = (level, start, months) => ({
        id: U.uid(),
        level,
        status: '認定済',
        applyType: '更新',
        start,
        end: U.addDays(U.addMonths(start, months), -1),
      });
      const mkUser = (o) => {
        const u = { id: 'demo_' + U.uid(), status: 'active', burden: 1, cmId: 'stf1', emergency: [{}, {}], doctor: {}, ...o };
        st.users.push(u);
        return u;
      };
      const firstOfThis = U.monthStart(ym);
      const u1 = mkUser({
        name: '山田 花子', kana: 'やまだ はなこ', sex: '女', birth: U.addMonths(today, -12 * 84 - 3), insurerNo: '000000', insuredNo: '0000000001',
        address: '〇〇市△△町1-2-3', startDate: U.addMonths(firstOfThis, -30), livesWithFamily: false,
        certs: [cert('c2', U.addMonths(firstOfThis, -10), 12)],
      });
      const u2 = mkUser({
        name: '田中 一郎', kana: 'たなか いちろう', sex: '男', birth: U.addMonths(today, -12 * 79), insurerNo: '000000', insuredNo: '0000000002',
        address: '〇〇市□□町4-5-6', startDate: U.addMonths(firstOfThis, -14), burden: 2, livesWithFamily: true,
        // 認定期限が近い（更新申請の案内が出る）
        certs: [cert('c3', U.addMonths(firstOfThis, -11), 12)],
      });
      const u3 = mkUser({
        name: '高橋 キヨ', kana: 'たかはし きよ', sex: '女', birth: U.addMonths(today, -12 * 91), insurerNo: '000000', insuredNo: '0000000003',
        address: '〇〇市◇◇町7-8', startDate: U.addMonths(firstOfThis, -40), cmId: 'stf2',
        certs: [cert('c5', U.addMonths(firstOfThis, -6), 24)],
      });
      const u4 = mkUser({
        name: '伊藤 勝', kana: 'いとう まさる', sex: '男', birth: U.addDays(U.addMonths(today, -12 * 65 + 1), 0), insurerNo: '000000', insuredNo: '0000000004',
        address: '〇〇市☆☆町9', startDate: firstOfThis,
        certs: [{ ...cert('c1', firstOfThis, 6), applyType: '新規' }],
      });

      const svcLines = (defs, ymX) =>
        defs.map(([serviceId, provider, wds, extra]) => {
          const plan = [];
          const svc = S.service(serviceId);
          if (svc.kind === 'monthly') plan.push(1);
          else for (let d = 1; d <= U.daysInMonth(ymX); d++) if (wds.includes(U.weekday(U.dayISO(ymX, d)))) plan.push(d);
          return { id: U.uid(), serviceId, providerId: provider.id, plan, actual: [], ...(extra || {}) };
        });
      const sched = (user, defs, confirmPrev = true) => {
        for (const m of [prev, ym]) {
          const lines = svcLines(defs, m);
          const confirmed = m === prev && confirmPrev;
          if (confirmed) lines.forEach((l) => (l.actual = [...l.plan]));
          S.saveSchedule({ userId: user.id, ym: m, lines, overflowLineId: '', confirmed });
        }
      };
      sched(u1, [
        ['hv_b2', hv, [1, 3, 5]],
        ['hv_l2', hv, [2, 4]],
        ['dc_78', dc, [2, 6]],
        ['dc_bath1', dc, [2, 6]],
        ['wr', wr, [], { units: 1100 }],
      ]);
      sched(u2, [
        ['dc_78', dc, [1, 3, 5]],
        ['dc_bath1', dc, [1, 3, 5]],
        ['vn_60', vn, [2]],
        ['wr', wr, [], { units: 2500 }],
      ], false);
      // 限度額を超えるケース
      sched(u3, [
        ['hv_b3', hv, [0, 1, 2, 3, 4, 5, 6]],
        ['hv_b2', hv, [1, 3, 5]],
        ['dc_78', dc, [2, 4]],
        ['vn_60', vn, [1, 4]],
        ['ss_h', ss, [6]],
        ['wr', wr, [], { units: 3200 }],
      ]);

      const need = (needText, longGoal, shortGoal, services, start, end) => ({
        need: needText,
        longGoal,
        longStart: start,
        longEnd: end,
        shorts: [{ goal: shortGoal, start, end: U.addDays(U.addMonths(start, 6), -1) < end ? U.addDays(U.addMonths(start, 6), -1) : end, services }],
      });
      const plan = (user, needs, opts = {}) => {
        const c = user.certs[0];
        const p = {
          id: 'demo_' + U.uid(),
          userId: user.id,
          status: 'final',
          createdDate: c.start,
          consentDate: c.start,
          deliveredDate: c.start,
          planType: '継続',
          certStatus: '認定済',
          intention: '本人：「住み慣れた家でできるだけ自分のことは自分でしたい」\n家族：「無理のない範囲で在宅生活を続けてほしい」',
          committee: '特になし',
          policy: '心身の状態を確認しながら、本人の意欲を大切にした在宅生活を支援します。緊急時は長女および主治医へ連絡します。',
          lifeReason: user.livesWithFamily ? '' : '1. 一人暮らし',
          needs: needs.map(([a, b, c2, svcs]) => need(a, b, c2, svcs.map(([content, type, provider, freq]) => ({ content, insured: true, type, provider, freq, start: c.start, end: U.addDays(U.addMonths(c.start, 6), -1) })), c.start, c.end)),
          weekly: { items: [{ label: '訪問介護', days: [1, 3, 5], start: '10:00', end: '11:00' }, { label: '通所介護', days: [2, 6], start: '09:00', end: '16:30' }], daily: '7:00 起床 ／ 12:00 昼食 ／ 21:00 就寝', other: '福祉用具貸与（特殊寝台・付属品）' },
          staffId: user.cmId,
          ...opts,
        };
        st.plans.push(p);
        return p;
      };
      const p1 = plan(u1, [
        ['一人での入浴が不安だが、清潔を保ちたい', '安全に入浴を続けられる', '週2回デイで入浴できる', [['入浴介助・見守り', '通所介護', dc.name, '週2回']]],
        ['買い物や掃除が負担になっている', '自宅で清潔な環境を保てる', '一緒に掃除をして生活環境を整える', [['掃除・買い物（生活援助）', '訪問介護', hv.name, '週2回']]],
      ]);
      plan(u2, [['足腰が弱り外出の機会が減っている', '近所の散歩ができる', 'デイで機能訓練を継続する', [['機能訓練・入浴', '通所介護', dc.name, '週3回']]]]);
      const p3 = plan(u3, [['寝たきりで褥瘡のリスクが高い', '褥瘡をつくらずに過ごせる', '体位変換と皮膚状態の観察を継続する', [['身体介護（体位変換・おむつ交換）', '訪問介護', hv.name, '毎日'], ['皮膚の観察・処置', '訪問看護', vn.name, '週2回']]]]);
      // 伊藤さんは新規でプラン作成中
      st.plans.push({ id: 'demo_' + U.uid(), userId: u4.id, status: 'draft', createdDate: today, planType: '初回', certStatus: '認定済', intention: '', policy: '', needs: [], weekly: { items: [] }, staffId: 'stf1' });

      // モニタリング・支援経過
      const monDate = (m, d) => U.dayISO(m, Math.min(d, U.daysInMonth(m)));
      for (const [u, d] of [[u1, 12], [u2, 15], [u3, 8]]) {
        const date = monDate(prev, d);
        st.monitorings.push({ id: U.uid(), userId: u.id, date, method: '居宅訪問', place: '自宅', attendees: '本人・家族', goals: [], satisfaction: 'サービスに満足している', change: '特になし', planChange: 'なし', staffId: u.cmId });
        st.notes.push({ id: U.uid(), userId: u.id, date, time: '10:00', method: '訪問', category: 'モニタリング', content: '自宅を訪問し、本人・家族と面談。\n本人の心身状態に大きな変化なし。\nサービス利用状況を確認。予定どおり利用できている。', staffId: u.cmId });
      }
      const d1 = monDate(ym, 2) <= today ? monDate(ym, 2) : today;
      st.monitorings.push({ id: U.uid(), userId: u1.id, date: d1, method: '居宅訪問', place: '自宅', attendees: '本人', goals: [], change: '特になし', planChange: 'なし', staffId: 'stf1' });
      st.notes.push({ id: U.uid(), userId: u1.id, date: d1, time: '14:00', method: '訪問', category: 'モニタリング', content: '自宅を訪問。入浴は週2回デイで実施できている。', staffId: 'stf1' });
      st.notes.push({ id: U.uid(), userId: u2.id, date: today, time: '09:30', method: '電話', category: '認定関連', content: '長女へ電話。認定の更新申請について説明し、来週代行申請することで了承を得た。', staffId: 'stf1' });
      st.meetings.push({ id: U.uid(), userId: u1.id, planId: p1.id, date: p1.createdDate, time: '14:00〜14:30', place: '利用者宅', attendees: [{ org: '本人', name: u1.name }, { org: hv.name, name: 'サ責 A' }, { org: dc.name, name: '生活相談員 B' }], topic: '更新認定に伴うケアプランの検討', discussion: '入浴と家事支援の継続について確認。', conclusion: '現行サービスを継続する。', remaining: '6ヶ月後に再評価', staffId: 'stf1' });
      st.meetings.push({ id: U.uid(), userId: u3.id, planId: p3.id, date: p3.createdDate, place: '利用者宅', attendees: [{ org: '本人', name: u3.name }], topic: '褥瘡予防', discussion: '', conclusion: '訪問看護を週2回とする。', staffId: 'stf2' });
      S.save();
      // 限度額超過の確認用に計算しておく（例外が出ないことの確認も兼ねる）
      C.computeMonth(u3, ym, S.getSchedule(u3.id, ym));
    },
  };
})(globalThis);
