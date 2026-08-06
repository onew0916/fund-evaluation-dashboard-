/**
 * 집합투자재산평가위원회 개최이력 뷰
 * committee_history 시트: no, session_no, meeting_date, agenda, target_funds, target_assets,
 *   resolution, attendees, remark, reflected(Y=장부가반영/N=장부가미반영/공란=확인필요, 장부가 반영여부),
 *   eval_conducted(Y/N, 평가시행 여부), eval_amount(평가시행여부=Y일 때만 의미있음),
 *   impair_yn(Y/N, 부실분류 여부), impair_level(부실우려/발생/개선/악화 - impair_yn=Y일 때만 의미있음)
 *
 * 부실분류는 반드시 평가위원회 의결을 통해서만 이루어진다는 원칙에 따라, 부실분류 여부/단계는
 * 이 시트에서만 입력한다. 다만 실제 펀드/자산의 부실분류(impair) 필드 반영은 (다른 필드들과 동일하게)
 * 항상 자산 대시보드의 관리자 입력을 통해서만 이루어진다 - 위원회 이력에서 자동으로 값을 밀어넣지 않는다.
 *
 * 평가시행여부=Y인 건은 이 위원회 개최일이 대상 자산(들)의 평가기준일이 되며, admin.js에서
 * 위원회 이력 저장 시 대상 펀드×자산 조합 전체에 동일한 평가금액으로 eval_history에도 함께 반영한다.
 */
