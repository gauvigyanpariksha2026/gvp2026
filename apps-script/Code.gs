/**
 * Gau Vigyan Pariksha 2026 — JSON API backend
 *
 * This file is a plain Apps Script JSON API. It has no HTML of its own —
 * the registration and payment pages are a separate static website
 * (see the /site folder) that calls this API over fetch().
 *
 * Deploy → New deployment → Web app
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * After deploying, copy the "Web app URL" (ends in /exec) and paste it
 * into API_URL at the top of site/js/api.js.
 *
 * Read actions  (GET  ?action=NAME&...params)
 *   getDistricts, getLocations, getBlocks, getSchoolBill, getSchools
 * Write actions (POST body: {"action":"NAME","payload":{...}})
 *   submitRegistration, reportSchoolPayment
 *
 * Unexpected server-side errors (not normal validation rejections) are
 * appended to a hidden "Errors" sheet tab by logError_ — check there if
 * submissions seem to be failing without a clear reason.
 */

// For a spreadsheet-bound Apps Script, the attached spreadsheet is used first.
// For a standalone Apps Script, replace this with the ID between /d/ and /edit
// in your Google Sheet URL.
var SHEET_ID = '1EtLPtFLLE7qHZuSCROdnRO-ZgfaDTX1RFRF4s77Mz6A';

var FEE_PER_STUDENT = 30;
var UPI_VPA = 'SHREEDEVNARAYAN@SBI';
var UPI_NAME = 'SHREE DEV NARAYAN GOSHALA SAM';
var ACADEMIC_YEAR = '2026';

// Only the fields the current form actually collects. (Mother, DOB, PIN,
// Address, WhatsApp, Email were dropped from the form and are no longer
// reserved as columns — see ensureRegistrationHeaders_.)
var REG_HEADERS_ = [
  'Reg', 'Time', 'Name', 'Father', 'Gender', 'Class',
  'District', 'Block', 'School', 'Village', 'Mobile', 'OMR Roll', 'Year'
];
var PAY_HEADERS_ = ['District', 'Block', 'School', 'Students', 'Amount Due', 'Amount Paid', 'Status', 'Payer Name', 'UTR', 'Payer Mobile', 'Reported At', 'Books', 'Village'];
var DUES_HEADERS_ = ['District', 'Block', 'School', 'Students', 'Amount', 'Paid', 'Balance', 'Status', 'Books', 'Village'];
var UTILITY_SHEETS_ = { 'Payments': true, 'School Dues': true, 'Errors': true };

function getSpreadsheet_() {
  // A bound project should not fail merely because an old copied ID remains here.
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;

  var id = String(SHEET_ID || '').trim();
  if (!id) {
    throw new Error('Spreadsheet is not configured. Set SHEET_ID to the ID from your Google Sheet URL.');
  }

  try {
    return SpreadsheetApp.openById(id);
  } catch (e) {
    throw new Error(
      'Cannot open spreadsheet ID ' + id +
      '. Replace SHEET_ID with the ID from your Google Sheet URL and make sure the script account has Editor access.'
    );
  }
}

var DISTRICT_BLOCKS = {
  "Banswara": ["Ghatol", "Chotisarvan", "Talwara", "Garhi", "Anandpuri", "Bagidora", "Ganodha", "Chhoti Sarwa", "Sajjangarh", "Kushalgarh", "Banswara", "Arthuna", "Gangadtalai"],
  "Dungarpur": ["Bicchiwara", "Dungarpur", "Aspur", "Sagwara", "Simalwara", "Chikhali", "Dovda", "Galiyakot", "Jhonthari", "Sabla", "Paldeval", "Gamdi Ahara"],
  "Udaipur": ["Gogunda", "Badgaon", "Mavli", "Bhinder", "Girwa", "Kotra", "Nayagaon", "Vallabhnagar", "Khemli", "Devla", "Jhadol", "Kherwara", "Rishabhdev", "Phalasiya", "Sayra", "Kurabad"],
  "Salumbar": ["Sarada", "Salumbar", "Lasadiya", "Semari", "Jhallara", "Jaisamand"],
  "Rajsamand": ["Bhim", "Deogarh", "Amet", "Kumbhalgarh", "Khamnor", "Rajsamand", "Railmagra", "Delwada"],
  "Chittorgarh": ["Rashmi", "Gangrar", "Begun", "Bhainsroadgarh", "Chittorgarh", "Kapasan", "Bhopal Sagar", "Dungla", "Bhadesar", "Nimbahera", "Badi Sadri"],
  "Pratapgarh": ["Peepalkhoot", "Dhariyawad", "Chhoti Sadri", "Pratapgarh", "Arnod", "Dalot", "Suhagpura", "Dhamotar"],
  "Bhilwara": ["Asind", "Hurda", "Shahpura", "Banera", "Mandal", "Raipur", "Badnor", "Kareda", "Sahada", "Suwana", "Kotri", "Jahajpur", "Mandalgarh", "Bijoliya"],
  "Ajmer": ["Kishangarh", "Arain", "Sri Nagar", "Pisangan", "Bhinai", "Kekri", "Ajmer (U)", "Sarwar", "Ajmer Rural", "Sawar"],
  "Beawar": ["Jaitaran", "Raipur", "Jawaja", "Masooda", "Bhim (Beawar)", "Badnor (Beawar)"],
  "Bundi": ["Hindoli", "K.Patan", "Nainwa", "Talera", "Bundi"],
  "Kota": ["Itawa", "Sultanpur", "Ladpura", "Khairabad", "Sangod", "Kota"],
  "Baran": ["Baran", "Anta", "Atru", "Chhabra", "Chhipabarod", "Kishanganj", "Shahbad", "Mangrol"],
  "Jhalawar": ["Khanpur", "Jhalarapatan", "Manoharthana", "Bakani", "Sunel", "Dag", "Aklera", "Bhawanimandi"]
};

