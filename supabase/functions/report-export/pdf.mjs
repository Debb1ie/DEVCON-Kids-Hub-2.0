// Dependency-free PDF renderer for the approved Post Event Report. It reads the
// same normalized payload that is written to JSON, so both artifacts always
// describe one snapshot. Output uses the built-in Helvetica fonts (WinAnsi),
// A4 pages, vector branding and page numbers. Runs in Deno and Node.
import { HELVETICA, HELVETICA_BOLD } from './fontMetrics.mjs';

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;
const TOP = PAGE_H - MARGIN;
const BOTTOM = MARGIN + 30;

const hex = (value) => {
  const n = parseInt(value.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => (c / 255).toFixed(3)).join(' ');
};
const C = {
  purple: '#5638D8', purpleDeep: '#3B24A8', tint: '#F4F1FD', ink: '#1C1726', muted: '#5B5466',
  rule: '#E4DEF0', white: '#FFFFFF', cyan: '#28C6E5', spark: '#FFC93C',
  green: '#0E7C55', greenTint: '#E3F6EE', amber: '#8A4B00', amberTint: '#FFF1D6',
  blue: '#1A5FB4', blueTint: '#E6EFFB', red: '#B42F2F', redTint: '#FDECEC', gray: '#5B5466', grayTint: '#F1EEF4',
};

const WIN_ANSI_EXTRA = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89,
  'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95,
  '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
};

export function encodeWinAnsi(text) {
  const bytes = [];
  for (const char of String(text ?? '').replace(/₱/g, 'PHP ').replace(/\t/g, ' ')) {
    const code = char.codePointAt(0);
    if ((code >= 32 && code <= 126) || (code >= 160 && code <= 255)) bytes.push(code);
    else if (WIN_ANSI_EXTRA[char]) bytes.push(WIN_ANSI_EXTRA[char]);
    else {
      const base = char.normalize('NFKD').replace(/[̀-ͯ]/g, '');
      const simple = base.length === 1 && base.codePointAt(0) >= 32 && base.codePointAt(0) <= 126;
      if (simple) bytes.push(base.codePointAt(0));
      else if (!/[\u0000-\u001f​-‏﻿]/.test(char)) bytes.push(63);
    }
  }
  return bytes;
}

const widthOf = (bytes, bold, size) =>
  (bytes.reduce((sum, b) => sum + ((bold ? HELVETICA_BOLD : HELVETICA)[b - 32] || 556), 0) * size) / 1000;

export const textWidth = (text, { bold = false, size = 10 } = {}) => widthOf(encodeWinAnsi(text), bold, size);

export function wrapText(text, { bold = false, size = 10, width }) {
  const lines = [];
  for (const paragraph of String(text ?? '').split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(''); continue; }
    let line = '';
    for (let word of words) {
      while (textWidth(word, { bold, size }) > width && word.length > 1) {
        let cut = word.length - 1;
        while (cut > 1 && textWidth(word.slice(0, cut), { bold, size }) > width) cut -= 1;
        if (line) { lines.push(line); line = ''; }
        lines.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      const candidate = line ? `${line} ${word}` : word;
      if (textWidth(candidate, { bold, size }) <= width) line = candidate;
      else { lines.push(line); line = word; }
    }
    lines.push(line);
  }
  return lines;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function formatDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  if (!match) return value ? String(value) : 'Not recorded';
  return `${MONTHS[Number(match[2]) - 1]} ${Number(match[3])}, ${match[1]}`;
}
// Timestamps are shown in Philippine time (UTC+8, no daylight saving).
export function formatDateTime(value) {
  const time = Date.parse(value || '');
  if (Number.isNaN(time)) return value ? String(value) : 'Not recorded';
  const d = new Date(time + 8 * 3600 * 1000);
  const hours = d.getUTCHours();
  const h12 = hours % 12 || 12;
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()} ${h12}:${minutes} ${hours < 12 ? 'AM' : 'PM'} PHT`;
}
export function formatMoney(amount, currency = 'PHP') {
  const value = Number(amount || 0);
  const fixed = Math.abs(value).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${value < 0 ? '-' : ''}${currency || 'PHP'} ${fixed}`;
}
const titleCase = (value) => String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const fileSize = (bytes) => {
  const n = Number(bytes || 0);
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
};
const orDash = (value) => (value === null || value === undefined || value === '' ? 'Not recorded' : String(value));

