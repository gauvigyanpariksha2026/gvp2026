const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const backendSource = fs.readFileSync(path.join(root, 'apps-script', 'Code.gs'), 'utf8');
const context = vm.createContext({ console });
vm.runInContext(backendSource, context, { filename: 'apps-script/Code.gs' });

const current = [
  'ALICE', 'FATHER', 'Female', '10', 'Banswara', 'Ghatol',
  'GSSS TEST', 'Test Village', '9876543210', '26000001', '2026', '', ''
];
const legacy = [
  'BOB', 'FATHER', 'MOTHER', 'Male', '2009-02-03', '9', 'Banswara',
  'Ghatol', 'GSSS TEST', 'Test Village', '327001', 'Address', '9876543211'
];

assert.deepEqual(
  JSON.parse(JSON.stringify(context.registrationRow_(current))),
  {
    legacy: false, name: 'ALICE', father: 'FATHER', gender: 'Female', cls: '10',
    district: 'Banswara', block: 'Ghatol', school: 'GSSS TEST',
    village: 'Test Village', mobile: '9876543210'
  }
);
assert.deepEqual(
  JSON.parse(JSON.stringify(context.registrationRow_(legacy))),
  {
    legacy: true, name: 'BOB', father: 'FATHER', gender: 'Male', cls: '9',
    district: 'Banswara', block: 'Ghatol', school: 'GSSS TEST',
    village: 'Test Village', mobile: '9876543211'
  }
);
assert.deepEqual(
  JSON.parse(JSON.stringify(context.regRowLocation_(
    '2009-02-03', '9', 'Banswara', 'Ghatol', 'GSSS TEST', 'Test Village'
  ))),
  { district: 'Banswara', block: 'Ghatol', school: 'GSSS TEST', village: 'Test Village' }
);

// Duplicate checks must search both K (current Mobile) and O (legacy Mobile).
const duplicateSheet = {
  getLastRow: () => 2,
  getMaxColumns: () => 19,
  getRange(row, column) {
    if (column === 11 || column === 15) {
      return {
        createTextFinder() {
          return {
            matchCase() { return this; },
            matchEntireCell() { return this; },
            findAll() { return column === 15 ? [{ getRow: () => 2 }] : []; }
          };
        }
      };
    }
    assert.equal(row, 2);
    assert.equal(column, 3);
    return { getValues: () => [['BOB', 'FATHER']] };
  }
};
assert.equal(context.duplicateRegistrationExists_(duplicateSheet, 'Bob', 'Father', '9876543211'), true);

// A 13-column current-only sheet must not be queried for legacy column O.
const narrowDuplicateSheet = {
  getLastRow: () => 2,
  getMaxColumns: () => 13,
  getRange(row, column) {
    assert.equal(column, 11);
    return {
      createTextFinder() {
        return {
          matchCase() { return this; },
          matchEntireCell() { return this; },
          findAll() { return []; }
        };
      }
    };
  }
};
assert.equal(context.duplicateRegistrationExists_(narrowDuplicateSheet, 'Alice', 'Father', '9876543210'), false);

function fullRegistrationRow(cToO, regNo, omrColumn) {
  const row = new Array(19).fill('');
  row[0] = regNo;
  cToO.forEach((value, index) => { row[index + 2] = value; });
  row[omrColumn - 1] = omrColumn === 18 ? '26000002' : '26000001';
  return row;
}
const studentSheet = {
  getLastRow: () => 3,
  getMaxColumns: () => 19,
  getRange: () => ({ getValues: () => [
    fullRegistrationRow(current, 'GVP-2026-00001', 12),
    fullRegistrationRow(legacy, 'GVP-2026-00002', 18)
  ] })
};
context.getSpreadsheet_ = () => ({});
context.getRegistrationSheet_ = () => studentSheet;
assert.deepEqual(
  JSON.parse(JSON.stringify(context.getSchoolStudents(
    'Banswara', 'Ghatol', 'GSSS TEST', 'Test Village', '9876543211'
  ))),
  {
    ok: true,
    data: [
      { regNo: 'GVP-2026-00001', name: 'ALICE', father: 'FATHER', gender: 'Female', cls: '10' },
      { regNo: 'GVP-2026-00002', name: 'BOB', father: 'FATHER', gender: 'Male', cls: '9' }
    ]
  }
);
assert.equal(context.getSchoolStudents('', '', 'GSSS TEST', '', '9876543211').ok, false);
assert.equal(context.getSchoolStudents('Banswara', 'Ghatol', 'GSSS TEST', 'Test Village', '9999999999').ok, false);

