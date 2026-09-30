// Google Sheets "Post Event Reports" tracker layout, row building and
// idempotent formatting requests. Pure functions so they can be unit tested;
// index.ts performs the HTTP calls.

export const TRACKER_COLUMNS = [
  { key: 'event_name', header: 'Event Name', width: 280 },
  { key: 'chapter', header: 'Chapter', width: 130 },
  { key: 'event_date', header: 'Event Date', width: 120, kind: 'date' },
  { key: 'submitted_by', header: 'Submitted By', width: 160 },
  { key: 'approved_by', header: 'Approved By', width: 160 },
  { key: 'registered', header: 'Registered', width: 100, kind: 'count' },
  { key: 'attended', header: 'Attended', width: 100, kind: 'count' },
  { key: 'learners_reached', header: 'Learners Reached', width: 120, kind: 'count' },
  { key: 'volunteers', header: 'Volunteers', width: 105, kind: 'count' },
  { key: 'satisfaction', header: 'Satisfaction', width: 115 },
  { key: 'approved_budget', header: 'Approved Budget', width: 140, kind: 'money' },
  { key: 'expenses', header: 'Expenses', width: 130, kind: 'money' },
  { key: 'balance', header: 'Balance', width: 130, kind: 'money' },
  { key: 'report_status', header: 'Report Status', width: 130, kind: 'status' },
  { key: 'export_status', header: 'Export Status', width: 130, kind: 'status' },
  { key: 'drive_folder', header: 'Drive Folder', width: 115, kind: 'link' },
  { key: 'pdf', header: 'PDF', width: 95, kind: 'link' },
  { key: 'json', header: 'JSON', width: 95, kind: 'link' },
  { key: 'approved_at', header: 'Approved At (PHT)', width: 180, kind: 'datetime' },
  { key: 'exported_at', header: 'Exported At (PHT)', width: 180, kind: 'datetime' },
  { key: 'report_id', header: 'Report ID', width: 110, kind: 'id' },
  { key: 'event_id', header: 'Event ID', width: 110, kind: 'id' },
];

export const TRACKER_HEADERS = TRACKER_COLUMNS.map((column) => column.header);
export const LEGACY_TRACKER_HEADERS = [
  'Report ID', 'Event ID', 'Event name', 'Chapter', 'Event date', 'Submitted by', 'Approved by', 'Registered', 'Attended',
  'Learners reached', 'Volunteers', 'Satisfaction', 'Approved budget', 'Expenses', 'Balance', 'Report status', 'Export status',
  'Drive folder ID', 'Final export file ID', 'Approved at', 'Exported at',
];
export const OVERVIEW_TAB = 'Overview';
export const OVERVIEW_TITLE = 'DEVCON Kids Hub | Post Event Reports Overview';

const index = (key) => TRACKER_COLUMNS.findIndex((column) => column.key === key);
export const COLUMN = Object.fromEntries(TRACKER_COLUMNS.map((column, i) => [column.key, i]));
export const columnLetter = (i) => {
  let n = i + 1; let out = '';
  while (n > 0) { const r = (n - 1) % 26; out = String.fromCharCode(65 + r) + out; n = Math.floor((n - 1) / 26); }
  return out;
};
export const LAST_COLUMN = columnLetter(TRACKER_COLUMNS.length - 1);
export const REPORT_ID_COLUMN = columnLetter(index('report_id'));

export const driveFolderUrl = (id) => `https://drive.google.com/drive/folders/${id}`;
export const driveFileUrl = (id) => `https://drive.google.com/file/d/${id}/view`;

// Values are written with USER_ENTERED so links and dates work. Free text that
// starts like a formula is forced to plain text to prevent formula injection.
export const safeText = (value) => {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
};
const quote = (value) => String(value).replace(/"/g, '""');
export const hyperlink = (url, label) => (url ? `=HYPERLINK("${quote(url)}","${quote(label)}")` : '');

export const dateSerial = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').slice(0, 10));
  if (!match) return '';
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000 + 25569;
};
// Sheets serials are timezone-free; convert to Philippine wall time (UTC+8).
export const dateTimeSerial = (value) => {
  const time = Date.parse(value || '');
  if (Number.isNaN(time)) return '';
  return Math.round(((time + 8 * 3600000) / 86400000 + 25569) * 1e6) / 1e6;
};

const titleCase = (value) => String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
export const reportStatusLabel = (status) => titleCase(status);
export const exportStatusLabel = (status) => ({ pending: 'Queued', queued: 'Queued', processing: 'Processing', completed: 'Completed', failed: 'Failed', retrying: 'Retrying' }[String(status || '').toLowerCase()] || titleCase(status));