/** GET requests: ?action=getDistricts | getBlocks&district=... */
function doGet(e) {
  var params = (e && e.parameter) || {};
  var action = String(params.action || '');
  if (!action) {
    return jsonOut_({ ok: false, error: 'Missing action. This URL is the GVP 2026 JSON API endpoint, not a page.' });
  }
  return jsonOut_(dispatchApi_(action, params));
}

/** POST requests: body is JSON {"action":"NAME","payload":{...}} sent as text/plain (avoids CORS preflight). */
function doPost(e) {
  var body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (parseErr) {
    return jsonOut_({ ok: false, error: 'Invalid request body' });
  }
  var action = String(body.action || '');
  var payload = body.payload || {};
  if (!action) {
    return jsonOut_({ ok: false, error: 'Missing action' });
  }
  return jsonOut_(dispatchApi_(action, payload));
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Routes an action name + params/payload to the matching function and normalizes the response shape. */
function dispatchApi_(action, p) {
  try {
    switch (action) {
      case 'getDistricts':
        return { ok: true, data: getDistricts() };
      case 'getLocations':
        return { ok: true, data: getLocations() };
      case 'getBlocks':
        return { ok: true, data: getBlocks(p.district) };
      case 'submitRegistration':
        return submitRegistration(p);
      case 'getSchoolBill':
        return getSchoolBill(p.district, p.block, p.school, p.village);
      case 'getSchools':
        return { ok: true, data: getSchools(p.district, p.block) };
      case 'reportSchoolPayment':
        return reportSchoolPayment(p);
      default:
        return { ok: false, error: 'Unknown action: ' + action };
    }
  } catch (err) {
    logError_(action, err);
    return { ok: false, error: err && err.message ? err.message : 'Server error' };
  }
}

// Errors logged here are genuine unexpected failures (Sheet API errors, lock
// timeouts, bugs) — normal validation rejections return {ok:false} directly
// without throwing, so they never reach this. Never let logging itself break
// the response the caller is waiting on.
function logError_(context, err) {
  try {
    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName('Errors');
    if (!sheet) {
      sheet = ss.insertSheet('Errors');
      sheet.getRange(1, 1, 1, 3).setValues([['Time', 'Action', 'Error']]);
      sheet.setFrozenRows(1);
    }
    var now = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'M/d/yyyy HH:mm:ss');
    sheet.appendRow([now, context || '', String(err && err.message ? err.message : err)]);
  } catch (e) {
    // Swallow — logging must never mask or replace the real error response.
  }
}

function getDistricts() {
  return Object.keys(DISTRICT_BLOCKS);
}

function getLocations() {
  return DISTRICT_BLOCKS;
}

function getBlocks(district) {
  return DISTRICT_BLOCKS[district] || [];
}