window.CommitteeView = (() => {
  let state = null;
  let searchText = '';

  function init(appState) {
    state = appState;
    const searchInput = document.getElementById('committeeSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        searchText = searchInput.value.trim();
        render();
      });
    }
  }

  function fundLabel(code) {
    const fund = state.data.fundMaster.find(f => f.fund_code === code);
    return fund ? `${Utils.escapeHtml(code)} · ${Utils.escapeHtml(fund.fund_name)}` : Utils.escapeHtml(code);
  }

  function assetNamesForFund(fundCode) {
    return (state.data.assetDetail || [])
      .filter(a => a.fund_code === fundCode)
      .map(a => a.asset_name);
  }

  function toInputDate(str) {
    const d = Utils.parseDate(str);
    if (!d) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function codeChips(codesStr) {
    const codes = (codesStr || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!codes.length) return '<span style="color:var(--text-500);font-size:12px;">-</span>';
    return codes.map(c => `<span class="chip" style="cursor:default;">${fundLabel(c)}</span>`).join(' ');
  }

  function reflectedBadge(r) {
    return Utils.bookReflectedBadge(r.reflected);
  }

  function evalConductedBadge(r) {
    if ((r.eval_conducted || '').trim().toUpperCase() !== 'Y') return '';
    return `<span class="badge" style="color:#2563eb;background:#eaf1fd;border:1px solid #2563eb33;">평가시행</span>`;
  }

  function impairBadge(r) {
    const yn = (r.impair_yn || '').trim().toUpperCase();
    if (yn !== 'Y') return '';
    const level = r.impair_level || '(단계 미입력)';
    return `<span class="badge" style="color:#dc2626;background:#fee2e2;border:1px solid #dc262633;">부실분류: ${Utils.escapeHtml(level)}</span>`;
  }

  // 특정 펀드/자산과 관련된 위원회 이력을 찾는다 (Panel.js의 "위원회 개최내역 보기"에서 사용)
  // 매칭 기준: target_funds에 fund_code가 포함되고, target_assets에 asset_name이 포함되거나
  //           (target_assets가 비어있으면) agenda 텍스트에 asset_name이 포함되는 경우
  function findForAsset(fundCode, assetName) {
    const list = state.data.committeeHistory || [];
    const name = (assetName || '').trim();
    if (!name) return [];
    return list
      .map((r, idx) => ({ r, idx }))
      .filter(({ r }) => {
        const funds = (r.target_funds || '').split(',').map(s => s.trim()).filter(Boolean);
        if (funds.length && !funds.includes(fundCode)) return false;
        const assets = (r.target_assets || '').split(',').map(s => s.trim()).filter(Boolean);
        if (assets.length) return assets.some(a => a === name || a.includes(name) || name.includes(a));
        return (r.agenda || '').includes(name);
      })
      .sort((a, b) => {
        const da = Utils.parseDate(a.r.meeting_date), db = Utils.parseDate(b.r.meeting_date);
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return db - da;
      });
  }

  // Panel.js에서 매칭된 이력을 카드 형태로 렌더링할 때 재사용
  function renderEntrySummary(r) {
    return `
      <div style="border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;align-items:center;">
          <b style="font-size:12px;">${Utils.escapeHtml(r.session_no || '(회차 미상)')} · ${Utils.formatDate(r.meeting_date)}</b>
          <span style="display:flex;gap:4px;flex-wrap:wrap;">${reflectedBadge(r)}${impairBadge(r)}</span>
        </div>
        <div style="font-size:12px;font-weight:500;margin-top:4px;">${Utils.escapeHtml(r.agenda || '-')}</div>
        <div style="font-size:12px;color:var(--text-500);margin-top:4px;">${Utils.escapeHtml(r.resolution || '-')}</div>
      </div>
    `;
  }

  function render() {
    const container = document.getElementById('committeeContainer');
    const rows = [...state.data.committeeHistory]
      .map((r, idx) => ({ r, idx }))
      .filter(({ r }) => {
        if (!searchText) return true;
        const q = searchText.toLowerCase();
        const codes = (r.target_funds || '').split(',').map(s => s.trim()).filter(Boolean);
        return codes.some(c => {
          if (c.toLowerCase().includes(q)) return true;
          const fund = state.data.fundMaster.find(f => f.fund_code === c);
          return fund && fund.fund_name.toLowerCase().includes(q);
        });
      })
      .sort((a, b) => {
        const da = Utils.parseDate(a.r.meeting_date), db = Utils.parseDate(b.r.meeting_date);
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return db - da;
      });

    if (!rows.length) {
      container.innerHTML = `<div class="empty-state">${searchText ? '검색 결과가 없습니다.' : '등록된 위원회 개최이력이 없습니다. 관리자 모드에서 추가할 수 있습니다.'}</div>`;
      return;
    }

    container.innerHTML = rows.map(({ r, idx }) => `
      <div class="history-fund-group" data-ch-idx="${idx}">
        <div class="committee-entry-view">
          <div class="hf-head">
            <span class="code">${Utils.formatDate(r.meeting_date)}</span>
            <h3>${Utils.escapeHtml(r.session_no || '(회차 미상)')}</h3>
            <span style="display:flex;gap:6px;flex-wrap:wrap;margin-left:auto;align-items:center;">
              ${evalConductedBadge(r)}${reflectedBadge(r)}${impairBadge(r)}
              ${state.isAdmin ? `<button class="btn btn-secondary committee-edit-btn" data-ch-idx="${idx}" style="padding:2px 9px;font-size:11px;">수정</button>` : ''}
            </span>
          </div>
          <div class="detail-grid" style="margin-bottom:10px;">
            <div class="detail-item full">
              <div class="k">안건</div>
              <div class="v" style="font-weight:500;">${Utils.escapeHtml(r.agenda || '-')}</div>
            </div>
            <div class="detail-item full">
              <div class="k">대상 펀드</div>
              <div class="v" style="font-weight:500;display:flex;gap:6px;flex-wrap:wrap;">${codeChips(r.target_funds)}</div>
            </div>
            ${r.target_assets ? `
            <div class="detail-item full">
              <div class="k">대상 자산</div>
              <div class="v" style="font-weight:500;">${Utils.escapeHtml(r.target_assets)}</div>
            </div>` : ''}
            <div class="detail-item full">
              <div class="k">의결내용</div>
              <div class="v" style="font-weight:500;">${Utils.escapeHtml(r.resolution || '-')}</div>
            </div>
            ${(r.eval_conducted || '').trim().toUpperCase() === 'Y' ? `
            <div class="detail-item">
              <div class="k">평가금액 (평가기준일 = 개최일)</div>
              <div class="v" style="font-weight:500;">${Utils.formatKRW(r.eval_amount)}</div>
            </div>` : ''}
            <div class="detail-item">
              <div class="k">참석위원</div>
              <div class="v" style="font-weight:500;">${Utils.escapeHtml(r.attendees || '-')}</div>
            </div>
            ${r.remark ? `
            <div class="detail-item full">
              <div class="k">비고</div>
              <div class="v" style="font-weight:400;color:var(--text-500);">${Utils.escapeHtml(r.remark)}</div>
            </div>` : ''}
          </div>
        </div>
        ${state.isAdmin ? renderEditForm(r, idx) : ''}
      </div>
    `).join('');

    if (state.isAdmin) bindEditButtons();
  }

  function renderEditForm(r, idx) {
    const impairOptions = (CONFIG.IMPAIR_LEVELS || []).filter(l => l !== '정상')
      .map(l => `<option value="${l}" ${l === r.impair_level ? 'selected' : ''}>${l}</option>`).join('');
    const reflectedVal = (r.reflected || '').trim().toUpperCase();
    const impairYnVal = (r.impair_yn || '').trim().toUpperCase();
    const evalConductedVal = (r.eval_conducted || '').trim().toUpperCase();
    return `
      <form class="committee-edit-form" data-ch-idx="${idx}" style="display:none;margin-top:8px;border:1px dashed #93c5fd;background:#f5f9ff;border-radius:8px;padding:12px;">
        <div class="detail-grid">
          <div class="form-row"><label>회차</label><input name="session_no" value="${Utils.escapeHtml(r.session_no || '')}"></div>
          <div class="form-row"><label>개최일</label><input type="date" name="meeting_date" value="${toInputDate(r.meeting_date)}" required></div>
          <div class="form-row full"><label>안건</label><textarea name="agenda">${Utils.escapeHtml(r.agenda || '')}</textarea></div>
          <div class="form-row full">
            <label>대상 펀드 (펀드코드, 콤마로 여러 개 구분)</label>
            <input name="target_funds" class="committee-edit-funds-input" data-ch-idx="${idx}" value="${Utils.escapeHtml(r.target_funds || '')}">
          </div>
          <div class="form-row full">
            <label>대상 자산 (선택, 콤마로 여러 개 구분)</label>
            <input name="target_assets" class="committee-edit-assets-input" list="committeeEditAssetDatalist-${idx}" value="${Utils.escapeHtml(r.target_assets || '')}">
            <datalist id="committeeEditAssetDatalist-${idx}">${assetNamesForFund((r.target_funds || '').split(',')[0].trim())
              .map(n => `<option value="${Utils.escapeHtml(n)}"></option>`).join('')}</datalist>
          </div>
          <div class="form-row full"><label>의결내용</label><textarea name="resolution">${Utils.escapeHtml(r.resolution || '')}</textarea></div>
          <div class="form-row"><label>평가시행 여부</label>
            <select name="eval_conducted" class="committee-edit-eval-yn" data-ch-idx="${idx}">
              <option value="N" ${evalConductedVal !== 'Y' ? 'selected' : ''}>N (평가미시행)</option>
              <option value="Y" ${evalConductedVal === 'Y' ? 'selected' : ''}>Y (평가시행)</option>
            </select>
          </div>
          <div class="form-row committee-edit-eval-amount-row" data-ch-idx="${idx}" style="${evalConductedVal === 'Y' ? '' : 'display:none;'}">
            <label>평가금액</label>
            <input type="number" name="eval_amount" value="${r.eval_amount || ''}">
          </div>
          <div class="form-row"><label>부실분류 여부</label>
            <select name="impair_yn" class="committee-edit-impair-yn" data-ch-idx="${idx}">
              <option value="N" ${impairYnVal !== 'Y' ? 'selected' : ''}>N (해당없음)</option>
              <option value="Y" ${impairYnVal === 'Y' ? 'selected' : ''}>Y (부실분류 의결)</option>
            </select>
          </div>
          <div class="form-row committee-edit-impair-level-row" data-ch-idx="${idx}" style="${impairYnVal === 'Y' ? '' : 'display:none;'}">
            <label>부실단계</label>
            <select name="impair_level">${impairOptions}</select>
          </div>
          <div class="form-row"><label>장부가 반영여부</label>
            <select name="reflected">
              <option value="" ${!reflectedVal ? 'selected' : ''}>공란 (확인필요)</option>
              <option value="Y" ${reflectedVal === 'Y' ? 'selected' : ''}>Y (반영)</option>
              <option value="N" ${reflectedVal === 'N' ? 'selected' : ''}>N (미반영)</option>
            </select>
          </div>
          <div class="form-row full"><label>참석위원</label><input name="attendees" value="${Utils.escapeHtml(r.attendees || '')}"></div>
          <div class="form-row full"><label>비고</label><textarea name="remark">${Utils.escapeHtml(r.remark || '')}</textarea></div>
        </div>
        <div class="btn-row">
          <button type="submit" class="btn btn-primary">저장</button>
          <button type="button" class="btn btn-secondary committee-cancel-btn">취소</button>
        </div>
      </form>
    `;
  }

  function bindEditButtons() {
    document.querySelectorAll('.committee-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const wrap = document.querySelector(`.history-fund-group[data-ch-idx="${btn.dataset.chIdx}"]`);
        wrap.querySelector('.committee-entry-view').style.display = 'none';
        wrap.querySelector('.committee-edit-form').style.display = 'block';
      });
    });

    document.querySelectorAll('.committee-cancel-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const wrap = btn.closest('.history-fund-group');
        wrap.querySelector('.committee-edit-form').style.display = 'none';
        wrap.querySelector('.committee-entry-view').style.display = 'block';
      });
    });

    document.querySelectorAll('.committee-edit-eval-yn').forEach(sel => {
      sel.addEventListener('change', () => {
        const row = document.querySelector(`.committee-edit-eval-amount-row[data-ch-idx="${sel.dataset.chIdx}"]`);
        if (row) row.style.display = sel.value === 'Y' ? '' : 'none';
      });
    });

    document.querySelectorAll('.committee-edit-impair-yn').forEach(sel => {
      sel.addEventListener('change', () => {
        const row = document.querySelector(`.committee-edit-impair-level-row[data-ch-idx="${sel.dataset.chIdx}"]`);
        if (row) row.style.display = sel.value === 'Y' ? '' : 'none';
      });
    });

    document.querySelectorAll('.committee-edit-funds-input').forEach(input => {
      input.addEventListener('input', () => {
        const datalist = document.getElementById(`committeeEditAssetDatalist-${input.dataset.chIdx}`);
        if (!datalist) return;
        const codes = input.value.split(',').map(s => s.trim()).filter(Boolean);
        const names = new Set();
        codes.forEach(c => assetNamesForFund(c).forEach(n => names.add(n)));
        datalist.innerHTML = [...names].map(n => `<option value="${Utils.escapeHtml(n)}"></option>`).join('');
      });
    });

    document.querySelectorAll('.committee-edit-form').forEach(form => {
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const idx = Number(form.dataset.chIdx);
        const original = state.data.committeeHistory[idx];
        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true; btn.textContent = '저장 중…';

        const fd = new FormData(form);
        const fields = Object.fromEntries(fd.entries());
        if (fields.impair_yn !== 'Y') fields.impair_level = '';
        if (fields.eval_conducted !== 'Y') fields.eval_amount = '';

        try {
          await Api.updateCommitteeHistory(
            { session_no: original.session_no, meeting_date: original.meeting_date, agenda: original.agenda },
            fields
          );
          if (fields.eval_conducted === 'Y' && fields.eval_amount) {
            await Admin.syncEvalHistoryFromCommittee(fields);
          }
          if (fields.impair_yn === 'Y' && fields.impair_level) {
            await Admin.syncImpairFromCommittee(fields);
          }
          App.showToast('위원회 이력이 수정되었습니다.', 'success');
          await App.reloadData();
        } catch (err) {
          App.showToast(err.message, 'error');
          btn.disabled = false; btn.textContent = '저장';
        }
      });
    });
  }

  return { init, render, findForAsset, renderEntrySummary };
})();
