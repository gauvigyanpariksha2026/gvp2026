const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const backendSource = fs.readFileSync(path.join(root, 'apps-script', 'Code.gs'), 'utf8');
const context = vm.createContext({ console });
vm.runInContext(backendSource, context, { filename: 'apps-script/Code.gs' });
const originalGetRegistrationSheet = context.getRegistrationSheet_;
const securityProperties = new Map();
context.PropertiesService = { getScriptProperties: () => ({
  getProperty: (key) => securityProperties.get(key) || null,
  setProperty: (key, value) => securityProperties.set(key, value)
}) };

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

// Pending public registrations must not affect bills or authorize roster access.
const statusValues = [['Verified'], ['Pending']];
const verifiedCurrent = current.slice();
verifiedCurrent[8] = '9876501234';
const statusAwareStudentSheet = {
  getLastRow: () => 3,
  getMaxColumns: () => 20,
  getRange(row, column) {
    if (row === 1 && column === 20) return { getValue: () => 'Registration Status' };
    if (column === 20) return { getValues: () => statusValues };
    const rows = [
      fullRegistrationRow(verifiedCurrent, 'GVP-2026-00001', 12),
      fullRegistrationRow(legacy, 'GVP-2026-00002', 18)
    ];
    if (column === 7) return { getValues: () => rows.map((value) => value.slice(6, 12)) };
    return { getValues: () => rows };
  }
};
context.getRegistrationSheet_ = () => statusAwareStudentSheet;
assert.equal(context.getSchoolStudents('Banswara', 'Ghatol', 'GSSS TEST', 'Test Village', '9876543211').ok, false);
assert.equal(context.getSchoolStudents('Banswara', 'Ghatol', 'GSSS TEST', 'Test Village', '9876501234').data.length, 1);
assert.equal(context.countSchoolStudents_('Banswara', 'Ghatol', 'GSSS TEST', 'Test Village', statusAwareStudentSheet), 1);
assert.equal(context.registrationVerified_('Rejected'), false);
assert.equal(context.registrationVerified_('unexpected'), false);
assert.equal(context.registrationVerified_(''), true);
assert.equal(securityProperties.get('REG_STATUS_SECURITY_ENABLED'), '1');

// registrationStatuses_ self-healing: once the security flag is already
// on, a missing/blank column T is treated as an accidental edit and
// repaired in place, rather than zeroing out every school at once. A
// column T holding some OTHER non-blank text is left untouched and still
// fails closed — that is the legacy-workbook scenario the check exists for.
function makeSelfHealSheet(maxColumns, header, dataValues) {
  const state = { maxColumns, header, data: dataValues.slice() };
  return {
    __state: state,
    getMaxColumns: () => state.maxColumns,
    getLastRow: () => state.data.length + 1,
    insertColumnsAfter: (after, count) => { state.maxColumns += count; },
    getRange(row, col, numRows) {
      if (numRows === undefined) {
        return { getValue: () => state.header, setValue: (v) => { state.header = v; } };
      }
      return { getValues: () => state.data.map((v) => [v]) };
    }
  };
}
const missingColumnSheet = makeSelfHealSheet(19, '', ['', '']);
assert.deepEqual(
  JSON.parse(JSON.stringify(context.registrationStatuses_(missingColumnSheet, 2))),
  [[''], ['']]
);
assert.equal(missingColumnSheet.__state.header, 'Registration Status');
assert.ok(missingColumnSheet.__state.maxColumns >= 20);

const blankHeaderSheet = makeSelfHealSheet(20, '', ['Verified']);
assert.deepEqual(
  JSON.parse(JSON.stringify(context.registrationStatuses_(blankHeaderSheet, 1))),
  [['Verified']]
);
assert.equal(blankHeaderSheet.__state.header, 'Registration Status');

