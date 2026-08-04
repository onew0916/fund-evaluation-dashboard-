/**
 * ============================================================
 *  자산평가 현황 대시보드 - Apps Script 백엔드 (쓰기 전용 API)
 * ============================================================
 *  배포 방법:
 *   1. 이 스크립트를 대상 스프레드시트에 바인딩된 Apps Script 프로젝트로 붙여넣기
 *      (스프레드시트 열기 > 확장 프로그램 > Apps Script)
 *   2. 프로젝트 설정 > 스크립트 속성(Script Properties)에 WRITE_TOKEN 키로
 *      임의의 긴 문자열을 등록 (js/config.js의 WRITE_TOKEN과 동일하게)
 *   3. 배포 > 새 배포 > 유형: 웹앱
 *        - 실행 계정: 나(Me)
 *        - 액세스 권한: 전체 (Anyone)
 *   4. 발급된 URL(…/exec)을 js/config.js의 APPS_SCRIPT_URL에 붙여넣기
 * ============================================================
 */

const SHEET_NAMES = {
  fundMaster: 'fund_master',
  assetDetail: 'asset_detail',
  evalHistory: 'eval_history',
  committeeHistory: 'committee_history',
  config: 'config'
};

function doPost(e) {
  try {
    const params = e.parameter || {};
    const token = params.token || '';
    const expected = PropertiesService.getScriptProperties().getProperty('WRITE_TOKEN');

    if (!expected || token !== expected) {
      return jsonOut({ ok: false, error: '인증 토큰이 올바르지 않습니다.' });
    }

    const action = params.action;
    const payload = params.payload ? JSON.parse(params.payload) : {};
    let result;

    switch (action) {
      case 'update_fund':
        result = updateFund(payload.fundCode, payload.fields);
        break;
      case 'update_asset':
        result = updateAsset(payload.fundCode, payload.assetName, payload.fields);
        break;
      case 'add_eval_history':
        result = addEvalHistory(payload);
        break;
      case 'update_eval_history':
        result = updateEvalHistory(payload.rowKey, payload.fields);
        break;
      case 'update_config':
        result = updateConfigValue(payload.key, payload.value);
        break;
      case 'bulk_upload':
        result = bulkUpload(payload.sheetName, payload.rows);
        break;
      case 'add_committee_history':
        result = addCommitteeHistory(payload);
        break;
      case 'update_committee_history':
        result = updateCommitteeHistory(payload.rowKey, payload.fields);
        break;
      default:
        return jsonOut({ ok: false, error: '알 수 없는 action: ' + action });
    }

    return jsonOut({ ok: true, result: result });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function doGet() {
  return jsonOut({ ok: true, result: 'Fund Eval Dashboard API is running.' });
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- 시트 유틸 ----------
function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('시트를 찾을 수 없습니다: ' + name);
  return sheet;
}

function getHeader(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
}

function normalizeCellValue(v) {
  // 시트 셀이 '날짜' 형식으로 저장되어 있으면 getValues()가 Date 객체를 반환하므로,
  // 문자열 비교가 항상 가능하도록 yyyy-MM-dd 형태로 통일한다.
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone() || 'Asia/Seoul', 'yyyy-MM-dd');
  }
  return String(v === null || v === undefined ? '' : v).trim();
}

function findRowIndexByKeys(sheet, header, keyValues) {
  // keyValues: { colName: value, ... } - 모두 일치하는 첫 행(1-based, 헤더 제외) 반환. 없으면 -1
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  const idxMap = {};
  Object.keys(keyValues).forEach(k => { idxMap[k] = header.indexOf(k); });

  for (let i = 0; i < data.length; i++) {
    let match = true;
    for (const k of Object.keys(keyValues)) {
      const colIdx = idxMap[k];
      if (colIdx === -1) { match = false; break; }
      if (normalizeCellValue(data[i][colIdx]) !== normalizeCellValue(keyValues[k])) { match = false; break; }
    }
    if (match) return i + 2; // 실제 시트 행 번호 (1-based, 헤더 포함)
  }
  return -1;
}

function applyFields(sheet, header, rowNum, fields) {
  Object.keys(fields || {}).forEach(col => {
    const colIdx = header.indexOf(col);
    if (colIdx === -1) return;
    sheet.getRange(rowNum, colIdx + 1).setValue(fields[col]);
  });
}