// A new-only sheet may have had all obsolete columns after M deleted.
const narrowCurrent = current.slice();
narrowCurrent[8] = '9876501234';
const narrowStudentSheet = {
  getLastRow: () => 2,
  getMaxColumns: () => 13,
  getRange: () => ({ getValues: () => [fullRegistrationRow(narrowCurrent, 'GVP-2026-00001', 12).slice(0, 13)] })
};
context.getRegistrationSheet_ = () => narrowStudentSheet;
const narrowResult = context.getSchoolStudents(
  'Banswara', 'Ghatol', 'GSSS TEST', 'Test Village', '9876501234'
);
assert.equal(narrowResult.ok, true);
assert.equal(narrowResult.data[0].regNo, 'GVP-2026-00001');
assert.equal(Object.prototype.hasOwnProperty.call(narrowResult.data[0], 'omrNo'), false);

// Transliteration & spelling tolerance tests for Jawada / Javada / Jawda / Javda variants:
assert.equal(context.locMatch_('JAVADA', 'JAWADA'), true);
assert.equal(context.locMatch_('JAWDA', 'JAWADA'), true);
assert.equal(context.locMatch_('JAVDA', 'JAWADA'), true);
assert.equal(context.locMatch_('JAWAD', 'JAWADA'), true);
assert.equal(context.locMatch_('JAVAD', 'JAWADA'), true);
assert.equal(context.locMatch_('JAWADA', 'JAWAJA'), false);
assert.equal(context.locMatch_('JAWADA', 'JODHPUR'), false);

const jawadaSchoolKey = context.schoolNormalizeKey_('GSSS JAVADA');
assert.equal(context.schoolNormalizeKey_('GSSS JAWADA'), jawadaSchoolKey);
assert.equal(context.schoolNormalizeKey_('G.S.S.S. JAWADA'), jawadaSchoolKey);
assert.equal(context.schoolNormalizeKey_('G S S S JAWADA'), jawadaSchoolKey);
assert.equal(context.schoolNormalizeKey_('Govt Sr Sec School Jawada'), jawadaSchoolKey);
assert.equal(context.schoolNormalizeKey_('Govt. Sr. Sec. School Javada'), jawadaSchoolKey);
assert.equal(context.schoolNormalizeKey_('GSSS JAWDA'), jawadaSchoolKey);
assert.equal(context.schoolNormalizeKey_('GSSS JAVDA'), jawadaSchoolKey);
assert.equal(context.schoolNormalizeKey_('GSSS JAWAD'), jawadaSchoolKey);
assert.equal(context.schoolNormalizeKey_('GSSS JAVAD'), jawadaSchoolKey);

// Verify cross-spelling retrieval of students registered with JAVADA when queried with JAWADA:
const jawadaStudent = [
  'RAMESH', 'FATHER', 'Male', '10', 'Chittorgarh', 'Nimbahera',
  'GSSS JAVADA', 'JAVADA', '9876599999', '26000003', '2026', '', ''
];
const jawadaStudentSheet = {
  getLastRow: () => 2,
  getMaxColumns: () => 13,
  getRange: () => ({ getValues: () => [fullRegistrationRow(jawadaStudent, 'GVP-2026-00003', 12).slice(0, 13)] })
};
context.getRegistrationSheet_ = () => jawadaStudentSheet;
const jawadaResult = context.getSchoolStudents(
  'Chittorgarh', 'Nimbahera', 'GSSS JAWADA', 'JAWADA', '9876599999'
);
assert.equal(jawadaResult.ok, true);
assert.equal(jawadaResult.data.length, 1);
assert.equal(jawadaResult.data[0].regNo, 'GVP-2026-00003');
assert.equal(jawadaResult.data[0].name, 'RAMESH');