const unrelatedColumnSheet = makeSelfHealSheet(20, 'Notes', ['anything']);
assert.deepEqual(
  JSON.parse(JSON.stringify(context.registrationStatuses_(unrelatedColumnSheet, 1))),
  [['Invalid']]
);
assert.equal(unrelatedColumnSheet.__state.header, 'Notes');
assert.equal(context.UTILITY_SHEETS_['Payments'], true);
assert.equal(context.UTILITY_SHEETS_['School Dues'], true);
assert.equal(context.UTILITY_SHEETS_['Errors'], true);
const insertedRegistrationSheet = { marker: 'new registration sheet' };
assert.equal(originalGetRegistrationSheet({
  getSheetByName: () => null,
  getSheets: () => [{ getName: () => 'Payments' }],
  insertSheet: (name) => {
    assert.equal(name, 'Registrations');
    return insertedRegistrationSheet;
  }
}), insertedRegistrationSheet);

// The rate limiter retains a global, non-payload-derived ceiling, so rotating
// mobile/school input cannot make accepted registration volume unbounded.
const rateProperties = new Map();
const rateCache = new Map();
context.PropertiesService = { getScriptProperties: () => ({
  getProperty: (key) => rateProperties.get(key) || null,
  setProperty: (key, value) => rateProperties.set(key, value)
}) };
context.CacheService = { getScriptCache: () => ({
  get: (key) => rateCache.get(key) || null,
  put: (key, value) => rateCache.set(key, value)
}) };
const rateData = { mobile: '9876501234', district: 'Banswara', block: 'Ghatol', school: 'GSSS TEST', village: 'Test Village' };
assert.equal(context.registrationWriteAllowed_(rateData), true);
rateProperties.set('REG_RATE_WINDOW_START', String(Math.floor(Date.now() / 1000)));
rateProperties.set('REG_RATE_WINDOW_COUNT', String(context.REG_GLOBAL_WINDOW_MAX_));
assert.equal(context.registrationWriteAllowed_({ ...rateData, mobile: '9876501235' }), false);
const submitRegistrationSource = backendSource.slice(
  backendSource.indexOf('function submitRegistration(data)'),
  backendSource.indexOf('function registrationRow_', backendSource.indexOf('function submitRegistration(data)'))
);
assert.ok(
  submitRegistrationSource.indexOf('duplicateRegistrationExists_(sheet, data.name, data.father, data.mobile)') <
    submitRegistrationSource.indexOf('registrationWriteAllowed_(data)'),
  'duplicate rejection must occur before registration quota is charged'
);

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
assert.equal(context.locMatch_('Jawada 2', 'Javada II'), true);
assert.equal(context.locMatch_('Javda-2', 'Jawada II'), true);
assert.equal(context.locMatch_('Jawada 1', 'Jawada II'), false);
assert.equal(context.schoolMatch_('Govt Senior Secondary School Jawada 2', 'GSSS Javda II'), true);
assert.equal(context.schoolMatch_('Govt Senior Secondary School Jawada 1', 'GSSS Javda II'), false);
assert.equal(context.locMatch_('Kothariya 2', 'Kothriya II'), true);
assert.equal(context.locMatch_('Jawada 2', 'JawadaII'), true);
assert.equal(context.locMatch_('Jawada 4', 'Jawada IV'), true);
assert.equal(context.schoolMatch_('Govt Senior Secondary School Kothariya 2', 'GSSS Kothriya II'), true);
assert.equal(context.schoolMatch_('Govt Senior Secondary School Kothariya 1', 'GSSS Kothriya II'), false);
// Actual live-data formats, including a missing separator before the place.
assert.equal(context.schoolMatch_('PM SHRI GOVERNMENT SENIOR SECONDARY SCHOOL JAWADA 2', 'PM SHRI GSSS.SCHOOLJAWADA-II'), true);
assert.equal(context.schoolMatch_('Govt Senior Secondary School Jawada 2', 'GSSSSCHOOLJAWADA-2'), true);
// Common Rajasthan abbreviations and synonyms
assert.equal(context.schoolMatch_('Govt Girls Senior Secondary School Nimbahera', 'GGSSS Nimbahera'), true);
assert.equal(context.schoolMatch_('Govt Balika Senior Secondary School Nimbahera', 'GGSSS Nimbahera'), true);
assert.equal(context.schoolMatch_('Rajkiya Senior Secondary School Jawada', 'Govt Senior Secondary School Jawada'), true);
assert.equal(context.schoolMatch_('Govt Hr Sec School Jawada', 'Govt Senior Secondary School Jawada'), true);
assert.equal(context.schoolMatch_('Kendriya Vidyalaya Chittorgarh', 'KV Chittorgarh'), true);
assert.equal(context.schoolMatch_('Jawahar Navodaya Vidyalaya Mandaphia', 'JNV Mandaphia'), true);
assert.equal(context.schoolMatch_('Kasturba Gandhi Balika Vidyalaya Ghatol', 'KGBV Ghatol'), true);
assert.equal(context.schoolMatch_('Mahatma Gandhi Govt School Banswara', 'MGGS Banswara'), true);
// Acronyms immediately followed by numbers / Roman numerals without place name
assert.equal(context.schoolMatch_('Govt Senior Secondary School 1', 'G.S.S.S. 1'), true);
assert.equal(context.schoolMatch_('Govt Senior Secondary School 2', 'G.S.S.S. 2'), true);
assert.equal(context.schoolMatch_('Govt Senior Secondary School 1', 'G.S.S.S. I'), true);
assert.equal(context.schoolMatch_('Govt Senior Secondary School 2', 'G.S.S.S. II'), true);
assert.equal(context.locMatch_('JAWADA', 'JAWAJA'), false);

