/**
 * Gau Vigyan Pariksha 2026 — web app
 *
 * Files needed in this project:
 *   Code.gs  (this file)
 *   Index    (HTML file — paste the updated registration page)
 *   Pay      (HTML file — school bulk payment page)
 *
 * Deploy → New deployment → Web app
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * School payment URL: YOUR_EXEC_URL?page=pay
 */

// For a spreadsheet-bound Apps Script, the attached spreadsheet is used first.
// For a standalone Apps Script, replace this with the ID between /d/ and /edit
// in your Google Sheet URL.
var SHEET_ID = '1y8pSU50mHR3jD0y9LxMUty-1y2RoBU4o5Cco1IXEiJk';

var FEE_PER_STUDENT = 30;
var UPI_VPA = 'SHREEDEVNARAYAN@SBI';
var UPI_NAME = 'SHREE DEV NARAYAN GOSHALA SAM';

var REG_HEADERS_ = [
  'Reg', 'Time', 'Name', 'Father', 'Mother', 'Gender', 'DOB', 'Class',
  'District', 'Block', 'School', 'Village', 'PIN', 'Address',
  'Mobile', 'WhatsApp', 'Email', 'OMR Roll'
];
var PAY_HEADERS_ = ['District', 'Block', 'School', 'Students', 'Amount Due', 'Amount Paid', 'Status', 'UTR', 'Payer Mobile', 'Reported At', 'Books'];
var DUES_HEADERS_ = ['District', 'Block', 'School', 'Students', 'Amount', 'Paid', 'Balance', 'Status', 'Books'];
var UTILITY_SHEETS_ = { 'Payments': true, 'School Dues': true };

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

