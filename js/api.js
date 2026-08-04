/**
 * API 레이어
 *  - 읽기: Google Sheets CSV export (공개 링크, API 키 불필요)
 *  - 쓰기: Apps Script 웹앱 (POST, WRITE_TOKEN 으로 2차 검증)
 */
window.Api = (() => {
  let cache = { data: null, ts: 0 };

  function csvUrl(sheetName) {
    return `https://docs.google.com/spreadsheets/d/${CONFIG.SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  }

  async function fetchSheet(sheetName) {
    const res = await fetch(csvUrl(sheetName), { cache: 'no-store' });
    if (!res.ok) throw new Error(`시트 로드 실패: ${sheetName} (${res.status})`);
    const text = await res.text();
    return Utils.parseCSV(text);
  }

  async function loadAll(force = false) {
    const now = Date.now();
    if (!force && cache.data && (now - cache.ts) < CONFIG.CACHE_TTL_MS) {
      return cache.data;
    }
    const [fundMaster, assetDetail, evalHistory, committeeHistory, config] = await Promise.all([
      fetchSheet(CONFIG.SHEETS.fundMaster),
      fetchSheet(CONFIG.SHEETS.assetDetail),
      fetchSheet(CONFIG.SHEETS.evalHistory),
      fetchSheet(CONFIG.SHEETS.committeeHistory),
      fetchSheet(CONFIG.SHEETS.config)
    ]);

    const configMap = {};
    config.forEach(row => { configMap[row.key] = row.value; });

    const data = { fundMaster, assetDetail, evalHistory, committeeHistory, config: configMap };
    cache = { data, ts: now };
    return data;
  }

  function invalidate() { cache = { data: null, ts: 0 }; }

  // ---- 쓰기 (Apps Script 웹앱 호출) ----
  async function write(action, payload) {
    if (!CONFIG.APPS_SCRIPT_URL || CONFIG.APPS_SCRIPT_URL.startsWith('YOUR_')) {
      throw new Error('Apps Script URL이 설정되지 않았습니다. js/config.js를 확인하세요.');
    }
    const body = new URLSearchParams();
    body.set('action', action);
    body.set('token', CONFIG.WRITE_TOKEN);
    body.set('payload', JSON.stringify(payload));

    const res = await fetch(CONFIG.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    let json;
    try { json = await res.json(); }
    catch (e) { throw new Error('서버 응답을 해석할 수 없습니다.'); }

    if (!json.ok) throw new Error(json.error || '알 수 없는 오류가 발생했습니다.');
    invalidate();
    return json.result;
  }

  const updateFund = (fundCode, fields) => write('update_fund', { fundCode, fields });
  const updateAsset = (fundCode, assetName, fields) => write('update_asset', { fundCode, assetName, fields });
  const addEvalHistory = (row) => write('add_eval_history', row);
  const updateEvalHistory = (rowKey, fields) => write('update_eval_history', { rowKey, fields });
  const updateConfig = (key, value) => write('update_config', { key, value });
  const bulkUpload = (sheetName, rows) => write('bulk_upload', { sheetName, rows });
  const addCommitteeHistory = (row) => write('add_committee_history', row);
  const updateCommitteeHistory = (rowKey, fields) => write('update_committee_history', { rowKey, fields });

  return {
    loadAll, invalidate,
    updateFund, updateAsset, addEvalHistory, updateEvalHistory, updateConfig, bulkUpload,
    addCommitteeHistory, updateCommitteeHistory
  };
})();
