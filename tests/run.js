/* 計算ロジックのテスト：node tests/run.js */
'use strict';
const path = require('path');
const assert = require('assert');

const mem = {};
globalThis.localStorage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => (mem[k] = v) };
for (const f of ['util', 'master', 'store', 'calc']) require(path.join(__dirname, '..', 'js', f + '.js'));
const { util: U, store: S, calc: C, master: M } = globalThis.KC;

let passed = 0;
let failed = 0;
function test(name, fn) {
  S.state = S.empty();
  U.setToday('2026-10-05');
  try {
    fn();
    passed++;
    console.log('  ok  ' + name);
  } catch (e) {
    failed++;
    console.log('  NG  ' + name + '\n      ' + e.message);
  }
}

// ---------- 日付・和暦 ----------
test('和暦表記', () => {
  assert.strictEqual(U.wareki('2019-05-01'), '令和元年5月1日');
  assert.strictEqual(U.wareki('2019-04-30'), '平成31年4月30日');
  assert.strictEqual(U.wareki('2026-10-05', 'short'), 'R8.10.5');
  assert.strictEqual(U.wareki('1940-03-02', 'short'), 'S15.3.2');
  assert.strictEqual(U.warekiYM('2019-05'), '令和元年5月');
});
test('日付の柔軟な解釈', () => {
  assert.strictEqual(U.parseDate('R6.4.1'), '2024-04-01');
  assert.strictEqual(U.parseDate('令和元年5月1日'), '2019-05-01');
  assert.strictEqual(U.parseDate('ｓ１５．３．２'), '1940-03-02');
  assert.strictEqual(U.parseDate('昭和15年3月2日'), '1940-03-02');
  assert.strictEqual(U.parseDate('2024/4/1'), '2024-04-01');
  assert.strictEqual(U.parseDate('20240401'), '2024-04-01');
  assert.strictEqual(U.parseDate('4/1'), '2026-04-01');
  assert.strictEqual(U.parseDate('R6.2.30'), null);
  assert.strictEqual(U.parseDate('abc'), null);
});
test('年齢・月加算', () => {
  assert.strictEqual(U.age('1940-10-06', '2026-10-05'), 85);
  assert.strictEqual(U.age('1940-10-05', '2026-10-05'), 86);
  assert.strictEqual(U.ageReachDate('1961-10-06', 65), '2026-10-05');
  assert.strictEqual(U.addMonths('2024-01-31', 1), '2024-02-29');
  assert.strictEqual(U.daysInMonth('2026-02'), 28);
});
test('ひらがな・カタカナを区別せず検索できる', () => {
  assert.strictEqual(U.norm('ヤマダ ハナコ'), U.norm('やまだはなこ'));
});

// ---------- 利用票の計算 ----------
const mkUser = (certs, burden = 1) => {
  const u = { id: 'u1', name: 'テスト', burden, certs, startDate: '2024-01-01' };
  S.state.users.push(u);
  return u;
};
const days = (ym, wds) => {
  const out = [];
  for (let d = 1; d <= U.daysInMonth(ym); d++) if (wds.includes(U.weekday(U.dayISO(ym, d)))) out.push(d);
  return out;
};

test('単価と端数処理（6級地・訪問介護・1割）', () => {
  S.state.settings.areaGrade = '6級地';
  S.state.providers.push({ id: 'p1', name: 'A', serviceType: '訪問介護', areaGrade: '6級地' });
  const u = mkUser([{ level: 'c2', start: '2026-04-01', end: '2027-03-31' }]);
  const sch = { userId: 'u1', ym: '2026-10', lines: [{ id: 'l1', serviceId: 'hv_b2', providerId: 'p1', plan: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }] };
  const r = C.computeMonth(u, '2026-10', sch, 'plan');
  assert.strictEqual(r.limit, 19705);
  assert.strictEqual(r.targetTotal, 3870);
  const g = r.groups[0];
  assert.strictEqual(g.price, 10.42);
  assert.strictEqual(g.fee, Math.floor(3870 * 10.42)); // 40325
  assert.strictEqual(g.benefit, Math.floor(40325 * 0.9)); // 36292
  assert.strictEqual(g.userPay, 40325 - 36292);
});