// A future registration with a matching variant is saved using the dominant
// existing spelling, so the source sheet stops accumulating new variants.
const canonicalLocationSheet = {
  getLastRow: () => 4,
  getMaxColumns: () => 13,
  getRange: () => ({ getValues: () => [
    ['Chittorgarh', 'Nimbahera', 'PM SHRI GSS SCHOOL JAWADA 2', 'JAWADA 2', '', ''],
    ['Chittorgarh', 'Nimbahera', 'PM SHRI GSS SCHOOL JAWADA 2', 'JAWADA 2', '', ''],
    ['Chittorgarh', 'Nimbahera', 'P M SHRI GSS SCHOOL,JAWADA II', 'JAWADA II', '', '']
  ] })
};
assert.deepEqual(
  JSON.parse(JSON.stringify(context.canonicalRegistrationLocation_(
    canonicalLocationSheet, 'Chittorgarh', 'Nimbahera', 'P M SHRI GSS SCHOOL JAWADA-II', 'JAWADA II'
  ))),
  { school: 'PM SHRI GSS SCHOOL JAWADA 2', village: 'JAWADA 2', changed: true }
);
assert.equal(context.locMatch_('JAWADA', 'JODHPUR'), false);

// Case-insensitive and transliteration tolerance in validLocation_ and getBlocks:
assert.equal(context.validLocation_('banswara', 'ghatol'), '');
assert.equal(context.validLocation_('BANSWARA', 'GHATOL'), '');
assert.equal(context.validLocation_('Banswara', 'Ghatol'), '');
assert.equal(context.validLocation_('unknown', 'ghatol'), 'जिला सही नहीं है / Select a valid district');
assert.equal(context.validLocation_('banswara', 'unknown'), 'ब्लॉक सही नहीं है / Select a valid block');
assert.deepEqual(context.getBlocks('banswara'), context.getBlocks('Banswara'));
assert.deepEqual(context.getBlocks('BANSWARA'), context.getBlocks('Banswara'));
assert.equal(context.getBlocks('unknown').length, 0);

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

// Hindi school acronyms and synonyms:
assert.equal(context.schoolNormalizeKey_('Rajkiya Uchh Madhyamik Vidyalaya Jawada'), jawadaSchoolKey);
assert.equal(context.schoolNormalizeKey_('Raumavi Jawada'), jawadaSchoolKey);
assert.equal(context.schoolNormalizeKey_('Raumaavi Jawada'), jawadaSchoolKey);
assert.equal(context.schoolNormalizeKey_('R.U.M.V. Jawada'), jawadaSchoolKey);