const jawdaResult = context.getSchoolStudents(
  'Chittorgarh', 'Nimbahera', 'Govt Sr Sec School Jawda', 'JAWDA', '9876599999'
);
assert.equal(jawdaResult.ok, true);
assert.equal(jawdaResult.data.length, 1);
assert.equal(jawdaResult.data[0].name, 'RAMESH');

// OMR backfill writes L for current rows and R for legacy rows without
// replacing the legacy Village value that also lives in column L.
const writes = {};
const backfillSheet = {
  getLastRow: () => 3,
  getMaxColumns: () => 19,
  getRange(row, column) {
    const key = `${row}:${column}`;
    const values = column === 1 ? [['GVP-2026-00001'], ['GVP-2026-00002']]
      : column === 3 ? [current, legacy]
      : column === 12 ? [[''], ['Test Village']]
      : column === 18 ? [['KEEP'], ['']]
      : null;
    assert.ok(values, `unexpected range ${key}`);
    return {
      getValues: () => values.map((r) => r.slice()),
      setValues(next) { writes[column] = next.map((r) => r.slice()); }
    };
  }
};
context.getSpreadsheet_ = () => ({});
context.getRegistrationSheet_ = () => backfillSheet;
context.ensureRegistrationHeaders_ = () => {};
context.backfillOmrNumbers();
assert.deepEqual(writes[12], [['26000001'], ['Test Village']]);
assert.deepEqual(writes[18], [['KEEP'], ['26000002']]);

for (const relative of ['site/index.html', 'site/pay.html']) {
  const htmlPath = path.join(root, relative);
  const html = fs.readFileSync(htmlPath, 'utf8');
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  for (const [, attrs, source] of scripts) {
    if (!/\bsrc\s*=/.test(attrs) && source.trim()) {
      new Function(source); // Syntax check each inline script.
    }
  }

  for (const [, ref] of html.matchAll(/\b(?:src|href)=["']([^"'#?:]+)["']/gi)) {
    const localPath = path.resolve(path.dirname(htmlPath), ref.split('?')[0]);
    assert.ok(fs.existsSync(localPath), `${relative} references missing file: ${ref}`);
  }
}

for (const file of fs.readdirSync(path.join(root, 'site', 'js')).filter((name) => name.endsWith('.js'))) {
  new Function(fs.readFileSync(path.join(root, 'site', 'js', file), 'utf8'));
}
if (fs.existsSync(path.join(root, 'site', 'sw.js'))) {
  new Function(fs.readFileSync(path.join(root, 'site', 'sw.js'), 'utf8'));
}

// Verify that the OCR UTR auto-extraction logic in site/pay.html correctly parses
// PhonePe, Google Pay, Paytm, BHIM and OCR O/0 transliteration variations.
const payHtmlContent = fs.readFileSync(path.join(root, 'site', 'pay.html'), 'utf8');
const fnMatch = payHtmlContent.match(/function extractUtr\(rawText\)[\s\S]*?return null;\s*\n  \}/);
const cleanFnMatch = payHtmlContent.match(/function cleanOcrText\(text\)[\s\S]*?return text[\s\S]*?\n  \}/);
assert.ok(fnMatch && cleanFnMatch, 'extractUtr or cleanOcrText missing in site/pay.html');
const extractUtrTestFn = new Function(cleanFnMatch[0] + '\n' + fnMatch[0] + '; return extractUtr;')();

const ocrSamples = [
  { text: 'Paid to Gau Vigyan Pariksha\nUPI Ref No: 425210984512\nState Bank of India', expected: '425210984512' },
  { text: 'Google Pay\nCompleted\nUPI transaction ID\n4252 1098 4512', expected: '425210984512' },
  { text: 'PhonePe\nTransaction ID T260908123456\nUTR: 42521O984512', expected: '425210984512' },
  { text: 'Paytm\nBank Ref: 4252-1098-4512', expected: '425210984512' },
  { text: 'BHIM UPI Payment\nBank Ref No. 425210984512', expected: '425210984512' }
];
ocrSamples.forEach((sample) => {
  assert.equal(extractUtrTestFn(sample.text), sample.expected, `OCR extraction failed for ${sample.text}`);
});