function compactKey_(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function upper_(s) {
  return String(s || '').trim().toUpperCase();
}

function locMatch_(sheetVal, selected) {
  var s = String(sheetVal || '').trim();
  var sel = String(selected || '').trim();
  if (!sel) return true;   // caller did not filter on this field
  if (!s) return false;    // filter is set but the sheet cell is empty
  var sl = s.toLowerCase();
  var sell = sel.toLowerCase();
  if (sl === sell) return true;
  if (compactKey_(s) && compactKey_(s) === compactKey_(sel)) return true;
  var slash = s.lastIndexOf('/');
  if (slash > -1 && s.substring(slash + 1).trim().toLowerCase() === sell) return true;
  return false;
}

// Whole-name abbreviations, expanded to the same words schoolNormalizeKey_
// would produce from the spelled-out name, so e.g. "GSSS Lasdawan" and
// "Govt Senior Secondary School Lasdawan" normalize to the same key. Place
// names are never touched, so two different real schools that happen to
// share this boilerplate still stay distinct. Only add entries here that
// are unambiguous — DPS and the "G..." govt-school prefixes always expand
// to the same thing; a vaguer private-school initialism (which could stand
// for several different actual school names) should not go in this table.
var SCHOOL_ABBR_EXPAND_ = {
  gsss: ['govt', 'sr', 'sec', 'school'],
  gss: ['govt', 'sec', 'school'],
  gups: ['govt', 'up', 'pri', 'school'],
  gps: ['govt', 'pri', 'school'],
  gms: ['govt', 'mid', 'school'],
  dps: ['delhi', 'public', 'school']
};
var SCHOOL_WORD_SYNONYMS_ = {
  government: 'govt', govt: 'govt',
  senior: 'sr', sr: 'sr', sen: 'sr',
  secondary: 'sec', sec: 'sec',
  primary: 'pri', pri: 'pri', prim: 'pri',
  upper: 'up', up: 'up',
  middle: 'mid', mid: 'mid',
  school: 'school', vidyalaya: 'school', vidhyalaya: 'school'
};

// School-name-only matching key: expands known abbreviations and collapses
// common spelling variants (govt/government, sr/senior, sec/secondary, ...)
// before compacting, so abbreviation vs. spelled-out names of the same
// school match. Used only for the School field — district/block come from
// a fixed dropdown and never need this.
function schoolNormalizeKey_(s) {
  var words = String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(function (w) { return w; });
  var out = [];
  for (var i = 0; i < words.length; i++) {
    var w = words[i];
    if (SCHOOL_ABBR_EXPAND_[w]) {
      out = out.concat(SCHOOL_ABBR_EXPAND_[w]);
    } else {
      out.push(SCHOOL_WORD_SYNONYMS_[w] || w);
    }
  }
  return out.join('');
}

function schoolMatch_(sheetVal, selected) {
  if (locMatch_(sheetVal, selected)) return true;
  var sel = String(selected || '').trim();
  if (!sel) return true;
  var s = String(sheetVal || '').trim();
  if (!s) return false;
  if (schoolNormalizeKey_(s) === schoolNormalizeKey_(sel)) return true;

  // Registrations made before the separate Village field was introduced put
  // "School name, Village" in the School cell. Accept the school-name part
  // when looking up those legacy rows so the new comma-free form can still
  // find their bill and prior payments.
  var comma = s.lastIndexOf(',');
  return comma > 0 && schoolNormalizeKey_(s.substring(0, comma)) === schoolNormalizeKey_(sel);
}

// Return a displayable school name for both current and legacy rows. A comma
// is removed only when its suffix is exactly the separately stored Village
// value, so punctuation that is genuinely part of a school name is retained.
function schoolDisplayName_(school, village) {
  var name = String(school || '').trim();
  var place = String(village || '').trim();
  var comma = name.lastIndexOf(',');
  if (comma > 0 && place && compactKey_(name.substring(comma + 1)) === compactKey_(place)) {
    return name.substring(0, comma).trim();
  }
  return name;
}

function validLocation_(district, block) {
  district = String(district || '').trim();
  block = String(block || '').trim();
  if (!district || !DISTRICT_BLOCKS[district]) {
    return 'जिला सही नहीं है / Select a valid district';
  }
  var blocks = DISTRICT_BLOCKS[district] || [];
  if (!block || blocks.indexOf(block) === -1) {
    return 'ब्लॉक सही नहीं है / Select a valid block';
  }
  return '';
}

function getRegistrationSheet_(ss) {
  ss = ss || getSpreadsheet_();
  var named = ['Registrations', 'Registration', 'Students'];
  for (var i = 0; i < named.length; i++) {
    var byName = ss.getSheetByName(named[i]);
    if (byName) return byName;
  }
  var sheets = ss.getSheets();
  for (var j = 0; j < sheets.length; j++) {
    var name = sheets[j].getName();
    if (UTILITY_SHEETS_[name]) continue;
    var a1 = String(sheets[j].getRange(1, 1).getValue() || '');
    var a2 = sheets[j].getLastRow() >= 2 ? String(sheets[j].getRange(2, 1).getValue() || '') : '';
    if (/^reg/i.test(a1) || /GVP-/i.test(a1) || /GVP-/i.test(a2)) return sheets[j];
  }
  return sheets[0];
}

// Keeps row 1 exactly equal to REG_HEADERS_ across columns 1..REG_HEADERS_.length.
// This only ever touches that fixed width — it never recreates columns beyond
// it, so deleting an extra column from the sheet stays deleted.
function ensureRegistrationHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, REG_HEADERS_.length).setValues([REG_HEADERS_]);
    sheet.setFrozenRows(1);
    return;
  }

  var current = sheet.getRange(1, 1, 1, REG_HEADERS_.length).getValues()[0];
  var matches = REG_HEADERS_.every(function (h, i) {
    return String(current[i] || '').trim() === h;
  });
  if (!matches) {
    sheet.getRange(1, 1, 1, REG_HEADERS_.length).setValues([REG_HEADERS_]);
    sheet.setFrozenRows(1);
  }
}