test('通所介護は要介護度別単位・地域区分45%', () => {
  S.state.providers.push({ id: 'p2', name: 'D', serviceType: '通所介護', areaGrade: '1級地' });
  const u = mkUser([{ level: 'c3', start: '2026-04-01', end: '2027-03-31' }], 2);
  const sch = { lines: [{ id: 'l', serviceId: 'dc_78', providerId: 'p2', plan: [1, 8] }] };
  const r = C.computeMonth(u, '2026-10', sch, 'plan');
  assert.strictEqual(r.targetTotal, 1800);
  assert.strictEqual(r.groups[0].price, 10.9);
  assert.strictEqual(r.groups[0].fee, 19620);
  assert.strictEqual(r.groups[0].benefit, Math.floor(19620 * 0.8));
});

test('処遇改善加算は限度額内単位×率（四捨五入）で限度額管理の対象外', () => {
  S.state.providers.push({ id: 'p1', name: 'A', serviceType: '訪問介護', areaGrade: 'その他', shogu: 24.5 });
  const u = mkUser([{ level: 'c1', start: '2026-04-01', end: '2027-03-31' }]);
  const sch = { lines: [{ id: 'l', serviceId: 'hv_b1', providerId: 'p1', plan: [1, 2, 3] }] };
  const r = C.computeMonth(u, '2026-10', sch, 'plan');
  assert.strictEqual(r.targetTotal, 732);
  assert.strictEqual(r.groups[0].shogu, Math.round(732 * 0.245)); // 179
  assert.strictEqual(r.groups[0].fee, (732 + 179) * 10);
});

test('限度額超過は指定行から充当し、全額自己負担になる', () => {
  S.state.providers.push({ id: 'p1', name: 'A', serviceType: '訪問介護', areaGrade: 'その他' });
  const u = mkUser([{ level: 's1', start: '2026-04-01', end: '2027-03-31' }]);
  const sch = {
    overflowLineId: 'a',
    lines: [
      { id: 'a', serviceId: 'hv_b3', providerId: 'p1', plan: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }, // 5670
      { id: 'b', serviceId: 'hv_l3', providerId: 'p1', plan: [1, 2] }, // 440
    ],
  };
  const r = C.computeMonth(u, '2026-10', sch, 'plan');
  assert.strictEqual(r.limit, 5032);
  assert.strictEqual(r.over, 6110 - 5032);
  assert.strictEqual(r.rows[0].over, 1078);
  assert.strictEqual(r.rows[1].over, 0);
  assert.strictEqual(r.groups[0].inLimit, 5032);
  assert.strictEqual(r.totals.overFee, 10780);
});

test('月途中の区分変更は重い方の限度額、日ごとの要介護度で単位算定', () => {
  S.state.providers.push({ id: 'p2', name: 'D', serviceType: '通所介護', areaGrade: 'その他' });
  const u = mkUser([
    { level: 'c1', start: '2026-04-01', end: '2026-10-14' },
    { level: 'c3', start: '2026-10-15', end: '2027-04-30' },
  ]);
  const sch = { lines: [{ id: 'l', serviceId: 'dc_78', providerId: 'p2', plan: [1, 20] }] };
  const r = C.computeMonth(u, '2026-10', sch, 'plan');
  assert.strictEqual(r.limit, 27048);
  assert.strictEqual(r.targetTotal, 658 + 900);
});

test('福祉用具は月額・手入力単位、居宅療養管理指導は限度額対象外', () => {
  const u = mkUser([{ level: 'c2', start: '2026-04-01', end: '2027-03-31' }]);
  const sch = { lines: [{ id: 'w', serviceId: 'wr', plan: [1], units: 1100 }, { id: 'k', serviceId: 'rk_dr', plan: [3, 17] }] };
  const r = C.computeMonth(u, '2026-10', sch, 'plan');
  assert.strictEqual(r.targetTotal, 1100);
  assert.strictEqual(r.rows[1].total, 1030);
  assert.strictEqual(r.rows[1].limitTarget, false);
});

test('前月の曜日パターンを翌月へコピー', () => {
  const src = { ym: '2026-09', lines: [{ id: 'x', serviceId: 'hv_b2', plan: days('2026-09', [1, 4]) }] };
  const lines = C.copyByWeekday(src, '2026-10');
  assert.deepStrictEqual(lines[0].plan, days('2026-10', [1, 4]));
  assert.deepStrictEqual(lines[0].actual, []);
});

