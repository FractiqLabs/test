/* データ保存（ブラウザの localStorage）とドメイン補助関数 */
(function (g) {
  'use strict';
  const KC = (g.KC = g.KC || {});
  const U = KC.util;
  const M = KC.master;
  const KEY = 'kaigo-cm-data-v1';

  const S = (KC.store = { state: null });

  S.empty = () => ({
    version: 1,
    settings: {
      officeName: '',
      officeNo: '',
      areaGrade: 'その他',
      feeType: 'I',
      fte: 1,
      tokutei: '',
      shuchuGenzan: false,
      staff: [],
      currentStaff: '',
      lastBackup: null,
    },
    users: [],
    providers: [],
    plans: [],
    schedules: {},
    notes: [],
    monitorings: [],
    meetings: [],
    customServices: [],
    kyotaku: {}, // `${userId}_${ym}` → { addons: [], genzan: bool }
    recent: [],
  });

  S.load = () => {
    const base = S.empty();
    let data = null;
    try {
      data = JSON.parse(g.localStorage?.getItem(KEY) || 'null');
    } catch (e) {
      console.error(e);
    }
    S.state = data ? { ...base, ...data, settings: { ...base.settings, ...(data.settings || {}) } } : base;
    return S.state;
  };
  S.save = () => {
    try {
      g.localStorage?.setItem(KEY, JSON.stringify(S.state));
    } catch (e) {
      alert('保存に失敗しました（ブラウザの保存容量不足の可能性）。バックアップを出力してください。\n' + e.message);
    }
  };
  S.byId = (coll, id) => S.state[coll].find((x) => x.id === id) || null;
  S.upsert = (coll, obj) => {
    if (!obj.id) obj.id = U.uid();
    obj.updatedAt = new Date().toISOString();
    const i = S.state[coll].findIndex((x) => x.id === obj.id);
    if (i >= 0) S.state[coll][i] = obj;
    else S.state[coll].push(obj);
    S.save();
    return obj;
  };
  S.remove = (coll, id) => {
    S.state[coll] = S.state[coll].filter((x) => x.id !== id);
    S.save();
  };

  S.touchRecent = (userId) => {
    S.state.recent = [userId, ...S.state.recent.filter((x) => x !== userId)].slice(0, 8);
    S.save();
  };

  // ---------- 利用者・認定 ----------
  S.activeUsers = () => S.state.users.filter((u) => u.status !== 'ended');
  S.userName = (id) => S.byId('users', id)?.name || '（不明）';
  S.certOn = (user, iso) => (user.certs || []).find((c) => c.start && c.end && c.start <= iso && iso <= c.end) || null;
  S.levelOn = (user, iso) => S.certOn(user, iso)?.level || null;
  S.latestCert = (user) => [...(user.certs || [])].sort((a, b) => (b.start || '').localeCompare(a.start || ''))[0] || null;
  // 月内の認定（区分変更等で複数あれば重い方を限度額に使う）
  S.certsInMonth = (user, ym) =>
    (user.certs || []).filter((c) => c.start && c.end && U.overlaps(c.start, c.end, U.monthStart(ym), U.monthEnd(ym)));
  S.limitLevelForMonth = (user, ym) => {
    const lv = S.certsInMonth(user, ym)
      .map((c) => M.level(c.level))
      .filter(Boolean)
      .sort((a, b) => b.rank - a.rank)[0];
    return lv || null;
  };
  // 居宅介護支援費は月末時点の要介護度（月末に認定がなければ月内最後の認定）
  S.levelAtMonthEnd = (user, ym) => {
    const end = S.levelOn(user, U.monthEnd(ym));
    if (end) return end;
    const cs = S.certsInMonth(user, ym).sort((a, b) => b.end.localeCompare(a.end));
    return cs[0]?.level || null;
  };

  // ---------- サービス ----------
  S.allServices = () => [...M.services, ...(S.state.customServices || [])];
  S.service = (id) => S.allServices().find((s) => s.id === id) || null;

  // ---------- ケアプラン ----------
  S.userPlans = (userId) =>
    S.state.plans.filter((p) => p.userId === userId).sort((a, b) => (b.createdDate || '').localeCompare(a.createdDate || ''));
  S.currentPlan = (userId, iso = U.today()) =>
    S.userPlans(userId).find((p) => p.status === 'final' && (p.createdDate || '') <= iso) || null;

  // ---------- 利用票 ----------
  S.schedKey = (userId, ym) => `${userId}_${ym}`;
  S.getSchedule = (userId, ym) => S.state.schedules[S.schedKey(userId, ym)] || null;
  S.ensureSchedule = (userId, ym) => {
    const k = S.schedKey(userId, ym);
    if (!S.state.schedules[k]) S.state.schedules[k] = { userId, ym, lines: [], overflowLineId: '', confirmed: false };
    return S.state.schedules[k];
  };
  S.saveSchedule = (sch) => {
    sch.updatedAt = new Date().toISOString();
    S.state.schedules[S.schedKey(sch.userId, sch.ym)] = sch;
    S.save();
  };

  // ---------- 記録 ----------
  S.userNotes = (userId) =>
    S.state.notes.filter((n) => n.userId === userId).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  S.monitoringFor = (userId, ym) => S.state.monitorings.filter((m) => m.userId === userId && m.date && U.ym(m.date) === ym);
  S.userMeetings = (userId) => S.state.meetings.filter((m) => m.userId === userId).sort((a, b) => b.date.localeCompare(a.date));

  S.kyotakuOf = (userId, ym) => S.state.kyotaku[S.schedKey(userId, ym)] || { addons: [], genzan: false };
  S.setKyotaku = (userId, ym, v) => {
    S.state.kyotaku[S.schedKey(userId, ym)] = v;
    S.save();
  };

  // ---------- バックアップ ----------
  S.exportJSON = () => {
    S.state.settings.lastBackup = new Date().toISOString();
    S.save();
    return JSON.stringify(S.state, null, 2);
  };
  S.importJSON = (text) => {
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.users)) throw new Error('このアプリのバックアップファイルではありません');
    S.state = { ...S.empty(), ...data, settings: { ...S.empty().settings, ...(data.settings || {}) } };
    S.save();
  };
  S.clearAll = () => {
    S.state = S.empty();
    S.save();
  };
})(globalThis);