class Writer {
  constructor(footerLabel) {
    this.pages = [];
    this.footerLabel = footerLabel;
    this.newPage();
  }
  get ops() { return this.pages[this.current ?? this.pages.length - 1]; }
  newPage() {
    this.pages.push([]);
    this.y = TOP;
    if (this.pages.length > 1) {
      this.text(this.footerLabel, MARGIN, this.y - 9, { size: 8.5, bold: true, color: C.purple });
      this.rule(this.y - 16);
      this.y -= 30;
    }
  }
  ensure(height) { if (this.y - height < BOTTOM) this.newPage(); }
  fill(color) { this.ops.push(`${hex(color)} rg`); }
  stroke(color) { this.ops.push(`${hex(color)} RG`); }
  rect(x, y, w, h, color) { this.fill(color); this.ops.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`); }
  roundRect(x, y, w, h, r, color, strokeColor) {
    const k = 0.5523 * r;
    const p = [
      `${x + r} ${y} m`, `${x + w - r} ${y} l`, `${x + w - r + k} ${y} ${x + w} ${y + r - k} ${x + w} ${y + r} c`,
      `${x + w} ${y + h - r} l`, `${x + w} ${y + h - r + k} ${x + w - r + k} ${y + h} ${x + w - r} ${y + h} c`,
      `${x + r} ${y + h} l`, `${x + r - k} ${y + h} ${x} ${y + h - r + k} ${x} ${y + h - r} c`,
      `${x} ${y + r} l`, `${x} ${y + r - k} ${x + r - k} ${y} ${x + r} ${y} c`,
    ].map((line) => line.replace(/(\d+\.\d{3})\d+/g, '$1'));
    if (color) this.fill(color);
    if (strokeColor) { this.stroke(strokeColor); this.ops.push('0.75 w'); }
    this.ops.push(`${p.join(' ')} h ${color && strokeColor ? 'B' : color ? 'f' : 'S'}`);
  }
  rule(y, color = C.rule, x = MARGIN, w = CONTENT_W) {
    this.stroke(color);
    this.ops.push(`0.75 w ${x.toFixed(2)} ${y.toFixed(2)} m ${(x + w).toFixed(2)} ${y.toFixed(2)} l S`);
  }
  text(value, x, y, { size = 10, bold = false, color = C.ink, align = 'left', width = 0 } = {}) {
    const bytes = encodeWinAnsi(value);
    let left = x;
    if (align === 'right') left = x + width - widthOf(bytes, bold, size);
    if (align === 'center') left = x + (width - widthOf(bytes, bold, size)) / 2;
    const hexText = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
    this.fill(color);
    this.ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${left.toFixed(2)} ${y.toFixed(2)} Td <${hexText}> Tj ET`);
  }
  paragraph(value, { size = 10, bold = false, color = C.ink, x = MARGIN, width = CONTENT_W, leading = 1.45 } = {}) {
    for (const line of wrapText(value, { size, bold, width })) {
      this.ensure(size * leading);
      this.text(line, x, this.y - size, { size, bold, color });
      this.y -= size * leading;
    }
  }
  logo(x, y, size) {
    // Spark Hub mark, drawn from its 64x64 SVG geometry with a y-flip.
    const s = size / 64;
    this.ops.push(`q ${s.toFixed(4)} 0 0 ${(-s).toFixed(4)} ${x.toFixed(2)} ${(y + size).toFixed(2)} cm`);
    const k = 0.5523;
    const circle = (cx, cy, r, color) => {
      this.fill(color);
      this.ops.push(`${cx + r} ${cy} m ${cx + r} ${cy + r * k} ${cx + r * k} ${cy + r} ${cx} ${cy + r} c ${cx - r * k} ${cy + r} ${cx - r} ${cy + r * k} ${cx - r} ${cy} c ${cx - r} ${cy - r * k} ${cx - r * k} ${cy - r} ${cx} ${cy - r} c ${cx + r * k} ${cy - r} ${cx + r} ${cy - r * k} ${cx + r} ${cy} c f`.replace(/(\d+\.\d{3})\d+/g, '$1'));
    };
    this.ops.push('q');
    this.roundRect(0, 0, 64, 64, 16, C.purple);
    this.ops.push('Q q 0.78 0 0 0.78 7 7 cm');
    this.stroke(C.white);
    this.ops.push('8 w 1 J 17 11 m 17 53 l S 27 32 m 47 14 l S 27 32 m 47 50 l S');
    circle(17, 11, 6, C.white);
    circle(17, 53, 6, C.white);
    circle(47, 50, 7.5, C.cyan);
    circle(27, 32, 11, C.white);
    this.fill(C.spark);
    this.ops.push('48 2 m 48 9.33 51.67 13 59 13 c 51.67 13 48 16.67 48 24 c 48 16.67 44.33 13 37 13 c 44.33 13 48 9.33 48 2 c f');
    this.ops.push('Q Q');
  }
}