// Institutional modifier word order invariance (e.g. GGSSS Kotri):
const ggsssKotriKey = context.schoolNormalizeKey_('GGSSS KOTRI');
assert.equal(context.schoolNormalizeKey_('Govt Girls Sr Sec School Kotri'), ggsssKotriKey);
assert.equal(context.schoolNormalizeKey_('Govt Sr Sec Girls School Kotri'), ggsssKotriKey);
assert.equal(context.schoolNormalizeKey_('Rajkiya Balika Uchh Madhyamik Vidyalaya Kotri'), ggsssKotriKey);
assert.equal(context.schoolNormalizeKey_('Raubamavi Kotri'), ggsssKotriKey);
assert.equal(context.schoolNormalizeKey_('R.B.U.M.V. Kotri'), ggsssKotriKey);

// GSS (3-letter) is treated the same as GSSS (4-letter) — a dropped-S
// shorthand for "Govt Sr Sec School" is far more common in this data than a
// genuine, distinct non-senior "Govt Sec School" sharing a place name.
assert.equal(context.schoolMatch_('Government Senior Secondary School Padwa', 'G.S.S.SCHOOL PADWA'), true);
assert.equal(context.schoolMatch_('G.S.S.SCHOOL PADWA', 'GSSS PADWA'), true);
assert.equal(context.schoolMatch_('Govt Girls Sr Sec School Kotri', 'GGSS Kotri'), true);
assert.equal(context.schoolMatch_('Govt Boys Sr Sec School Kotri', 'GBSS Kotri'), true);

// "Government" typos (dropped/transposed letter) must not fragment a
// school's roster into separate spellings — a genuinely different long
// word should NOT get pulled in by the same fuzzy match.
assert.equal(context.schoolMatch_('Goverment Senior Secondary School Padwa', 'Government Senior Secondary School Padwa'), true);
assert.equal(context.schoolMatch_('Govermnet Senior Secondary School Padwa', 'Government Senior Secondary School Padwa'), true);
assert.equal(context.schoolMatch_('Govenment Senior Secondary School Padwa', 'Government Senior Secondary School Padwa'), true);
assert.equal(context.schoolMatch_('Generation Senior Secondary School Padwa', 'Government Senior Secondary School Padwa'), false);

// The same typo tolerance generalizes to every spelled-out boilerplate word
// in the synonym table, not just "government" — a one-off patch per word
// as each gets reported would never keep up with real registration data.
assert.equal(context.schoolMatch_('Govt Seconday School Padwa', 'Govt Secondary School Padwa'), true);
assert.equal(context.schoolMatch_('Govt Scondary School Padwa', 'Govt Secondary School Padwa'), true);
assert.equal(context.schoolMatch_('Govt Senoir Sec School Padwa', 'Govt Senior Sec School Padwa'), true);
assert.equal(context.schoolMatch_('Govt Sr Sec Shool Padwa', 'Govt Sr Sec School Padwa'), true);
assert.equal(context.schoolMatch_('Govt Primry School Padwa', 'Govt Primary School Padwa'), true);
assert.equal(context.schoolMatch_('Govt Sr Sec School Girsl Padwa', 'Govt Sr Sec School Girls Padwa'), true);
// A short, genuinely different word must never get swept up by the fuzzy
// fallback — only 4+ letter spelled-out forms are eligible targets.
assert.equal(context.schoolMatch_('Sr Sec School Padwa', 'Up Pri School Padwa'), false);
assert.equal(context.schoolMatch_('Govt Boys School Padwa', 'Govt Girls School Padwa'), false);

// Self-check: no two genuinely different canonical words in the synonym
// table are ever within each other's fuzzy-typo threshold — every word
// this fallback ever matches against must be a safe, same-target variant.
// This guards the table itself as new entries get added over time.
(function () {
  var canon = context.SCHOOL_WORD_CANON_;
  var synonyms = context.SCHOOL_WORD_SYNONYMS_;
  for (var i = 0; i < canon.length; i++) {
    for (var j = i + 1; j < canon.length; j++) {
      var a = canon[i], b = canon[j];
      if (synonyms[a] === synonyms[b]) continue; // same target: safe to be close
      var maxDist = Math.min(context.schoolWordTypoMaxDist_(a.length), context.schoolWordTypoMaxDist_(b.length));
      var d = context.levenshtein_(a, b);
      assert.ok(d > maxDist, 'Fuzzy school-word table has an unsafe collision: "' + a + '" vs "' + b + '" (dist ' + d + ', threshold ' + maxDist + ')');
    }
  }
})();

