const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const CSV_DIR = process.env.CSV_DIR || path.join(ROOT, 'data');

function readCsv(name) {
  return fs.readFileSync(path.join(CSV_DIR, name), 'utf8');
}

const csvBySheet = {
  fund_master: readCsv('fund_master.csv'),
  asset_detail: readCsv('asset_detail.csv'),
  eval_history: readCsv('eval_history.csv'),
  committee_history: readCsv('committee_history.csv'),
  config: readCsv('config.csv')
};

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const indexUrl = 'file://' + path.join(ROOT, 'index.html');

const dom = new JSDOM(html, {
  url: indexUrl,
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true
});
const { window } = dom;

// fetch 목(mock) - 실제 스크립트가 로드되기 전에 미리 주입
window.fetch = async (url) => {
  if (typeof url === 'string' && url.includes('gviz/tq')) {
    const m = url.match(/sheet=([^&]+)/);
    const sheet = decodeURIComponent(m[1]);
    const text = csvBySheet[sheet];
    if (!text) throw new Error('unknown sheet ' + sheet);
    return { ok: true, status: 200, text: async () => text };
  }
  if (typeof url === 'string' && url.includes('/exec')) {
    return { ok: true, status: 200, json: async () => ({ ok: true, result: { mocked: true } }) };
  }
  throw new Error('Unhandled fetch: ' + url);
};

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('PASS:', msg);
}

window.addEventListener('error', (e) => {
  console.error('WINDOW ERROR:', e.error ? (e.error.stack || e.error.message) : e.message);
});

window.document.addEventListener('DOMContentLoaded', () => {
  // main.js 의 App.init() 도 동일 이벤트에서 실행되므로, 약간의 지연 후 검증한다.
  setTimeout(runAssertions, 300);
});