const CURRENCY_SYMBOL = { PHP: '₱', USD: '$', EUR: '€', GBP: '£', JPY: '¥', SGD: 'S$', AUD: 'A$', CAD: 'C$' };
export const currencyPattern = (code = 'PHP') => {
  const symbol = CURRENCY_SYMBOL[String(code || 'PHP').toUpperCase()] || `${String(code).toUpperCase()} `;
  return `"${symbol}"#,##0.00;-"${symbol}"#,##0.00`;
};

const count = (value) => (value === null || value === undefined || value === '' ? '' : Number(value));

export function buildTrackerRow(payload, automation = {}) {
  const row = new Array(TRACKER_COLUMNS.length).fill('');
  const set = (key, value) => { row[COLUMN[key]] = value; };
  set('event_name', safeText(payload.event.name));
  set('chapter', safeText(payload.event.chapter));
  set('event_date', dateSerial(payload.event.date));
  set('submitted_by', safeText(payload.people.submitted_by));
  set('approved_by', safeText(payload.people.approved_by));
  set('registered', count(payload.attendance.registered_count));
  set('attended', count(payload.attendance.attended_count));
  set('learners_reached', count(payload.attendance.children_reached));
  set('volunteers', count(payload.attendance.volunteers_involved));
  set('satisfaction', safeText(titleCase(payload.impact.satisfaction_rating)));
  set('approved_budget', Number(payload.finance.approved_budget || 0));
  set('expenses', Number(payload.finance.expenses || 0));
  set('balance', Number(payload.finance.balance || 0));
  set('report_status', reportStatusLabel(payload.report.status));
  set('export_status', exportStatusLabel(automation.status));
  set('drive_folder', automation.drive_folder_id ? hyperlink(driveFolderUrl(automation.drive_folder_id), 'Open Folder') : '');
  set('pdf', automation.pdf_file_id ? hyperlink(driveFileUrl(automation.pdf_file_id), 'View PDF') : '');
  set('json', automation.final_export_file_id ? hyperlink(driveFileUrl(automation.final_export_file_id), 'View JSON') : '');
  set('approved_at', dateTimeSerial(payload.report.approved_at));
  set('exported_at', dateTimeSerial(automation.completed_at));
  set('report_id', safeText(payload.report.id));
  set('event_id', safeText(payload.event.id));
  return row;
}

export const isLegacyHeader = (header = []) => header[0] === 'Report ID' && header[2] === 'Event name';

// Upgrades a row written by the original 21-column exporter in place.
export function legacyRowToTracker(old = []) {
  const at = (i) => (old[i] === undefined || old[i] === null ? '' : old[i]);
  if (!String(at(0)).trim()) return new Array(TRACKER_COLUMNS.length).fill('');
  const row = new Array(TRACKER_COLUMNS.length).fill('');
  const set = (key, value) => { row[COLUMN[key]] = value; };
  const serialOr = (value, convert) => (typeof value === 'number' ? value : convert(value) || safeText(value));
  set('event_name', safeText(at(2)));
  set('chapter', safeText(at(3)));
  set('event_date', serialOr(at(4), dateSerial));
  set('submitted_by', safeText(at(5)));
  set('approved_by', safeText(at(6)));
  set('registered', count(at(7)));
  set('attended', count(at(8)));
  set('learners_reached', count(at(9)));
  set('volunteers', count(at(10)));
  set('satisfaction', safeText(titleCase(at(11))));
  set('approved_budget', count(at(12)));
  set('expenses', count(at(13)));
  set('balance', count(at(14)));
  set('report_status', reportStatusLabel(at(15)));
  set('export_status', exportStatusLabel(at(16)));
  set('drive_folder', at(17) ? hyperlink(driveFolderUrl(at(17)), 'Open Folder') : '');
  set('json', at(18) ? hyperlink(driveFileUrl(at(18)), 'View JSON') : '');
  set('approved_at', serialOr(at(19), dateTimeSerial));
  set('exported_at', serialOr(at(20), dateTimeSerial));
  set('report_id', safeText(at(0)));
  set('event_id', safeText(at(1)));
  return row;
}

// Finds the sheet row (1-based) holding a report, or chooses a free one.
export function chooseTrackerRow({ reportIds = [], reportId, preferredRow = null }) {
  const found = reportIds.findIndex((value, i) => i > 0 && String(value ?? '').trim() === reportId);
  if (found > 0) return found + 1;
  if (preferredRow && preferredRow > 1 && !String(reportIds[preferredRow - 1] ?? '').trim()) return preferredRow;
  let last = reportIds.length;
  while (last > 1 && !String(reportIds[last - 1] ?? '').trim()) last -= 1;
  return Math.max(2, last + 1);
}

