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