function doGet(e) {
  var page = (e && e.parameter && e.parameter.page) || '';
  var file = (String(page).toLowerCase() === 'pay') ? payFileName_() : htmlFileName_();
  var template = HtmlService.createTemplateFromFile(file);
  template.webAppUrl = ScriptApp.getService().getUrl();
  return template.evaluate()
    .setTitle(file.toLowerCase().indexOf('pay') === 0 ? 'GVP 2026 — School Payment' : 'गौ विज्ञान परीक्षा — पंजीकरण')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function htmlFileName_() {
  var names = ['Index', 'index', 'Index_1', 'Form', 'form', 'Page', 'page'];
  for (var i = 0; i < names.length; i++) {
    try {
      HtmlService.createHtmlOutputFromFile(names[i]);
      return names[i];
    } catch (e) {}
  }
  throw new Error('No HTML file found. Add a file named Index and paste the registration page into it.');
}

function payFileName_() {
  var names = ['Pay', 'pay', 'Pay_1'];
  for (var i = 0; i < names.length; i++) {
    try { HtmlService.createHtmlOutputFromFile(names[i]); return names[i]; } catch (e) {}
  }
  throw new Error('Add an HTML file named Pay and paste the school payment page.');
}

function getDistricts() {
  return Object.keys(DISTRICT_BLOCKS);
}

function getBlocks(district) {
  return DISTRICT_BLOCKS[district] || [];
}

function compactKey_(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
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

function ensureRegistrationHeaders_(sheet) {
  var first = String(sheet.getRange(1, 1).getValue() || '').trim();
  if (!first || sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, REG_HEADERS_.length).setValues([REG_HEADERS_]);
    sheet.setFrozenRows(1);
  }
  if (!sheet.getRange(1, 18).getValue()) sheet.getRange(1, 18).setValue('OMR Roll');
}

function nextRegSerial_(sheet) {
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
  return max + 1;
}

function getSchools(district, block) {
  try {
    var ss = getSpreadsheet_();
    var regSheet = getRegistrationSheet_(ss);

    // 1) Try explicit, common sheet names first. Rename your school-directory
    //    tab to one of these (or add its exact name to the front of this list).
    var CANDIDATE_NAMES = ['Schools', 'School List', 'School Directory', 'Master', 'Directory'];
    var sheet = null;
    for (var c = 0; c < CANDIDATE_NAMES.length; c++) {
      var byName = ss.getSheetByName(CANDIDATE_NAMES[c]);
      if (byName) { sheet = byName; break; }
    }

    // 2) Fall back to header-content match, but explicitly skip the
    //    registration sheet and the script's own utility sheets so this
    //    can never accidentally read student data as school data.
    if (!sheet) {
      var matches = ss.getSheets().filter(function(s) {
        if (s.getSheetId() === regSheet.getSheetId()) return false;
        if (UTILITY_SHEETS_[s.getName()]) return false;
        var h = s.getRange(1, 1, 1, Math.max(s.getLastColumn(), 1)).getValues()[0].join(' ').toLowerCase();
        return h.indexOf('school') > -1 || h.indexOf('विद्यालय') > -1 || h.indexOf('udise') > -1;
      });
      sheet = matches[0];
    }

    if (!sheet || sheet.getLastRow() < 2) return [];
    var values = sheet.getDataRange().getValues();
    var out = [];
    var seen = {};
    for (var i = 1; i < values.length; i++) {
      var d = String(values[i][0] || '').trim();
      var b = String(values[i][1] || '').trim();
      var name = String(values[i][2] || '').trim();
      var udise = String(values[i][3] || '').trim();
      if (!name) continue;
      if (district && d && !locMatch_(d, district)) continue;
      if (block && b && !locMatch_(b, block)) continue;
      var key = compactKey_(name) + '|' + String(udise);
      if (seen[key]) continue;
      seen[key] = true;
      out.push({ name: name, udise: udise });
    }
    return out;
  } catch (e) {
    throw new Error(e && e.message ? e.message : 'Could not load the school directory.');
  }
}

function submitRegistration(data) {
  data = data || {};
  try {
    if (!data.name || !data.father || !data.gender || !data.cls) {
      return { ok: false, error: 'आवश्यक जानकारी अधूरी है' };
    }
    if (!data.district || !data.block || !data.school || !data.village) {
      return { ok: false, error: 'आवश्यक जानकारी अधूरी है' };
    }
    var locErr = validLocation_(data.district, data.block);
    if (locErr) return { ok: false, error: locErr };
    if (!/^[1-9][0-9]{5}$/.test(String(data.pin || ''))) {
      return { ok: false, error: 'पिन कोड ६ अंकों का होना चाहिए' };
    }
    if (!/^[6-9][0-9]{9}$/.test(String(data.mobile || ''))) {
      return { ok: false, error: 'मोबाइल नंबर सही नहीं है' };
    }
    if (!/^(Male|Female|Other)$/.test(String(data.gender || ''))) {
      return { ok: false, error: 'लिंग पुरुष, महिला या अन्य चुनें / Select Male, Female or Other' };
    }
    if (!/^(8|9|10|11|12)$/.test(String(data.cls || ''))) {
      return { ok: false, error: 'कक्षा 8 से 12 चुनें / Select class 8–12' };
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
      var nextNum = nextRegSerial_(sheet);
      var regNo = 'GVP-2026-' + ('00000' + nextNum).slice(-5);
      var omrNo = omrFromSerial_(nextNum);
      var now = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'M/d/yyyy HH:mm:ss');

      // Keep existing column order; leave removed fields blank
      // Reg | Time | Name | Father | Mother | Gender | DOB | Class | District | Block | School | Village | PIN | Address | Mobile | WhatsApp | Email | OMR Roll
      sheet.appendRow([
        regNo,
        now,
        String(data.name).trim(),
        String(data.father).trim(),
        '',
        data.gender,
        '',
        data.cls,
        String(data.district).trim(),
        String(data.block).trim(),
        String(data.school).trim(),
        String(data.village).trim(),
        String(data.pin).trim(),
        '',
        String(data.mobile).trim(),
        '',
        '',
        omrNo
      ]);
      return { ok: true, regNo: regNo, omrNo: omrNo };
    } finally {
      lock.releaseLock();
    }
  } catch (e) {
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
  var regs = sheet.getRange(2, 1, last - 1, 1).getValues();
  var out = [];
  for (var i = 0; i < regs.length; i++) {
    var m = String(regs[i][0] || '').match(/(\d+)$/);
    var n = m ? parseInt(m[1], 10) : (i + 1);
    out.push([omrFromSerial_(n)]);
  }
  sheet.getRange(2, 18, out.length, 1).setValues(out);
}

function ensurePaymentsSheet_() {
  var ss = getSpreadsheet_();
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
  }
  return sheet;
}

