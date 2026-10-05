/* 支援経過（第5表）・モニタリング・サービス担当者会議（第4表） */
(function (g) {
  'use strict';
  const KC = g.KC;
  const U = KC.util;
  const M = KC.master;
  const S = KC.store;
  const UI = KC.ui;
  const V = (KC.views = KC.views || {});
  V.tabs = V.tabs || {};
  const esc = U.esc;

  // ================= 支援経過 =================
  const noteFilter = { cat: '', q: '' };
  V.tabs.notes = (el, user) => {
    let editing = null;
    const blank = () => ({
      id: '',
      userId: user.id,
      date: U.today(),
      time: U.nowTime(),
      method: '訪問',
      category: 'モニタリング',
      content: '',
      staffId: S.state.settings.currentStaff || user.cmId || '',
    });
    let draft = blank();

    const draw = () => {
      const n = U.norm(noteFilter.q);
      const notes = S.userNotes(user.id).filter((x) => (!noteFilter.cat || x.category === noteFilter.cat) && (!n || U.norm(x.content).includes(n)));
      let lastYm = '';
      el.innerHTML = `
        <div class="card note-entry">
          <div class="form-row">
            ${UI.dateInput({ id: 'n-date' }, draft.date)}
            <input type="time" id="n-time" value="${esc(draft.time)}">
            ${UI.select({ id: 'n-method' }, M.noteMethods, draft.method)}
            ${UI.select({ id: 'n-cat' }, M.noteCategories, draft.category)}
            ${UI.select({ id: 'n-staff' }, UI.staffOptions(), draft.staffId)}
            <label class="chk"><input type="checkbox" id="n-mon" ${draft.category === 'モニタリング' && !editing ? 'checked' : ''}> モニタリング実施として記録</label>
          </div>
          <div class="chips tpl">${M.noteTemplates.map((t, i) => `<button class="chip" data-tpl="${i}">${esc(t)}</button>`).join('')}</div>
          <textarea id="n-content" rows="5" placeholder="支援経過を入力（Ctrl+Enter で保存）">${esc(draft.content)}</textarea>
          <div class="form-actions">
            <button class="btn primary" id="n-save" data-primary-save>${editing ? '更新' : '記録する'} <kbd>Ctrl+Enter</kbd></button>
            ${editing ? '<button class="btn ghost" id="n-cancel">キャンセル</button>' : ''}
            <span class="spacer"></span>
            <input type="search" id="n-q" placeholder="記録内を検索" value="${esc(noteFilter.q)}">
            ${UI.select({ id: 'n-fcat' }, [['', '分類：すべて'], ...M.noteCategories], noteFilter.cat)}
            <button class="btn small" id="n-print">印刷（第5表）</button>
          </div>
        </div>
        <div class="timeline">
          ${
            notes.length
              ? notes
                  .map((x) => {
                    const ym = U.ym(x.date);
                    const head = ym !== lastYm ? `<h3 class="tl-month">${esc(U.warekiYM(ym))}</h3>` : '';
                    lastYm = ym;
                    return `${head}<div class="tl-item">
                      <div class="tl-meta"><b>${esc(U.wareki(x.date, 'short'))}(${U.WD[U.weekday(x.date)]}) ${esc(x.time || '')}</b>
                        <span class="badge muted">${esc(x.method)}</span><span class="badge info">${esc(x.category)}</span>
                        <small>${esc(UI.staffName(x.staffId))}</small>
                        <span class="spacer"></span><button class="link" data-edit="${x.id}">編集</button><button class="link danger-text" data-del="${x.id}">削除</button></div>
                      <div class="tl-body">${esc(x.content).replace(/\n/g, '<br>')}</div></div>`;
                  })
                  .join('')
              : UI.empty('記録はありません')
          }
        </div>`;
      bind(notes);
    };

    function bind(notes) {
      const q = (s) => el.querySelector(s);
      const content = q('#n-content');
      if (!editing) setTimeout(() => content.focus(), 0);
      content.addEventListener('input', () => UI.setDirty(!!content.value.trim()));
      content.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          save();
        }
      });
      q('#n-cat').addEventListener('change', (e) => (q('#n-mon').checked = e.target.value === 'モニタリング' && !editing));
      el.querySelectorAll('[data-tpl]').forEach((b) => (b.onclick = () => {
        const t = M.noteTemplates[Number(b.dataset.tpl)];
        content.value = content.value ? content.value.replace(/\s*$/, '\n') + t : t;
        content.focus();
        UI.setDirty(true);
      }));
      q('#n-save').onclick = save;
      q('#n-cancel')?.addEventListener('click', () => {
        editing = null;
        draft = blank();
        UI.setDirty(false);
        draw();
      });
      q('#n-q').addEventListener('input', (e) => {
        noteFilter.q = e.target.value;
        captureDraft();
        draw();
        const s = el.querySelector('#n-q');
        s.focus();
        s.setSelectionRange(s.value.length, s.value.length);
      });
      q('#n-fcat').addEventListener('change', (e) => ((noteFilter.cat = e.target.value), captureDraft(), draw()));
      q('#n-print').onclick = () => KC.print.notes(user, [...notes].reverse());
      el.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => {
        editing = S.byId('notes', b.dataset.edit);
        draft = U.clone(editing);
        draw();
        el.querySelector('#n-content').focus();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }));
      el.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => {
        if (!confirm('この記録を削除しますか？')) return;
        S.remove('notes', b.dataset.del);
        draw();
      }));
    }

    function captureDraft() {
      const q = (s) => el.querySelector(s);
      draft = {
        ...draft,
        date: UI.dateVal(q('#n-date')) || draft.date,
        time: q('#n-time').value,
        method: q('#n-method').value,
        category: q('#n-cat').value,
        staffId: q('#n-staff').value,
        content: q('#n-content').value,
      };
    }

    function save() {
      captureDraft();
      const date = UI.dateVal(el.querySelector('#n-date'));
      if (!date) return UI.toast('日付を正しく入力してください', 'error');
      if (!draft.content.trim()) return UI.toast('内容を入力してください', 'error');
      if (date > U.today() && !confirm('未来の日付になっています。このまま記録しますか？')) return;
      draft.date = date;
      const alsoMon = el.querySelector('#n-mon').checked;
      S.upsert('notes', draft);
      if (alsoMon) {
        S.upsert('monitorings', {
          userId: user.id,
          date,
          method: draft.method === 'オンライン' ? 'テレビ電話' : '居宅訪問',
          place: draft.method === '訪問' ? '自宅' : '',
          memo: draft.content,
          noteId: draft.id,
          staffId: draft.staffId,
          goals: [],
        });
      }
      UI.setDirty(false);
      UI.toast(alsoMon ? '記録し、モニタリング実施として登録しました' : '記録しました');
      editing = null;
      const keep = { method: draft.method, category: draft.category, staffId: draft.staffId };
      draft = { ...blank(), ...keep };
      draw();
    }

    draw();
  };

  // ================= モニタリング =================
  V.tabs.monitoring = (el, user, monId) => {
    const today = U.today();
    const plan = S.currentPlan(user.id);
    const shorts = plan ? plan.needs.flatMap((n, i) => (n.shorts || []).map((s, j) => ({ key: `${i}-${j}`, need: n.need, goal: s.goal, end: s.end }))) : [];
    const existing = monId ? S.byId('monitorings', monId) : null;
    const draft = existing
      ? U.clone(existing)
      : { userId: user.id, date: today, method: '居宅訪問', place: '自宅', attendees: '本人', goals: [], satisfaction: '', change: '', planChange: 'なし', next: '', memo: '', staffId: S.state.settings.currentStaff || user.cmId || '' };
    draft.goals = draft.goals || [];
    shorts.forEach((s) => {
      if (!draft.goals.find((x) => x.key === s.key)) draft.goals.push({ key: s.key, goal: s.goal, eval: '', comment: '' });
    });

    const months = Array.from({ length: 12 }, (_, i) => U.ymAdd(U.ym(today), -11 + i));
    const all = S.state.monitorings.filter((m) => m.userId === user.id).sort((a, b) => b.date.localeCompare(a.date));

    el.innerHTML = `
      <div class="mon-strip">${months
        .map((ym) => {
          const ms = S.monitoringFor(user.id, ym);
          const visit = ms.some((m) => m.method === '居宅訪問');
          const cls = ms.length ? (visit ? 'ok' : 'tv') : ym === U.ym(today) ? 'pending' : 'ng';
          return `<div class="mon-cell ${cls}" title="${esc(U.warekiYM(ym))}"><small>${Number(ym.slice(5))}月</small><b>${ms.length ? (visit ? '訪問' : 'TV') : ym === U.ym(today) ? '未' : '✕'}</b></div>`;
        })
        .join('')}</div>
      <div class="cols">
        <div class="card">
          <h2>${existing ? 'モニタリング記録の編集' : 'モニタリングを記録'}</h2>
          <div class="form-grid">
            <label class="fld"><span>実施日</span>${UI.dateInput({ 'data-path': 'date' }, draft.date)}</label>
            <label class="fld"><span>方法</span>${UI.select({ 'data-path': 'method' }, ['居宅訪問', 'テレビ電話'], draft.method)}</label>
            <label class="fld"><span>場所</span><input data-path="place" value="${esc(draft.place || '')}"></label>
            <label class="fld"><span>面接した人</span><input data-path="attendees" value="${esc(draft.attendees || '')}"></label>
            <label class="fld"><span>担当者</span>${UI.select({ 'data-path': 'staffId' }, UI.staffOptions(), draft.staffId)}</label>
          </div>
          <div id="tv-cond" ${draft.method === 'テレビ電話' ? '' : 'hidden'} class="alert info">
            テレビ電話装置等によるモニタリングは、利用者の同意とサービス担当者会議等での主治医・事業者の合意が必要で、少なくとも2月に1回は居宅を訪問する必要があります。
            <label class="chk"><input type="checkbox" data-path="tvConsent" ${draft.tvConsent ? 'checked' : ''}> 同意・合意を得ている</label>
          </div>
          <h3>目標の達成状況 ${plan ? `<small>（${esc(U.wareki(plan.createdDate, 'short'))}作成プラン）</small>` : '<small class="danger-text">現行プランなし</small>'}</h3>
          ${draft.goals
            .map(
              (gl, i) => `<div class="goal-eval"><div class="sub">${esc(gl.goal || '（短期目標）')}</div>
              ${UI.select({ 'data-path': `goals.${i}.eval` }, ['', '達成', '一部達成', '未達成', '評価時期前'], gl.eval)}
              <input data-path="goals.${i}.comment" value="${esc(gl.comment || '')}" placeholder="状況・理由"></div>`
            )
            .join('') || UI.empty('評価する短期目標がありません')}
          <label class="fld"><span>サービスの実施状況・満足度</span><textarea data-path="satisfaction" rows="2">${esc(draft.satisfaction || '')}</textarea></label>
          <label class="fld"><span>心身・生活状況の変化</span><textarea data-path="change" rows="2">${esc(draft.change || '')}</textarea></label>
          <div class="form-grid">
            <label class="fld"><span>計画変更の必要性</span>${UI.select({ 'data-path': 'planChange' }, ['なし', 'あり'], draft.planChange)}</label>
          </div>
          <label class="fld"><span>今後の対応</span><textarea data-path="next" rows="2">${esc(draft.next || '')}</textarea></label>
          <label class="fld"><span>メモ</span><textarea data-path="memo" rows="2">${esc(draft.memo || '')}</textarea></label>
          <div class="form-actions">
            <button class="btn primary" data-primary-save id="m-save">保存</button>
            ${existing ? `<a class="btn ghost" href="#/user/${user.id}/monitoring">新規入力に戻る</a><button class="btn ghost danger-text" id="m-del">削除</button>` : ''}
          </div>
        </div>
        <div class="card">
          <h2>実施履歴</h2>
          ${
            all.length
              ? `<ul class="simple-list">${all
                  .map(
                    (m) => `<li><a href="#/user/${user.id}/monitoring/${m.id}"><b>${esc(U.wareki(m.date, 'short'))}</b> ${esc(m.method)}
                    ${m.planChange === 'あり' ? '<span class="badge warn">計画変更要</span>' : ''}<div class="sub">${esc((m.change || m.memo || '').slice(0, 60))}</div></a></li>`
                  )
                  .join('')}</ul>`
              : UI.empty('記録はありません')
          }
        </div>
      </div>`;
    UI.bindPath(el, draft, (path) => {
      if (path === 'method') el.querySelector('#tv-cond').hidden = draft.method !== 'テレビ電話';
    });
    el.querySelector('#m-save').onclick = () => {
      document.activeElement?.blur?.();
      if (!draft.date) return UI.toast('実施日を入力してください', 'error');
      if (draft.method === 'テレビ電話') {
        if (!draft.tvConsent) return UI.toast('テレビ電話の場合は同意・合意の確認が必要です', 'error');
        const prevYm = U.ymAdd(U.ym(draft.date), -1);
        const prevVisit = S.monitoringFor(user.id, prevYm).some((m) => m.method === '居宅訪問');
        if (!prevVisit && !confirm('前月に居宅訪問のモニタリングがありません。2月に1回は居宅訪問が必要です。このまま保存しますか？')) return;
      }
      S.upsert('monitorings', draft);
      UI.setDirty(false);
      UI.toast('保存しました');
      if (draft.planChange === 'あり') UI.toast('計画変更が必要です。ケアプランの見直しを行ってください', 'warn');
      KC.app.go(`#/user/${user.id}/monitoring`);
    };
    el.querySelector('#m-del')?.addEventListener('click', () => {
      if (!confirm('削除しますか？')) return;
      S.remove('monitorings', draft.id);
      UI.setDirty(false);
      KC.app.go(`#/user/${user.id}/monitoring`);
    });
  };

  // ================= サービス担当者会議（第4表） =================
  V.tabs.meeting = (el, user, meetId) => {
    const list = S.userMeetings(user.id);
    const existing = meetId && meetId !== 'new' ? S.byId('meetings', meetId) : null;
    const plans = S.userPlans(user.id);
    if (!meetId) {
      el.innerHTML = `<div class="toolbar"><a class="btn primary" href="#/user/${user.id}/meeting/new">＋ 会議を記録</a></div>
        ${
          list.length
            ? `<table class="grid clickable"><thead><tr><th>開催日</th><th>場所</th><th>出席者数</th><th>対象プラン</th><th>検討した項目</th></tr></thead><tbody>
          ${list
            .map(
              (m) => `<tr data-href="#/user/${user.id}/meeting/${m.id}"><td>${esc(U.wareki(m.date, 'short'))}</td><td>${esc(m.place || '')}</td><td>${(m.attendees || []).filter((a) => a.name).length}</td>
              <td>${esc(S.byId('plans', m.planId) ? U.wareki(S.byId('plans', m.planId).createdDate, 'short') + '作成' : '—')}</td><td>${esc((m.topic || '').slice(0, 40))}</td></tr>`
            )
            .join('')}</tbody></table>`
            : UI.empty('会議の記録はありません')
        }`;
      el.querySelectorAll('tr[data-href]').forEach((tr) => (tr.onclick = () => KC.app.go(tr.dataset.href)));
      return;
    }
    const draft = existing
      ? U.clone(existing)
      : {
          userId: user.id,
          date: U.today(),
          time: '',
          place: '利用者宅',
          planId: plans[0]?.id || '',
          attendees: [
            { org: '本人', name: user.name },
            { org: '家族', name: '' },
            ...S.state.providers.slice(0, 3).map((p) => ({ org: p.name, name: '' })),
          ],
          absent: '',
          topic: '',
          discussion: '',
          conclusion: '',
          remaining: '',
          staffId: S.state.settings.currentStaff || user.cmId || '',
        };
    const draw = () => {
      el.innerHTML = `<div class="card">
        <div class="form-actions sticky">
          <a class="btn ghost" href="#/user/${user.id}/meeting">← 一覧</a>
          <button class="btn primary" data-primary-save id="mt-save">保存</button>
          <button class="btn" id="mt-print">印刷（第4表）</button>
          ${existing ? '<button class="btn ghost danger-text" id="mt-del">削除</button>' : ''}
        </div>
        <h2>サービス担当者会議の要点</h2>
        <div class="form-grid">
          <label class="fld"><span>開催日</span>${UI.dateInput({ 'data-path': 'date' }, draft.date)}</label>
          <label class="fld"><span>開催時間</span><input data-path="time" value="${esc(draft.time || '')}" placeholder="14:00〜14:40"></label>
          <label class="fld"><span>開催場所</span><input data-path="place" value="${esc(draft.place || '')}"></label>
          <label class="fld"><span>対象のケアプラン</span>${UI.select({ 'data-path': 'planId' }, [['', '—'], ...plans.map((p) => [p.id, `${U.wareki(p.createdDate, 'short')}作成（${p.status === 'final' ? '確定' : '作成中'}）`])], draft.planId)}</label>
          <label class="fld"><span>開催方法</span>${UI.select({ 'data-path': 'online' }, [['', '対面'], ['online', 'オンライン（同意あり）'], ['mixed', '対面＋オンライン']], draft.online)}</label>
        </div>
        <h3>会議出席者 <button class="btn small ghost" id="add-att">＋ 追加</button></h3>
        <table class="grid"><thead><tr><th>所属（職種）</th><th>氏名</th><th></th></tr></thead><tbody>
          ${draft.attendees
            .map((a, i) => `<tr><td><input data-path="attendees.${i}.org" value="${esc(a.org || '')}" list="dl-prov"></td><td><input data-path="attendees.${i}.name" value="${esc(a.name || '')}"></td><td><button class="link danger-text" data-del-att="${i}">×</button></td></tr>`)
            .join('')}
        </tbody></table>
        <datalist id="dl-prov">${['本人', '家族', '主治医', ...S.state.providers.map((p) => p.name)].map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
        <label class="fld"><span>欠席者・照会（依頼）内容</span><textarea data-path="absent" rows="2" placeholder="主治医（〇〇医院）：日程調整がつかず欠席。事前に照会し「…」との意見を得た。">${esc(draft.absent || '')}</textarea></label>
        <label class="fld"><span>検討した項目</span><textarea data-path="topic" rows="3">${esc(draft.topic || '')}</textarea></label>
        <label class="fld"><span>検討内容</span><textarea data-path="discussion" rows="4">${esc(draft.discussion || '')}</textarea></label>
        <label class="fld"><span>結論</span><textarea data-path="conclusion" rows="3">${esc(draft.conclusion || '')}</textarea></label>
        <label class="fld"><span>残された課題（次回の開催時期）</span><textarea data-path="remaining" rows="2">${esc(draft.remaining || '')}</textarea></label>
      </div>`;
      el.querySelector('#add-att').onclick = () => {
        draft.attendees.push({ org: '', name: '' });
        UI.setDirty(true);
        draw();
      };
      el.querySelectorAll('[data-del-att]').forEach((b) => (b.onclick = () => {
        draft.attendees.splice(Number(b.dataset.delAtt), 1);
        UI.setDirty(true);
        draw();
      }));
      el.querySelector('#mt-save').onclick = () => {
        document.activeElement?.blur?.();
        if (!draft.date) return UI.toast('開催日を入力してください', 'error');
        S.upsert('meetings', draft);
        UI.setDirty(false);
        UI.toast('保存しました');
        if (!existing) {
          S.upsert('notes', {
            userId: user.id,
            date: draft.date,
            time: (draft.time || '').slice(0, 5),
            method: draft.online === 'online' ? 'オンライン' : '訪問',
            category: '担当者会議',
            content: `サービス担当者会議を開催（${draft.place}）。\n結論：${draft.conclusion || ''}`,
            staffId: draft.staffId,
          });
        }
        KC.app.go(`#/user/${user.id}/meeting/${draft.id}`);
      };
      el.querySelector('#mt-print').onclick = () => KC.print.meeting(user, draft);
      el.querySelector('#mt-del')?.addEventListener('click', () => {
        if (!confirm('削除しますか？')) return;
        S.remove('meetings', draft.id);
        UI.setDirty(false);
        KC.app.go(`#/user/${user.id}/meeting`);
      });
    };
    draw();
    UI.bindPath(el, draft);
  };
})(globalThis);