// ---------- 居宅介護支援費 ----------
test('取扱件数による逓減（45件目から ii）と要支援の1/3換算', () => {
  S.state.settings.fte = 1;
  for (let i = 0; i < 46; i++) {
    const id = 'c' + i;
    S.state.users.push({ id, name: id, startDate: `2020-01-${U.pad((i % 28) + 1)}`, certs: [{ level: i % 2 ? 'c3' : 'c1', start: '2026-01-01', end: '2027-12-31' }] });
    S.state.schedules[`${id}_2026-10`] = { userId: id, ym: '2026-10', lines: [{ id: 'l', serviceId: 'wr', plan: [1], units: 500 }] };
  }
  let k = C.kyotakuMonth('2026-10');
  assert.strictEqual(k.items.length, 46);
  assert.strictEqual(k.items.filter((x) => x.tier === 'i').length, 44);
  assert.strictEqual(k.items.filter((x) => x.tier === 'ii').length, 2);
  // 要支援3名（=1件）を加えると、i が1件減る
  for (let i = 0; i < 3; i++) {
    const id = 's' + i;
    S.state.users.push({ id, name: id, startDate: '2019-01-01', certs: [{ level: 's1', start: '2026-01-01', end: '2027-12-31' }] });
    S.state.schedules[`${id}_2026-10`] = { userId: id, ym: '2026-10', lines: [{ id: 'l', serviceId: 'wr', plan: [1], units: 500 }] };
  }
  k = C.kyotakuMonth('2026-10');
  assert.strictEqual(Math.round(k.caseCount * 100) / 100, 47);
  assert.strictEqual(k.items.filter((x) => x.tier === 'i').length, 43);
});

test('居宅介護支援費の単位と運営基準減算・初回加算の制限', () => {
  S.state.settings.areaGrade = 'その他';
  const u = mkUser([{ level: 'c3', start: '2026-04-01', end: '2027-03-31' }]);
  S.state.schedules['u1_2026-10'] = { userId: 'u1', ym: '2026-10', lines: [{ id: 'l', serviceId: 'wr', plan: [1], units: 500 }] };
  let k = C.kyotakuMonth('2026-10');
  assert.strictEqual(k.items[0].total, 1411);
  assert.strictEqual(k.items[0].yen, 14110);
  S.setKyotaku(u.id, '2026-10', { addons: ['initial'], genzan: true });
  k = C.kyotakuMonth('2026-10');
  assert.strictEqual(k.items[0].total, Math.round(1411 * 0.5));
  assert.ok(k.items[0].msgs.some((m) => m.includes('初回加算')));
});

test('給付管理対象のサービスがない月は居宅介護支援費を算定しない', () => {
  mkUser([{ level: 'c1', start: '2026-04-01', end: '2027-03-31' }]);
  const k = C.kyotakuMonth('2026-10');
  assert.strictEqual(k.items.length, 0);
  assert.strictEqual(k.notBillable.length, 1);
});

// ---------- ケアプランのチェック ----------
test('ケアプランの期間チェック', () => {
  const u = mkUser([{ level: 'c2', start: '2026-04-01', end: '2027-03-31' }]);
  const plan = {
    createdDate: '2026-04-01',
    status: 'final',
    consentDate: '',
    needs: [{ need: 'x', longStart: '2026-04-01', longEnd: '2027-06-30', shorts: [{ goal: 'y', start: '2026-10-01', end: '2026-09-30', services: [] }] }],
  };
  const { errs, warns } = C.validatePlan(plan, u);
  assert.ok(errs.some((e) => e.includes('同意日')));
  assert.ok(errs.some((e) => e.includes('逆転')));
  assert.ok(warns.some((w) => w.includes('認定有効期間')));
});

// ---------- アラート ----------
test('認定期限・モニタリング・実績未確定のアラート', () => {
  const u = mkUser([{ level: 'c2', start: '2025-11-01', end: '2026-10-31' }]);
  u.status = 'active';
  S.state.schedules['u1_2026-09'] = { userId: 'u1', ym: '2026-09', lines: [{ id: 'l', serviceId: 'wr', plan: [1], units: 500 }], confirmed: false };
  const a = C.alerts('2026-10-05');
  assert.ok(a.some((x) => x.cat === '認定' && x.level === 'danger'));
  assert.ok(a.some((x) => x.cat === 'モニタリング'));
  assert.ok(a.some((x) => x.cat === '給付管理'));
});

test('マスタ：区分支給限度基準額', () => {
  assert.deepStrictEqual(M.levels.map((l) => l.limit), [5032, 5032, 10531, 16765, 19705, 27048, 30938, 36217]);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