const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 };
};
const PURPLE = '#5638D8';

const STATUS_RULES = [
  ['report_status', 'Approved', '#E3F6EE', '#0E6B4A'],
  ['report_status', 'Submitted', '#E6EFFB', '#1A5FB4'],
  ['report_status', 'Needs Revision', '#FFF1D6', '#8A4B00'],
  ['report_status', 'Draft', '#F1EEF4', '#4E4759'],
  ['export_status', 'Completed', '#E3F6EE', '#0E6B4A'],
  ['export_status', 'Processing', '#EEE9FD', '#4B2FC4'],
  ['export_status', 'Queued', '#E6EFFB', '#1A5FB4'],
  ['export_status', 'Failed', '#FDECEC', '#B42F2F'],
  ['export_status', 'Retrying', '#FFF1D6', '#8A4B00'],
];
const MANAGED_RULE_COLUMNS = [COLUMN.report_status, COLUMN.export_status, COLUMN.balance];

const NUMBER_FORMATS = {
  date: { type: 'DATE', pattern: 'mmm d, yyyy' },
  datetime: { type: 'DATE_TIME', pattern: 'mmm d, yyyy h:mm AM/PM' },
  count: { type: 'NUMBER', pattern: '#,##0' },
};

export function trackerFormatRequests({ sheetId, rowCount = 1000, bandedRangeIds = [], conditionalFormats = [], hasBasicFilter = false, basicFilterColumns = 0 }) {
  const width = TRACKER_COLUMNS.length;
  const rows = Math.max(rowCount, 2);
  const all = { sheetId, startRowIndex: 0, endRowIndex: rows, startColumnIndex: 0, endColumnIndex: width };
  const column = (i) => ({ sheetId, startRowIndex: 1, endRowIndex: rows, startColumnIndex: i, endColumnIndex: i + 1 });
  const requests = [
    { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1, frozenColumnCount: 1 } }, fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount' } },
    { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: width }, cell: { userEnteredFormat: { backgroundColor: rgb(PURPLE), textFormat: { bold: true, fontSize: 10, foregroundColor: rgb('#FFFFFF') }, verticalAlignment: 'MIDDLE', horizontalAlignment: 'LEFT', wrapStrategy: 'WRAP', padding: { left: 8, right: 8, top: 4, bottom: 4 } } }, fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment,horizontalAlignment,wrapStrategy,padding)' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 44 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 1, endIndex: rows }, properties: { pixelSize: 30 }, fields: 'pixelSize' } },
    ...TRACKER_COLUMNS.map((col, i) => ({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: col.width }, fields: 'pixelSize' } })),
  ];
  TRACKER_COLUMNS.forEach((col, i) => {
    const format = { verticalAlignment: 'MIDDLE', wrapStrategy: 'CLIP', padding: { left: 8, right: 8, top: 2, bottom: 2 } };
    let fields = 'userEnteredFormat(verticalAlignment,wrapStrategy,padding,horizontalAlignment,textFormat';
    format.horizontalAlignment = ['count', 'money'].includes(col.kind) ? 'RIGHT' : ['status', 'link'].includes(col.kind) ? 'CENTER' : 'LEFT';
    format.textFormat = col.kind === 'id'
      ? { fontSize: 8, foregroundColor: rgb('#6B6475'), fontFamily: 'Roboto Mono' }
      : { fontSize: 10, foregroundColor: rgb('#1C1726'), bold: col.key === 'event_name' };
    if (NUMBER_FORMATS[col.kind]) { format.numberFormat = NUMBER_FORMATS[col.kind]; fields += ',numberFormat'; }
    // Money columns keep a per-row currency format (set when each row is written).
    requests.push({ repeatCell: { range: column(i), cell: { userEnteredFormat: format }, fields: `${fields})` } });
  });
  requests.push({ updateBorders: { range: all, bottom: { style: 'SOLID', color: rgb('#E6E1F0') }, innerHorizontal: { style: 'SOLID', color: rgb('#EEEAF4') }, top: { style: 'NONE' }, left: { style: 'NONE' }, right: { style: 'NONE' }, innerVertical: { style: 'NONE' } } });
  const banding = { range: all, rowProperties: { headerColor: rgb(PURPLE), firstBandColor: rgb('#FFFFFF'), secondBandColor: rgb('#F8F6FD') } };
  requests.push(bandedRangeIds.length
    ? { updateBanding: { bandedRange: { bandedRangeId: bandedRangeIds[0], ...banding }, fields: 'range,rowProperties' } }
    : { addBanding: { bandedRange: banding } });
  if (!hasBasicFilter || basicFilterColumns !== width) requests.push({ setBasicFilter: { filter: { range: all } } });

  // Replace only the exporter's own rules (single-column rules on managed columns).
  conditionalFormats
    .map((rule, i) => ({ rule, i }))
    .filter(({ rule }) => (rule.ranges || []).length > 0 && rule.ranges.every((r) => MANAGED_RULE_COLUMNS.includes(r.startColumnIndex) && r.endColumnIndex === r.startColumnIndex + 1))
    .sort((a, b) => b.i - a.i)
    .forEach(({ i }) => requests.push({ deleteConditionalFormatRule: { sheetId, index: i } }));
  STATUS_RULES.forEach(([key, value, background, foreground], i) => requests.push({ addConditionalFormatRule: { index: i, rule: { ranges: [column(COLUMN[key])], booleanRule: { condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: value }] }, format: { backgroundColor: rgb(background), textFormat: { foregroundColor: rgb(foreground), bold: true } } } } } }));
  requests.push({ addConditionalFormatRule: { index: STATUS_RULES.length, rule: { ranges: [column(COLUMN.balance)], booleanRule: { condition: { type: 'NUMBER_LESS', values: [{ userEnteredValue: '0' }] }, format: { backgroundColor: rgb('#FDECEC'), textFormat: { foregroundColor: rgb('#B42F2F'), bold: true } } } } } });
  return requests;
}