function scanMaxRegSerial_(sheet) {
  var last = sheet.getLastRow();
  var max = 0;
  if (last >= 2) {
    var regs = sheet.getRange(2, 1, last - 1, 1).getValues();
    for (var i = 0; i < regs.length; i++) {
      var m = String(regs[i][0] || '').match(/(\d+)$/);
      if (m) {
        var n = parseInt(m[1], 10);
        if (n > max) max = n;
      }
    }
  }
  return max;
}

// Registrations happen one at a time under the script lock, so a cached
// counter in Properties avoids rescanning the whole Reg column on every
// submission. The first call after deploy (or after the property is
// cleared) falls back to a one-time scan to pick up where the sheet left off.
// Uses Script (not Document) properties: this project can run as a
// standalone script opening the spreadsheet by ID, and getDocumentProperties()
// returns null in that mode since there's no bound container.
function nextRegSerial_(sheet) {
  var props = PropertiesService.getScriptProperties();
  var stored = props.getProperty('LAST_REG_SERIAL');
  var next = (stored ? parseInt(stored, 10) : scanMaxRegSerial_(sheet)) + 1;
  props.setProperty('LAST_REG_SERIAL', String(next));
  return next;
}

// Same student (by name + father + mobile) submitted twice, e.g. a
// double-click or a resubmit after a network hiccup. Siblings sharing a
// household mobile number are unaffected since name+father must also match.
function duplicateRegistrationExists_(sheet, name, father, mobile) {
  var last = sheet.getLastRow();
  if (last < 2) return false;
  var nameKey = compactKey_(name);
  var fatherKey = compactKey_(father);
  var mobileKey = String(mobile || '').trim();

  // Searching the Mobile column directly avoids downloading C:K for every
  // registration. The old approach became progressively slower as the list
  // of students grew, even though nearly every mobile number is unique.
  var mobileRange = sheet.getRange(2, 11, last - 1, 1);
  var matches = mobileRange.createTextFinder(mobileKey)
    .matchCase(false)
    .matchEntireCell(true)
    .findAll();
  for (var i = 0; i < matches.length; i++) {
    var row = matches[i].getRow();
    var identity = sheet.getRange(row, 3, 1, 2).getValues()[0];
    if (compactKey_(identity[0]) === nameKey && compactKey_(identity[1]) === fatherKey) return true;
  }
  return false;
}