const STATUS_TONE = {
  approved: [C.green, C.greenTint], completed: [C.green, C.greenTint], submitted: [C.blue, C.blueTint],
  needs_revision: [C.amber, C.amberTint], draft: [C.gray, C.grayTint], processing: [C.purple, C.tint],
};

function pill(w, label, x, y, status) {
  const [fg, bg] = STATUS_TONE[status] || [C.gray, C.grayTint];
  const text = titleCase(label).toUpperCase();
  const width = textWidth(text, { bold: true, size: 8 }) + 18;
  w.roundRect(x - width, y, width, 18, 9, bg);
  w.text(text, x - width, y + 5.5, { size: 8, bold: true, color: fg, align: 'center', width });
}

function section(w, title) {
  // Keep a heading with at least its first block of content.
  w.ensure(96);
  w.y -= 14;
  w.rect(MARGIN, w.y - 12, 3, 12, C.purple);
  w.text(title.toUpperCase(), MARGIN + 10, w.y - 10, { size: 10, bold: true, color: C.purple });
  w.y -= 20;
  w.rule(w.y);
  w.y -= 12;
}

function fieldGrid(w, fields, columns = 2) {
  const gap = 18;
  const colW = (CONTENT_W - gap * (columns - 1)) / columns;
  for (let i = 0; i < fields.length; i += columns) {
    const row = fields.slice(i, i + columns).map(([label, value]) => ({ label, lines: wrapText(orDash(value), { size: 10, width: colW }) }));
    const height = 14 + Math.max(...row.map((cell) => cell.lines.length)) * 14 + 8;
    w.ensure(height);
    row.forEach((cell, index) => {
      const x = MARGIN + index * (colW + gap);
      w.text(cell.label.toUpperCase(), x, w.y - 8, { size: 7.5, bold: true, color: C.muted });
      cell.lines.forEach((line, n) => w.text(line, x, w.y - 22 - n * 14, { size: 10 }));
    });
    w.y -= height;
  }
}

function statCards(w, stats) {
  const gap = 10;
  const cardW = (CONTENT_W - gap * (stats.length - 1)) / stats.length;
  const height = 54;
  w.ensure(height + 8);
  stats.forEach(({ label, value, tone }, index) => {
    const x = MARGIN + index * (cardW + gap);
    w.roundRect(x, w.y - height, cardW, height, 8, C.tint);
    let size = 15;
    while (size > 8 && textWidth(String(value), { bold: true, size }) > cardW - 20) size -= 0.5;
    w.text(String(value), x + 12, w.y - 25, { size, bold: true, color: tone || C.ink });
    w.text(label.toUpperCase(), x + 12, w.y - 42, { size: 7.5, bold: true, color: C.muted });
  });
  w.y -= height + 10;
}