// PM-SHRI Scheme prefix tolerance:
assert.equal(context.schoolMatch_('PM SHRI GSSS JAWADA', 'GSSS JAWADA'), true);
assert.equal(context.schoolMatch_('GSSS JAWADA', 'PM SHRI GSSS JAWADA'), true);
assert.equal(context.schoolMatch_('PM-SHRI GGSSS KOTRI', 'GGSSS KOTRI'), true);
assert.equal(context.schoolMatch_('PM SHRI GSSS JAWADA', 'GSSS KOTRI'), false);

// Consonant aspiration tolerance in location matching:
assert.equal(context.locMatch_('Kotri', 'Kothri'), true);
assert.equal(context.locMatch_('Kotariya', 'Kothariya'), true);
assert.equal(context.locMatch_('Mandaphia', 'Mandafia'), true);
assert.equal(context.locMatch_('Bhilwara', 'Bilwara'), true);
assert.equal(context.locMatch_('Ghatol', 'Gatol'), true);
assert.equal(context.locMatch_('Dhamnod', 'Damnod'), true);
assert.equal(context.locMatch_('Chhoti Sadri', 'Choti Sadri'), true);
// Discrimination preservation:
assert.equal(context.locMatch_('Jawada', 'Jawaja'), false);
assert.equal(context.locMatch_('Asind', 'Amet'), false);

// A generic "village" filler word carries no identity of its own, so
// "Padwa", "Gao Padwa", "Gaon Padwa", "Gram Padwa" and "Village Padwa"
// must all key the same place — while a real place name that merely
// starts with those letters ("Gaonri") must stay distinct.
assert.equal(context.locMatch_('Padwa', 'Gao Padwa'), true);
assert.equal(context.locMatch_('Padwa', 'Gaon Padwa'), true);
assert.equal(context.locMatch_('Padwa', 'Gram Padwa'), true);
assert.equal(context.locMatch_('Padwa', 'Village Padwa'), true);
assert.equal(context.locMatch_('Gao Padwa', 'Gaon Padwa'), true);
assert.equal(context.locMatch_('Padwa', 'Gaonri'), false);

// Short village collision safeguards in villageSimilar_:
assert.equal(context.villageSimilar_('Bor', 'Mor'), false);
assert.equal(context.villageSimilar_('Bor', 'Dor'), false);
assert.equal(context.villageSimilar_('Pee', 'Dee'), false);
assert.equal(context.villageSimilar_('Pal', 'Mal'), false);
assert.equal(context.villageSimilar_('Pal', 'Palasoda'), false);
assert.equal(context.villageSimilar_('Bor', 'Boria'), false);
assert.equal(context.villageSimilar_('Jawada', 'Javada'), true);
assert.equal(context.villageSimilar_('Jawada', 'Jawada Khurd'), true);
assert.equal(context.villageSimilar_('Village Jawada', 'Jawada'), true);

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

const jawadaNumberStudent = jawadaStudent.slice();
jawadaNumberStudent[7] = 'Javda-2';
jawadaNumberStudent[8] = '9876588888';
const jawadaNumberSheet = {
  getLastRow: () => 2,
  getMaxColumns: () => 13,
  getRange: () => ({ getValues: () => [fullRegistrationRow(jawadaNumberStudent, 'GVP-2026-00004', 12).slice(0, 13)] })
};
context.getRegistrationSheet_ = () => jawadaNumberSheet;
const jawadaNumberResult = context.getSchoolStudents(
  'Chittorgarh', 'Nimbahera', 'Govt Sr Sec School Javda', 'Jawada II', '9876588888'
);
assert.equal(jawadaNumberResult.ok, true);
assert.equal(jawadaNumberResult.data.length, 1);

// Sanitized +91 phone lookup in getSchoolStudents:
const sanitizedPhoneResult = context.getSchoolStudents(
  'Chittorgarh', 'Nimbahera', 'Govt Sr Sec School Javda', 'Jawada II', '+91 98765 88888'
);
assert.equal(sanitizedPhoneResult.ok, true);
assert.equal(sanitizedPhoneResult.data.length, 1);

