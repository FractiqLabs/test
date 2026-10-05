/*
 * 制度マスタ（令和6年度介護報酬改定ベース）
 *
 * 注意：単位数・単価・加算率は改定・期中改定で変わる。本ファイルの値は
 * 公式の「介護給付費単位数等サービスコード表」と照合してから運用すること。
 * verify: true は特に照合を推奨する項目。設定画面から独自サービスの追加・単位上書きが可能。
 */
(function (g) {
  'use strict';
  const KC = (g.KC = g.KC || {});
  const M = (KC.master = {});

  M.basis = '令和6年度介護報酬改定（令和6年4月・6月施行分）';

  // 要介護度と区分支給限度基準額（単位／月）
  M.levels = [
    { code: 'jigyo', label: '事業対象者', limit: 5032, group: 'support', rank: 0 },
    { code: 's1', label: '要支援1', limit: 5032, group: 'support', rank: 1 },
    { code: 's2', label: '要支援2', limit: 10531, group: 'support', rank: 2 },
    { code: 'c1', label: '要介護1', limit: 16765, group: 'care', rank: 3 },
    { code: 'c2', label: '要介護2', limit: 19705, group: 'care', rank: 4 },
    { code: 'c3', label: '要介護3', limit: 27048, group: 'care', rank: 5 },
    { code: 'c4', label: '要介護4', limit: 30938, group: 'care', rank: 6 },
    { code: 'c5', label: '要介護5', limit: 36217, group: 'care', rank: 7 },
  ];
  M.level = (code) => M.levels.find((l) => l.code === code) || null;
  M.careLevelCodes = ['c1', 'c2', 'c3', 'c4', 'c5'];

  // 地域区分と1単位の単価（人件費割合別）
  M.areaGrades = ['1級地', '2級地', '3級地', '4級地', '5級地', '6級地', '7級地', 'その他'];
  M.unitPrices = {
    70: [11.4, 11.12, 11.05, 10.84, 10.7, 10.42, 10.21, 10.0],
    55: [11.1, 10.88, 10.83, 10.66, 10.55, 10.33, 10.17, 10.0],
    45: [10.9, 10.72, 10.68, 10.54, 10.45, 10.27, 10.14, 10.0],
    0: [10, 10, 10, 10, 10, 10, 10, 10],
  };
  M.unitPrice = (ratio, grade) => {
    const i = Math.max(0, M.areaGrades.indexOf(grade || 'その他'));
    return (M.unitPrices[ratio] || M.unitPrices[0])[i];
  };

  // サービス種類：ratio=人件費割合区分, limitTarget=区分支給限度額管理の対象か
  M.serviceTypes = {
    訪問介護: { ratio: 70, limitTarget: true, code: '11' },
    訪問入浴介護: { ratio: 70, limitTarget: true, code: '12' },
    訪問看護: { ratio: 70, limitTarget: true, code: '13' },
    訪問リハビリテーション: { ratio: 55, limitTarget: true, code: '14' },
    通所介護: { ratio: 45, limitTarget: true, code: '15' },
    通所リハビリテーション: { ratio: 55, limitTarget: true, code: '16' },
    福祉用具貸与: { ratio: 0, limitTarget: true, code: '17' },
    短期入所生活介護: { ratio: 55, limitTarget: true, code: '21' },
    居宅療養管理指導: { ratio: 0, limitTarget: false, code: '31' },
    地域密着型通所介護: { ratio: 45, limitTarget: true, code: '78' },
    その他: { ratio: 0, limitTarget: true, code: '' },
  };
  M.typeNames = Object.keys(M.serviceTypes);

  const byLv = (a) => ({ c1: a[0], c2: a[1], c3: a[2], c4: a[3], c5: a[4] });
  // kind: visit=回単位, monthly=月単位（福祉用具は単位数を月ごとに入力）
  M.services = [
    // 訪問介護
    { id: 'hv_b0', type: '訪問介護', name: '身体介護0（20分未満）', units: 163, kind: 'visit' },
    { id: 'hv_b1', type: '訪問介護', name: '身体介護1（20分以上30分未満）', units: 244, kind: 'visit' },
    { id: 'hv_b2', type: '訪問介護', name: '身体介護2（30分以上1時間未満）', units: 387, kind: 'visit' },
    { id: 'hv_b3', type: '訪問介護', name: '身体介護3（1時間以上1時間30分未満）', units: 567, kind: 'visit' },
    { id: 'hv_b4', type: '訪問介護', name: '身体介護4（1時間30分以上2時間未満）', units: 649, kind: 'visit' },
    { id: 'hv_l2', type: '訪問介護', name: '生活援助2（20分以上45分未満）', units: 179, kind: 'visit' },
    { id: 'hv_l3', type: '訪問介護', name: '生活援助3（45分以上）', units: 220, kind: 'visit' },
    { id: 'hv_b1l1', type: '訪問介護', name: '身体1・生活1', units: 309, kind: 'visit' },
    { id: 'hv_b1l2', type: '訪問介護', name: '身体1・生活2', units: 374, kind: 'visit' },
    { id: 'hv_b2l1', type: '訪問介護', name: '身体2・生活1', units: 452, kind: 'visit' },
    { id: 'hv_b2l2', type: '訪問介護', name: '身体2・生活2', units: 517, kind: 'visit' },
    { id: 'hv_ride', type: '訪問介護', name: '通院等乗降介助', units: 97, kind: 'visit' },
    { id: 'hv_first', type: '訪問介護', name: '初回加算', units: 200, kind: 'monthly' },
    { id: 'hv_emg', type: '訪問介護', name: '緊急時訪問介護加算', units: 100, kind: 'visit' },
    // 訪問入浴
    { id: 'bath', type: '訪問入浴介護', name: '訪問入浴介護', units: 1266, kind: 'visit' },
    // 訪問看護（訪問看護ステーション）
    { id: 'vn_20', type: '訪問看護', name: '訪看I1（20分未満）', units: 314, kind: 'visit' },
    { id: 'vn_30', type: '訪問看護', name: '訪看I2（30分未満）', units: 471, kind: 'visit' },
    { id: 'vn_60', type: '訪問看護', name: '訪看I3（30分以上1時間未満）', units: 823, kind: 'visit' },
    { id: 'vn_90', type: '訪問看護', name: '訪看I4（1時間以上1時間30分未満）', units: 1128, kind: 'visit' },
    { id: 'vn_pt', type: '訪問看護', name: '訪看I5（理学療法士等・20分）', units: 294, kind: 'visit' },
    { id: 'vn_emg', type: '訪問看護', name: '緊急時訪問看護加算(I)', units: 600, kind: 'monthly' },
    // 訪問リハ
    { id: 'vr', type: '訪問リハビリテーション', name: '訪問リハビリテーション（20分）', units: 308, kind: 'visit' },
    // 通所介護（通常規模型）
    { id: 'dc_34', type: '通所介護', name: '通常規模 3時間以上4時間未満', levelUnits: byLv([370, 423, 479, 533, 588]), kind: 'visit' },
    { id: 'dc_45', type: '通所介護', name: '通常規模 4時間以上5時間未満', levelUnits: byLv([388, 444, 502, 560, 617]), kind: 'visit' },
    { id: 'dc_56', type: '通所介護', name: '通常規模 5時間以上6時間未満', levelUnits: byLv([570, 673, 777, 880, 984]), kind: 'visit' },
    { id: 'dc_67', type: '通所介護', name: '通常規模 6時間以上7時間未満', levelUnits: byLv([584, 690, 799, 908, 1017]), kind: 'visit' },
    { id: 'dc_78', type: '通所介護', name: '通常規模 7時間以上8時間未満', levelUnits: byLv([658, 777, 900, 1023, 1148]), kind: 'visit' },
    { id: 'dc_89', type: '通所介護', name: '通常規模 8時間以上9時間未満', levelUnits: byLv([669, 791, 915, 1041, 1168]), kind: 'visit' },
    { id: 'dc_bath1', type: '通所介護', name: '入浴介助加算(I)', units: 40, kind: 'visit' },
    { id: 'dc_bath2', type: '通所介護', name: '入浴介助加算(II)', units: 55, kind: 'visit' },
    { id: 'dc_fk1', type: '通所介護', name: '個別機能訓練加算(I)イ', units: 56, kind: 'visit' },
    { id: 'dc_fk2', type: '通所介護', name: '個別機能訓練加算(I)ロ', units: 76, kind: 'visit' },
    { id: 'dc_nopick', type: '通所介護', name: '送迎減算（片道）', units: -47, kind: 'visit' },
    // 通所リハ（通常規模型）
    { id: 'dr_67', type: '通所リハビリテーション', name: '通常規模 6時間以上7時間未満', levelUnits: byLv([715, 850, 981, 1137, 1290]), kind: 'visit', verify: true },
    { id: 'dr_78', type: '通所リハビリテーション', name: '通常規模 7時間以上8時間未満', levelUnits: byLv([762, 903, 1046, 1215, 1379]), kind: 'visit', verify: true },
    // 短期入所生活介護（併設型）
    { id: 'ss_h', type: '短期入所生活介護', name: '併設型（従来型個室・多床室）', levelUnits: byLv([603, 672, 745, 815, 884]), kind: 'visit', shortStay: true, verify: true },
    { id: 'ss_pick', type: '短期入所生活介護', name: '送迎加算（片道）', units: 184, kind: 'visit' },
    // 福祉用具貸与（単位数＝貸与価格÷10。月ごとに入力）
    { id: 'wr', type: '福祉用具貸与', name: '福祉用具貸与', units: 0, kind: 'monthly', manualUnits: true },
    // 居宅療養管理指導（限度額管理対象外）
    { id: 'rk_dr', type: '居宅療養管理指導', name: '医師（I）単一建物1人', units: 515, kind: 'visit', verify: true },
  ];

  // 居宅介護支援費（令和6年度）。[要介護1・2, 要介護3〜5]
  M.kyotakuFees = {
    I: { label: '居宅介護支援費(I)', i: [1086, 1411], ii: [544, 704], iii: [326, 422], th: [45, 60] },
    II: { label: '居宅介護支援費(II)（ケアプランデータ連携＋事務職員）', i: [1086, 1411], ii: [527, 683], iii: [316, 410], th: [50, 60] },
  };
  M.kyotakuAddons = [
    { id: 'initial', name: '初回加算', units: 300, excl: ['taiin1a', 'taiin1b', 'taiin2a', 'taiin2b', 'taiin3'] },
    { id: 'nyuin1', name: '入院時情報連携加算(I)', units: 250, excl: ['nyuin2'] },
    { id: 'nyuin2', name: '入院時情報連携加算(II)', units: 200, excl: ['nyuin1'] },
    { id: 'taiin1a', name: '退院・退所加算(I)イ', units: 450, group: 'taiin' },
    { id: 'taiin1b', name: '退院・退所加算(I)ロ', units: 600, group: 'taiin' },
    { id: 'taiin2a', name: '退院・退所加算(II)イ', units: 600, group: 'taiin' },
    { id: 'taiin2b', name: '退院・退所加算(II)ロ', units: 750, group: 'taiin' },
    { id: 'taiin3', name: '退院・退所加算(III)', units: 900, group: 'taiin' },
    { id: 'tsuin', name: '通院時情報連携加算', units: 50 },
    { id: 'kinkyu', name: '緊急時等居宅カンファレンス加算', units: 200 },
    { id: 'terminal', name: 'ターミナルケアマネジメント加算', units: 400 },
  ];
  M.tokuteiAddons = [
    { id: '', name: 'なし', units: 0 },
    { id: 'I', name: '特定事業所加算(I)', units: 519 },
    { id: 'II', name: '特定事業所加算(II)', units: 421 },
    { id: 'III', name: '特定事業所加算(III)', units: 323 },
    { id: 'A', name: '特定事業所加算(A)', units: 114 },
  ];

  // 支援経過の分類と定型文
  M.noteMethods = ['訪問', '電話', 'FAX', 'メール', '来所', 'オンライン', 'その他'];
  M.noteCategories = ['モニタリング', '担当者会議', '連絡調整', '相談受付', '認定関連', '入退院', '給付管理', 'その他'];
  M.noteTemplates = [
    '自宅を訪問し、本人・家族と面談。',
    '本人の心身状態に大きな変化なし。',
    'サービス利用状況を確認。予定どおり利用できている。',
    '目標の達成状況を確認した。',
    '計画の変更の必要性はないと判断した。',
    '事業所へ電話にて状況を確認。',
    '利用票・提供票を送付した。',
    '家族より相談あり。',
    '主治医へ情報提供を行った。',
  ];
})(globalThis);