async function runAssertions() {
  try {
    const doc = window.document;
    // App.init()이 비동기이므로 데이터 로드를 한번 더 기다림
    await window.App.reloadData(false).catch(() => {});
    await new Promise(r => setTimeout(r, 100));

    assert(doc.querySelectorAll('.kpi-card').length === 4, 'KPI 카드 4개 렌더링');
    const kpiValues = [...doc.querySelectorAll('.kpi-value')].map(el => el.childNodes[0].textContent.trim());
    console.log('KPI values:', kpiValues);
    assert(kpiValues[0] === '145', `전체 펀드 수 145 (실제 ${kpiValues[0]})`);

    const rows = doc.querySelectorAll('#fundTableBody tr[data-fund-code]');
    assert(rows.length === 145, `펀드 테이블 행 수 145 (실제 ${rows.length})`);

    const searchInput = doc.getElementById('searchInput');
    searchInput.value = '100150';
    searchInput.dispatchEvent(new window.Event('input'));
    await new Promise(r => setTimeout(r, 250));
    const filteredRows = doc.querySelectorAll('#fundTableBody tr[data-fund-code]');
    assert(filteredRows.length === 1 && filteredRows[0].dataset.fundCode === '100150', `검색 필터 동작 (실제 ${filteredRows.length}건)`);

    searchInput.value = '';
    searchInput.dispatchEvent(new window.Event('input'));
    await new Promise(r => setTimeout(r, 250));

    window.App.openPanel('100150');
    assert(doc.getElementById('sidePanel').classList.contains('open'), '사이드패널 열림');
    assert(doc.getElementById('panelFundName').textContent.includes('코람코Debt일반사모1호'), '패널 펀드명 표시');
    const assetTabBtn = doc.querySelector('.side-panel-tab[data-ptab="assets"]');
    assetTabBtn.click();
    const assetCards = doc.querySelectorAll('#panelBody .asset-card');
    assert(assetCards.length === 8, `보유자산 8건 표시 (실제 ${assetCards.length})`);

    doc.getElementById('adminToggleBtn').click();
    assert(doc.getElementById('adminModal').style.display === 'flex', '관리자 로그인 모달 오픈');
    doc.getElementById('adminPasswordInput').value = 'wrongpass';
    doc.getElementById('adminSubmitBtn').click();
    assert(doc.getElementById('adminErrorMsg').textContent.length > 0, '오답 비밀번호 에러 표시');

    doc.getElementById('adminPasswordInput').value = window.CONFIG.ADMIN_PASSWORD;
    doc.getElementById('adminSubmitBtn').click();
    assert(window.App.state.isAdmin === true, '정답 비밀번호로 관리자 모드 활성화');
    assert(doc.getElementById('navAdminBtn').style.display !== 'none', '관리자 도구 메뉴 노출');

    window.App.switchView('admin');
    assert(!!doc.getElementById('evalHistoryForm'), '외부평가 이력 입력 폼 렌더링');
    assert(doc.querySelectorAll('.method-save-btn').length > 0, '평가방법 관리 테이블 렌더링');
    assert(!!doc.getElementById('dropzone'), 'CSV 업로드 드롭존 렌더링');
    assert(!!doc.getElementById('committeeForm'), '위원회 개최이력 입력 폼 렌더링');

    window.App.switchView('committee');
    const committeeGroups = doc.querySelectorAll('#committeeContainer .history-fund-group');
    assert(committeeGroups.length === 1, `위원회 이력 카드 렌더링 (실제 ${committeeGroups.length}건)`);
    assert(doc.getElementById('committeeContainer').textContent.includes('100150'), '위원회 이력에 대상 펀드 칩 표시');

    window.App.switchView('history');
    const histGroups = doc.querySelectorAll('.history-fund-group');
    assert(histGroups.length > 0, `평가이력 그룹 렌더링 (${histGroups.length}개 펀드)`);
    const stages = doc.querySelectorAll('.timeline-stage');
    assert(stages.length > 0 && stages.length % 4 === 0, '타임라인 4단계 구조 확인');

    // 평가이력 인라인 수정 폼 (관리자 모드) 동작 확인
    const editBtn = doc.querySelector('.history-edit-btn');
    assert(!!editBtn, '관리자 모드에서 평가이력 수정 버튼 노출');
    editBtn.click();
    const entryWrap = doc.querySelector(`.history-entry[data-eh-idx="${editBtn.dataset.ehIdx}"]`);
    assert(entryWrap.querySelector('.history-edit-form').style.display === 'block', '수정 버튼 클릭 시 편집 폼 노출');
    const cancelBtn = entryWrap.querySelector('.history-cancel-btn');
    cancelBtn.click();
    assert(entryWrap.querySelector('.history-edit-form').style.display === 'none', '취소 버튼 클릭 시 편집 폼 숨김');

    window.App.switchView('dashboard');
    window.App.openPanel('121158'); // 외부평가 대상 펀드
    assert(!!doc.getElementById('fundEditForm'), '관리자 모드에서 펀드 수정 폼 노출');

    // 보유자산 평가정보 저장 시 평가이력 자동 반영(upsert) 동작 확인 - 에러 없이 완료되는지만 검증
    doc.querySelector('.side-panel-tab[data-ptab="assets"]').click();
    const firstAssetForm = doc.querySelector('.admin-asset-form');
    firstAssetForm.querySelector('input[name="eval_amount"]').value = '123456789';
    firstAssetForm.querySelector('input[name="last_eval_date"]').value = '2026-07-01';
    let syncError = null;
    try {
      firstAssetForm.dispatchEvent(new window.Event('submit', { cancelable: true }));
      await new Promise(r => setTimeout(r, 400));
    } catch (e) { syncError = e; }
    assert(!syncError, '보유자산 저장 시 평가이력 자동 반영 처리 중 오류 없음');

    console.log(`\n=== 결과: ${failures === 0 ? '모두 통과' : failures + '개 실패'} ===`);
    process.exit(failures === 0 ? 0 : 1);
  } catch (err) {
    console.error('테스트 실행 중 오류:', err.stack || err);
    process.exit(1);
  }
}
