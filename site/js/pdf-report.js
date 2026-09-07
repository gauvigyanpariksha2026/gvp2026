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

  var COW_PHOTO_BASE64 = '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';
  var COW_PHOTO_W = 400;
  var COW_PHOTO_H = 267;

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
