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
 *   getDistricts, getLocations, getBlocks, getSchoolBill, getSchools, getVillages, getSchoolStudents
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
      case 'getVillages':
        return { ok: true, data: getVillages(p.district, p.block, p.school) };
      case 'getSchoolStudents':
        return getSchoolStudents(p.district, p.block, p.school, p.village, p.mobile);
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

function isKnownDistrict_(value) {
  var candidate = String(value || '').trim();
  if (!candidate) return false;
  var districts = Object.keys(DISTRICT_BLOCKS);
  for (var i = 0; i < districts.length; i++) {
    if (locMatch_(candidate, districts[i])) return true;
  }
  return false;
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

function levenshtein_(a, b) {
  var m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  var prev = [];
  for (var j = 0; j <= n; j++) prev[j] = j;
  for (var i = 1; i <= m; i++) {
    var cur = [i];
    for (var k = 1; k <= n; k++) {
      var cost = a.charAt(i - 1) === b.charAt(k - 1) ? 0 : 1;
      cur[k] = Math.min(prev[k] + 1, cur[k - 1] + 1, prev[k - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

// True only when two village texts plausibly name the same real place —
// exact/compacted match, one containing the other (a dropped "Village"
// prefix, or a trailing block/district name), or a couple of characters of
// typo drift. Many schools in this data share a generic, place-free name
// (just "GSSS" or "Govt Sr Sec School"), so Village is the *only* thing
// that keeps two different real schools apart — a "did you mean" suggestion
// must not offer a textually unrelated village from a same-named but
// different school, or it would steer someone into paying that school's
// bill by mistake. See computeSchoolBill_'s villagesOnFile.
function villageSimilar_(a, b) {
  var ak = compactKey_(a), bk = compactKey_(b);
  if (!ak || !bk) return false;
  if (ak === bk) return true;
  if (ak.indexOf(bk) > -1 || bk.indexOf(ak) > -1) return true;
  return levenshtein_(ak, bk) <= 2;
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

// Catches the placeholder numbers people type when they don't want to give
// a real one — all one digit repeated, or a straight ascending/descending
// run of digits (wrapping past 9→0 or 0→9, so 6789012345 counts too, not
// just runs starting at 0 or 1). Live testing found "9999999999" sitting in
// a real school's Mobile column and matching getSchoolStudents' registered-
// mobile privacy gate — that gate is only as strong as the numbers actually
// on file, so this stops new junk values at the source. It cannot fix
// already-registered fake numbers.
function isFakeMobile_(mobile) {
  mobile = String(mobile || '').trim();
  if (!/^[0-9]{10}$/.test(mobile)) return false;
  if (/^(\d)\1{9}$/.test(mobile)) return true;
  var ascending = true, descending = true;
  for (var i = 1; i < mobile.length; i++) {
    var prev = Number(mobile.charAt(i - 1)), cur = Number(mobile.charAt(i));
    if ((cur - prev + 10) % 10 !== 1) ascending = false;
    if ((prev - cur + 10) % 10 !== 1) descending = false;
  }
  return ascending || descending;
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

  // Search both the current Mobile column (K) and the legacy one (O). The
  // header migration deliberately left existing rows in their old layout,
  // so checking K alone lets a legacy student be registered twice. A new
  // current-only sheet can be only 13 columns wide, however, so do not ask
  // Sheets for legacy column O unless that column actually exists.
  var matches = [];
  var mobileColumns = [11];
  if (sheet.getMaxColumns() >= 15) mobileColumns.push(15);
  mobileColumns.forEach(function (column) {
    matches = matches.concat(sheet.getRange(2, column, last - 1, 1)
      .createTextFinder(mobileKey)
      .matchCase(false)
      .matchEntireCell(true)
      .findAll());
  });
  var seenRows = {};
  for (var i = 0; i < matches.length; i++) {
    var row = matches[i].getRow();
    if (seenRows[row]) continue;
    seenRows[row] = true;
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
    if (isFakeMobile_(data.mobile)) {
      return { ok: false, error: 'असली मोबाइल नंबर लिखें, प्लेसहोल्डर नहीं / Enter a real mobile number, not a placeholder' };
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
  var rowCount = last - 1;
  var maxColumns = sheet.getMaxColumns();
  var regs = sheet.getRange(2, 1, rowCount, 1).getValues();
  var dataWidth = Math.min(13, maxColumns - 2);
  var rowData = sheet.getRange(2, 3, rowCount, dataWidth).getValues();
  rowData.forEach(function (row) { while (row.length < 13) row.push(''); });
  var currentOmr = sheet.getRange(2, 12, rowCount, 1).getValues(); // L
  var legacyOmr = maxColumns >= 18
    ? sheet.getRange(2, 18, rowCount, 1).getValues()
    : null;
  var parsed = regs.map(function (row) {
    var m = String(row[0] || '').match(/(\d+)$/);
    return m ? parseInt(m[1], 10) : null;
  });
  var maxSerial = 0;
  for (var i = 0; i < parsed.length; i++) {
    if (parsed[i] !== null && parsed[i] > maxSerial) maxSerial = parsed[i];
  }
  var nextUnparsed = maxSerial;
  for (var j = 0; j < parsed.length; j++) {
    var n = parsed[j];
    if (n === null) {
      nextUnparsed += 1;
      n = nextUnparsed;
    }
    if (legacyOmr && registrationRow_(rowData[j]).legacy) legacyOmr[j][0] = omrFromSerial_(n);
    else currentOmr[j][0] = omrFromSerial_(n);
  }
  // Preserve the other layout's cells: L is Village on a legacy row, while
  // R may contain old OMR values and must not be cleared for current rows.
  sheet.getRange(2, 12, rowCount, 1).setValues(currentOmr);
  if (legacyOmr) sheet.getRange(2, 18, rowCount, 1).setValues(legacyOmr);
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

// District/Block/School/Village for one registration row, given columns
// G:L (6 cells: current District, Block, School, Village, then the two
// columns that held District/Block before the Sep 2026 schema shrink
// (877e255) moved those fields two columns left. Existing rows written
// before that migration were never rewritten, so their real location data
// still sits at the old I:L position while the code's normal G:J read finds
// only blank cells (DOB/PIN, in the old layout) there. Falling back to I:L
// when G is blank keeps those older rows from silently vanishing out of
// every school's student count.
function regRowLocation_(g, h, i, j, k, l) {
  var district = String(g || '').trim();
  var legacyDistrict = String(i || '').trim();
  // A legacy DOB can occupy G, so "G is non-empty" is not enough to
  // identify the current layout. Prefer whichever candidate is a district
  // from the configured location list.
  if (isKnownDistrict_(district) || !isKnownDistrict_(legacyDistrict)) {
    return { district: district, block: String(h || '').trim(), school: String(i || '').trim(), village: String(j || '').trim() };
  }
  return { district: legacyDistrict, block: String(j || '').trim(), school: String(k || '').trim(), village: String(l || '').trim() };
}

// Parse C:O from either registration layout. Current rows store
// Gender/Class/District/Block/School/Village/Mobile at E:K; legacy rows use
// F/H:I:J:K:L/O because the removed fields still occupy their old columns.
function registrationRow_(values) {
  var legacy = !isKnownDistrict_(values[4]) && isKnownDistrict_(values[6]);
  return {
    legacy: legacy,
    name: String(values[0] || '').trim(),
    father: String(values[1] || '').trim(),
    gender: String(values[legacy ? 3 : 2] || '').trim(),
    cls: String(values[legacy ? 5 : 3] || '').trim(),
    district: String(values[legacy ? 6 : 4] || '').trim(),
    block: String(values[legacy ? 7 : 5] || '').trim(),
    school: String(values[legacy ? 8 : 6] || '').trim(),
    village: String(values[legacy ? 9 : 7] || '').trim(),
    mobile: String(values[legacy ? 12 : 8] || '').trim()
  };
}

function countSchoolStudents_(district, block, school, village, sheet) {
  sheet = sheet || getRegistrationSheet_(getSpreadsheet_());
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  // G:L so regRowLocation_ can fall back to the pre-migration column
  // position when a row's current-schema District cell is blank.
  var values = sheet.getRange(2, 7, lastRow - 1, 6).getValues();
  var n = 0;
  for (var i = 0; i < values.length; i++) {
    var loc = regRowLocation_(values[i][0], values[i][1], values[i][2], values[i][3], values[i][4], values[i][5]);
    if (!loc.school) continue;
    if (district && !locMatch_(loc.district, district)) continue;
    if (block && !locMatch_(loc.block, block)) continue;
    if (!schoolMatch_(schoolDisplayName_(loc.school, loc.village), school)) continue;
    if (village && !locMatch_(loc.village, village)) continue;
    n++;
  }
  return n;
}

// Name/Father/Gender/Class for every student matched by the same
// district+block+school+village filter countSchoolStudents_ uses, so a
// school can see who the counted students actually are. There is no login
// on this site, and district/block/school/village are not secret, so this
// requires the caller to also supply a mobile number that matches one of
// the school's own registered students before releasing the list — that
// proves affiliation without adding any new signup/credential system. The
// returned records still omit mobile numbers themselves.
function getSchoolStudents(district, block, school, village, mobile) {
  try {
    district = String(district || '').trim();
    block = String(block || '').trim();
    school = String(school || '').trim();
    village = String(village || '').trim();
    mobile = String(mobile || '').trim();
    if (!school) return { ok: false, error: 'School name is required / विद्यालय का नाम लिखें' };
    if (!village) return { ok: false, error: 'Village or city is required / गाँव या शहर लिखें' };
    var locErr = validLocation_(district, block);
    if (locErr) return { ok: false, error: locErr };
    if (!/^[6-9][0-9]{9}$/.test(mobile) || isFakeMobile_(mobile)) {
      return { ok: false, error: 'Enter a registered mobile number to view students / छात्र सूची देखने हेतु पंजीकृत मोबाइल नंबर लिखें' };
    }

    var sheet = getRegistrationSheet_(getSpreadsheet_());
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: true, data: [] };

    // A:O includes the registration number plus every current/legacy field
    // needed for the authorized participant list. OMR is intentionally not
    // returned because schools do not need it for this report.
    var width = Math.min(15, sheet.getMaxColumns());
    var values = sheet.getRange(2, 1, lastRow - 1, width).getValues();
    var matched = [];
    var mobileFound = false;
    for (var i = 0; i < values.length; i++) {
      var raw = values[i];
      while (raw.length < 15) raw.push('');
      var row = registrationRow_(raw.slice(2, 15));
      if (!row.school) continue;
      if (district && !locMatch_(row.district, district)) continue;
      if (block && !locMatch_(row.block, block)) continue;
      if (!schoolMatch_(schoolDisplayName_(row.school, row.village), school)) continue;
      if (village && !locMatch_(row.village, village)) continue;
      if (row.mobile === mobile) mobileFound = true;
      matched.push({
        regNo: String(raw[0] || '').trim(),
        name: row.name,
        father: row.father,
        gender: row.gender,
        cls: row.cls
      });
    }
    if (!mobileFound) {
      return { ok: false, error: 'Mobile number does not match a registered student at this school / यह मोबाइल नंबर इस विद्यालय के किसी पंजीकृत छात्र से मेल नहीं खाता' };
    }
    return { ok: true, data: matched };
  } catch (e) {
    logError_('getSchoolStudents', e);
    return { ok: false, error: e.message || 'Could not load student list' };
  }
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
    // G:L so regRowLocation_ can fall back to the pre-migration column
    // position (see its comment) for rows written before the schema shrink.
    var values = sheet.getRange(2, 7, lastRow - 1, 6).getValues();
    var seen = {};
    for (var i = 0; i < values.length; i++) {
      var loc = regRowLocation_(values[i][0], values[i][1], values[i][2], values[i][3], values[i][4], values[i][5]);
      var sheetSchool = schoolDisplayName_(loc.school, loc.village);
      if (!sheetSchool) continue;
      if (district && !locMatch_(loc.district, district)) continue;
      if (block && !locMatch_(loc.block, block)) continue;
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

// Distinct village spellings already on file for one specific school, so a
// second registration session (or the payment page) can pick the exact text
// used before instead of retyping it from memory. countSchoolStudents_ needs
// an exact-ish village match to keep two different schools that share a name
// in different villages from being billed together, so drift in how a
// village is typed for the *same* school across sessions is what silently
// drops students from a bill — this lets the UI prevent that drift instead
// of loosening the match itself.
function getVillages(district, block, school) {
  school = String(school || '').trim();
  if (!school) return [];
  var sheet = getRegistrationSheet_(getSpreadsheet_());
  var lastRow = sheet.getLastRow();
  var out = [];
  if (lastRow >= 2) {
    // G:L so regRowLocation_ can fall back to the pre-migration column
    // position (see its comment) for rows written before the schema shrink.
    var values = sheet.getRange(2, 7, lastRow - 1, 6).getValues();
    var seen = {};
    for (var i = 0; i < values.length; i++) {
      var loc = regRowLocation_(values[i][0], values[i][1], values[i][2], values[i][3], values[i][4], values[i][5]);
      if (!loc.school) continue;
      if (district && !locMatch_(loc.district, district)) continue;
      if (block && !locMatch_(loc.block, block)) continue;
      if (!schoolMatch_(schoolDisplayName_(loc.school, loc.village), school)) continue;
      var place = loc.village;
      if (!place) continue;
      var key = compactKey_(place);
      if (seen[key]) continue;
      seen[key] = true;
      out.push(place);
    }
    out.sort();
  }
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
  var result = {
    students: students,
    fee: FEE_PER_STUDENT,
    amountDue: amountDue,
    amountPaid: amountPaid,
    amountReported: amountReported,
    amountReportable: amountReportable,
    status: status
  };
  // A zero count is sometimes a village-spelling mismatch rather than an
  // empty school (see getVillages) — but many schools here share a generic,
  // place-free name, so getVillages can return villages belonging to a
  // genuinely different school of the same name. Only surface ones that are
  // textually plausible variants of what was typed (villageSimilar_), never
  // the full on-file list, so this hint can't steer a payer into paying a
  // different school's bill.
  if (students === 0 && village) {
    var onFile = getVillages(district, block, school).filter(function (v) {
      return !locMatch_(v, village) && villageSimilar_(v, village);
    });
    if (onFile.length) result.villagesOnFile = onFile;
  }
  return result;
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
    var out = {
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
    if (bill.villagesOnFile) out.villagesOnFile = bill.villagesOnFile;
    return out;
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
    // G:L lets the same row-layout detector used by billing include legacy
    // registrations in the administrative dues rebuild as well.
    var rows = reg.getRange(2, 7, reg.getLastRow() - 1, 6).getValues();
    for (var i = 0; i < rows.length; i++) {
      var loc = regRowLocation_(rows[i][0], rows[i][1], rows[i][2], rows[i][3], rows[i][4], rows[i][5]);
      var v = loc.village;
      var s = schoolDisplayName_(loc.school, v);
      if (!s) continue;
      ensure(loc.district, loc.block, s, v).students++;
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

// ---------------------------------------------------------------------
// ONE-TIME MAINTENANCE — run manually from the Apps Script editor
// (select fixSchoolNameSplits from the function dropdown, click Run).
// Not called by any API action; safe to delete after running once.
//
// Fixes registrations for a real school that got split across different
// spellings/formats of the School column itself (typos, legacy comma
// format, "PM SHRI" renaming inconsistency, a stray truncated/garbled
// entry) — as opposed to Village drift, which countSchoolStudents_ and
// getVillages already tolerate at query time. Each entry below was
// verified by hand against the exported sheet data: same real village,
// same admin level (senior-secondary vs primary etc. not mixed), and
// checked for cross-block collisions before being scoped to a specific
// district+block so it can't touch a same-named school elsewhere.
//
// Every match is EXACT (district + block + full School cell text, and
// for the Parda Saroda case also Village) — nothing here does a partial
// or fuzzy replace, so a row that doesn't match one of these entries
// exactly is left untouched.
function fixSchoolNameSplits() {
  var sheet = getRegistrationSheet_(getSpreadsheet_());
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log('No data rows.');
    return;
  }

  // { district, block, school: exact current School text to match,
  //   village: optional — only set when the School text alone isn't
  //   unique enough within that district+block, e.g. the Parda Saroda
  //   case shares its bare School text with two other real schools
  //   (Vamasa, Saroda) in the same block, so Village disambiguates it.
  //   replacement: new School text to write. }
  var fixes = [
    { district: 'BUNDI', block: 'K.PATAN', school: 'GSSS GRAMPURA GRAMIN LAKHERI, LAKHERI', replacement: 'GSSS GARAMPURA GRAMEEN LAKHERI' },
    { district: 'BUNDI', block: 'K.PATAN', school: 'GSSS GRAMPURA GRAMIN LAKHERI , LAKHERI', replacement: 'GSSS GARAMPURA GRAMEEN LAKHERI' },
    { district: 'BUNDI', block: 'K.PATAN', school: 'GSSS GRAMPURA GRAMEEN LAKHERI, LAKHERI', replacement: 'GSSS GARAMPURA GRAMEEN LAKHERI' },
    { district: 'BUNDI', block: 'K.PATAN', school: 'GSSS GARAMPURA GRAMEEN LAKHERI ,LAKHERI', replacement: 'GSSS GARAMPURA GRAMEEN LAKHERI' },
    { district: 'BUNDI', block: 'K.PATAN', school: 'GSSS GARAMPURA GRAMEEN LAKHERIL', replacement: 'GSSS GARAMPURA GRAMEEN LAKHERI' },
    { district: 'BUNDI', block: 'K.PATAN', school: 'GSSS GRAMPURA GRAMEEN LAKHERI', replacement: 'GSSS GARAMPURA GRAMEEN LAKHERI' },
    { district: 'BUNDI', block: 'K.PATAN', school: 'GSSS GRAMPURA GRAMIN LAKHERI', replacement: 'GSSS GARAMPURA GRAMEEN LAKHERI' },

    { district: 'DUNGARPUR', block: 'ASPUR', school: 'GOVERMENT SENIOR SECONDARY SCHOOL BADOUDA', replacement: 'GOVT SENIOR SECONDARY SCHOOL' },
    { district: 'DUNGARPUR', block: 'ASPUR', school: 'KATISOUR,ASPUR', replacement: 'GSSS KATISOUR,ASPUR' },

    { district: 'BHILWARA', block: 'RAIPUR', school: "GSSS-THALA'VILLAGAE-THALA , RAIPUR", replacement: 'GSSS THALA' },
    { district: 'BHILWARA', block: 'RAIPUR', school: 'G.S.S.S THALA ,RAIPUR', replacement: 'GSSS THALA' },

    { district: 'BARAN', block: 'ANTA', school: 'MGGS, SORKHAND KALAN', replacement: 'MGGS SORKHAND KALAN' },

    { district: 'CHITTORGARH', block: 'NIMBAHERA', school: 'PM SHRI G S S S', replacement: 'PM SHRI GSS SCHOOL' },
    { district: 'CHITTORGARH', block: 'NIMBAHERA', school: 'P M SHRI G S S SCHOOL', replacement: 'PM SHRI GSS SCHOOL' },
    { district: 'CHITTORGARH', block: 'NIMBAHERA', school: 'P M SHRI GSS, SCHOOL', replacement: 'PM SHRI GSS SCHOOL' },
    { district: 'CHITTORGARH', block: 'NIMBAHERA', school: 'PMSHRI GSS,SCHOOL', replacement: 'PM SHRI GSS SCHOOL' },
    { district: 'CHITTORGARH', block: 'NIMBAHERA', school: 'PM SHRI GSS, SCHOOL', replacement: 'PM SHRI GSS SCHOOL' },
    { district: 'CHITTORGARH', block: 'NIMBAHERA', school: 'GOVERNMENT UPPER PRIMARY SCHOOL MURLIYA, MURLIYA', replacement: 'GOVT UPPER PRIMARY SCHOOL' },

    { district: 'DUNGARPUR', block: 'SAGWARA', school: 'GOVT SENIOR SECONDARY SCHOOL VAMASA,CANADA/VAMASA', replacement: 'GOVT SENIOR SECONDARY SCHOOL' },
    { district: 'DUNGARPUR', block: 'SAGWARA', school: 'GOV', replacement: 'GOVT SENIOR SECONDARY SCHOOL' },
    { district: 'DUNGARPUR', block: 'SAGWARA', school: 'GOVT SENIOR SECONDARY SCHOOL', village: 'PARDA SARODA', replacement: 'GOVT SR SEC SCHOOL PARDA SARODA' }
  ];

  var values = sheet.getRange(2, 7, lastRow - 1, 4).getValues(); // G:J = District, Block, School, Village
  var counts = {};
  var writes = []; // {row, value}

  for (var i = 0; i < values.length; i++) {
    var district = String(values[i][0] || '').trim().toUpperCase();
    var block = String(values[i][1] || '').trim().toUpperCase();
    var school = String(values[i][2] || '').trim();
    var village = String(values[i][3] || '').trim().toUpperCase();
    var sheetRow = i + 2;

    for (var f = 0; f < fixes.length; f++) {
      var fx = fixes[f];
      if (district !== fx.district || block !== fx.block || school !== fx.school) continue;
      if (fx.village && village !== fx.village) continue;
      writes.push({ row: sheetRow, value: fx.replacement });
      var logKey = fx.district + '/' + fx.block + ': "' + fx.school + '"' + (fx.village ? ' [village=' + fx.village + ']' : '') + ' -> "' + fx.replacement + '"';
      counts[logKey] = (counts[logKey] || 0) + 1;
      break;
    }
  }

  Logger.log('Rows matched per fix:');
  Object.keys(counts).forEach(function (k) { Logger.log('  ' + counts[k] + '  ' + k); });
  Logger.log('Total rows to change: ' + writes.length);

  for (var w = 0; w < writes.length; w++) {
    sheet.getRange(writes[w].row, 9).setValue(writes[w].value); // column I = School
  }

  Logger.log('Done — School column updated for ' + writes.length + ' rows.');
}