// Verify that selecting an item from autocomplete immediately closes the list
// and does not get stuck or reopen due to dispatched input events.
for (const file of ['site/pay.html', 'site/index.html']) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const start = html.indexOf('function createAutocomplete(inputEl,listEl){');
  const end = html.indexOf('var schoolAC=createAutocomplete', start);
  assert.ok(start > -1 && end > -1, `createAutocomplete not found in ${file}`);
  const code = html.substring(start, end).trim();

  let inputVal = '';
  let listHidden = true;
  let listChildren = [];
  const listeners = {};

  const inputEl = {
    get value() { return inputVal; },
    set value(v) { inputVal = v; },
    offsetTop: 0, offsetHeight: 30,
    setAttribute() {},
    addEventListener(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); },
    dispatchEvent(e) { (listeners[e.type] || []).forEach((fn) => fn(e)); }
  };

  const listEl = {
    classList: {
      contains(c) { return c === 'hidden' ? listHidden : false; },
      add(c) { if (c === 'hidden') listHidden = true; },
      remove(c) { if (c === 'hidden') listHidden = false; }
    },
    setAttribute() {},
    style: {},
    get children() { return listChildren; },
    set innerHTML(v) { if (v === '') listChildren = []; },
    appendChild(d) { listChildren.push(d); }
  };

  const globalScope = {
    hide(el) { el.classList.add('hidden'); },
    show(el) { el.classList.remove('hidden'); },
    translitMatch(a, b) { return a.toLowerCase().includes(b.toLowerCase()); },
    document: { createElement() { return { setAttribute() {}, addEventListener(e, cb) { this['on' + e] = cb; }, className: '', textContent: '' }; }, activeElement: inputEl },
    setTimeout(fn) { fn(); },
    Event: function (t) { this.type = t; }
  };

  const fn = new Function('inputEl', 'listEl', 'hide', 'show', 'translitMatch', 'document', 'setTimeout', 'Event', `${code}\n return createAutocomplete(inputEl, listEl);`);
  const ac = fn(inputEl, listEl, globalScope.hide, globalScope.show, globalScope.translitMatch, globalScope.document, globalScope.setTimeout, globalScope.Event);

  ac.setItems(['GSSS KOTRI', 'GSSS MANDAL']);
  inputEl.value = 'GSSS';
  inputEl.dispatchEvent({ type: 'input' });
  assert.equal(listHidden, false, `Dropdown should open on typing in ${file}`);
  assert.equal(listChildren.length, 2);

  // Click on first item
  listChildren[0].onmousedown({ preventDefault() {} });
  assert.equal(listHidden, true, `Dropdown must be closed immediately after selection in ${file}`);
  assert.equal(inputVal, 'GSSS KOTRI');
}

// Exercise the browser-independent PDF path with enough rows to force three
// pages. This catches broken PDF object numbering and page-splitting changes
// without writing a test artifact to the repository.
const pdfSource = fs.readFileSync(path.join(root, 'site', 'js', 'pdf-report.js'), 'utf8');
const pdfContext = vm.createContext({
  TextEncoder,
  atob: (b64) => Buffer.from(b64, 'base64').toString('binary')
});
vm.runInContext(pdfSource, pdfContext, { filename: 'site/js/pdf-report.js' });

const pdfStudents = Array.from({ length: 37 }, (_, index) => ({
  regNo: `GVP-2026-${String(index + 1).padStart(5, '0')}`,
  name: `STUDENT ${index + 1}`,
  father: `GUARDIAN ${index + 1}`,
  gender: index % 2 ? 'Female' : 'Male',
  cls: String(6 + (index % 7))
}));

pdfContext.GVP_PDF.buildStudentReport({
  school: {
    school: 'GSSS TEST SCHOOL', village: 'TEST VILLAGE',
    block: 'GHATOL', district: 'BANSWARA'
  },
  students: pdfStudents
}).then((bytes) => {
  const binary = Buffer.from(bytes).toString('latin1');
  assert.ok(binary.startsWith('%PDF-1.4'));
  assert.equal((binary.match(/\/Type \/Page\b/g) || []).length, 3);
  assert.match(binary, /GVP-2026-00037/);
  assert.doesNotMatch(binary, /OMR No\.?/i);
  console.log('All static, schema-compatibility, and PDF checks passed.');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
