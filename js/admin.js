/**
 * 관리자 모드: 비밀번호 잠금, CSV 업로드, 평가방법 관리, 외부평가 이력 입력
 */
window.Admin = (() => {
  let state = null;
  let pendingUpload = null; // { sheetName, rows }
  let monthlyResult = null; // MonthlyMerge.run()의 결과 (미리보기 -> 반영 사이 보관)

  // 특정 펀드가 보유 중인 자산명 목록 (asset_detail 기준)
  function assetNamesForFund(fundCode) {
    return (state.data.assetDetail || [])
      .filter(a => a.fund_code === fundCode)
      .map(a => a.asset_name);
  }

  function init(appState) {
    state = appState;

    document.getElementById('adminToggleBtn').addEventListener('click', () => {
      if (state.isAdmin) {
        logout();
      } else {
        openLoginModal();
      }
    });

    document.getElementById('adminSubmitBtn').addEventListener('click', tryLogin);
    document.getElementById('adminCancelBtn').addEventListener('click', closeLoginModal);
    document.getElementById('adminPasswordInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') tryLogin();
    });
  }

  function openLoginModal() {
    document.getElementById('adminModal').style.display = 'flex';
    document.getElementById('adminPasswordInput').value = '';
    document.getElementById('adminErrorMsg').textContent = '';
    document.getElementById('adminPasswordInput').focus();
  }
  function closeLoginModal() {
    document.getElementById('adminModal').style.display = 'none';
  }

  function tryLogin() {
    const val = document.getElementById('adminPasswordInput').value;
    if (val === CONFIG.ADMIN_PASSWORD) {
      state.isAdmin = true;
      closeLoginModal();
      applyAdminUI();
      App.showToast('관리자 모드가 활성화되었습니다.', 'success');
    } else {
      document.getElementById('adminErrorMsg').textContent = '비밀번호가 올바르지 않습니다.';
    }
  }

  function logout() {
    state.isAdmin = false;
    applyAdminUI();
    App.showToast('관리자 모드를 종료했습니다.');
    if (document.getElementById('view-admin').style.display !== 'none') {
      App.switchView('dashboard');
    }
  }

  function applyAdminUI() {
    document.getElementById('adminToggleState').textContent = state.isAdmin ? 'ON' : 'OFF';
    document.getElementById('adminToggleBtn').classList.toggle('on', state.isAdmin);
    document.getElementById('navAdminBtn').style.display = state.isAdmin ? 'flex' : 'none';
    Panel.refreshIfOpen();
    if (state.isAdmin) renderAdminView();
  }

  // ---------------- 관리자 도구 뷰 ----------------
  function renderAdminView() {
    const container = document.getElementById('adminContainer');
    container.innerHTML = `
      ${renderMonthlyUpdateSection()}
      ${renderUploadSection()}
      ${renderMethodSection()}
      ${renderEvalHistoryForm()}
      ${renderCommitteeForm()}
    `;
    bindMonthlyUpdateSection();
    bindUploadSection();
    bindMethodSection();
    bindEvalHistoryForm();
    bindCommitteeForm();
  }

  // ---- 월간 데이터 반영 (펀드현황/자산현황 xlsx 업로드 -> 비교 미리보기 -> 반영) ----
  function renderMonthlyUpdateSection() {
    return `
      <div class="table-card" style="padding:18px;margin-bottom:18px;">
        <div class="section-title">월간 데이터 반영</div>
        <div class="sub" style="margin-bottom:10px;">이번 달 펀드현황(펀드정보3)·자산현황(명세부) xlsx를 올리면 현재 시트와 비교해 변경/신규/제외 내역을 미리 보여줍니다. 클래스펀드는 자동으로 제외됩니다.</div>
        <div class="detail-grid">
          <div class="form-row"><label>펀드현황 (펀드정보3.xlsx)</label><input type="file" id="monthlyFundFile" accept=".xlsx"></div>
          <div class="form-row"><label>자산현황 (명세부.xlsx)</label><input type="file" id="monthlyAssetFile" accept=".xlsx"></div>
        </div>
        <div class="btn-row">
          <button class="btn btn-primary" id="monthlyPreviewBtn">미리보기</button>
        </div>
        <div id="monthlyReviewArea"></div>
      </div>
    `;
  }

  function readWorkbook(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try { resolve(XLSX.read(reader.result, { type: 'array' })); }
        catch (e) { reject(e); }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  function renderMonthlyReview(result) {
    const fm = result.fundMaster, ad = result.assetDetail, ev = result.evalStatus;

    const section = (title, rows, cols) => `
      <details style="margin-top:8px;">
        <summary style="cursor:pointer;font-weight:600;font-size:12.5px;">${Utils.escapeHtml(title)} (${rows.length}건)</summary>
        ${rows.length ? `
        <div style="max-height:220px;overflow:auto;margin-top:6px;border:1px solid var(--border);border-radius:6px;">
          <table class="fund-table" style="min-width:0;">
            <thead><tr>${cols.map(c => `<th>${Utils.escapeHtml(c)}</th>`).join('')}</tr></thead>
            <tbody>
              ${rows.map(r => `<tr>${r.map(v => `<td>${Utils.escapeHtml(v === undefined || v === null ? '' : String(v))}</td>`).join('')}</tr>`).join('')}
            </tbody>
          </table>
        </div>` : ''}
      </details>
    `;

    return `
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);">
        <div style="font-weight:600;margin-bottom:6px;">미리보기 결과</div>
        <div class="detail-grid">
          <div class="detail-item"><div class="k">fund_master 변경</div><div class="v">${fm.changes.length}건</div></div>
          <div class="detail-item"><div class="k">신규설정</div><div class="v">${fm.addedFunds.length}개</div></div>
          <div class="detail-item"><div class="k">상환처리 추정(제외)</div><div class="v">${fm.removedFunds.length}개</div></div>
          <div class="detail-item"><div class="k">클래스펀드 제외</div><div class="v">${fm.skippedClassFunds}개</div></div>
          <div class="detail-item"><div class="k">asset_detail 변경</div><div class="v">${ad.changes.length}건</div></div>
          <div class="detail-item"><div class="k">신규 취득</div><div class="v">${ad.added.length}건</div></div>
          <div class="detail-item"><div class="k">매각추정(미확인)</div><div class="v">${ad.missing.length}건</div></div>
          <div class="detail-item"><div class="k">listed 확인필요</div><div class="v">${ev.listedReview.length}건</div></div>
        </div>
        ${section('펀드정보 변경사항', fm.changes, ['펀드코드', '필드', '기존값', '신규값'])}
        ${section('신규설정 펀드', fm.addedFunds.map(c => [c]), ['펀드코드'])}
        ${section('상환처리 추정 펀드', fm.removedFunds, ['펀드코드', '펀드명'])}
        ${section('자산정보 변경사항', ad.changes, ['펀드코드', '자산명', '필드', '기존값', '신규값'])}
        ${section('신규 취득 자산', ad.added, ['펀드코드', '자산명'])}
        ${section('매각추정(미확인) 자산', ad.missing, ['펀드코드', '자산명'])}
        ${section('listed 확인필요', ev.listedReview, ['펀드코드', '자산명', '자산유형'])}
        <div class="btn-row" style="margin-top:14px;">
          <button class="btn btn-primary" id="monthlyApplyBtn">위 내용대로 시트에 반영하기</button>
        </div>
        <div style="font-size:11px;color:var(--text-500);margin-top:6px;">
          ⚠ 반영 시 fund_master/asset_detail 시트 전체가 위 내용으로 교체됩니다. 충분히 검토한 뒤 눌러주세요.
        </div>
      </div>
    `;
  }

  function bindMonthlyUpdateSection() {
    const previewBtn = document.getElementById('monthlyPreviewBtn');
    if (!previewBtn) return;

    previewBtn.addEventListener('click', async () => {
      const fundFile = document.getElementById('monthlyFundFile').files[0];
      const assetFile = document.getElementById('monthlyAssetFile').files[0];
      if (!fundFile || !assetFile) {
        App.showToast('펀드현황/자산현황 파일을 모두 선택해주세요.', 'error');
        return;
      }
      previewBtn.disabled = true; previewBtn.textContent = '분석 중…';
      try {
        const [fundWb, assetWb] = await Promise.all([readWorkbook(fundFile), readWorkbook(assetFile)]);
        monthlyResult = MonthlyMerge.run(fundWb, assetWb, state.data.fundMaster, state.data.assetDetail);
        document.getElementById('monthlyReviewArea').innerHTML = renderMonthlyReview(monthlyResult);
        bindMonthlyApplyButton();
        App.showToast('미리보기가 생성되었습니다. 아래 내용을 검토해주세요.', 'success');
      } catch (err) {
        App.showToast('분석 중 오류: ' + err.message, 'error');
      } finally {
        previewBtn.disabled = false; previewBtn.textContent = '미리보기';
      }
    });
  }

  function bindMonthlyApplyButton() {
    const btn = document.getElementById('monthlyApplyBtn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      if (!monthlyResult) return;
      btn.disabled = true; btn.textContent = '반영 중…';
      try {
        const r1 = await Api.bulkUpload('fund_master', monthlyResult.fundMaster.newRows);
        const r2 = await Api.bulkUpload('asset_detail', monthlyResult.assetDetail.newRows);
        App.showToast(`반영 완료 (fund_master ${r1.rowsWritten}행 / asset_detail ${r2.rowsWritten}행)`, 'success');
        monthlyResult = null;
        document.getElementById('monthlyReviewArea').innerHTML = '';
        await App.reloadData();
      } catch (err) {
        App.showToast('반영 중 오류: ' + err.message, 'error');
        btn.disabled = false; btn.textContent = '위 내용대로 시트에 반영하기';
      }
    });
  }

  // ---- CSV 업로드 ----
  function renderUploadSection() {
    return `
      <div class="table-card" style="padding:18px;margin-bottom:18px;">
        <div class="section-title">CSV 일괄 업로드</div>
        <div class="form-row" style="max-width:260px;">
          <label>대상 시트</label>
          <select id="uploadTargetSheet">
            <option value="${CONFIG.SHEETS.fundMaster}">fund_master</option>
            <option value="${CONFIG.SHEETS.assetDetail}">asset_detail</option>
            <option value="${CONFIG.SHEETS.evalHistory}">eval_history</option>
            <option value="${CONFIG.SHEETS.committeeHistory}">committee_history</option>
          </select>
        </div>
        <div class="dropzone" id="dropzone">CSV 파일을 여기에 드래그하거나 클릭하여 선택하세요.<br>
          <span style="font-size:11px;">※ 선택한 시트의 헤더와 동일한 컬럼명을 사용해야 합니다. 업로드 시 기존 데이터는 전체 대체됩니다.</span>
        </div>
        <input type="file" id="uploadFileInput" accept=".csv" style="display:none;">
        <div id="uploadPreview" style="margin-top:10px;font-size:12px;color:var(--text-500);"></div>
        <div class="btn-row">
          <button class="btn btn-primary" id="uploadConfirmBtn" disabled>업로드 실행</button>
        </div>
      </div>
    `;
  }

  function bindUploadSection() {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('uploadFileInput');
    const confirmBtn = document.getElementById('uploadConfirmBtn');

    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.classList.remove('drag');
      if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length) handleFile(fileInput.files[0]);
    });

    function handleFile(file) {
      const reader = new FileReader();
      reader.onload = () => {
        const rows = Utils.parseCSV(reader.result);
        pendingUpload = { sheetName: document.getElementById('uploadTargetSheet').value, rows };
        document.getElementById('uploadPreview').textContent =
          `${file.name} · ${rows.length}개 행 확인됨. "업로드 실행"을 누르면 기존 데이터가 대체됩니다.`;
        confirmBtn.disabled = false;
      };
      reader.readAsText(file, 'UTF-8');
    }

    confirmBtn.addEventListener('click', async () => {
      if (!pendingUpload) return;
      confirmBtn.disabled = true; confirmBtn.textContent = '업로드 중…';
      try {
        const res = await Api.bulkUpload(pendingUpload.sheetName, pendingUpload.rows);
        App.showToast(`${res.sheetName} 시트에 ${res.rowsWritten}개 행이 반영되었습니다.`, 'success');
        pendingUpload = null;
        document.getElementById('uploadPreview').textContent = '';
        await App.reloadData();
      } catch (err) {
        App.showToast(err.message, 'error');
      } finally {
        confirmBtn.disabled = false; confirmBtn.textContent = '업로드 실행';
      }
    });
  }

  // ---- 평가방법 관리 (대체평가 대상 "자산" 단위 - eval_status는 펀드가 아니라 자산 속성) ----
  function renderMethodSection() {
    const assets = (state.data.assetDetail || [])
      .filter(a => a.eval_status === '대체평가')
      .slice()
      .sort((a, b) => String(a.fund_code).localeCompare(String(b.fund_code)));
    const rowsHtml = assets.map(a => {
      const fund = (state.data.fundMaster || []).find(f => f.fund_code === a.fund_code);
      return `
        <tr data-fund-code="${Utils.escapeHtml(a.fund_code)}">
          <td class="mono">${Utils.escapeHtml(a.fund_code)}</td>
          <td class="fund-name">${Utils.escapeHtml(fund ? fund.fund_name : '')}</td>
          <td>${Utils.escapeHtml(a.asset_name)}</td>
          <td><input class="method-reason-input" data-code="${Utils.escapeHtml(a.fund_code)}" data-asset="${Utils.escapeHtml(a.asset_name)}" value="${Utils.escapeHtml(a.alt_reason || '')}" style="width:100%;border:1px solid var(--border);border-radius:4px;padding:5px 7px;"></td>
          <td><input class="method-input" data-code="${Utils.escapeHtml(a.fund_code)}" data-asset="${Utils.escapeHtml(a.asset_name)}" value="${Utils.escapeHtml(a.alt_method || '')}" style="width:100%;border:1px solid var(--border);border-radius:4px;padding:5px 7px;"></td>
          <td><button class="btn btn-secondary method-save-btn" data-code="${Utils.escapeHtml(a.fund_code)}" data-asset="${Utils.escapeHtml(a.asset_name)}" style="padding:5px 10px;">저장</button></td>
        </tr>
      `;
    }).join('');
    return `
      <div class="table-card" style="padding:18px;margin-bottom:18px;">
        <div class="section-title">대체평가 방법 관리 (${assets.length}개 자산)</div>
        <div class="form-row" style="max-width:260px;margin-bottom:10px;">
          <label>펀드코드 검색</label>
          <input id="methodSearchInput" placeholder="펀드코드로 검색">
        </div>
        <table class="fund-table" id="methodTable">
          <thead><tr><th>펀드코드</th><th>펀드명</th><th>자산명</th><th>대체평가근거</th><th>대체평가방법</th><th></th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `;
  }

  function bindMethodSection() {
    const searchInput = document.getElementById('methodSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        const q = searchInput.value.trim();
        document.querySelectorAll('#methodTable tbody tr').forEach(tr => {
          tr.style.display = tr.dataset.fundCode.includes(q) ? '' : 'none';
        });
      });
    }

    document.querySelectorAll('.method-save-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const code = btn.dataset.code;
        const assetName = btn.dataset.asset;
        const reason = document.querySelector(`.method-reason-input[data-code="${CSS.escape(code)}"][data-asset="${CSS.escape(assetName)}"]`).value;
        const method = document.querySelector(`.method-input[data-code="${CSS.escape(code)}"][data-asset="${CSS.escape(assetName)}"]`).value;
        btn.disabled = true; btn.textContent = '저장 중…';
        try {
          await Api.updateAsset(code, assetName, { alt_reason: reason, alt_method: method });
          App.showToast(`${code} / ${assetName} 평가방법이 저장되었습니다.`, 'success');
          await App.reloadData();
        } catch (err) {
          App.showToast(err.message, 'error');
        } finally {
          btn.disabled = false; btn.textContent = '저장';
        }
      });
    });
  }

  // ---- 평가이력 입력 ----
  // 평가기준일(eval_base_date)의 의미: 외부평가=감평보고서 상 평가기준일, 대체평가=대체평가 의결일,
  // 부실/특정이벤트로 인한 위원회 개최=위원회 의결일
  function renderEvalHistoryForm() {
    const funds = state.data.fundMaster;
    const options = funds.map(f => `<option value="${Utils.escapeHtml(f.fund_code)}">${Utils.escapeHtml(f.fund_code)} · ${Utils.escapeHtml(f.fund_name)}</option>`).join('');
    const firstCode = funds[0] ? funds[0].fund_code : '';
    const assetOptions = assetNamesForFund(firstCode).map(n => `<option value="${Utils.escapeHtml(n)}">${Utils.escapeHtml(n)}</option>`).join('');
    return `
      <div class="table-card" style="padding:18px;">
        <div class="section-title">평가이력 입력</div>
        <form id="evalHistoryForm">
          <div class="detail-grid">
            <div class="form-row full"><label>펀드</label><select name="fund_code" id="evalHistoryFundSelect">${options}</select></div>
            <div class="form-row full"><label>자산명</label><select name="asset_name" id="evalHistoryAssetSelect" required>${assetOptions}</select></div>
            <div class="form-row"><label>평가기준일</label><input type="date" name="eval_base_date" required></div>
            <div class="form-row"><label>평가금액</label><input type="number" name="eval_amount"></div>
            <div class="form-row"><label>장부가 반영여부</label>
              <select name="book_reflected">
                <option value="" selected>공란 (확인필요)</option>
                <option value="Y">Y (반영)</option>
                <option value="N">N (미반영)</option>
              </select>
            </div>
            <div class="form-row full"><label>특이사항</label><textarea name="notes"></textarea></div>
          </div>
          <div class="btn-row"><button type="submit" class="btn btn-primary">이력 추가</button></div>
        </form>
      </div>
    `;
  }

  function bindEvalHistoryForm() {
    const form = document.getElementById('evalHistoryForm');
    if (!form) return;

    const fundSelect = document.getElementById('evalHistoryFundSelect');
    const assetSelect = document.getElementById('evalHistoryAssetSelect');
    if (fundSelect && assetSelect) {
      fundSelect.addEventListener('change', () => {
        assetSelect.innerHTML = assetNamesForFund(fundSelect.value)
          .map(n => `<option value="${Utils.escapeHtml(n)}">${Utils.escapeHtml(n)}</option>`).join('');
      });
    }

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true; btn.textContent = '저장 중…';
      const fd = new FormData(form);
      const row = Object.fromEntries(fd.entries());
      try {
        await Api.addEvalHistory(row);
        App.showToast('평가이력이 추가되었습니다.', 'success');
        form.reset();
        await App.reloadData();
      } catch (err) {
        App.showToast(err.message, 'error');
      } finally {
        btn.disabled = false; btn.textContent = '이력 추가';
      }
    });
  }

  // ---- 위원회 개최 이력 입력 ----
  // 부실분류는 반드시 평가위원회 의결을 통해서만 이루어지므로, 부실분류 여부/단계는 이 폼에서만 입력한다.
  // (단, 실제 펀드/자산의 부실분류 필드 반영은 다른 항목과 동일하게 항상 자산 대시보드에서 수행한다.)
  // 평가시행여부(eval_conducted)=Y인 경우: 이 위원회 개최일이 대상 자산(들)의 평가기준일이 되며,
  // 입력한 평가금액은 대상 펀드×자산 조합 전체에 동일하게 적용되어 eval_history에도 함께 반영된다.
  function renderCommitteeForm() {
    const funds = state.data.fundMaster;
    const datalistOptions = funds.map(f => `<option value="${Utils.escapeHtml(f.fund_code)}">${Utils.escapeHtml(f.fund_name)}</option>`).join('');
    const impairOptions = (CONFIG.IMPAIR_LEVELS || []).filter(l => l !== '정상')
      .map(l => `<option value="${l}">${l}</option>`).join('');
    return `
      <div class="table-card" style="padding:18px;margin-top:18px;">
        <div class="section-title">집합투자재산평가위원회 개최이력 입력</div>
        <form id="committeeForm">
          <div class="detail-grid">
            <div class="form-row"><label>회차</label><input name="session_no" placeholder="예: 2026년 제3차"></div>
            <div class="form-row"><label>개최일</label><input type="date" name="meeting_date" required></div>
            <div class="form-row full"><label>안건</label><textarea name="agenda" placeholder="예: 대체평가 대상 펀드 적용기간 연장 건"></textarea></div>
            <div class="form-row full">
              <label>대상 펀드 (펀드코드, 콤마로 여러 개 구분)</label>
              <input name="target_funds" id="committeeFundsInput" list="fundCodeDatalist" placeholder="예: 100150, 100181">
              <datalist id="fundCodeDatalist">${datalistOptions}</datalist>
            </div>
            <div class="form-row full">
              <label>대상 자산 (선택, 콤마로 여러 개 구분)</label>
              <input name="target_assets" id="committeeAssetsInput" list="committeeAssetDatalist" placeholder="자산명 또는 - (대상 펀드 입력 시 보유자산 목록이 자동완성됩니다)">
              <datalist id="committeeAssetDatalist"></datalist>
            </div>
            <div class="form-row full"><label>의결내용</label><textarea name="resolution" placeholder="예: 원안 가결"></textarea></div>
            <div class="form-row"><label>평가시행 여부</label>
              <select name="eval_conducted" id="committeeEvalConductedYn">
                <option value="N" selected>N (평가미시행)</option>
                <option value="Y">Y (평가시행)</option>
              </select>
            </div>
            <div class="form-row" id="committeeEvalAmountRow" style="display:none;">
              <label>평가금액</label>
              <input type="number" name="eval_amount" id="committeeEvalAmountInput">
            </div>
            <div class="form-row"><label>부실분류 여부</label>
              <select name="impair_yn" id="committeeImpairYn">
                <option value="N">N (해당없음)</option>
                <option value="Y">Y (부실분류 의결)</option>
              </select>
            </div>
            <div class="form-row" id="committeeImpairLevelRow" style="display:none;">
              <label>부실단계</label>
              <select name="impair_level">${impairOptions}</select>
            </div>
            <div class="form-row"><label>장부가 반영여부</label>
              <select name="reflected">
                <option value="" selected>공란 (확인필요)</option>
                <option value="Y">Y (반영)</option>
                <option value="N">N (미반영)</option>
              </select>
            </div>
            <div class="form-row full"><label>참석위원</label><input name="attendees"></div>
            <div class="form-row full"><label>비고</label><textarea name="remark"></textarea></div>
          </div>
          <div class="btn-row"><button type="submit" class="btn btn-primary">위원회 이력 추가</button></div>
        </form>
      </div>
    `;
  }

  function bindCommitteeForm() {
    const form = document.getElementById('committeeForm');
    if (!form) return;

    const impairYnSelect = document.getElementById('committeeImpairYn');
    const impairLevelRow = document.getElementById('committeeImpairLevelRow');
    if (impairYnSelect) {
      impairYnSelect.addEventListener('change', () => {
        impairLevelRow.style.display = impairYnSelect.value === 'Y' ? '' : 'none';
      });
    }

    const evalConductedSelect = document.getElementById('committeeEvalConductedYn');
    const evalAmountRow = document.getElementById('committeeEvalAmountRow');
    if (evalConductedSelect) {
      evalConductedSelect.addEventListener('change', () => {
        evalAmountRow.style.display = evalConductedSelect.value === 'Y' ? '' : 'none';
      });
    }

    const fundsInput = document.getElementById('committeeFundsInput');
    const assetDatalist = document.getElementById('committeeAssetDatalist');
    if (fundsInput && assetDatalist) {
      fundsInput.addEventListener('input', () => {
        const codes = fundsInput.value.split(',').map(s => s.trim()).filter(Boolean);
        const names = new Set();
        codes.forEach(c => assetNamesForFund(c).forEach(n => names.add(n)));
        assetDatalist.innerHTML = [...names].map(n => `<option value="${Utils.escapeHtml(n)}"></option>`).join('');
      });
    }

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true; btn.textContent = '저장 중…';
      const fd = new FormData(form);
      const row = Object.fromEntries(fd.entries());
      if (row.impair_yn !== 'Y') row.impair_level = '';
      if (row.eval_conducted !== 'Y') row.eval_amount = '';
      try {
        await Api.addCommitteeHistory(row);
        if (row.eval_conducted === 'Y' && row.eval_amount) {
          await syncEvalHistoryFromCommittee(row);
        }
        App.showToast('위원회 개최이력이 추가되었습니다.', 'success');
        form.reset();
        evalAmountRow.style.display = 'none';
        impairLevelRow.style.display = 'none';
        await App.reloadData();
      } catch (err) {
        App.showToast(err.message, 'error');
      } finally {
        btn.disabled = false; btn.textContent = '위원회 이력 추가';
      }
    });
  }

  // 평가시행여부=Y로 제출된 위원회 이력을 eval_history에도 반영 (대상 펀드×자산 조합 전체에 동일 금액 적용)
  async function syncEvalHistoryFromCommittee(row) {
    const fundCodes = (row.target_funds || '').split(',').map(s => s.trim()).filter(Boolean);
    const assetNames = (row.target_assets || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!fundCodes.length || !assetNames.length) {
      App.showToast('평가시행 건이지만 대상 펀드/자산이 비어있어 평가이력에는 반영되지 않았습니다.', 'error');
      return;
    }
    for (const fundCode of fundCodes) {
      for (const assetName of assetNames) {
        const existing = (state.data.evalHistory || []).find(h =>
          h.fund_code === fundCode && h.asset_name === assetName && h.eval_base_date === row.meeting_date
        );
        if (existing) {
          await Api.updateEvalHistory(
            { fund_code: existing.fund_code, asset_name: existing.asset_name, eval_base_date: existing.eval_base_date },
            { eval_amount: row.eval_amount, book_reflected: row.reflected }
          );
        } else {
          await Api.addEvalHistory({
            fund_code: fundCode,
            asset_name: assetName,
            eval_base_date: row.meeting_date,
            eval_amount: row.eval_amount,
            book_reflected: row.reflected,
            notes: `위원회 개최이력(${row.session_no || row.meeting_date}) 의결에 따른 평가 반영`
          });
        }
      }
    }
  }

  return { init, applyAdminUI, renderAdminView, syncEvalHistoryFromCommittee };
})();