function table(w, columns, rows) {
  const pad = 6;
  const drawHeader = () => {
    w.ensure(24);
    w.rect(MARGIN, w.y - 20, CONTENT_W, 20, C.tint);
    let x = MARGIN;
    for (const col of columns) {
      w.text(col.label.toUpperCase(), x + pad, w.y - 13, { size: 7.5, bold: true, color: C.purpleDeep, align: col.align, width: col.width - pad * 2 });
      x += col.width;
    }
    w.y -= 20;
  };
  drawHeader();
  for (const row of rows) {
    const cells = columns.map((col, i) => wrapText(String(row[i] ?? ''), { size: 9, width: col.width - pad * 2 }));
    const height = Math.max(...cells.map((lines) => lines.length)) * 12 + 10;
    if (w.y - height < BOTTOM) { w.newPage(); drawHeader(); }
    let x = MARGIN;
    cells.forEach((lines, i) => {
      lines.forEach((line, n) => w.text(line, x + pad, w.y - 14 - n * 12, { size: 9, align: columns[i].align, width: columns[i].width - pad * 2 }));
      x += columns[i].width;
    });
    w.y -= height;
    w.rule(w.y);
  }
}

export function buildReportPdfModel(payload, context = {}) {
  const { report, event, people, attendance = {}, impact = {}, finance = {}, attachments = [] } = payload;
  const registered = Number(attendance.registered_count || 0);
  const attended = Number(attendance.attended_count || 0);
  return {
    title: `Post Event Report - ${event.name || 'Event'}`,
    attendanceRate: registered > 0 ? `${Math.round((attended / registered) * 100)}%` : 'Not available',
    event, report, people, attendance, impact, finance, attachments, context,
  };
}