function submitRegistration(data) {
  data = data || {};
  try {
    // Honeypot: real users never fill this hidden field, bots usually do.
    // Fail with the same generic error a validation failure would give.
    if (data.hp) {
      return { ok: false, error: 'आवश्यक जानकारी अधूरी है' };
    }
    if (!data.name || !data.father || !data.gender || !data.cls) {
      return { ok: false, error: 'आवश्यक जानकारी अधूरी है' };
    }
    if (!data.district || !data.block || !data.school || !data.village) {
      return { ok: false, error: 'आवश्यक जानकारी अधूरी है' };
    }
    var locErr = validLocation_(data.district, data.block);
    if (locErr) return { ok: false, error: locErr };
    if (!/^[6-9][0-9]{9}$/.test(String(data.mobile || ''))) {
      return { ok: false, error: 'मोबाइल नंबर सही नहीं है' };
    }
    if (!/^(Male|Female|Other)$/.test(String(data.gender || ''))) {
      return { ok: false, error: 'लिंग पुरुष, महिला या अन्य चुनें / Select Male, Female or Other' };
    }
    if (!/^(8|9|10|11|12)$/.test(String(data.cls || ''))) {
      return { ok: false, error: 'कक्षा 8 से 12 चुनें / Select class 8–12' };
    }
    if (String(data.year || '').trim() !== ACADEMIC_YEAR) {
      return { ok: false, error: 'शैक्षणिक वर्ष सही नहीं है / Invalid academic year' };
    }
    if (!/^[A-Za-z][A-Za-z .'-]{1,78}$/.test(String(data.name || '').trim())) {
      return { ok: false, error: 'नाम अंग्रेज़ी में लिखें / Write name in English' };
    }
    if (!/^[A-Za-z][A-Za-z .'-]{1,78}$/.test(String(data.father || '').trim())) {
      return { ok: false, error: 'पिता का नाम अंग्रेज़ी में लिखें / Write father\'s name in English' };
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9 .,'()\/-]{1,118}$/.test(String(data.school || '').trim())) {
      return { ok: false, error: 'विद्यालय का नाम अंग्रेज़ी में लिखें / Write school name in English' };
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9 .,'()\/-]{1,118}$/.test(String(data.village || '').trim())) {
      return { ok: false, error: 'गाँव अंग्रेज़ी में लिखें / Write village in English' };
    }
    if (!data.declare) {
      return { ok: false, error: 'घोषणा स्वीकार करें' };
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var ss = getSpreadsheet_();
      var sheet = getRegistrationSheet_(ss);
      ensureRegistrationHeaders_(sheet);
      if (duplicateRegistrationExists_(sheet, data.name, data.father, data.mobile)) {
        return { ok: false, error: 'यह विद्यार्थी पहले से पंजीकृत है / This student is already registered' };
      }
      var nextNum = nextRegSerial_(sheet);
      var regNo = 'GVP-2026-' + ('00000' + nextNum).slice(-5);
      var omrNo = omrFromSerial_(nextNum);
      var now = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'M/d/yyyy HH:mm:ss');

      // Reg | Time | Name | Father | Gender | Class | District | Block | School | Village | Mobile | OMR Roll | Year
      sheet.appendRow([
        regNo,
        now,
        upper_(data.name),
        upper_(data.father),
        upper_(data.gender),
        data.cls,
        upper_(data.district),
        upper_(data.block),
        upper_(data.school),
        upper_(data.village),
        String(data.mobile).trim(),
        omrNo,
        ACADEMIC_YEAR
      ]);
      invalidateSchoolsCache_(data.district, data.block);
      return { ok: true, regNo: regNo, omrNo: omrNo };
    } finally {
      lock.releaseLock();
    }
  } catch (e) {
    logError_('submitRegistration', e);
    return { ok: false, error: e.message || 'त्रुटि हुई, पुनः प्रयास करें' };
  }
}

function omrFromSerial_(n) {
  return '26' + ('000000' + n).slice(-6);
}

/**
 * Run once from the editor (select this function in the dropdown, then Run)
 * after clearing out all registration rows, so the next real registration
 * starts at GVP-2026-00001 again instead of continuing from the cached
 * counter. Not needed otherwise — nextRegSerial_ manages the counter itself.
 */
function resetRegSerialCounter() {
  PropertiesService.getScriptProperties().deleteProperty('LAST_REG_SERIAL');
}

/** Run once from the editor to fill OMR Roll for existing rows. */
function backfillOmrNumbers() {
  var ss = getSpreadsheet_();
  var sheet = getRegistrationSheet_(ss);
  ensureRegistrationHeaders_(sheet);
  var last = sheet.getLastRow();
  if (last < 2) return;
  var regs = sheet.getRange(2, 1, last - 1, 1).getValues();
  var parsed = regs.map(function (row) {
    var m = String(row[0] || '').match(/(\d+)$/);
    return m ? parseInt(m[1], 10) : null;
  });
  var maxSerial = 0;
  for (var i = 0; i < parsed.length; i++) {
    if (parsed[i] !== null && parsed[i] > maxSerial) maxSerial = parsed[i];
  }
  var nextUnparsed = maxSerial;
  var out = [];
  for (var j = 0; j < parsed.length; j++) {
    var n = parsed[j];
    if (n === null) {
      nextUnparsed += 1;
      n = nextUnparsed;
    }
    out.push([omrFromSerial_(n)]);
  }
  sheet.getRange(2, 12, out.length, 1).setValues(out);
}

function ensurePaymentsSheet_(ss) {
  ss = ss || getSpreadsheet_();
  var sheet = ss.getSheetByName('Payments');
  if (!sheet) {
    sheet = ss.insertSheet('Payments');
    sheet.getRange(1, 1, 1, PAY_HEADERS_.length).setValues([PAY_HEADERS_]);
    sheet.setFrozenRows(1);
    return sheet;
  }
  var first = String(sheet.getRange(1, 1).getValue() || '').trim();
  if (!first) {
    sheet.getRange(1, 1, 1, PAY_HEADERS_.length).setValues([PAY_HEADERS_]);
    sheet.setFrozenRows(1);
  } else if (String(sheet.getRange(1, 13).getValue() || '').trim() !== 'Village') {
    sheet.getRange(1, 13).setValue('Village');
  }
  return sheet;
}

function countSchoolStudents_(district, block, school, village, sheet) {
  sheet = sheet || getRegistrationSheet_(getSpreadsheet_());
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  // G:J includes Village for legacy "School, Village" compatibility.
  var values = sheet.getRange(2, 7, lastRow - 1, 4).getValues();
  var n = 0;
  for (var i = 0; i < values.length; i++) {
    var sheetSchool = String(values[i][2] || '').trim();
    if (!sheetSchool) continue;
    if (district && !locMatch_(values[i][0], district)) continue;
    if (block && !locMatch_(values[i][1], block)) continue;
    if (!schoolMatch_(schoolDisplayName_(sheetSchool, values[i][3]), school)) continue;
    if (village && !locMatch_(values[i][3], village)) continue;
    n++;
  }
  return n;
}

// Distinct school names already registered, optionally narrowed to a
// district/block, for the site's school-name autocomplete. Returns sorted,
// de-duplicated names as stored (upper_() at submit time).
//
// Cached for SCHOOLS_CACHE_TTL_SEC per district/block combo so repeated
// autocomplete keystrokes don't rescan the whole registration sheet — the
// scan cost grows with total registrations, not with how often people type.
// submitRegistration_ invalidates the exact keys a new row can affect right
// after it's written, so the cache is never stale for longer than a
// submission that happens to race a read.
var SCHOOLS_CACHE_TTL_SEC = 300;

function schoolsCacheKey_(district, block) {
  return 'schools:' + compactKey_(district) + ':' + compactKey_(block);
}

function invalidateSchoolsCache_(district, block) {
  try {
    CacheService.getScriptCache().removeAll([
      schoolsCacheKey_('', ''),
      // getSchools supports an optional district filter, so a newly added
      // school also changes a block-only result (for example, ?block=Asind).
      // Invalidate that key as well; otherwise it can remain stale for the
      // cache TTL even though the exact district/block key is refreshed.
      schoolsCacheKey_('', block),
      schoolsCacheKey_(district, ''),
      schoolsCacheKey_(district, block)
    ]);
  } catch (e) {
    // Cache is best-effort; a failed invalidation just means autocomplete
    // can lag by up to SCHOOLS_CACHE_TTL_SEC, not a correctness issue.
  }
}

function getSchools(district, block) {
  var cache = CacheService.getScriptCache();
  var key = schoolsCacheKey_(district, block);
  var cached = cache.get(key);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) { /* fall through and recompute */ }
  }

  var sheet = getRegistrationSheet_(getSpreadsheet_());
  var lastRow = sheet.getLastRow();
  var out = [];
  if (lastRow >= 2) {
    // G:J includes Village so legacy combined values can be displayed as
    // plain school names in the autocomplete list.
    var values = sheet.getRange(2, 7, lastRow - 1, 4).getValues();
    var seen = {};
    for (var i = 0; i < values.length; i++) {
      var sheetSchool = schoolDisplayName_(values[i][2], values[i][3]);
      if (!sheetSchool) continue;
      if (district && !locMatch_(values[i][0], district)) continue;
      if (block && !locMatch_(values[i][1], block)) continue;
      // De-dupe by normalized key so "GSSS X" and "Govt Sr Sec School X"
      // don't both show up as separate suggestions — keep the first spelling seen.
      var dedupeKey = schoolNormalizeKey_(sheetSchool);
      if (seen[dedupeKey]) continue;
      seen[dedupeKey] = true;
      out.push(sheetSchool);
    }
    out.sort();
  }

  try { cache.put(key, JSON.stringify(out), SCHOOLS_CACHE_TTL_SEC); } catch (e) { /* best-effort */ }
  return out;
}