// Case-insensitive payment status verification (PAID / paid / REPORTED / reported):
const mockPaymentSheet = {
  getLastRow: () => 3,
  getRange: () => ({
    getValues: () => [
      ['Chittorgarh', 'Nimbahera', 'GSSS JAWADA', '10', '500', '300', 'PAID', 'CLERK', '123456789012', '9876599999', '', '', 'JAWADA'],
      ['Chittorgarh', 'Nimbahera', 'GSSS JAWADA', '10', '500', '200', 'paid', 'CLERK', '123456789013', '9876599999', '', '', 'JAWADA']
    ]
  })
};
assert.equal(context.sumSchoolPaid_('Chittorgarh', 'Nimbahera', 'GSSS JAWADA', 'JAWADA', mockPaymentSheet), 500);

const mockReportedSheet = {
  getLastRow: () => 2,
  getRange: () => ({
    getValues: () => [
      ['Chittorgarh', 'Nimbahera', 'GSSS JAWADA', '10', '500', '150', 'REPORTED', 'CLERK', '123456789014', '9876599999', '', '', 'JAWADA']
    ]
  })
};
assert.equal(context.sumSchoolReported_('Chittorgarh', 'Nimbahera', 'GSSS JAWADA', 'JAWADA', mockReportedSheet), 150);

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
      if (/type=["']application\/ld\+json["']/i.test(attrs)) {
        JSON.parse(source); // Syntax check JSON-LD scripts.
      } else {
        new Function(source); // Syntax check each inline JS script.
      }
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

// Verify that site/js/locations.js matches apps-script/Code.gs DISTRICT_BLOCKS exactly
const locCode = fs.readFileSync(path.join(root, 'site', 'js', 'locations.js'), 'utf8');
const locContext = vm.createContext({});
vm.runInContext(locCode, locContext);
assert.deepEqual(
  JSON.parse(JSON.stringify(locContext.GVP_LOCATIONS)),
  JSON.parse(JSON.stringify(context.DISTRICT_BLOCKS)),
  'site/js/locations.js GVP_LOCATIONS must match apps-script/Code.gs DISTRICT_BLOCKS'
);
// sw.js is a kill switch, not an offline cache: it must unregister itself
// and clear every cache it created (rather than keep serving stale pages
// to already-registered visitors), and neither page may register a new
// one so it can never install for a first-time visitor.
if (fs.existsSync(path.join(root, 'site', 'sw.js'))) {
  const swCode = fs.readFileSync(path.join(root, 'site', 'sw.js'), 'utf8');
  new Function(swCode);
  assert.ok(/self\.registration\.unregister\(\)/.test(swCode), 'site/sw.js must unregister itself');
  assert.ok(/caches\.delete\(/.test(swCode), 'site/sw.js must clear caches it created');
  assert.ok(!/STATIC_ASSETS/.test(swCode), 'site/sw.js should no longer pre-cache an app shell');
}
for (const page of ['index.html', 'pay.html']) {
  const pageSrc = fs.readFileSync(path.join(root, 'site', page), 'utf8');
  assert.ok(!/serviceWorker\.register/.test(pageSrc), `site/${page} must not register a service worker`);
}

// Verify that site/manifest.json is valid JSON and referenced icons exist
const manifestPath = path.join(root, 'site', 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
assert.ok(manifest.name && manifest.start_url, 'site/manifest.json must have name and start_url');
(manifest.icons || []).forEach((icon) => {
  const iconPath = path.join(root, 'site', icon.src);
  assert.ok(fs.existsSync(iconPath), `Manifest icon not found on disk: ${icon.src}`);
});

// Verify that LAST_BILL_LOOKUP_VILLAGE is properly declared in site/pay.html
const payHtmlContent = fs.readFileSync(path.join(root, 'site', 'pay.html'), 'utf8');
assert.match(payHtmlContent, /var\s+LAST_BILL_LOOKUP_VILLAGE\s*=/, 'LAST_BILL_LOOKUP_VILLAGE must be explicitly declared with var in site/pay.html');
assert.doesNotMatch(payHtmlContent, /text\.innerHTML\s*=\s*['"]चयनित विद्यालय:/, 'updateSchoolStatusBadge must not use innerHTML to interpolate school/village text');
assert.doesNotMatch(payHtmlContent, /params\.get\(['"]mobile['"]\)/, 'payment page must not read mobile from URL');
assert.match(payHtmlContent, /GVP_API\.post\(['"]getSchoolStudents['"]/, 'school access code must be sent in a POST body');
assert.match(backendSource, /action === ['"]getSchoolStudents['"][\s\S]*requires POST/, 'student-list GET requests must be rejected');
assert.match(backendSource, /var amountReportable = amountDue;/, 'unverified payment reports must not reserve the balance');
assert.doesNotMatch(backendSource, /reportableAmount <= 0/, 'pending reports must not block later reports');

// Verify offline detection and banner presence in site/index.html, site/pay.html, and site/js/api.js
const apiJsContent = fs.readFileSync(path.join(root, 'site', 'js', 'api.js'), 'utf8');
assert.match(payHtmlContent, /id=["']offlineBar["']/, 'site/pay.html must include offlineBar banner');
assert.match(payHtmlContent, /window\.addEventListener\(['"]offline['"]/, 'site/pay.html must listen for offline event');
assert.match(apiJsContent, /navigator\.onLine\s*===\s*false/, 'site/js/api.js must check navigator.onLine');

// Verify that registerAnotherBtn in site/index.html properly re-enables submitBtn
const indexHtmlContent = fs.readFileSync(path.join(root, 'site', 'index.html'), 'utf8');
assert.doesNotMatch(indexHtmlContent, /mobile\s*:\s*data\.mobile/, 'registration-to-payment URL must not contain mobile');
assert.match(indexHtmlContent, /id=["']offlineBar["']/, 'site/index.html must include offlineBar banner');
assert.match(indexHtmlContent, /window\.addEventListener\(['"]offline['"]/, 'site/index.html must listen for offline event');

// Verify canonical link and Schema.org JSON-LD structured data in index.html and pay.html
assert.match(indexHtmlContent, /<link\s+rel=["']canonical["']\s+href=["']\.\/["']/, 'site/index.html must have canonical link');
assert.match(payHtmlContent, /<link\s+rel=["']canonical["']\s+href=["']pay\.html["']/, 'site/pay.html must have canonical link');

const indexJsonLdMatch = indexHtmlContent.match(/<script type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/);
assert.ok(indexJsonLdMatch, 'site/index.html must contain JSON-LD script');
const indexJsonLd = JSON.parse(indexJsonLdMatch[1]);
assert.equal(indexJsonLd['@context'], 'https://schema.org');
assert.ok(Array.isArray(indexJsonLd['@graph']), 'site/index.html JSON-LD must contain @graph array');

const payJsonLdMatch = payHtmlContent.match(/<script type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/);
assert.ok(payJsonLdMatch, 'site/pay.html must contain JSON-LD script');
const payJsonLd = JSON.parse(payJsonLdMatch[1]);
assert.equal(payJsonLd['@context'], 'https://schema.org');
assert.equal(payJsonLd['@type'], 'WebPage');
const regAnotherBlock = indexHtmlContent.substring(
  indexHtmlContent.indexOf("$('registerAnotherBtn').addEventListener"),
  indexHtmlContent.indexOf('// Smart Phone Number Paste Cleaner')
);
assert.ok(regAnotherBlock.includes("$('submitBtn').disabled=false;"), 'registerAnotherBtn must re-enable submitBtn');
assert.ok(regAnotherBlock.includes("$('btnSpin').classList.add('hidden');"), 'registerAnotherBtn must hide btnSpin');

// Verify that the OCR UTR auto-extraction logic in site/pay.html correctly parses
// PhonePe, Google Pay, Paytm, BHIM and OCR O/0 transliteration variations.
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

  // Click or tap on first item
  assert.equal(typeof listChildren[0].ontouchstart, 'function', `Dropdown items must attach touchstart listener in ${file}`);
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