export function renderReportPdf(payload, context = {}) {
  const model = buildReportPdfModel(payload, context);
  const { event, report, people, attendance, impact, finance, attachments } = model;
  const currency = finance.currency_code || 'PHP';
  const w = new Writer(`Post Event Report  |  ${event.name || 'Event'}`);

  // 1. Header
  w.logo(MARGIN, w.y - 40, 40);
  w.text('DEVCON KIDS HUB', MARGIN + 52, w.y - 14, { size: 8.5, bold: true, color: C.purple });
  w.text('Post Event Report', MARGIN + 52, w.y - 34, { size: 20, bold: true });
  pill(w, report.status || 'approved', PAGE_W - MARGIN, w.y - 30, report.status);
  w.y -= 58;
  w.paragraph(event.name || 'Untitled event', { size: 15, bold: true, color: C.purpleDeep, leading: 1.3 });
  w.y -= 2;
  w.text(`${event.chapter || 'No chapter'}   |   ${formatDate(event.date)}   |   Report ${report.id}`, MARGIN, w.y - 9, { size: 9, color: C.muted });
  w.y -= 22;
  w.rule(w.y, C.purple);
  w.y -= 4;

  // 2. Event information
  section(w, 'Event information');
  fieldGrid(w, [
    ['Event name', event.name], ['Event date', formatDate(event.date)],
    ['Chapter', event.chapter], ['Venue', report.venue],
    ['Submitted by', people.submitted_by], ['Approved by', people.approved_by],
    ['Submitted', report.submitted_at ? formatDateTime(report.submitted_at) : null], ['Approved', report.approved_at ? formatDateTime(report.approved_at) : null],
  ]);
  if (report.event_summary) {
    w.ensure(30);
    w.text('EVENT SUMMARY', MARGIN, w.y - 8, { size: 7.5, bold: true, color: C.muted });
    w.y -= 14;
    w.paragraph(report.event_summary);
  }

  // 3. Attendance
  section(w, 'Attendance');
  statCards(w, [
    { label: 'Registered', value: formatCount(attendance.registered_count) },
    { label: 'Attended', value: formatCount(attendance.attended_count) },
    { label: 'Learners reached', value: formatCount(attendance.children_reached) },
    { label: 'Volunteers', value: formatCount(attendance.volunteers_involved) },
    { label: 'Attendance rate', value: model.attendanceRate, tone: C.purple },
  ]);
  if (attendance.notes) w.paragraph(attendance.notes, { color: C.muted, size: 9.5 });

  // 4. Impact
  section(w, 'Impact');
  fieldGrid(w, [['Satisfaction', impact.satisfaction_rating ? titleCase(impact.satisfaction_rating) : null]], 1);
  for (const [label, value] of [['Key learnings', impact.key_learnings], ['Community impact', impact.community_impact], ['Challenges', impact.challenges], ['Recommendations', impact.recommendations]]) {
    w.ensure(34);
    w.text(label.toUpperCase(), MARGIN, w.y - 8, { size: 7.5, bold: true, color: C.muted });
    w.y -= 14;
    w.paragraph(orDash(value));
    w.y -= 6;
  }

  // 5. Finance
  section(w, 'Finance');
  statCards(w, [
    { label: `Approved budget (${currency})`, value: formatMoney(finance.approved_budget, currency) },
    { label: `Expenses (${currency})`, value: formatMoney(finance.expenses, currency) },
    { label: `Balance (${currency})`, value: formatMoney(finance.balance, currency), tone: Number(finance.balance) < 0 ? C.red : C.green },
  ]);
  const transactions = finance.transactions || [];
  if (transactions.length) {
    table(w, [
      { label: 'Date', width: 72 }, { label: 'Description', width: 150 }, { label: 'Category', width: 72 },
      { label: 'Payee', width: 110 }, { label: 'Amount', width: CONTENT_W - 404, align: 'right' },
    ], transactions.map((row) => [row.transaction_date ? formatDate(row.transaction_date) : '', row.description, titleCase(row.expense_category), row.vendor_payee || '', formatMoney(row.amount, currency)]));
  } else {
    w.paragraph('No expense transactions were recorded.', { color: C.muted, size: 9.5 });
  }

  // 6. Attachments
  section(w, 'Attachments');
  if (attachments.length) {
    table(w, [
      { label: 'File name', width: 220 }, { label: 'Category', width: 110 }, { label: 'Type', width: 100 }, { label: 'Size', width: CONTENT_W - 430, align: 'right' },
    ], attachments.map((file) => [file.file_name, titleCase(file.category), file.file_type, fileSize(file.file_size)]));
    w.y -= 4;
    w.paragraph('Files are stored in the Attachments folder next to this report.', { color: C.muted, size: 8.5 });
  } else {
    w.paragraph('No attachments were submitted with this report.', { color: C.muted, size: 9.5 });
  }

  // 7. Approval and export
  section(w, 'Approval and export');
  fieldGrid(w, [
    ['Report status', titleCase(report.status)], ['Approved by', people.approved_by],
    ['Approved at', report.approved_at ? formatDateTime(report.approved_at) : null], ['PDF generated at', formatDateTime(model.context.generatedAt || new Date().toISOString())],
    ['Drive folder ID', model.context.driveFolderId], ['JSON file ID', model.context.jsonFileId],
  ]);
  w.paragraph('This PDF and Post Event Report.json are generated from the same approved report snapshot.', { color: C.muted, size: 8.5 });

  // Footers with page numbers.
  const total = w.pages.length;
  for (let index = 0; index < total; index += 1) {
    w.current = index;
    w.rule(MARGIN + 14);
    w.text(`DEVCON Kids Hub  |  Report ${report.id}`, MARGIN, MARGIN, { size: 7.5, color: C.muted });
    w.text(`Page ${index + 1} of ${total}`, MARGIN, MARGIN, { size: 7.5, color: C.muted, align: 'right', width: CONTENT_W });
  }
  w.current = undefined;

  return serialize(w.pages, model.title);
}

function formatCount(value) {
  return Number(value || 0).toLocaleString('en-US');
}

function serialize(pages, title) {
  const objects = [];
  const add = (body) => { objects.push(body); return objects.length; };
  const catalog = add(null);
  const pagesId = add(null);
  const regular = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const bold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const kids = [];
  for (const ops of pages) {
    const content = ops.join('\n');
    const contentId = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${regular} 0 R /F2 ${bold} 0 R >> >> /Contents ${contentId} 0 R >>`));
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((id) => `${id} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  const titleHex = encodeWinAnsi(title).map((b) => b.toString(16).padStart(2, '0')).join('');
  const info = add(`<< /Title <${titleHex}> /Creator (DEVCON Kids Hub) /Producer (DEVCON Kids Hub report-export) >>`);
  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(out.length);
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i += 1) bytes[i] = out.charCodeAt(i) & 255;
  return bytes;
}
