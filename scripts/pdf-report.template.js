/** Browser-only PDF report generator. No participant data leaves the device.
 * Generated file — edit scripts/pdf-report.template.js and scripts/gen-pdf-report.js
 * instead, then run: node scripts/gen-pdf-report.js
 */
var GVP_PDF = (function () {
  var PAGE_W = 595.28;
  var PAGE_H = 841.89;
  var MARGIN = 40;
  var ROW_H = 24;
  var ROWS_PER_PAGE = 18;

  var COW_PHOTO_BASE64 = '__COW_PHOTO_BASE64__';
  var COW_PHOTO_W = __COW_PHOTO_WIDTH__;
  var COW_PHOTO_H = __COW_PHOTO_HEIGHT__;

  var TERRA = '0.663 0.294 0.173';
  var TERRA_DARK = '0.51 0.2 0.11';
  var GOLD = '0.722 0.529 0.231';
  var TULSI = '0.29 0.42 0.26';
  var CREAM = '0.984 0.965 0.918';
  var CARD = '0.965 0.937 0.878';
  var STRIPE = '0.953 0.918 0.835';
  var INK = '0.18 0.125 0.075';
  var INK_SOFT = '0.42 0.36 0.28';
  var ON_DARK = '1 0.965 0.902';
  var GOLD_LIGHT = '0.953 0.851 0.659';
  var WHITE = '1 1 1';

  function ascii(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/[‘’]/g, "'")
      .replace(/[–—]/g, '-')
      .replace(/[^\x20-\x7E]/g, '?');
  }

  function pdfText(value) {
    return ascii(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }

  function short(value, limit) {
    var text = ascii(value).trim();
    return text.length > limit ? text.slice(0, limit - 3) + '...' : text;
  }

  function safeFilenamePart(value) {
    return ascii(value).trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'school';
  }

  function n(value) {
    return Math.round(value * 100) / 100;
  }

  // `tracking` adds letter-spacing (PDF's Tc operator, in points) — small
  // positive values on uppercase labels are what give modern-looking type
  // its "eyebrow"/label feel versus default-set body text. `oblique` shears
  // the text matrix to fake an italic slant — real PDF text stays real text
  // (selectable, searchable, tiny on disk); it's just Helvetica leaned over,
  // the standard trick for italicizing a font with no italic style of its
  // own, rather than rasterizing plain Latin copy for the sake of a font.
  function text(font, size, color, x, y, value, tracking, oblique) {
    var tc = tracking ? n(tracking) + ' Tc ' : '';
    var c = oblique ? n(0.21) : '0';
    return 'BT /' + font + ' ' + size + ' Tf ' + tc + color + ' rg 1 0 ' + c + ' 1 ' + n(x) + ' ' + n(y) + ' Tm (' + pdfText(value) + ') Tj ET\n';
  }

  // Estimated glyph width (Helvetica has no metrics available to us here,
  // so ~0.52em/~0.58em bold is close enough) — includes tracking, which
  // the chip-sizing code used to leave out and consequently overflowed its
  // pill on tracked labels.
  function estTextWidth(value, size, tracking, boldFactor) {
    var factor = boldFactor || 0.52;
    var trackTotal = (tracking || 0) * Math.max(value.length - 1, 0);
    return value.length * size * factor + trackTotal;
  }

  // Centers `value` on `cx` using the estimate above — exact centering
  // isn't the point, just keeping a caption from drifting visibly
  // off-center under the avatar.
  function centerText(font, size, color, cx, y, value, tracking, boldFactor) {
    var w = estTextWidth(value, size, tracking, boldFactor);
    return text(font, size, color, cx - w / 2, y, value, tracking);
  }

  function rect(x, y, w, h, color, mode) {
    return color + ' ' + (mode === 'S' ? 'RG' : 'rg') + ' ' + n(x) + ' ' + n(y) + ' ' + n(w) + ' ' + n(h) + ' re ' + (mode === 'S' ? 'S' : 'f') + '\n';
  }

  function line(x1, y1, x2, y2, color, w) {
    return color + ' RG ' + n(w) + ' w ' + n(x1) + ' ' + n(y1) + ' m ' + n(x2) + ' ' + n(y2) + ' l S\n';
  }

  // Rounded-rect path ops only (no paint), centered on (0,0) when x=-w/2.
  // Kappa is the standard cubic-bezier constant approximating a quarter circle.
  function roundedRectPath(x, y, w, h, r) {
    var k = r * 0.5523;
    var ops = '';
    ops += n(x + r) + ' ' + n(y) + ' m\n';
    ops += n(x + w - r) + ' ' + n(y) + ' l\n';
    ops += n(x + w - r + k) + ' ' + n(y) + ' ' + n(x + w) + ' ' + n(y + r - k) + ' ' + n(x + w) + ' ' + n(y + r) + ' c\n';
    ops += n(x + w) + ' ' + n(y + h - r) + ' l\n';
    ops += n(x + w) + ' ' + n(y + h - r + k) + ' ' + n(x + w - r + k) + ' ' + n(y + h) + ' ' + n(x + w - r) + ' ' + n(y + h) + ' c\n';
    ops += n(x + r) + ' ' + n(y + h) + ' l\n';
    ops += n(x + r - k) + ' ' + n(y + h) + ' ' + n(x) + ' ' + n(y + h - r + k) + ' ' + n(x) + ' ' + n(y + h - r) + ' c\n';
    ops += n(x) + ' ' + n(y + r) + ' l\n';
    ops += n(x) + ' ' + n(y + r - k) + ' ' + n(x + r - k) + ' ' + n(y) + ' ' + n(x + r) + ' ' + n(y) + ' c\n';
    return ops + 'h\n';
  }

  // Rounded-rect, filled and/or stroked.
  function roundedRect(x, y, w, h, r, fillColor, strokeColor, strokeW) {
    var pre = '';
    if (fillColor) pre += fillColor + ' rg\n';
    if (strokeColor) pre += strokeColor + ' RG ' + n(strokeW || 1) + ' w\n';
    var op = fillColor && strokeColor ? 'B' : fillColor ? 'f' : 'S';
    return pre + roundedRectPath(x, y, w, h, r) + op + '\n';
  }

  function alpha(gsName, ops) {
    return 'q /' + gsName + ' gs\n' + ops + 'Q\n';
  }

  // A soft multi-layer drop shadow behind a rounded-rect shape, faked by
  // stacking a few offset, low-alpha copies of decreasing opacity — the
  // usual trick for a blurred shadow without a real blur filter. Pass
  // stronger/lighter ExtGState names and a bigger dx/dy for a heavier shadow.
  function roundedRectShadow(x, y, w, h, r, dx, dy, gsNames) {
    var names = gsNames || ['GS3', 'GS2', 'GS1'];
    var mult = [1.6, 1.0, 0.4];
    var ops = '';
    for (var i = 0; i < 3; i++) {
      ops += alpha(names[i], roundedRectPath(x - dx * mult[i], y - dy * mult[i], w, h, r) + '0 0 0 rg f\n');
    }
    return ops;
  }

  // Rounded-square cow portrait: a glowing white border around a soft
  // shadowed card, rather than the circular crop. Positioned level with
  // the title in buildHeader (beside the wordmark), not dropped to the
  // band's bottom edge.
  function avatarSquare(cx, cy, w, h) {
    var halfW = w / 2, halfH = h / 2, r = 24;
    var ops = 'q\n';
    ops += '1 0 0 1 ' + n(cx) + ' ' + n(cy) + ' cm\n';

    // Soft shadow in the background, offset down so the card reads as
    // lifted off the page — two low-alpha layers stand in for a blur.
    ops += roundedRectShadow(-halfW, -halfH, w, h, r, 0, 6);

    // White glow radiating from the edge — wide, low-alpha strokes centered
    // on the border path, widest and faintest first, so it fades outward
    // (and inward, but that part is covered by the photo/border drawn
    // after it) like a soft light source rather than a hard outline.
    ops += alpha('GS3', roundedRectPath(-halfW, -halfH, w, h, r) + WHITE + ' RG 20 w S\n');
    ops += alpha('GS2', roundedRectPath(-halfW, -halfH, w, h, r) + WHITE + ' RG 12 w S\n');
    ops += alpha('GS1', roundedRectPath(-halfW, -halfH, w, h, r) + WHITE + ' RG 7 w S\n');

    ops += 'q\n' + roundedRectPath(-halfW, -halfH, w, h, r) + 'W n\n';
    var drawW = w, drawH = h;
    if (COW_PHOTO_W / COW_PHOTO_H >= w / h) drawW = h * (COW_PHOTO_W / COW_PHOTO_H);
    else drawH = w * (COW_PHOTO_H / COW_PHOTO_W);
    ops += n(drawW) + ' 0 0 ' + n(drawH) + ' ' + n(-drawW / 2) + ' ' + n(-drawH / 2) + ' cm /Im1 Do\n';
    ops += 'Q\n';

    ops += roundedRectPath(-halfW, -halfH, w, h, r) + WHITE + ' RG 3.5 w S\n';

    ops += 'Q\n';
    return ops;
  }

  // Renders the Hindi header (calligraphic title + subtitle) to a JPEG via
  // canvas, then that image gets embedded in the PDF as-is. Our PDF only
  // has the Latin-only base-14 Helvetica fonts available (no Devanagari
  // glyphs, and no shaping engine for conjuncts/matras even if it had
  // them), so real Devanagari text has to come from the browser's own text
  // layout rather than from PDF text operators. Returns null — falling
  // back to a plain Latin vector title — when no DOM/canvas is available,
  // which is the case in the Node test harness.
  function renderHindiHeaderRaster() {
    if (typeof document === 'undefined' || !document.createElement) return Promise.resolve(null);
    var titleLine = 'गौ विज्ञान परीक्षा';
    var subLine = 'विद्यालय सहभागिता रिकॉर्ड';
    var titleFont = '700 68px "Yatra One"';
    var subFont = '600 28px "Noto Serif Devanagari"';

    var ready = Promise.resolve();
    if (document.fonts && document.fonts.load) {
      ready = Promise.all([document.fonts.load(titleFont, titleLine), document.fonts.load(subFont, subLine)])
        .then(function () { return document.fonts.ready || null; })
        .catch(function () { return null; });
    }

    return ready.then(function () {
      var measure = document.createElement('canvas').getContext('2d');
      measure.font = titleFont;
      var titleMetrics = measure.measureText(titleLine);
      // Decorative Devanagari glyphs (matras/conjuncts in a calligraphic
      // face) commonly render ink past their nominal advance width, so
      // `.width` alone under-sizes the canvas and clips the last character.
      // actualBoundingBoxRight (when available) reflects real drawn extent.
      var titleW = Math.max(titleMetrics.width, titleMetrics.actualBoundingBoxRight || 0);
      measure.font = subFont;
      var subMetrics = measure.measureText(subLine);
      var subW = Math.max(subMetrics.width, subMetrics.actualBoundingBoxRight || 0);

      var padX = 22, padTop = 26, gap = 12, padBottom = 22, safety = 24;
      var w = Math.ceil(Math.max(titleW, subW) + padX * 2 + safety);
      var h = Math.ceil(padTop + 68 + gap + 28 + padBottom);
      var scale = 3;

      var canvas = document.createElement('canvas');
      canvas.width = w * scale;
      canvas.height = h * scale;
      var ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);

      // Background matches the header band's own vivid terra gradient (see
      // Sh1 in buildStudentReport) at roughly the vertical position this
      // image sits, so it reads as text printed on the band, not a card
      // floating on top of it.
      var grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#c5602f');
      grad.addColorStop(1, '#a8481f');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.textBaseline = 'alphabetic';

      // A restrained glow + depth treatment: a gentle warm halo (soft, not
      // a blown-out neon rim), one blurred drop shadow for lift, and a
      // crisp light-to-gold gradient face — three passes, not a stacked
      // extrusion, which read as smudged rather than dimensional. Done on
      // canvas since this whole title is already a raster (see the
      // function doc above for why real PDF text can't render Devanagari).
      function glow3DText(str, font, x, y, opt) {
        ctx.font = font;

        ctx.save();
        ctx.globalAlpha = opt.glowAlpha;
        ctx.shadowColor = opt.glow;
        ctx.shadowBlur = opt.glowBlur;
        ctx.fillStyle = opt.glow;
        ctx.fillText(str, x, y);
        ctx.restore();

        ctx.save();
        ctx.shadowColor = opt.shadow;
        ctx.shadowBlur = opt.shadowBlur;
        ctx.shadowOffsetX = opt.shadowOffsetX;
        ctx.shadowOffsetY = opt.shadowOffsetY;
        ctx.fillStyle = opt.shadow;
        ctx.fillText(str, x, y);
        ctx.restore();

        var faceGrad = ctx.createLinearGradient(x, y - opt.capHeight, x, y + 4);
        faceGrad.addColorStop(0, opt.faceTop);
        faceGrad.addColorStop(1, opt.faceBottom);
        ctx.fillStyle = faceGrad;
        ctx.fillText(str, x, y);
      }

      glow3DText(titleLine, titleFont, padX, padTop + 54, {
        glow: '#ffcf8a', glowAlpha: 0.55, glowBlur: 9,
        shadow: 'rgba(35, 12, 4, 0.45)', shadowBlur: 4, shadowOffsetX: 1.5, shadowOffsetY: 2.5,
        faceTop: '#fff8ee', faceBottom: '#ffdba6', capHeight: 50
      });
      glow3DText(subLine, subFont, padX, padTop + 68 + gap + 22, {
        glow: '#ffdba0', glowAlpha: 0.4, glowBlur: 5,
        shadow: 'rgba(35, 12, 4, 0.30)', shadowBlur: 2, shadowOffsetX: 1, shadowOffsetY: 1.5,
        faceTop: '#ffeecb', faceBottom: '#f0c584', capHeight: 22
      });

      var dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      return { base64: dataUrl.slice(dataUrl.indexOf(',') + 1), w: canvas.width, h: canvas.height };
    }).catch(function () { return null; });
  }

  function wrapWords(value, maxChars) {
    var words = ascii(value).split(/\s+/);
    var lines = [], cur = '';
    words.forEach(function (word) {
      var next = cur ? cur + ' ' + word : word;
      if (next.length > maxChars && cur) { lines.push(cur); cur = word; }
      else cur = next;
    });
    if (cur) lines.push(cur);
    return lines;
  }

  // The English tagline, in the band's warm gold and leaned into a synthetic
  // italic — a themed treatment, but still real selectable/searchable PDF
  // text (not a raster), since it's plain ASCII with no font-availability
  // problem to solve. `topY` is the baseline of the first line.
  function drawTagline(x, topY) {
    var lines = wrapWords('Cow science, sustainable agriculture, environment, health awareness and Indian knowledge traditions.', 58);
    var c = '';
    lines.slice(0, 2).forEach(function (ln, i) {
      c += text('F1', 8.5, GOLD_LIGHT, x, topY - i * 13, ln, 0.3, true);
    });
    return c;
  }

  var COLS = [
    { key: 'sno', label: 'S.NO.', x: MARGIN + 8, w: 34, font: 'F1', size: 8.5 },
    { key: 'regNo', label: 'REG. NO.', x: MARGIN + 44, w: 100, font: 'F1', size: 8.2, limit: 20 },
    { key: 'name', label: 'STUDENT NAME', x: MARGIN + 148, w: 140, font: 'F2', size: 8.6, limit: 24 },
    { key: 'father', label: 'FATHER / GUARDIAN', x: MARGIN + 292, w: 128, font: 'F1', size: 8.2, limit: 22 },
    { key: 'cls', label: 'CLASS', x: MARGIN + 424, w: 40, font: 'F2', size: 8.5, limit: 6 },
    { key: 'gender', label: 'GENDER', x: MARGIN + 466, w: 50, font: 'F1', size: 8.2, limit: 8 }
  ];

  // "Cover photo + overlapping avatar" header — the pattern behind most
  // modern profile/document headers (LinkedIn, GitHub, Notion covers): a
  // full-bleed color band anchors the brand, with the cow photo — styled
  // like the live site's own .gau-photo — placed beside the title, so the
  // page reads as one composed layout rather than a stack of separately
  // bordered cards.
  function buildHeader(report, pageNumber, pageCount, hindiAsset) {
    var school = report.school || {};
    var c = '';
    c += rect(0, 0, PAGE_W, PAGE_H, CREAM);

    var bandH = 192;
    var bandY = PAGE_H - bandH;

    // Drop shadow the band casts onto the page, so it reads as a raised
    // cover rather than a flat color fill.
    c += alpha('GS3', '0 0 0 rg 0 ' + n(bandY - 7) + ' ' + n(PAGE_W) + ' 7 re f\n');
    c += alpha('GS1', '0 0 0 rg 0 ' + n(bandY - 3) + ' ' + n(PAGE_W) + ' 3 re f\n');

    // Full-bleed, top-lit vertical gradient — no rounding, no border, no
    // card fill behind it. A confident color block reads as "brand cover,"
    // not another beige panel competing with the content cards below it.
    c += 'q\n0 ' + n(bandY) + ' ' + n(PAGE_W) + ' ' + n(bandH) + ' re W n\n/Sh1 sh\nQ\n';

    // Glossy diagonal sheen, clipped to the band.
    c += 'q\n0 ' + n(bandY) + ' ' + n(PAGE_W) + ' ' + n(bandH) + ' re W n\n';
    c += alpha('GS1', '0.94 -0.34 0.34 0.94 ' + n(PAGE_W * 0.16) + ' ' + n(bandY) + ' cm ' + WHITE + ' rg -50 0 130 360 re f\n');
    c += 'Q\n';

    // Bevel: a bright hairline at the very top, a dark one just above the
    // gold foot rule, so the band reads as a raised surface.
    c += alpha('GS2', WHITE + ' rg 0 ' + n(PAGE_H - 1.4) + ' ' + n(PAGE_W) + ' 1.4 re f\n');
    c += alpha('GS3', '0 0 0 rg 0 ' + n(bandY + 1) + ' ' + n(PAGE_W) + ' 1.6 re f\n');
    c += rect(0, bandY - 4, PAGE_W, 4, GOLD);

    // Avatar geometry first: the title raster's width needs to steer clear
    // of it (it paints on top). Broader than tall, and inset from the
    // margin rather than flush against it, then vertically centered on
    // the band itself — not tied to the title's own center — so it reads
    // as sitting in the middle of the header, not pinned to a corner.
    var avatarHalfW = 100, avatarHalfH = 74;
    var avatarCx = PAGE_W - MARGIN - avatarHalfW - 8;
    var avatarCy = bandY + bandH / 2;
    var avatarLeftEdge = avatarCx - avatarHalfW;

    var titleX = MARGIN;
    if (hindiAsset) {
      // The calligraphic Hindi title + subtitle, rendered with the band's
      // own gradient as its background so it reads as text printed
      // directly on the cover, not a separate card floating on it.
      var dispH = 96;
      var dispW = dispH * (hindiAsset.w / hindiAsset.h);
      var availW = avatarLeftEdge - titleX - 20;
      if (dispW > availW) { dispW = availW; dispH = dispW * (hindiAsset.h / hindiAsset.w); }
      var imgY = PAGE_H - 34 - dispH;
      c += 'q\n' + n(dispW) + ' 0 0 ' + n(dispH) + ' ' + n(titleX) + ' ' + n(imgY) + ' cm /Im2 Do\nQ\n';

      // A small pill "chip" for the record type — a modern status-badge
      // affordance, and a lighter touch than a full tracked caption line.
      var chipY = imgY - 26, chipH = 18, chipLabel = 'SCHOOL PARTICIPATION RECORD', chipTrack = 1.3;
      var chipW = estTextWidth(chipLabel, 7.4, chipTrack, 0.62) + 20;
      c += roundedRect(titleX, chipY, chipW, chipH, chipH / 2, CREAM, null);
      c += text('F2', 7.4, TERRA, titleX + 10, chipY + 6, chipLabel, chipTrack);
      c += drawTagline(titleX, chipY - 18);
    } else {
      // Fallback when Devanagari rendering isn't available (e.g. the Node
      // test harness, which has no DOM/canvas): plain Latin vector title.
      c += text('F2', 22, ON_DARK, titleX, PAGE_H - 50, 'GAU VIGYAN PARIKSHA 2026', 0.3);
      var chipY2 = PAGE_H - 76, chipH2 = 18, chipLabel2 = 'SCHOOL PARTICIPATION RECORD', chipTrack2 = 1.3;
      var chipW2 = estTextWidth(chipLabel2, 7.4, chipTrack2, 0.62) + 20;
      c += roundedRect(titleX, chipY2, chipW2, chipH2, chipH2 / 2, CREAM, null);
      c += text('F2', 7.4, TERRA, titleX + 10, chipY2 + 6, chipLabel2, chipTrack2);
      c += drawTagline(titleX, chipY2 - 18);
    }

    c += avatarSquare(avatarCx, avatarCy, avatarHalfW * 2, avatarHalfH * 2);

    // Flush info block — no border, no fill. A single hairline underneath
    // separates it from the table instead of boxing it in its own card,
    // which is what made the earlier layout feel like a stack of panels.
    // Fixed offset below the band, entirely on the cream page — the same
    // baseline the participant stat uses on the right, so both sit on a
    // consistent light background rather than the stat straddling the
    // band's dark gradient (where the info block's ink tones read poorly).
    var infoTop = bandY - 40;
    c += text('F2', 15, INK, MARGIN, infoTop, short(school.school || 'School', 40), 0.15);
    c += text('F1', 9, INK_SOFT, MARGIN, infoTop - 20, 'Village/City: ' + short(school.village, 24));
    c += text('F1', 9, INK_SOFT, MARGIN, infoTop - 36,
      'Block: ' + short(school.block, 20) + '   |   District: ' + short(school.district, 20));

    c += centerText('F2', 24, INK, avatarCx, infoTop, String(report.students.length), 0, 0.58);
    c += centerText('F1', 7.2, TULSI, avatarCx, infoTop - 16, 'PARTICIPANTS', 1.6);
    c += centerText('F1', 6.8, INK_SOFT, avatarCx, infoTop - 30, 'Generated ' + new Date().toISOString().slice(0, 10), 0);
    c += centerText('F1', 6.8, INK_SOFT, avatarCx, infoTop - 40, 'Page ' + pageNumber + ' of ' + pageCount, 0);

    var infoBottom = infoTop - 50;
    c += line(MARGIN, infoBottom, PAGE_W - MARGIN, infoBottom, GOLD, 1);

    return { content: c, tableTop: infoBottom - 20 };
  }

  function buildPage(report, students, pageNumber, pageCount, hindiAsset) {
    var header = buildHeader(report, pageNumber, pageCount, hindiAsset);
    var c = header.content;
    var top = header.tableTop;
    var tableW = PAGE_W - MARGIN * 2;
    var tableH = 28 + students.length * ROW_H;

    c += roundedRect(MARGIN, top - tableH, tableW, tableH, 10, WHITE, GOLD, 1);
    c += rect(MARGIN, top - 28, tableW, 28, TULSI);
    COLS.forEach(function (col) { c += text('F2', 7.6, WHITE, col.x, top - 19, col.label, 1.0); });

    students.forEach(function (student, index) {
      var y = top - 28 - (index + 1) * ROW_H;
      if (index % 2 === 0) c += rect(MARGIN, y, tableW, ROW_H, STRIPE);
      var row = {
        sno: String((pageNumber - 1) * ROWS_PER_PAGE + index + 1),
        regNo: student.regNo,
        name: student.name,
        father: student.father,
        cls: student.cls,
        gender: student.gender
      };
      COLS.forEach(function (col) {
        var val = col.limit ? short(row[col.key], col.limit) : row[col.key];
        c += text(col.font, col.size, INK, col.x, y + 8.5, val);
      });
    });

    var bottom = top - tableH - 26;
    c += line(MARGIN, bottom, PAGE_W - MARGIN, bottom, GOLD, 1);
    c += text('F1', 7.6, INK_SOFT, MARGIN, bottom - 16, 'Generated for school record. OMR numbers are intentionally excluded.');
    c += text('F1', 7.6, INK_SOFT, PAGE_W - MARGIN - 110, bottom - 16, 'Gau Vigyan Pariksha 2026');
    return c;
  }

  function toBytes(binaryStr) {
    var bytes = new Uint8Array(binaryStr.length);
    for (var i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i) & 0xFF;
    return bytes;
  }

  function buildStudentReport(report) {
    report = report || {};
    var students = Array.isArray(report.students) ? report.students : [];
    if (!students.length) throw new Error('No students to include');
    var chunks = [];
    for (var i = 0; i < students.length; i += ROWS_PER_PAGE) chunks.push(students.slice(i, i + ROWS_PER_PAGE));

    return renderHindiHeaderRaster().then(function (hindiAsset) {
      var cowJpeg = atob(COW_PHOTO_BASE64);

      var objects = [];
      objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
      objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
      objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';
      objects[5] = '<< /Type /XObject /Subtype /Image /Width ' + COW_PHOTO_W + ' /Height ' + COW_PHOTO_H +
        ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + cowJpeg.length + ' >>\nstream\n' + cowJpeg + '\nendstream';

      // Vivid top-lit terra gradient — the header's "brand cover" band.
      objects[6] = '<< /FunctionType 2 /Domain [0 1] /C0 [0.47 0.17 0.09] /C1 [0.80 0.38 0.21] /N 1 >>';
      objects[7] = '<< /ShadingType 2 /ColorSpace /DeviceRGB /Coords [0 ' + n(PAGE_H - 192) + ' 0 ' + n(PAGE_H) +
        '] /Function 6 0 R /Extend [true true] >>';
      objects[10] = '<< /Type /ExtGState /ca 0.30 /CA 0.30 >>';
      objects[11] = '<< /Type /ExtGState /ca 0.17 /CA 0.17 >>';
      objects[12] = '<< /Type /ExtGState /ca 0.08 /CA 0.08 >>';
      // Matches the site's own `.gau-photo { border: 3px solid
      // rgba(184,135,59,.65) }` — the avatar ring's alpha.
      objects[13] = '<< /Type /ExtGState /ca 0.65 /CA 0.65 >>';

      var xobjects = '/Im1 5 0 R';
      if (hindiAsset) {
        var hindiJpeg = atob(hindiAsset.base64);
        objects[16] = '<< /Type /XObject /Subtype /Image /Width ' + hindiAsset.w + ' /Height ' + hindiAsset.h +
          ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + hindiJpeg.length + ' >>\nstream\n' + hindiJpeg + '\nendstream';
        xobjects += ' /Im2 16 0 R';
      }
      var pageStart = hindiAsset ? 17 : 16;

      var resources = '<< /Font << /F1 3 0 R /F2 4 0 R >> /XObject << ' + xobjects + ' >>' +
        ' /Shading << /Sh1 7 0 R >>' +
        ' /ExtGState << /GS1 10 0 R /GS2 11 0 R /GS3 12 0 R /GS7 13 0 R >> >>';

      var kids = [];
      chunks.forEach(function (pageStudents, index) {
        var pageObject = pageStart + index * 2;
        var contentObject = pageObject + 1;
        kids.push(pageObject + ' 0 R');
        var stream = buildPage(report, pageStudents, index + 1, chunks.length, hindiAsset);
        objects[pageObject] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PAGE_W + ' ' + PAGE_H +
          '] /Resources ' + resources + ' /Contents ' + contentObject + ' 0 R >>';
        objects[contentObject] = '<< /Length ' + stream.length + ' >>\nstream\n' + stream + 'endstream';
      });
      objects[2] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + chunks.length + ' >>';

      var pdf = '%PDF-1.4\n%GVP\n';
      var offsets = [0];
      for (var n2 = 1; n2 < objects.length; n2++) {
        offsets[n2] = pdf.length;
        pdf += n2 + ' 0 obj\n' + (objects[n2] || '<< >>') + '\nendobj\n';
      }
      var xref = pdf.length;
      pdf += 'xref\n0 ' + objects.length + '\n0000000000 65535 f \n';
      for (var o = 1; o < objects.length; o++) pdf += String(offsets[o]).padStart(10, '0') + ' 00000 n \n';
      pdf += 'trailer\n<< /Size ' + objects.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
      return toBytes(pdf);
    });
  }

  function downloadStudentReport(report) {
    return buildStudentReport(report).then(function (bytes) {
      var url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      var link = document.createElement('a');
      link.href = url;
      link.download = safeFilenamePart(report.school && report.school.school) + '-' + safeFilenamePart(report.school && report.school.village) + '-participants.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });
  }

  return { buildStudentReport: buildStudentReport, downloadStudentReport: downloadStudentReport };
})();
