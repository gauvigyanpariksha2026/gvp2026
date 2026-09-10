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
// Column T is deliberately outside both the current (A:M) and legacy (A:R)
// registration layouts. Registrations are counted immediately (blank status);
// an organizer can still set this to Pending/Verified manually in the sheet
// to hold a specific row back from bills/student lists if needed.
var REG_STATUS_COLUMN_ = 20;
var REG_STATUS_HEADER_ = 'Registration Status';
var REG_GLOBAL_WINDOW_SEC_ = 600;
var REG_GLOBAL_WINDOW_MAX_ = 100;
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
  if (action === 'getSchoolStudents') {
    return jsonOut_({ ok: false, error: 'Student-list access requires POST' });
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

function getCanonicalDistrict_(district) {
  var candidate = String(district || '').trim();
  if (!candidate) return '';
  if (DISTRICT_BLOCKS[candidate]) return candidate;
  var districts = Object.keys(DISTRICT_BLOCKS);
  for (var i = 0; i < districts.length; i++) {
    if (locMatch_(districts[i], candidate)) return districts[i];
  }
  return '';
}

function getCanonicalBlock_(canonicalDistrict, block) {
  var candidate = String(block || '').trim();
  if (!canonicalDistrict || !candidate) return '';
  var blocks = DISTRICT_BLOCKS[canonicalDistrict] || [];
  for (var i = 0; i < blocks.length; i++) {
    if (blocks[i] === candidate || locMatch_(blocks[i], candidate)) return blocks[i];
  }
  return '';
}

function getBlocks(district) {
  var canonical = getCanonicalDistrict_(district);
  return canonical ? (DISTRICT_BLOCKS[canonical] || []) : [];
}

function isKnownDistrict_(value) {
  return !!getCanonicalDistrict_(value);
}

function compactKey_(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Phonetic/transliteration normalization for Indian English location and school names.
 * Equates W and V (Hindi 'व' transliteration), collapses doubled vowels (aa->a, ee->i, oo->u),
 * and removes an optional unstressed "a" between consonants. This gives a
 * common transliteration key for any place or school name (for example,
 * Kothariya/Kothriya and Jawada/Javda), rather than maintaining a list of
 * place-specific spelling exceptions.
 */
function phoneticKey_(s) {
  var k = compactKey_(s);
  if (!k) return '';
  k = k.replace(/chh/g, 'ch')
       .replace(/ph/g, 'f')
       .replace(/th/g, 't')
       .replace(/dh/g, 'd')
       .replace(/bh/g, 'b')
       .replace(/kh/g, 'k')
       .replace(/gh/g, 'g');
  k = k.replace(/w/g, 'v');
  k = k.replace(/aa+/g, 'a')
       .replace(/ee+/g, 'i')
       .replace(/oo+/g, 'u')
       .replace(/ii+/g, 'i')
       .replace(/uu+/g, 'u');
  // Hindi transliterations often include or omit a short "a" (schwa) in
  // the middle of a word. Apply the same rule to every name, then ignore a
  // final trailing "a" so Jawad/Jawada and Kothriya/Kothariya stay together.
  k = k.replace(/([bcdfghjklmnpqrstvwxyz])a(?=[bcdfghjklmnpqrstvwxyz])/g, '$1')
       .replace(/a$/, '');
  return k;
}

// Location labels frequently include a village/ward number. Treat a separated
// Arabic number and its Roman-numeral form as the same suffix, while keeping
// different numbers distinct: "Jawada 2", "Javada II", "JawadaII" and "Javda-2" match;
// "Jawada 1" does not. This is used only for location comparison, never for
// approval-roster matching or changing the spelling stored in a sheet.
function locationKey_(s) {
  var raw = String(s || '').toLowerCase()
    .replace(/([a-z])(iii|ii|iv)\b/g, '$1 $2')
    .replace(/\biv\b/g, '4')
    .replace(/\biii\b/g, '3')
    .replace(/\bii\b/g, '2')
    .replace(/\bi\b/g, '1');
  // A generic Hindi/English "village" filler word is often written right
  // next to the actual place name ("Gao Padwa", "Gaon Padwa", "Gram
  // Padwa", "Village Padwa") and carries no identifying information of
  // its own, so drop it before keying. Only whole standalone words are
  // stripped (word-boundary matched), never a substring, so a real place
  // name that happens to start the same way (e.g. "Gaonri") is untouched.
  raw = raw.replace(/\b(gao|gaon|gram|village|vill)\b/g, ' ');
  return phoneticKey_(raw);
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
  if (locationKey_(s) && locationKey_(s) === locationKey_(sel)) return true;
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
  if (locMatch_(a, b)) return true;
  var ak = compactKey_(a), bk = compactKey_(b);
  if (!ak || !bk) return false;
  if (ak === bk) return true;

  var minLen = Math.min(ak.length, bk.length);
  // Do not allow tiny substrings (< 4 chars) to match longer words (e.g. "Bor" inside "Boria" or "Pal" inside "Palasoda").
  if (minLen >= 4 && (ak.indexOf(bk) > -1 || bk.indexOf(ak) > -1)) return true;

  var ap = locationKey_(a), bp = locationKey_(b);
  if (ap && bp) {
    if (ap === bp) return true;
    var minP = Math.min(ap.length, bp.length);
    if (minP >= 4 && (ap.indexOf(bp) > -1 || bp.indexOf(ap) > -1)) return true;
    // Length-gated Levenshtein:
    // Short keys (< 4) must match exactly.
    // Medium keys (4-6 chars) allow at most 1 typo.
    // Long keys (7+ chars) allow up to 2 typos.
    var d = levenshtein_(ap, bp);
    if (minP >= 7 && d <= 2) return true;
    if (minP >= 4 && d <= 1) return true;
  }

  var dComp = levenshtein_(ak, bk);
  if (minLen >= 7 && dComp <= 2) return true;
  if (minLen >= 4 && dComp <= 1) return true;

  return false;
}

// Whole-name abbreviations, expanded to the same words schoolNormalizeKey_
// would produce from the spelled-out name, so e.g. "GSSS Lasdawan" and
// "Govt Senior Secondary School Lasdawan" normalize to the same key. Place
// names are never touched, so two different real schools that happen to
// share this boilerplate still stay distinct. Only add entries here that
// are unambiguous — DPS and govt-school prefixes always expand
// to the same thing; a vaguer private-school initialism (which could stand
// for several different actual school names) should not go in this table.
var SCHOOL_ABBR_EXPAND_ = {
  gsss: ['govt', 'sr', 'sec', 'school'],
  ggsss: ['govt', 'girls', 'sr', 'sec', 'school'],
  gbsss: ['govt', 'boys', 'sr', 'sec', 'school'],
  // GSS (3 letters) is treated the same as GSSS (4 letters) rather than
  // its own literal "Govt Sec School" reading: in practice this data set
  // almost never has a real, distinct non-senior "Govt Sec School" sharing
  // a place name with a "Govt Sr Sec School" — GSS is overwhelmingly a
  // dropped-S shorthand for GSSS written by a different parent for the
  // same school, and a roster fragmented across the two spellings was the
  // more common real-world failure than the rare genuine GSS/GSSS collision.
  gss: ['govt', 'sr', 'sec', 'school'],
  ggss: ['govt', 'girls', 'sr', 'sec', 'school'],
  gbss: ['govt', 'boys', 'sr', 'sec', 'school'],
  gups: ['govt', 'up', 'pri', 'school'],
  ggups: ['govt', 'girls', 'up', 'pri', 'school'],
  gbups: ['govt', 'boys', 'up', 'pri', 'school'],
  gps: ['govt', 'pri', 'school'],
  ggps: ['govt', 'girls', 'pri', 'school'],
  gbps: ['govt', 'boys', 'pri', 'school'],
  gms: ['govt', 'mid', 'school'],
  ggms: ['govt', 'girls', 'mid', 'school'],
  ghss: ['govt', 'sr', 'sec', 'school'],
  hss: ['sr', 'sec', 'school'],
  mggs: ['mahatma', 'gandhi', 'govt', 'school'],
  kgbv: ['kasturba', 'gandhi', 'girls', 'school'],
  kv: ['kendriya', 'school'],
  jnv: ['jawahar', 'navodaya', 'school'],
  dps: ['delhi', 'public', 'school'],
  pmshri: ['pm', 'shri'],
  raumavi: ['govt', 'sr', 'sec', 'school'],
  raumaavi: ['govt', 'sr', 'sec', 'school'],
  rumv: ['govt', 'sr', 'sec', 'school'],
  rumvi: ['govt', 'sr', 'sec', 'school'],
  raubamavi: ['govt', 'girls', 'sr', 'sec', 'school'],
  raubaumaavi: ['govt', 'girls', 'sr', 'sec', 'school'],
  rbumv: ['govt', 'girls', 'sr', 'sec', 'school'],
  ramavi: ['govt', 'sec', 'school'],
  ramaavi: ['govt', 'sec', 'school'],
  rmv: ['govt', 'sec', 'school'],
  raupravi: ['govt', 'up', 'pri', 'school'],
  raupraavi: ['govt', 'up', 'pri', 'school'],
  rupv: ['govt', 'up', 'pri', 'school'],
  rapravi: ['govt', 'pri', 'school'],
  rapraavi: ['govt', 'pri', 'school'],
  rpv: ['govt', 'pri', 'school'],
  svgms: ['govt', 'model', 'school'],
  svms: ['govt', 'model', 'school']
};
var SCHOOL_WORD_SYNONYMS_ = {
  government: 'govt', govt: 'govt', rajkiya: 'govt', rajkya: 'govt',
  senior: 'sr', sr: 'sr', sen: 'sr', higher: 'sr', hr: 'sr',
  secondary: 'sec', sec: 'sec',
  primary: 'pri', pri: 'pri', prim: 'pri',
  upper: 'up', up: 'up',
  middle: 'mid', mid: 'mid',
  school: 'school', vidyalaya: 'school', vidhyalaya: 'school',
  vidyalay: 'school', vidhyalay: 'school', vidyapeeth: 'school', vidyapith: 'school',
  girls: 'girls', girl: 'girls', balika: 'girls',
  boys: 'boys', boy: 'boys', balak: 'boys',
  uchh: 'sr', uchch: 'sr', uchcha: 'sr', uch: 'sr',
  madhyamik: 'sec', madhyamika: 'sec', madhymik: 'sec',
  prathmik: 'pri', prathamik: 'pri', praathmik: 'pri',
  model: 'model'
};

// Every distinct word ever typed for the same boilerplate concept ("school",
// "senior", "government", ...) is not something a fixed spelling table can
// keep up with — parents and clerks drop or swap a letter often enough
// (Goverment, Govermnet, Seconday, Scondary, Midle) that treating each typo
// as a brand-new, never-before-seen word silently fragments one school's
// roster across spellings, the same way GSS/GSSS did. This falls back to
// the closest canonical word (by edit distance) only for words the exact
// table missed, and only among words with a real spelled-out form (4+
// letters) — the short abbreviated forms (sr, sec, pri, up, mid, ...) are
// deliberately excluded as fuzzy *targets* since a 1-letter difference
// between two short, different words is far too easy to hit by accident.
// The threshold grows with word length because a fixed edit count is a much
// bigger fraction of a short word (more likely to accidentally cross into a
// different real word) than of a long one. Checked once for the whole
// table (tests/check.js) to confirm no two *different* canonical words are
// ever within each other's threshold — every hit found is already a
// same-target spelling variant that is safe to add.
var SCHOOL_WORD_CANON_ = Object.keys(SCHOOL_WORD_SYNONYMS_).filter(function (w) { return w.length >= 4; });
function schoolWordTypoMaxDist_(len) {
  return len >= 9 ? 3 : len >= 6 ? 2 : len >= 4 ? 1 : 0;
}
function fuzzySchoolWord_(w) {
  if (w.length < 4 || SCHOOL_ABBR_EXPAND_[w] || SCHOOL_WORD_SYNONYMS_[w]) return w;
  var best = w, bestDist = Infinity;
  for (var i = 0; i < SCHOOL_WORD_CANON_.length; i++) {
    var canon = SCHOOL_WORD_CANON_[i];
    if (Math.abs(canon.length - w.length) > schoolWordTypoMaxDist_(Math.max(canon.length, w.length))) continue;
    var maxDist = Math.min(schoolWordTypoMaxDist_(canon.length), schoolWordTypoMaxDist_(w.length));
    var d = levenshtein_(w, canon);
    if (d <= maxDist && d < bestDist) { bestDist = d; best = canon; }
  }
  return best;
}

// School-name-only matching key: expands known abbreviations and collapses
// common spelling variants (govt/government, sr/senior, sec/secondary, ...)
// before compacting, so abbreviation vs. spelled-out names of the same
// school match. Used only for the School field — district/block come from
// a fixed dropdown and never need this.
function schoolNormalizeKey_(s) {
  // Normalize Roman numerals and numbers before word splitting so Roman numerals
  // attached to place names ("JawadaII") or isolated in abbreviations ("G.S.S.S. I")
  // are normalized to digits and never swallowed into single-letter acronym groups.
  var sLower = String(s || '').toLowerCase()
    .replace(/([a-z])(iii|ii|iv)\b/g, '$1 $2')
    .replace(/\biv\b/g, '4')
    .replace(/\biii\b/g, '3')
    .replace(/\bii\b/g, '2')
    .replace(/\bi\b/g, '1');

  // A few spreadsheet rows concatenate "school" or "vidyalaya" and the place name (for
  // example, "SCHOOLJAWADA-II" or "GSSSSCHOOL"). Restore missing boundaries before
  // generic word-based normalization; this is not tied to any one place.
  var rawWords = sLower
    .replace(/([a-z])(school|vidyalaya|vidhyalaya|vidyalay|vidhyalay)/g, '$1 $2')
    .replace(/(school|vidyalaya|vidhyalaya|vidyalay|vidhyalay)(?=[a-z])/g, '$1 ')
    .split(/[^a-z0-9]+/).filter(function (w) { return Boolean(w); });

  // Group consecutive single alphabet letters into an acronym (e.g. ['g', 's', 's', 's'] -> 'gsss').
  // Exclude single digits (1, 2, etc.) so suffixes are not swallowed into the acronym.
  var words = [];
  for (var i = 0; i < rawWords.length; i++) {
    if (/^[a-z]$/.test(rawWords[i])) {
      var acro = '';
      var j = i;
      while (j < rawWords.length && /^[a-z]$/.test(rawWords[j])) {
        acro += rawWords[j];
        j++;
      }
      if (acro.length > 1) {
        words.push(acro);
        i = j - 1;
        continue;
      }
    }
    words.push(rawWords[i]);
  }

  var out = [];
  for (var k = 0; k < words.length; k++) {
    var w = fuzzySchoolWord_(words[k]);
    var expanded = SCHOOL_ABBR_EXPAND_[w] || [SCHOOL_WORD_SYNONYMS_[w] || w];
    expanded.forEach(function (word) {
      // GSSS expands to "... school"; an immediately following literal
      // SCHOOL is redundant, not a different school identity.
      if (out[out.length - 1] !== word) out.push(word);
    });
  }

  // Institutional modifier reordering:
  // If 'girls' or 'boys' appears after 'sr sec', 'sec', 'mid', 'up pri', 'pri',
  // reorder it to precede them (e.g. 'govt sr sec girls school' -> 'govt girls sr sec school')
  // so word order in English translations of Hindi board names is invariant.
  var joined = ' ' + out.join(' ') + ' ';
  joined = joined.replace(/ govt (sr sec|sec|mid|up pri|pri) (girls|boys) school /g, ' govt $2 $1 school ');
  out = joined.trim().split(/\s+/);

  // Keep word boundaries until locationKey_ has converted a separated Roman
  // numeral (e.g. "II") to the matching Arabic suffix ("2").
  return locationKey_(out.join(' '));
}

function schoolMatch_(sheetVal, selected) {
  if (locMatch_(sheetVal, selected)) return true;
  var sel = String(selected || '').trim();
  if (!sel) return true;
  var s = String(sheetVal || '').trim();
  if (!s) return false;
  var k1 = schoolNormalizeKey_(s);
  var k2 = schoolNormalizeKey_(sel);
  if (k1 === k2) return true;

  // PM-SHRI scheme prefix tolerance:
  // Schools upgraded under the Central PM-SHRI scheme are often entered with
  // or without the "PM SHRI" / "PMSHRI" prefix (e.g. "PM SHRI GSSS Jawada" vs "GSSS Jawada").
  var p1 = k1.replace(/^pmshri/, '');
  var p2 = k2.replace(/^pmshri/, '');
  if (p1 && p1 === p2) return true;

  // Registrations made before the separate Village field was introduced put
  // "School name, Village" in the School cell. Accept the school-name part
  // when looking up those legacy rows so the new comma-free form can still
  // find their bill and prior payments.
  var comma = s.lastIndexOf(',');
  if (comma > 0) {
    var kLegacy = schoolNormalizeKey_(s.substring(0, comma));
    if (kLegacy === k2) return true;
    if (p2 && kLegacy.replace(/^pmshri/, '') === p2) return true;
  }
  return false;
}

// Return a displayable school name for both current and legacy rows. A comma
// is removed only when its suffix is exactly the separately stored Village
// value, so punctuation that is genuinely part of a school name is retained.
function schoolDisplayName_(school, village) {
  var name = String(school || '').trim();
  var place = String(village || '').trim();
  var comma = name.lastIndexOf(',');
  if (comma > 0 && place && locMatch_(name.substring(comma + 1), place)) {
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
  var cd = getCanonicalDistrict_(district);
  if (!cd) {
    return 'जिला सही नहीं है / Select a valid district';
  }
  var cb = getCanonicalBlock_(cd, block);
  if (!cb) {
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
  for (var k = 0; k < sheets.length; k++) {
    if (!UTILITY_SHEETS_[sheets[k].getName()]) return sheets[k];
  }
  return ss.insertSheet('Registrations');
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

function ensureRegistrationStatusColumn_(sheet) {
  var missing = REG_STATUS_COLUMN_ - sheet.getMaxColumns();
  if (missing > 0) sheet.insertColumnsAfter(sheet.getMaxColumns(), missing);
  var current = String(sheet.getRange(1, REG_STATUS_COLUMN_).getValue() || '').trim();
  if (current && current !== REG_STATUS_HEADER_) {
    throw new Error('Column T is already in use. Move that data before enabling registration status.');
  }
  if (!current) {
    sheet.getRange(1, REG_STATUS_COLUMN_).setValue(REG_STATUS_HEADER_);
  }
  PropertiesService.getScriptProperties().setProperty('REG_STATUS_SECURITY_ENABLED', '1');
}

function registrationStatuses_(sheet, rowCount, startRow) {
  if (rowCount < 1) return [];
  startRow = startRow || 2;
  var props = PropertiesService.getScriptProperties();
  var enabled = props.getProperty('REG_STATUS_SECURITY_ENABLED') === '1';
  function failClosed_() {
    var out = [];
    for (var i = 0; i < rowCount; i++) out.push(['Invalid']);
    return out;
  }
  if (!enabled) {
    if (sheet.getMaxColumns() < REG_STATUS_COLUMN_) return [];
    var freshHeader = String(sheet.getRange(1, REG_STATUS_COLUMN_).getValue() || '').trim();
    if (freshHeader !== REG_STATUS_HEADER_) return [];
    props.setProperty('REG_STATUS_SECURITY_ENABLED', '1');
    return sheet.getRange(startRow, REG_STATUS_COLUMN_, rowCount, 1).getValues();
  }
  // Once this sheet has ever had a real "Registration Status" column, a
  // missing or blank column T is almost always an accidental edit (the
  // column deleted, or just its header cell cleared) rather than a legacy
  // workbook's unrelated data reappearing — self-heal by recreating the
  // header instead of treating every row on the sheet as unverified, which
  // otherwise zeroes out every school's bill and student list at once from
  // a single cleared cell. A column T that instead holds some OTHER,
  // non-blank text is left untouched and still fails closed: that is the
  // legacy-data scenario this check exists to protect against.
  var missing = REG_STATUS_COLUMN_ - sheet.getMaxColumns();
  if (missing > 0) sheet.insertColumnsAfter(sheet.getMaxColumns(), missing);
  var header = String(sheet.getRange(1, REG_STATUS_COLUMN_).getValue() || '').trim();
  if (!header) {
    sheet.getRange(1, REG_STATUS_COLUMN_).setValue(REG_STATUS_HEADER_);
    header = REG_STATUS_HEADER_;
  }
  if (header !== REG_STATUS_HEADER_) return failClosed_();
  return sheet.getRange(startRow, REG_STATUS_COLUMN_, rowCount, 1).getValues();
}

function registrationVerified_(status) {
  var value = String(status || '').trim().toLowerCase();
  // Blank preserves registrations created before this status column existed.
  return !value || value === 'verified' || value === 'approved';
}

function registrationWriteAllowed_(data) {
  // This helper runs under the script lock. The property-backed global bucket
  // provides a hard bound even if attacker-controlled cache keys are rotated.
  var props = PropertiesService.getScriptProperties();
  var nowSec = Math.floor(Date.now() / 1000);
  var windowStart = Number(props.getProperty('REG_RATE_WINDOW_START') || 0);
  var globalCount = Number(props.getProperty('REG_RATE_WINDOW_COUNT') || 0);
  if (!windowStart || nowSec - windowStart >= REG_GLOBAL_WINDOW_SEC_) {
    windowStart = nowSec;
    globalCount = 0;
  }
  if (globalCount >= REG_GLOBAL_WINDOW_MAX_) return false;

  var cache = CacheService.getScriptCache();
  var mobileKey = 'reg-mobile:' + compactKey_(data.mobile);
  var schoolKey = 'reg-school:' + compactKey_(data.district) + ':' + compactKey_(data.block) + ':' +
    schoolNormalizeKey_(data.school) + ':' + locationKey_(data.village);
  var mobileCount = Number(cache.get(mobileKey) || 0);
  var schoolCount = Number(cache.get(schoolKey) || 0);
  if (mobileCount >= 3 || schoolCount >= 50) return false;
  props.setProperty('REG_RATE_WINDOW_START', String(windowStart));
  props.setProperty('REG_RATE_WINDOW_COUNT', String(globalCount + 1));
  cache.put(mobileKey, String(mobileCount + 1), 21600);
  cache.put(schoolKey, String(schoolCount + 1), 600);
  return true;
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

// Before writing a new registration, reuse the dominant spelling already on
// file when its district, block, school and village all resolve to the same
// existing identity. This prevents new form submissions from creating fresh
// "GSSS"/"Government School", spacing, transliteration, or II/2 variants.
// A tie is deliberately left untouched: the lookup still works, but the API
// never guesses between equally common stored spellings.
function canonicalRegistrationLocation_(sheet, district, block, school, village) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { school: school, village: village, changed: false };
  var scanCount = Math.min(lastRow - 1, 1500);
  var startRow = lastRow - scanCount + 1;
  var values = sheet.getRange(startRow, 7, scanCount, 6).getValues();
  var statuses = registrationStatuses_(sheet, scanCount, startRow);
  var candidates = {};
  for (var i = 0; i < values.length; i++) {
    if (!registrationVerified_(statuses[i] && statuses[i][0])) continue;
    var loc = regRowLocation_(values[i][0], values[i][1], values[i][2], values[i][3], values[i][4], values[i][5]);
    if (!loc.school || !loc.village) continue;
    if (!locMatch_(loc.district, district) || !locMatch_(loc.block, block)) continue;
    var onFileSchool = schoolDisplayName_(loc.school, loc.village);
    if (!schoolMatch_(onFileSchool, school) || !locMatch_(loc.village, village)) continue;
    var key = upper_(onFileSchool) + '\u0000' + upper_(loc.village);
    if (!candidates[key]) candidates[key] = { school: onFileSchool, village: loc.village, count: 0 };
    candidates[key].count++;
  }
  var matches = Object.keys(candidates).map(function (key) { return candidates[key]; });
  if (!matches.length) return { school: school, village: village, changed: false };
  matches.sort(function (a, b) { return b.count - a.count || a.school.localeCompare(b.school) || a.village.localeCompare(b.village); });
  if (matches.length > 1 && matches[0].count === matches[1].count) return { school: school, village: village, changed: false };
  var winner = matches[0];
  return {
    school: winner.school,
    village: winner.village,
    changed: upper_(winner.school) !== upper_(school) || upper_(winner.village) !== upper_(village)
  };
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
      ensureRegistrationStatusColumn_(sheet);
      var canonicalLocation = canonicalRegistrationLocation_(sheet, data.district, data.block, data.school, data.village);
      data.school = canonicalLocation.school;
      data.village = canonicalLocation.village;
      if (duplicateRegistrationExists_(sheet, data.name, data.father, data.mobile)) {
        return { ok: false, error: 'यह विद्यार्थी पहले से पंजीकृत है / This student is already registered' };
      }
      if (!registrationWriteAllowed_(data)) {
        return { ok: false, error: 'बहुत अधिक पंजीकरण प्रयास हुए हैं। कृपया बाद में पुनः प्रयास करें / Too many registration attempts. Please try again later.' };
      }
      var initialStatus = '';
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
        ACADEMIC_YEAR,
        '', '', '', '', '', '',
        initialStatus
      ]);
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
  var statuses = registrationStatuses_(sheet, lastRow - 1);
  var n = 0;
  for (var i = 0; i < values.length; i++) {
    if (!registrationVerified_(statuses[i] && statuses[i][0])) continue;
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
    mobile = String(mobile || '').replace(/\s+/g, '').replace(/^[+]?(91|0)(?=[6-9][0-9]{9}$)/, '');
    if (!school) return { ok: false, error: 'School name is required / विद्यालय का नाम लिखें' };
    if (!village) return { ok: false, error: 'Village or city is required / गाँव या शहर लिखें' };
    var locErr = validLocation_(district, block);
    if (locErr) return { ok: false, error: locErr };
    var validMobile = /^[6-9][0-9]{9}$/.test(mobile) && !isFakeMobile_(mobile);
    if (!validMobile) {
      return { ok: false, error: 'Enter a registered mobile number to view students / छात्र सूची देखने हेतु पंजीकृत मोबाइल नंबर लिखें' };
    }

    var ss = getSpreadsheet_();
    var sheet = getRegistrationSheet_(ss);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: true, data: [] };

    // A:O includes the registration number plus every current/legacy field
    // needed for the authorized participant list. OMR is intentionally not
    // returned because schools do not need it for this report.
    var width = Math.min(15, sheet.getMaxColumns());
    var values = sheet.getRange(2, 1, lastRow - 1, width).getValues();
    var statuses = registrationStatuses_(sheet, lastRow - 1);
    var matched = [];
    var mobileFound = false;
    for (var i = 0; i < values.length; i++) {
      if (!registrationVerified_(statuses[i] && statuses[i][0])) continue;
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
function getSchools(district, block) {
  var sheet = getRegistrationSheet_(getSpreadsheet_());
  var lastRow = sheet.getLastRow();
  var out = [];
  if (lastRow >= 2) {
    // G:L so regRowLocation_ can fall back to the pre-migration column
    // position (see its comment) for rows written before the schema shrink.
    var values = sheet.getRange(2, 7, lastRow - 1, 6).getValues();
    var statuses = registrationStatuses_(sheet, lastRow - 1);
    var seen = {};
    for (var i = 0; i < values.length; i++) {
      if (!registrationVerified_(statuses[i] && statuses[i][0])) continue;
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
    var statuses = registrationStatuses_(sheet, lastRow - 1);
    var seen = {};
    for (var i = 0; i < values.length; i++) {
      if (!registrationVerified_(statuses[i] && statuses[i][0])) continue;
      var loc = regRowLocation_(values[i][0], values[i][1], values[i][2], values[i][3], values[i][4], values[i][5]);
      if (!loc.school) continue;
      if (district && !locMatch_(loc.district, district)) continue;
      if (block && !locMatch_(loc.block, block)) continue;
      if (!schoolMatch_(schoolDisplayName_(loc.school, loc.village), school)) continue;
      var place = loc.village;
      if (!place) continue;
      var key = locationKey_(place);
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
    var st = String(values[i][6] || '').trim().toLowerCase();
    // A user-entered UTR is only a payment report. It must not lower the
    // school bill until an organizer has checked the bank transaction and
    // changes this Status cell to Paid in the Payments sheet.
    if (st !== 'paid') continue;
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
    if (String(values[i][6] || '').trim().toLowerCase() !== 'reported') continue;
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
  // Unverified reports are informational only. They must not reserve the
  // balance and block a legitimate payer before an organizer verifies them.
  var amountReportable = amountDue;
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
    var utr = String(data.utr || '').replace(/\s+/g, '');
    var mobile = String(data.mobile || '').replace(/\s+/g, '').replace(/^[+]?(91|0)(?=[6-9][0-9]{9}$)/, '');

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

      // Reported rows do not reserve the balance. Only organizer-verified
      // Paid rows reduce amountDue.
      var reportableAmount = bill.amountReportable;
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
    return compactKey_(d) + '|' + compactKey_(b) + '|' + schoolNormalizeKey_(s) + '|' + locationKey_(v);
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
    var statuses = registrationStatuses_(reg, reg.getLastRow() - 1);
    for (var i = 0; i < rows.length; i++) {
      if (!registrationVerified_(statuses[i] && statuses[i][0])) continue;
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

