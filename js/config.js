/**
 * ============================================================
 *  설정 파일 - 배포 전 반드시 아래 값들을 채워주세요.
 * ============================================================
 *  1) SPREADSHEET_ID    : Google Sheets 주소창의 /d/ 와 /edit 사이 값
 *  2) APPS_SCRIPT_URL   : Apps Script를 웹앱으로 배포한 후 발급되는 URL
 *                         (…/exec 로 끝나는 주소)
 *  3) WRITE_TOKEN       : Apps Script 쪽 스크립트 속성(Script Properties)에
 *                         등록한 값과 동일한 문자열. 쓰기 요청을 보낼 때
 *                         함께 전송되어 서버에서 한 번 더 검증합니다.
 *  4) ADMIN_PASSWORD    : 관리자 모드 진입 비밀번호(클라이언트단 확인용).
 *                         내부 팀 4명이 함께 쓰는 대시보드 기준으로
 *                         간단한 방식을 채택했습니다. 완전한 보안이
 *                         필요하다면 Apps Script 서버단 검증으로 이전하세요.
 * ============================================================
 */
window.CONFIG = {
  // Google Sheets 스프레드시트 ID (공유 설정: "링크가 있는 모든 사용자" 뷰어 권한 필요)
  SPREADSHEET_ID: '1Y9r3QhewVssn6-6jZmM-5RBIoyw20874A2N4ddDMk4k',

  // 시트 탭 이름 (요청하신 구조 그대로)
  SHEETS: {
    fundMaster: 'fund_master',
    assetDetail: 'asset_detail',
    evalHistory: 'eval_history',
    committeeHistory: 'committee_history',
    config: 'config'
  },

  // Apps Script 웹앱 배포 URL (쓰기 전용)
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbwlHEckTCKLP0eYxGJeKR2okAI81OhI8DQbDXwxU9HlryrEQmGQ9dCaTovfOHejOuUABg/exec',

  // 서버단 2차 검증용 토큰 (Apps Script 스크립트 속성의 WRITE_TOKEN 값과 일치해야 함)
  WRITE_TOKEN: 'abcdefg1234',

  // 관리자 모드 비밀번호 (배포 전 반드시 변경)
  ADMIN_PASSWORD: 'koramco2026',

  // 데이터 캐시 유지 시간 (ms) - 너무 잦은 시트 호출 방지
  CACHE_TTL_MS: 60 * 1000,

  // 기한임박 자산 KPI 경고 기준일 수
  DDAY_WARNING_DAYS: 30,

  // 평가상태 배지 색상/라벨
  // 참고: 현지NAV반영은 별도 상태가 아니라 대체평가의 한 방법(alt_method)으로 통합 관리합니다.
  EVAL_STATUS: {
    '대체평가':      { color: '#16a34a', bg: '#e8f7ee', label: '대체평가' },
    '외부평가 대상': { color: '#ea580c', bg: '#fef1e6', label: '외부평가 대상' },
    '시가평가':      { color: '#6b7280', bg: '#f1f2f4', label: '시가평가' }
  },

  // 펀드 투자자 구분
  INVESTOR_TYPES: ['일반투자자', '전문투자자'],

  // 보유자산 평가방법
  ASSET_EVAL_METHODS: ['시가평가', '대체평가'],

  // 보유자산 부실분류
  IMPAIR_LEVELS: ['정상', '부실우려', '발생', '개선', '악화']
};