function paymentLocationMatch_(paymentSchool, paymentVillage, school, village) {
  if (!schoolMatch_(paymentSchool, school)) return false;
  if (!village) return true;
  if (locMatch_(paymentVillage, village)) return true;
  var comma = String(paymentSchool || '').lastIndexOf(',');
  return comma > 0 && locMatch_(String(paymentSchool).substring(comma + 1), village);
}

function sumSchoolPaid_(district, block, school, village, sheet) {
  sheet = sheet || ensurePaymentsSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  var values = sheet.getRange(2, 1, lastRow - 1, 13).getValues();
  var paid = 0;
  for (var i = 0; i < values.length; i++) {
    var st = String(values[i][6] || '').trim();
    // A user-entered UTR is only a payment report. It must not lower the
    // school bill until an organizer has checked the bank transaction and
    // changes this Status cell to Paid in the Payments sheet.
    if (st !== 'Paid') continue;
    if (district && !locMatch_(values[i][0], district)) continue;
    if (block && !locMatch_(values[i][1], block)) continue;
    if (!paymentLocationMatch_(values[i][2], values[i][12], school, village)) continue;
    paid += Number(values[i][5]) || 0;
  }
  return paid;
}

function sumSchoolReported_(district, block, school, village, sheet) {
  sheet = sheet || ensurePaymentsSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  var values = sheet.getRange(2, 1, lastRow - 1, 13).getValues();
  var reported = 0;
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][6] || '').trim() !== 'Reported') continue;
    if (district && !locMatch_(values[i][0], district)) continue;
    if (block && !locMatch_(values[i][1], block)) continue;
    if (!paymentLocationMatch_(values[i][2], values[i][12], school, village)) continue;
    reported += Number(values[i][5]) || 0;
  }
  return reported;
}

function utrAlreadyUsed_(utr, sheet) {
  sheet = sheet || ensurePaymentsSheet_();
  if (sheet.getLastRow() < 2) return false;
  var values = sheet.getRange(2, 9, sheet.getLastRow() - 1, 1).getValues();
  var key = String(utr || '').trim();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === key) return true;
  }
  return false;
}

function computeSchoolBill_(district, block, school, village, ss, registrationSheet, paymentsSheet) {
  ss = ss || getSpreadsheet_();
  registrationSheet = registrationSheet || getRegistrationSheet_(ss);
  paymentsSheet = paymentsSheet || ensurePaymentsSheet_(ss);
  var students = countSchoolStudents_(district, block, school, village, registrationSheet);
  var amountPaid = sumSchoolPaid_(district, block, school, village, paymentsSheet);
  var amountReported = sumSchoolReported_(district, block, school, village, paymentsSheet);
  var amountDue = students * FEE_PER_STUDENT - amountPaid;
  if (amountDue < 0) amountDue = 0;
  var amountReportable = amountDue - amountReported;
  if (amountReportable < 0) amountReportable = 0;
  var status = 'Due';
  if (students > 0 && amountDue === 0) status = 'Paid';
  else if (amountReported > 0) status = 'Verification pending';
  else if (amountPaid > 0) status = 'Partially paid';
  return {
    students: students,
    fee: FEE_PER_STUDENT,
    amountDue: amountDue,
    amountPaid: amountPaid,
    amountReported: amountReported,
    amountReportable: amountReportable,
    status: status
  };
}