function countSchoolStudents_(district, block, school) {
  var ss = getSpreadsheet_();
  var sheet = getRegistrationSheet_(ss);
  if (sheet.getLastRow() < 2) return 0;
  var values = sheet.getDataRange().getValues();
  var n = 0;
  for (var i = 1; i < values.length; i++) {
    var sheetSchool = String(values[i][10] || '').trim();
    if (!sheetSchool) continue;
    if (district && !locMatch_(values[i][8], district)) continue;
    if (block && !locMatch_(values[i][9], block)) continue;
    if (!locMatch_(sheetSchool, school)) continue;
    n++;
  }
  return n;
}

function sumSchoolPaid_(district, block, school) {
  var sheet = ensurePaymentsSheet_();
  if (sheet.getLastRow() < 2) return 0;
  var values = sheet.getDataRange().getValues();
  var paid = 0;
  for (var i = 1; i < values.length; i++) {
    var st = String(values[i][6] || '').trim();
    if (st !== 'Reported' && st !== 'Paid') continue;
    if (district && !locMatch_(values[i][0], district)) continue;
    if (block && !locMatch_(values[i][1], block)) continue;
    if (!locMatch_(values[i][2], school)) continue;
    paid += Number(values[i][5]) || 0;
  }
  return paid;
}

function utrAlreadyUsed_(utr) {
  var sheet = ensurePaymentsSheet_();
  if (sheet.getLastRow() < 2) return false;
  var values = sheet.getRange(2, 8, sheet.getLastRow() - 1, 1).getValues();
  var key = String(utr || '').trim();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === key) return true;
  }
  return false;
}