export const rowCurrencyRequest = ({ sheetId, row, currency, endRow = row }) => ({
  repeatCell: {
    range: { sheetId, startRowIndex: row - 1, endRowIndex: endRow, startColumnIndex: COLUMN.approved_budget, endColumnIndex: COLUMN.balance + 1 },
    cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: currencyPattern(currency) } } },
    fields: 'userEnteredFormat.numberFormat',
  },
});

export function overviewValues(tab) {
  const ref = (key) => `'${tab.replace(/'/g, "''")}'!${columnLetter(COLUMN[key])}2:${columnLetter(COLUMN[key])}`;
  return [
    [OVERVIEW_TITLE],
    ['Summary of the Post Event Reports tracker. Updated automatically by the report exporter.'],
    [],
    ['Total approved reports', 'Completed exports', 'Failed exports', 'Total learners reached', 'Total volunteers engaged'],
    [`=COUNTIF(${ref('report_status')},"Approved")`, `=COUNTIF(${ref('export_status')},"Completed")`, `=COUNTIF(${ref('export_status')},"Failed")`, `=SUM(${ref('learners_reached')})`, `=SUM(${ref('volunteers')})`],
  ];
}

export function overviewFormatRequests(sheetId) {
  const range = (r0, r1, c0, c1) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 });
  return [
    { updateSheetProperties: { properties: { sheetId, gridProperties: { hideGridlines: true } }, fields: 'gridProperties.hideGridlines' } },
    { repeatCell: { range: range(0, 1, 0, 5), cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 16, foregroundColor: rgb(PURPLE) } } }, fields: 'userEnteredFormat.textFormat' } },
    { repeatCell: { range: range(1, 2, 0, 5), cell: { userEnteredFormat: { textFormat: { fontSize: 10, foregroundColor: rgb('#5B5466') } } }, fields: 'userEnteredFormat.textFormat' } },
    { repeatCell: { range: range(3, 4, 0, 5), cell: { userEnteredFormat: { backgroundColor: rgb('#F4F1FD'), textFormat: { bold: true, fontSize: 9, foregroundColor: rgb('#4B2FC4') }, verticalAlignment: 'BOTTOM', wrapStrategy: 'WRAP', padding: { left: 12, top: 8, right: 12, bottom: 2 } } }, fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment,wrapStrategy,padding)' } },
    { repeatCell: { range: range(4, 5, 0, 5), cell: { userEnteredFormat: { backgroundColor: rgb('#F4F1FD'), textFormat: { bold: true, fontSize: 22, foregroundColor: rgb('#1C1726') }, numberFormat: { type: 'NUMBER', pattern: '#,##0' }, horizontalAlignment: 'LEFT', verticalAlignment: 'MIDDLE', padding: { left: 12, top: 2, right: 12, bottom: 8 } } }, fields: 'userEnteredFormat(backgroundColor,textFormat,numberFormat,horizontalAlignment,verticalAlignment,padding)' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 5 }, properties: { pixelSize: 200 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 3, endIndex: 4 }, properties: { pixelSize: 34 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 4, endIndex: 5 }, properties: { pixelSize: 56 }, fields: 'pixelSize' } },
    { updateBorders: { range: range(3, 5, 0, 5), innerVertical: { style: 'SOLID_THICK', color: rgb('#FFFFFF') } } },
  ];
}