function buildUpi_(amountDue, school) {
  var needsUpi = !UPI_VPA || String(UPI_VPA).trim() === '' || String(UPI_VPA).trim() === 'SET_UPI_ID';
  var link = '';
  var qr = '';
  if (!needsUpi && amountDue > 0) {
    link = 'upi://pay?pa=' + encodeURIComponent(UPI_VPA) +
      '&pn=' + encodeURIComponent(UPI_NAME) +
      '&am=' + encodeURIComponent(String(amountDue)) +
      '&cu=INR&tn=' + encodeURIComponent('GVP2026 ' + school);
    qr = 'https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=' + encodeURIComponent(link);
  }
  return {
    needsUpi: needsUpi,
    upi: {
      vpa: needsUpi ? '' : UPI_VPA,
      name: UPI_NAME,
      link: link,
      qr: qr
    }
  };
}

function getSchoolBill(district, block, school, village) {
  try {
    district = String(district || '').trim();
    block = String(block || '').trim();
    school = String(school || '').trim();
    village = String(village || '').trim();
    if (!school) return { ok: false, error: 'School name is required / विद्यालय का नाम लिखें' };
    if (!village) return { ok: false, error: 'Village or city is required / गाँव या शहर लिखें' };
    var locErr = validLocation_(district, block);
    if (locErr) return { ok: false, error: locErr };

    var bill = computeSchoolBill_(district, block, school, village);
    var upiPack = buildUpi_(bill.amountDue, school);
    return {
      ok: true,
      students: bill.students,
      fee: bill.fee,
      amountDue: bill.amountDue,
      amountPaid: bill.amountPaid,
      amountReported: bill.amountReported,
      amountReportable: bill.amountReportable,
      status: bill.status,
      needsUpi: upiPack.needsUpi,
      upi: upiPack.upi
    };
  } catch (e) {
    logError_('getSchoolBill', e);
    return { ok: false, error: e.message || 'Could not load bill' };
  }
}

