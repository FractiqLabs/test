/* サービス事業所・設定・マスタ・バックアップ */
(function (g) {
  'use strict';
  const KC = g.KC;
  const U = KC.util;
  const M = KC.master;
  const S = KC.store;
  const UI = KC.ui;
  const V = (KC.views = KC.views || {});
  const esc = U.esc;

  // ================= サービス事業所 =================
  V.providers = (el) => {
    let draft = null;
    const draw = () => {
      const list = [...S.state.providers].sort((a, b) => a.serviceType.localeCompare(b.serviceType, 'ja') || a.name.localeCompare(b.name, 'ja'));
      el.innerHTML = `
        <div class="page-head"><h1>サービス事業所</h1><button class="btn primary" id="p-new">＋ 事業所を登録</button></div>
        ${draft ? formHTML(draft) : ''}
        ${
          list.length
            ? `<table class="grid clickable"><thead><tr><th>サービス種類</th><th>事業所名</th><th>事業所番号</th><th>電話</th><th>FAX</th><th>地域区分</th><th>処遇改善等</th></tr></thead><tbody>
          ${list
            .map(
              (p) => `<tr data-id="${p.id}"><td>${esc(p.serviceType)}</td><td><b>${esc(p.name)}</b></td><td>${esc(p.number || '')}</td><td>${esc(p.tel || '')}</td><td>${esc(p.fax || '')}</td>
              <td>${esc(p.areaGrade || '（事業所設定）')}</td><td>${p.shogu ? esc(p.shogu) + '%' : ''}</td></tr>`
            )
            .join('')}</tbody></table>`
            : UI.empty('事業所が登録されていません')
        }`;
      el.querySelector('#p-new').onclick = () => {
        draft = { id: '', name: '', number: '', serviceType: '訪問介護', tel: '', fax: '', areaGrade: S.state.settings.areaGrade, shogu: '' };
        draw();
      };
      el.querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = () => ((draft = U.clone(S.byId('providers', tr.dataset.id))), draw(), window.scrollTo(0, 0))));
      if (!draft) return;
      const form = el.querySelector('#p-form');
      form.querySelector('#p-save').onclick = () => {
        const v = UI.readForm(form);
        if (!v.name.trim()) return UI.toast('事業所名を入力してください', 'error');
        v.number = U.digits(v.number);
        if (v.number && v.number.length !== 10) return UI.toast('事業所番号は10桁です', 'error');
        S.upsert('providers', { ...draft, ...v });
        draft = null;
        UI.setDirty(false);
        UI.toast('保存しました');
        draw();
      };
      form.querySelector('#p-cancel').onclick = () => ((draft = null), UI.setDirty(false), draw());
      form.querySelector('#p-del')?.addEventListener('click', () => {
        const used = Object.values(S.state.schedules).some((s) => s.lines.some((l) => l.providerId === draft.id));
        if (!confirm(used ? 'この事業所は利用票で使われています。削除すると利用票の事業所が未設定になります。削除しますか？' : '削除しますか？')) return;
        S.remove('providers', draft.id);
        draft = null;
        draw();
      });
      form.addEventListener('input', () => UI.setDirty(true));
    };
    const formHTML = (p) => `<div class="card" id="p-form">
      <h2>${p.id ? '事業所の編集' : '事業所の登録'}</h2>
      <div class="form-grid">
        <label class="fld"><span>サービス種類</span>${UI.select({ name: 'serviceType' }, M.typeNames, p.serviceType)}</label>
        <label class="fld"><span>事業所名</span><input name="name" value="${esc(p.name)}"></label>
        <label class="fld"><span>事業所番号（10桁）</span><input name="number" value="${esc(p.number || '')}" inputmode="numeric" maxlength="10"></label>
        <label class="fld"><span>電話</span><input name="tel" value="${esc(p.tel || '')}"></label>
        <label class="fld"><span>FAX</span><input name="fax" value="${esc(p.fax || '')}"></label>
        <label class="fld"><span>担当者</span><input name="contact" value="${esc(p.contact || '')}"></label>
        <label class="fld"><span>地域区分（所在地）</span>${UI.select({ name: 'areaGrade' }, M.areaGrades, p.areaGrade)}</label>
        <label class="fld"><span>処遇改善加算等の率（%）</span><input name="shogu" value="${esc(p.shogu || '')}" data-type="number" placeholder="例：24.5"></label>
      </div>
      <p class="note">処遇改善加算等の率は事業所が算定している区分の率を入力（例：令和6年6月〜 訪問介護(I) 24.5%、通所介護(I) 9.2%）。期中改定がある場合は最新の率に更新してください。</p>
      <div class="form-actions"><button class="btn primary" id="p-save" data-primary-save>保存</button><button class="btn ghost" id="p-cancel">閉じる</button>
      ${p.id ? '<button class="btn ghost danger-text" id="p-del">削除</button>' : ''}</div></div>`;
    draw();
  };

  // ================= 設定 =================
  V.settings = (el) => {
    const st = S.state;
    const s = U.clone(st.settings);
    const draw = () => {
      el.innerHTML = `
        <div class="page-head"><h1>設定・マスタ</h1></div>
        <div class="cols">
          <div class="card">
            <h2>事業所情報（居宅介護支援）</h2>
            <div class="form-grid">
              <label class="fld"><span>事業所名</span><input data-path="officeName" value="${esc(s.officeName)}"></label>
              <label class="fld"><span>事業所番号</span><input data-path="officeNo" value="${esc(s.officeNo)}" maxlength="10"></label>
              <label class="fld"><span>地域区分</span>${UI.select({ 'data-path': 'areaGrade' }, M.areaGrades, s.areaGrade)}</label>
              <label class="fld"><span>居宅介護支援費の区分</span>${UI.select({ 'data-path': 'feeType' }, Object.entries(M.kyotakuFees).map(([k2, v]) => [k2, v.label]), s.feeType)}</label>
              <label class="fld"><span>介護支援専門員（常勤換算）</span><input data-path="fte" data-type="number" value="${esc(s.fte)}"></label>
              <label class="fld"><span>特定事業所加算</span>${UI.select({ 'data-path': 'tokutei' }, M.tokuteiAddons.map((t) => [t.id, t.name + (t.units ? `（${t.units}）` : '')]), s.tokutei)}</label>
              <label class="fld chk"><input type="checkbox" data-path="shuchuGenzan" ${s.shuchuGenzan ? 'checked' : ''}><span>特定事業所集中減算を適用</span></label>
            </div>
            <h3>介護支援専門員</h3>
            <ul class="simple-list">${s.staff.map((x, i) => `<li><input data-path="staff.${i}.name" value="${esc(x.name)}"> <button class="link danger-text" data-del-staff="${i}">削除</button></li>`).join('')}</ul>
            <button class="btn small" id="add-staff">＋ 追加</button>
            <div class="form-actions"><button class="btn primary" data-primary-save id="s-save">設定を保存</button></div>
          </div>
          <div class="card">
            <h2>バックアップ・データ</h2>
            <p>データはこのブラウザ（端末）内にのみ保存されています。端末の故障やブラウザのデータ削除で消えるため、定期的にファイルへ保存してください。</p>
            <p>最終バックアップ：${s.lastBackup ? esc(U.wareki(s.lastBackup.slice(0, 10))) : '未実施'}</p>
            <div class="btn-col">
              <button class="btn" data-action="backup">バックアップを保存（JSON）</button>
              <label class="btn">バックアップから復元<input type="file" id="restore" accept=".json,application/json" hidden></label>
              <button class="btn" id="demo">デモデータを追加</button>
              <button class="btn ghost danger-text" id="clear">すべてのデータを削除</button>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h2>サービスマスタ</h2><small>${esc(M.basis)}</small></div>
          <p class="note">「要確認」は公式サービスコード表との照合を特に推奨する項目です。足りないサービスや単位数の異なる加算は「独自サービス」として追加できます。</p>
          <h3>独自サービスの追加</h3>
          <div class="form-row" id="cs-form">
            ${UI.select({ name: 'type' }, M.typeNames, '訪問介護')}
            <input name="name" placeholder="サービス内容（例：特定事業所加算(II)相当 等）">
            <input name="units" data-type="number" placeholder="単位/回" class="narrow">
            ${UI.select({ name: 'kind' }, [['visit', '回単位'], ['monthly', '月単位']], 'visit')}
            ${UI.select({ name: 'limitTarget' }, [['1', '限度額対象'], ['0', '限度額対象外']], '1')}
            <button class="btn small primary" id="cs-add">追加</button>
          </div>
          ${
            st.customServices.length
              ? `<table class="grid"><thead><tr><th>種類</th><th>内容</th><th>単位</th><th>算定</th><th>限度額</th><th></th></tr></thead><tbody>
            ${st.customServices.map((c) => `<tr><td>${esc(c.type)}</td><td>${esc(c.name)}</td><td>${c.units}</td><td>${c.kind === 'monthly' ? '月' : '回'}</td><td>${c.limitTarget ? '対象' : '対象外'}</td><td><button class="link danger-text" data-del-cs="${c.id}">削除</button></td></tr>`).join('')}
            </tbody></table>`
              : ''
          }
          <details><summary>標準マスタ一覧（${M.services.length}件）</summary>
            <table class="grid"><thead><tr><th>種類</th><th>内容</th><th>単位</th><th>算定</th><th></th></tr></thead><tbody>
            ${M.services
              .map(
                (x) => `<tr><td>${esc(x.type)}</td><td>${esc(x.name)}</td><td>${x.levelUnits ? Object.entries(x.levelUnits).map(([k2, v]) => `${UI.levelLabel(k2).replace('要介護', '介')}:${v}`).join(' ') : x.manualUnits ? '月ごと入力' : x.units}</td>
                <td>${x.kind === 'monthly' ? '月' : '回'}</td><td>${x.verify ? '<span class="badge warn">要確認</span>' : ''}</td></tr>`
              )
              .join('')}</tbody></table>
          </details>
        </div>`;
      bind();
    };

    function bind() {
      const q = (x) => el.querySelector(x);
      q('#s-save').onclick = () => {
        document.activeElement?.blur?.();
        s.staff = s.staff.filter((x) => x.name?.trim());
        st.settings = { ...st.settings, ...s, fte: U.num(s.fte, 1) || 1 };
        S.save();
        UI.setDirty(false);
        UI.toast('設定を保存しました');
        KC.app.render();
      };
      q('#add-staff').onclick = () => {
        s.staff.push({ id: U.uid(), name: '' });
        UI.setDirty(true);
        draw();
        el.querySelector(`[data-path="staff.${s.staff.length - 1}.name"]`)?.focus();
      };
      el.querySelectorAll('[data-del-staff]').forEach((b) => (b.onclick = () => {
        s.staff.splice(Number(b.dataset.delStaff), 1);
        UI.setDirty(true);
        draw();
      }));
      q('#restore').onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!confirm('現在のデータをバックアップの内容で置き換えます。よろしいですか？')) return;
        try {
          S.importJSON(await file.text());
          UI.toast('復元しました');
          KC.app.go('#/dashboard');
        } catch (err) {
          UI.toast('復元に失敗しました：' + err.message, 'error');
        }
      };
      q('#demo').onclick = () => {
        KC.demo.load();
        UI.toast('デモデータを追加しました');
        KC.app.go('#/dashboard');
      };
      q('#clear').onclick = () => {
        if (!confirm('すべてのデータを削除します。元に戻せません。先にバックアップを保存しましたか？')) return;
        if (prompt('確認のため「削除」と入力してください') !== '削除') return;
        S.clearAll();
        UI.toast('削除しました');
        KC.app.go('#/dashboard');
      };
      q('#cs-add').onclick = () => {
        const v = UI.readForm(q('#cs-form'));
        if (!v.name.trim()) return UI.toast('サービス内容を入力してください', 'error');
        st.customServices.push({ id: 'cs_' + U.uid(), type: v.type, name: v.name.trim(), units: U.num(v.units), kind: v.kind, limitTarget: v.limitTarget === '1', custom: true });
        S.save();
        UI.toast('追加しました');
        draw();
      };
      el.querySelectorAll('[data-del-cs]').forEach((b) => (b.onclick = () => {
        const used = Object.values(st.schedules).some((x) => x.lines.some((l) => l.serviceId === b.dataset.delCs));
        if (used) return UI.toast('利用票で使われているため削除できません', 'error');
        st.customServices = st.customServices.filter((c) => c.id !== b.dataset.delCs);
        S.save();
        draw();
      }));
    }
    draw();
    UI.bindPath(el, s);
  };
})(globalThis);