// ---------- Action 구현 ----------
function updateFund(fundCode, fields) {
  const sheet = getSheet(SHEET_NAMES.fundMaster);
  const header = getHeader(sheet);
  const rowNum = findRowIndexByKeys(sheet, header, { fund_code: fundCode });
  if (rowNum === -1) throw new Error('펀드를 찾을 수 없습니다: ' + fundCode);
  applyFields(sheet, header, rowNum, fields);
  return { fundCode, updated: Object.keys(fields || {}) };
}

function updateAsset(fundCode, assetName, fields) {
  const sheet = getSheet(SHEET_NAMES.assetDetail);
  const header = getHeader(sheet);
  const rowNum = findRowIndexByKeys(sheet, header, { fund_code: fundCode, asset_name: assetName });
  if (rowNum === -1) throw new Error('자산을 찾을 수 없습니다: ' + fundCode + ' / ' + assetName);
  applyFields(sheet, header, rowNum, fields);
  return { fundCode, assetName, updated: Object.keys(fields || {}) };
}

function addEvalHistory(row) {
  const sheet = getSheet(SHEET_NAMES.evalHistory);
  const header = getHeader(sheet);

  // 장부가 반영여부는 명시적으로 오지 않으면 공란(확인필요)으로 생성한다.
  if (row.book_reflected === undefined) row.book_reflected = '';

  const newRow = header.map(col => (row[col] !== undefined ? row[col] : ''));
  sheet.appendRow(newRow);
  return { added: true, row: row };
}

function updateEvalHistory(rowKey, fields) {
  // rowKey: { fund_code, asset_name, eval_req_date } 조합으로 대상 행 특정
  const sheet = getSheet(SHEET_NAMES.evalHistory);
  const header = getHeader(sheet);
  const rowNum = findRowIndexByKeys(sheet, header, rowKey);
  if (rowNum === -1) throw new Error('평가이력 행을 찾을 수 없습니다.');
  applyFields(sheet, header, rowNum, fields);
  return { rowKey, updated: Object.keys(fields || {}) };
}

function updateConfigValue(key, value) {
  const sheet = getSheet(SHEET_NAMES.config);
  const header = getHeader(sheet);
  const rowNum = findRowIndexByKeys(sheet, header, { key: key });
  if (rowNum === -1) throw new Error('config 키를 찾을 수 없습니다: ' + key);
  applyFields(sheet, header, rowNum, { value: value });
  return { key, value };
}

function addCommitteeHistory(row) {
  const sheet = getSheet(SHEET_NAMES.committeeHistory);
  const header = getHeader(sheet);

  // 순번(no) 컬럼이 있으면 자동 채번
  if (header.indexOf('no') !== -1 && !row.no) {
    const lastRow = sheet.getLastRow();
    row.no = lastRow; // 헤더가 1행이므로 데이터가 없으면 1, 있으면 마지막행 그대로 다음 번호
  }

  const newRow = header.map(col => (row[col] !== undefined ? row[col] : ''));
  sheet.appendRow(newRow);
  return { added: true, row: row };
}

function updateCommitteeHistory(rowKey, fields) {
  // rowKey: { meeting_date, session_no } 조합 등으로 대상 행 특정
  const sheet = getSheet(SHEET_NAMES.committeeHistory);
  const header = getHeader(sheet);
  const rowNum = findRowIndexByKeys(sheet, header, rowKey);
  if (rowNum === -1) throw new Error('위원회 이력 행을 찾을 수 없습니다.');
  applyFields(sheet, header, rowNum, fields);
  return { rowKey, updated: Object.keys(fields || {}) };
}

function bulkUpload(sheetName, rows) {
  const sheet = getSheet(sheetName);
  const header = getHeader(sheet);
  const lastRow = sheet.getLastRow();

  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  }

  if (rows && rows.length) {
    const values = rows.map(r => header.map(col => (r[col] !== undefined ? r[col] : '')));
    sheet.getRange(2, 1, values.length, header.length).setValues(values);
  }
  return { sheetName, rowsWritten: (rows || []).length };
}