function reportSchoolPayment(data) {
  data = data || {};
  try {
    if (data.hp) {
      return { ok: false, error: 'School name is required / विद्यालय का नाम लिखें' };
    }
    var district = String(data.district || '').trim();
    var block = String(data.block || '').trim();
    var school = String(data.school || '').trim();
    var village = String(data.village || '').trim();
    var payeeName = String(data.payeeName || '').trim();
    var utr = String(data.utr || '').trim();
    var mobile = String(data.mobile || '').trim();

    if (!school) return { ok: false, error: 'School name is required / विद्यालय का नाम लिखें' };
    if (!village) return { ok: false, error: 'Village or city is required / गाँव या शहर लिखें' };
    var locErr = validLocation_(district, block);
    if (locErr) return { ok: false, error: locErr };
    if (!/^[A-Za-z0-9][A-Za-z0-9 .,'()\/-]{1,118}$/.test(school)) {
      return { ok: false, error: 'Write school name in English / विद्यालय का नाम अंग्रेज़ी में लिखें' };
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9 .,'()\/-]{1,118}$/.test(village)) {
      return { ok: false, error: 'Write village or city in English / गाँव या शहर अंग्रेज़ी में लिखें' };
    }
    if (!/^[A-Za-z][A-Za-z .'-]{1,78}$/.test(payeeName)) {
      return { ok: false, error: 'Enter payee name in English / भुगतानकर्ता का नाम अंग्रेज़ी में लिखें' };
    }
    if (!/^[0-9]{6,24}$/.test(utr)) {
      return { ok: false, error: 'UTR / UPI Ref No must contain 6–24 digits only' };
    }
    if (!/^[6-9][0-9]{9}$/.test(mobile)) {
      return { ok: false, error: 'Enter a valid 10-digit mobile (starts with 6–9)' };
    }
    // Optional: caller may report a partial payment (e.g. a school paying in
    // two instalments). Omitted/blank means "pay the full amount currently
    // due", same as before this field existed.
    var amountRaw = data.amount;
    var hasAmount = amountRaw !== undefined && amountRaw !== null && String(amountRaw).trim() !== '';
    if (hasAmount && !/^[0-9]+$/.test(String(amountRaw).trim())) {
      return { ok: false, error: 'Amount must be a whole number of rupees' };
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var ss = getSpreadsheet_();
      var paymentSheet = ensurePaymentsSheet_(ss);
      if (utrAlreadyUsed_(utr, paymentSheet)) {
        return { ok: false, error: 'This UTR / UPI Ref No is already used / यह UTR पहले से दर्ज है' };
      }

      // Recalculate inside the lock so two clerks cannot report the same due twice.
      var registrationSheet = getRegistrationSheet_(ss);
      var bill = computeSchoolBill_(district, block, school, village, ss, registrationSheet, paymentSheet);
      if (bill.students < 1) {
        return { ok: false, error: 'No students registered yet for this school' };
      }
      if (bill.amountDue <= 0) {
        return { ok: false, error: 'This school is already paid / cleared' };
      }

      // Do not accept reports totalling more than the unpaid balance while
      // earlier UTRs are still awaiting verification.
      var reportableAmount = bill.amountReportable;
      if (reportableAmount <= 0) {
        return { ok: false, error: 'A payment report is already awaiting verification for this school' };
      }
      var amount = hasAmount ? parseInt(String(amountRaw).trim(), 10) : reportableAmount;
      if (amount < 1 || amount > reportableAmount) {
        return {
          ok: false,
          error: 'Amount must be between ₹1 and ₹' + reportableAmount + ' while earlier reports are verified'
        };
      }
      var students = bill.students;
      var now = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'M/d/yyyy HH:mm:ss');
      paymentSheet.appendRow([
        upper_(district),
        upper_(block),
        upper_(school),
        students,
        bill.amountDue,
        amount,
        'Reported',
        upper_(payeeName),
        utr,
        mobile,
        now,
        'Pending',
        upper_(village)
      ]);
      var message = 'Payment report for ₹' + amount + ' received. It will be counted after the organizer verifies the UTR.';
      return { ok: true, message: message, amountReportedNow: amount, remainingDue: bill.amountDue };
    } finally {
      lock.releaseLock();
    }
  } catch (e) {
    logError_('reportSchoolPayment', e);
    return { ok: false, error: e.message || 'Could not save payment' };
  }
}

/** Admin: rebuild one row per school from registrations + payments. Run from the editor. */
function rebuildSchoolDues() {
  var ss = getSpreadsheet_();
  var reg = getRegistrationSheet_(ss);
  var paySheet = ensurePaymentsSheet_(ss);
  var schools = {};
  var bookRank = { Pending: 0, Packed: 1, Sent: 2 };

  function keyOf(d, b, s, v) {
    return compactKey_(d) + '|' + compactKey_(b) + '|' + schoolNormalizeKey_(s) + '|' + compactKey_(v);
  }
  function ensure(d, b, s, v) {
    var key = keyOf(d, b, s, v);
    if (!schools[key]) {
      schools[key] = {
        district: upper_(d),
        block: upper_(b),
        school: upper_(s),
        village: upper_(v),
        students: 0,
        paid: 0,
        books: 'Pending'
      };
    }
    return schools[key];
  }

  if (reg.getLastRow() >= 2) {
    var rows = reg.getRange(2, 7, reg.getLastRow() - 1, 4).getValues();
    for (var i = 0; i < rows.length; i++) {
      var v = String(rows[i][3] || '').trim();
      var s = schoolDisplayName_(rows[i][2], v);
      if (!s) continue;
      ensure(rows[i][0], rows[i][1], s, v).students++;
    }
  }

  if (paySheet.getLastRow() >= 2) {
    var pays = paySheet.getDataRange().getValues();
    for (var j = 1; j < pays.length; j++) {
      var ps = String(pays[j][2] || '').trim();
      if (!ps) continue;
      var pv = String(pays[j][12] || '').trim();
      if (!pv) {
        var comma = ps.lastIndexOf(',');
        if (comma > 0) pv = ps.substring(comma + 1).trim();
      }
      ps = schoolDisplayName_(ps, pv);
      var rec = ensure(pays[j][0], pays[j][1], ps, pv);
      var st = String(pays[j][6] || '').trim();
      if (st === 'Paid') rec.paid += Number(pays[j][5]) || 0;
      var bk = String(pays[j][11] || 'Pending').trim() || 'Pending';
      if ((bookRank[bk] || 0) > (bookRank[rec.books] || 0)) rec.books = bk;
    }
  }

  var dues = ss.getSheetByName('School Dues');
  if (!dues) dues = ss.insertSheet('School Dues');
  else dues.clearContents();

  var out = [DUES_HEADERS_];
  var keys = Object.keys(schools).sort();
  for (var k = 0; k < keys.length; k++) {
    var r = schools[keys[k]];
    var amount = r.students * FEE_PER_STUDENT;
    var balance = amount - r.paid;
    if (balance < 0) balance = 0;
    var status = 'Due';
    if (r.students > 0 && balance === 0) status = 'Paid';
    else if (r.paid > 0) status = 'Reported';
    out.push([r.district, r.block, r.school, r.students, amount, r.paid, balance, status, r.books, r.village]);
  }
  dues.getRange(1, 1, out.length, DUES_HEADERS_.length).setValues(out);
  dues.setFrozenRows(1);
  return { ok: true, schools: out.length - 1 };
}