function computeSchoolBill_(district, block, school) {
  var students = countSchoolStudents_(district, block, school);
  var amountPaid = sumSchoolPaid_(district, block, school);
  var amountDue = students * FEE_PER_STUDENT - amountPaid;
  if (amountDue < 0) amountDue = 0;
  var status = 'Due';
  if (students > 0 && amountDue === 0) status = 'Paid';
  else if (amountPaid > 0) status = 'Reported';
  return {
    students: students,
    fee: FEE_PER_STUDENT,
    amountDue: amountDue,
    amountPaid: amountPaid,
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

function getSchoolBill(district, block, school) {
  try {
    district = String(district || '').trim();
    block = String(block || '').trim();
    school = String(school || '').trim();
    if (!school) return { ok: false, error: 'School name is required / विद्यालय का नाम लिखें' };
    var locErr = validLocation_(district, block);
    if (locErr) return { ok: false, error: locErr };

    var bill = computeSchoolBill_(district, block, school);
    var upiPack = buildUpi_(bill.amountDue, school);
    return {
      ok: true,
      students: bill.students,
      fee: bill.fee,
      amountDue: bill.amountDue,
      amountPaid: bill.amountPaid,
      status: bill.status,
      needsUpi: upiPack.needsUpi,
      upi: upiPack.upi
    };
  } catch (e) {
    return { ok: false, error: e.message || 'Could not load bill' };
  }
}

function reportSchoolPayment(data) {
  data = data || {};
  try {
    var district = String(data.district || '').trim();
    var block = String(data.block || '').trim();
    var school = String(data.school || '').trim();
    var utr = String(data.utr || '').trim();
    var mobile = String(data.mobile || '').trim();

    if (!school) return { ok: false, error: 'School name is required / विद्यालय का नाम लिखें' };
    var locErr = validLocation_(district, block);
    if (locErr) return { ok: false, error: locErr };
    if (!/^[A-Za-z0-9][A-Za-z0-9 .,'()\/-]{1,118}$/.test(school)) {
      return { ok: false, error: 'Write school name in English / विद्यालय का नाम अंग्रेज़ी में लिखें' };
    }
    if (!/^[0-9]{6,24}$/.test(utr)) {
      return { ok: false, error: 'UTR / UPI Ref No must contain 6–24 digits only' };
    }
    if (!/^[6-9][0-9]{9}$/.test(mobile)) {
      return { ok: false, error: 'Enter a valid 10-digit mobile (starts with 6–9)' };
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      if (utrAlreadyUsed_(utr)) {
        return { ok: false, error: 'This UTR / UPI Ref No is already used / यह UTR पहले से दर्ज है' };
      }

      // Recalculate inside the lock so two clerks cannot report the same due twice.
      var bill = computeSchoolBill_(district, block, school);
      if (bill.students < 1) {
        return { ok: false, error: 'No students registered yet for this school' };
      }
      if (bill.amountDue <= 0) {
        return { ok: false, error: 'This school is already paid / cleared' };
      }

      var amount = bill.amountDue;
      var students = bill.students;
      var sheet = ensurePaymentsSheet_();
      var now = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'M/d/yyyy HH:mm:ss');
      sheet.appendRow([
        district,
        block,
        school,
        students,
        bill.amountDue,
        amount,
        'Reported',
        utr,
        mobile,
        now,
        'Pending'
      ]);
      return { ok: true, message: 'Payment reported. Books will be sent after verification.' };
    } finally {
      lock.releaseLock();
    }
  } catch (e) {
    return { ok: false, error: e.message || 'Could not save payment' };
  }
}

/** Admin: rebuild one row per school from registrations + payments. Run from the editor. */
function rebuildSchoolDues() {
  var ss = getSpreadsheet_();
  var reg = getRegistrationSheet_(ss);
  var paySheet = ensurePaymentsSheet_();
  var schools = {};
  var bookRank = { Pending: 0, Packed: 1, Sent: 2 };

  function keyOf(d, b, s) {
    return compactKey_(d) + '|' + compactKey_(b) + '|' + compactKey_(s);
  }
  function ensure(d, b, s) {
    var key = keyOf(d, b, s);
    if (!schools[key]) {
      schools[key] = {
        district: String(d || '').trim(),
        block: String(b || '').trim(),
        school: String(s || '').trim(),
        students: 0,
        paid: 0,
        books: 'Pending'
      };
    }
    return schools[key];
  }

  if (reg.getLastRow() >= 2) {
    var rows = reg.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      var s = String(rows[i][10] || '').trim();
      if (!s) continue;
      ensure(rows[i][8], rows[i][9], s).students++;
    }
  }

  if (paySheet.getLastRow() >= 2) {
    var pays = paySheet.getDataRange().getValues();
    for (var j = 1; j < pays.length; j++) {
      var ps = String(pays[j][2] || '').trim();
      if (!ps) continue;
      var rec = ensure(pays[j][0], pays[j][1], ps);
      var st = String(pays[j][6] || '').trim();
      if (st === 'Reported' || st === 'Paid') rec.paid += Number(pays[j][5]) || 0;
      var bk = String(pays[j][10] || 'Pending').trim() || 'Pending';
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
    out.push([r.district, r.block, r.school, r.students, amount, r.paid, balance, status, r.books]);
  }
  dues.getRange(1, 1, out.length, DUES_HEADERS_.length).setValues(out);
  dues.setFrozenRows(1);
  return { ok: true, schools: out.length - 1 };
}
