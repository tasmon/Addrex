/* Document model + exporters (HTML preview, text, PDF, DOCX). No DOM access. */
(function (root) {
  'use strict';
  var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  function pad(n) { return String(n).padStart(2, '0'); }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }

  function makeRef(now) {
    now = now || new Date();
    return 'POA-' + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '-' +
           pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
  }
  function fmtDate(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    return +p[2] + ' ' + MONTHS[+p[1] - 1] + ' ' + p[0];
  }
  function fmtStamp(now) {
    now = now || new Date();
    return now.getDate() + ' ' + MONTHS[now.getMonth()] + ' ' + now.getFullYear() + ', ' + pad(now.getHours()) + ':' + pad(now.getMinutes());
  }
  function duration(from, to) {
    if (!from || !to) return '';
    var s = from.split('-').map(Number), t = to.split('-').map(Number);
    var m = (t[0] - s[0]) * 12 + (t[1] - s[1]) - (t[2] < s[2] ? 1 : 0);
    if (m < 0) return '';
    var y = Math.floor(m / 12), mo = m % 12, out = [];
    if (!y && !mo) return 'less than a month';
    if (y) out.push(plural(y, 'year'));
    if (mo) out.push(plural(mo, 'month'));
    return out.join(', ');
  }

  /* ---------- Document model ---------- */
  function buildDoc(d) {
    var sc = d.scenarios || {};
    var active = ['noBills', 'noContract', 'longTerm', 'host'].filter(function (k) { return sc[k]; });
    var subtitle = 'Declaration of residence';
    if (active.length === 1) {
      subtitle = {
        noContract: 'Declaration of residence under a verbal agreement',
        noBills: 'Declaration of residence without utility bills',
        longTerm: 'Declaration of long-term residence',
        host: 'Declaration of residence with a host'
      }[active[0]];
    }
    var ph = function (v, t) { return v || '[' + t + ']'; };
    var cityLine = [d.city, d.region, d.postcode].filter(Boolean).join(', ');
    var addr = [d.line1, d.line2, cityLine, d.country].filter(Boolean).join('\n');
    var len = duration(d.since, d.date || d.since);
    var landlord = !!(d.lname || d.lmobile || d.lemail);
    var secs = [];
    function rows(a) { return a.filter(function (r) { return r && r[1]; }); }

    secs.push({ h: 'Declarant', rows: rows([
      ['Full name', ph(d.name, 'full name')],
      ['Date of birth', fmtDate(d.dob)],
      [d.idType === 'passport' ? 'Passport number' : 'National ID number', d.idNumber],
      ['Phone', d.phone],
      ['Email', d.email]
    ]) });

    secs.push({ h: 'Residential address', rows: rows([
      ['Address', ph(addr, 'address')],
      ['Resident since', d.since ? fmtDate(d.since) : '[start date]'],
      ['Length of residence', len],
      ['Permanent address', d.permSame ? 'Same as residential address' : d.permanent]
    ]) });

    if (d.sname || d.smobile || d.semail) {
      secs.push({ h: 'Spouse', rows: rows([['Name', d.sname], ['Mobile', d.smobile], ['Email', d.semail]]) });
    }

    var paras = [];
    if (sc.noContract) paras.push('I live at this address under a verbal agreement with the landlord named in this letter. There is no written tenancy contract.');
    if (sc.noBills) paras.push('I do not hold utility bills, bank statements or similar documents in my name that show this address.' + (d.evidence ? ' Other evidence I can provide: ' + d.evidence + '.' : ''));
    if (sc.host) paras.push('I live with a family member or host, and household bills and agreements are in their name.');
    if (sc.longTerm) paras.push('I have lived at this address' + (d.since && len ? ' since ' + fmtDate(d.since) + ', a period of ' + len : '') + ', and it is my long-term home.');
    if (!paras.length) paras.push('I currently live at the address above.');
    secs.push({ h: 'Circumstances', paras: paras });

    if (landlord) {
      secs.push({
        h: (d.lrel || 'Landlord') + ' confirmation',
        rows: rows([['Printed name', ph(d.lname, 'name')], ['Relationship', d.lrel], ['Mobile', d.lmobile], ['Email', d.lemail]]),
        paras: ['The person named above confirms that the declarant lives at the address in this letter' + (sc.noContract ? ' under a verbal agreement' : '') + ' and may be contacted to verify this.']
      });
    }
    if (d.purpose) secs.push({ h: 'Purpose of this letter', paras: [d.purpose] });
    secs.forEach(function (s, i) { s.h = (i + 1) + '. ' + s.h; });
    secs.push({ h: 'Declaration', paras: ['I declare that the information in this letter is true and correct to the best of my knowledge.'] });

    var sigs = [{ caption: ['Declarant', d.name || 'Printed name', 'Date: ' + fmtDate(d.date)] }];
    if (landlord) sigs.push({ caption: [d.lrel || 'Landlord', d.lname || 'Printed name', 'Date: ____________________'] });

    return {
      ref: d.ref,
      title: 'Proof of Address',
      subtitle: subtitle,
      meta: [['Reference', d.ref], ['Date issued', fmtDate(d.date)], ['Generated', d.stamp]],
      to: (d.recipient || 'To whom it may concern') + ',',
      sections: secs,
      sigs: sigs,
      note: 'This is a self-declaration written by the person named above' + (landlord ? ', with contact details for the person who can confirm it' : '') +
            '. It is not issued by a government agency, bank or utility company. Some organisations only accept official documents, such as a utility bill, bank statement or tenancy agreement.'
    };
  }

  /* ---------- HTML preview ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function ml(s) { return esc(s).replace(/\n/g, '<br>'); }
  function cell(v) { return /^\[[^\]]*\]$/.test(v) ? '<span class="empty">' + esc(v) + '</span>' : ml(v); }

  function toHTML(doc) {
    var h = '<div class="head"><div><h2>' + esc(doc.title) + '</h2><p class="sub">' + esc(doc.subtitle) + '</p></div><dl class="meta">' +
      doc.meta.map(function (m) { return '<dt>' + esc(m[0]) + '</dt><dd>' + esc(m[1]) + '</dd>'; }).join('') + '</dl></div>';
    h += '<p class="to">' + esc(doc.to) + '</p>';
    doc.sections.forEach(function (s) {
      h += '<section><h3>' + esc(s.h) + '</h3>';
      if (s.rows && s.rows.length) h += '<dl>' + s.rows.map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + cell(r[1]) + '</dd>'; }).join('') + '</dl>';
      (s.paras || []).forEach(function (p) { h += '<p>' + ml(p) + '</p>'; });
      h += '</section>';
    });
    h += '<div class="sigs">' + doc.sigs.map(function (g) {
      return '<div><div class="blank"></div><span class="cap"><b>' + esc(g.caption[0]) + '</b><br>' +
        esc(g.caption[1]) + '<br>' + esc(g.caption[2]) + '</span></div>';
    }).join('') + '</div>';
    return h + '<div class="foot"><p class="note">' + esc(doc.note) + '</p></div>';
  }

  /* ---------- Plain text ---------- */
  function toText(doc) {
    var o = [doc.title, doc.subtitle, ''];
    doc.meta.forEach(function (m) { o.push(m[0] + ': ' + m[1]); });
    o.push('', doc.to, '');
    doc.sections.forEach(function (s) {
      o.push(s.h);
      (s.rows || []).forEach(function (r) { o.push('  ' + r[0] + ': ' + r[1].replace(/\n/g, ', ')); });
      (s.paras || []).forEach(function (p) { o.push('  ' + p); });
      o.push('');
    });
    doc.sigs.forEach(function (g) { o.push('Signature: ______________________', g.caption.join('\n'), ''); });
    o.push(doc.note);
    return o.join('\n');
  }

  /* ---------- PDF (vector text via jsPDF) ---------- */
  var NON_LATIN = /[^\x00-\xFF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\u20AC]/;
  function pdfSupports(doc) { return !NON_LATIN.test(JSON.stringify(doc).replace(/\\u[0-9a-f]{4}/gi, '')); }

  function toPDF(doc, JsPDF) {
    var pdf = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    var W = 210, H = 297, M = 20, CW = W - 2 * M, LABW = 42, BOTTOM = H - 22, y = M;
    var TEAL = [28, 59, 64], GREY = [90, 90, 90], INK = [22, 22, 22], RULE = [184, 196, 200];
    var lh = function (pt) { return pt * 0.3528 * 1.38; };
    function font(f, st, size, col) { pdf.setFont(f, st); pdf.setFontSize(size); pdf.setTextColor(col[0], col[1], col[2]); }
    function need(h) { if (y + h > BOTTOM) { pdf.addPage(); y = M; } }
    function lines(txt, w) { return pdf.splitTextToSize(txt, w); }
    function hline(x1, x2, yy, wd, col) { pdf.setDrawColor(col[0], col[1], col[2]); pdf.setLineWidth(wd); pdf.line(x1, yy, x2, yy); }

    // header
    font('times', 'bold', 24, TEAL); pdf.text(doc.title, M, y + 8);
    font('helvetica', 'normal', 9.5, GREY); pdf.text(doc.subtitle, M, y + 14);
    doc.meta.forEach(function (m, i) {
      font('helvetica', 'normal', 8.5, INK);
      var vw = pdf.getTextWidth(m[1]);
      pdf.text(m[1], W - M, y + 3 + i * 4.6, { align: 'right' });
      font('helvetica', 'bold', 8.5, GREY);
      pdf.text(m[0], W - M - vw - 2.5, y + 3 + i * 4.6, { align: 'right' });
    });
    hline(M, W - M, y + 19, 0.6, TEAL); hline(M, W - M, y + 20.6, 0.2, TEAL);
    y += 29;
    font('times', 'normal', 11, INK); pdf.text(doc.to, M, y); y += 9;

    // sections
    doc.sections.forEach(function (s) {
      font('times', 'normal', 10.5, INK);
      var rowLines = (s.rows || []).map(function (r) { return lines(r[1], CW - LABW); });
      var paraLines = (s.paras || []).map(function (p) { return lines(p, CW); });
      var total = 9;
      rowLines.forEach(function (l) { total += l.length * lh(10.5) + 1.2; });
      paraLines.forEach(function (l) { total += l.length * lh(10.5) + 2; });
      need(Math.min(total, 60));
      font('helvetica', 'bold', 9.5, TEAL); pdf.text(s.h, M, y + 3.5);
      hline(M, W - M, y + 5, 0.2, RULE); y += 9.5;
      (s.rows || []).forEach(function (r, i) {
        var h = rowLines[i].length * lh(10.5);
        need(h + 1.2);
        font('helvetica', 'bold', 8.5, GREY); pdf.text(r[0], M, y + 0.2);
        font('times', 'normal', 10.5, INK); pdf.text(rowLines[i], M + LABW, y);
        y += h + 1.2;
      });
      font('times', 'normal', 10.5, INK);
      paraLines.forEach(function (l) {
        need(l.length * lh(10.5) + 2);
        pdf.text(l, M, y); y += l.length * lh(10.5) + 2;
      });
      y += 4;
    });

    // signatures
    need(42); y += 8;
    var colW = (CW - 16) / 2;
    doc.sigs.forEach(function (g, i) {
      var x = M + i * (colW + 16);
      hline(x, x + colW, y + 11, 0.25, INK);
      font('helvetica', 'bold', 8.5, GREY); pdf.text(g.caption[0], x, y + 16);
      font('helvetica', 'normal', 8.5, INK); pdf.text(g.caption[1], x, y + 20.3); pdf.text(g.caption[2], x, y + 24.6);
    });
    y += 36;

    // note
    font('helvetica', 'normal', 7.5, GREY);
    var nl = lines(doc.note, CW);
    need(nl.length * lh(7.5) + 6);
    hline(M, W - M, y, 0.2, RULE); pdf.text(nl, M, y + 4.5);

    // footer on each page
    var n = pdf.getNumberOfPages();
    for (var p = 1; p <= n; p++) {
      pdf.setPage(p);
      hline(M, W - M, H - 15, 0.2, RULE);
      font('helvetica', 'normal', 7.5, GREY);
      pdf.text('Reference ' + doc.ref, M, H - 10.5);
      pdf.text('Page ' + p + ' of ' + n, W - M, H - 10.5, { align: 'right' });
    }
    return pdf;
  }

  /* ---------- DOCX (hand-built OOXML in a stored ZIP, no dependencies) ---------- */
  function xe(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function run(t, o) {
    o = o || {};
    var rp = '';
    if (o.font) rp += '<w:rFonts w:ascii="' + o.font + '" w:hAnsi="' + o.font + '" w:cs="' + o.font + '"/>';
    if (o.b) rp += '<w:b/>';
    if (o.i) rp += '<w:i/>';
    if (o.color) rp += '<w:color w:val="' + o.color + '"/>';
    if (o.sz) rp += '<w:sz w:val="' + o.sz + '"/><w:szCs w:val="' + o.sz + '"/>';
    var inner = String(t).split('\n').map(function (s, i) { return (i ? '<w:br/>' : '') + '<w:t xml:space="preserve">' + xe(s) + '</w:t>'; }).join('');
    return '<w:r>' + (rp ? '<w:rPr>' + rp + '</w:rPr>' : '') + inner + '</w:r>';
  }
  function para(runs, o) {
    o = o || {};
    var pp = '';
    if (o.keepNext) pp += '<w:keepNext/>';
    if (o.bdr) pp += '<w:pBdr>' + o.bdr + '</w:pBdr>';
    pp += '<w:spacing w:before="' + (o.before || 0) + '" w:after="' + (o.after == null ? 120 : o.after) + '" w:line="276" w:lineRule="auto"/>';
    if (o.jc) pp += '<w:jc w:val="' + o.jc + '"/>';
    return '<w:p><w:pPr>' + pp + '</w:pPr>' + (runs || '') + '</w:p>';
  }
  function tbl(rows, widths) {
    var total = widths.reduce(function (a, b) { return a + b; }, 0);
    return '<w:tbl><w:tblPr><w:tblW w:w="' + total + '" w:type="dxa"/><w:tblLayout w:type="fixed"/>' +
      '<w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>' +
      widths.map(function (w) { return '<w:gridCol w:w="' + w + '"/>'; }).join('') + '</w:tblGrid>' +
      rows.map(function (cells) {
        return '<w:tr><w:trPr><w:cantSplit/></w:trPr>' + cells.map(function (c, i) {
          return '<w:tc><w:tcPr><w:tcW w:w="' + widths[i] + '" w:type="dxa"/></w:tcPr>' + c + '</w:tc>';
        }).join('') + '</w:tr>';
      }).join('') + '</w:tbl>';
  }

  var NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

  function docxFiles(doc) {
    var T = '1C3B40', G = '555555', B = '';
    var sans = { font: 'Calibri' };
    var DB = '<w:bottom w:val="double" w:sz="6" w:space="6" w:color="' + T + '"/>';
    var SB = '<w:bottom w:val="single" w:sz="6" w:space="1" w:color="161616"/>';
    B += para(run(doc.title, { font: 'Georgia', b: 1, sz: 48, color: T }), { after: 40 });
    B += para(run(doc.subtitle, { font: 'Calibri', sz: 20, color: G }), { after: 120 });
    B += para(doc.meta.map(function (m, i) {
      return run((i ? '      ' : '') + m[0] + '  ', { font: 'Calibri', b: 1, sz: 17, color: '666666' }) + run(m[1], { font: 'Calibri', sz: 17 });
    }).join(''), { bdr: DB, after: 280 });
    B += para(run(doc.to), { after: 200 });
    doc.sections.forEach(function (s) {
      B += para(run(s.h, { font: 'Calibri', b: 1, sz: 20, color: T }), { keepNext: 1, bdr: '<w:bottom w:val="single" w:sz="4" w:space="2" w:color="B8C4C8"/>', before: 200, after: 100 });
      if (s.rows && s.rows.length) {
        B += tbl(s.rows.map(function (r) {
          return [para(run(r[0], { font: 'Calibri', b: 1, sz: 18, color: G }), { after: 50 }), para(run(r[1]), { after: 50 })];
        }), [2400, 7238]);
      }
      (s.paras || []).forEach(function (p) { B += para(run(p), { before: s.rows && s.rows.length ? 100 : 0, after: 100 }); });
    });
    B += para('', { after: 200 });
    var cells = doc.sigs.map(function (g) {
      return para('', { bdr: SB, before: 480, after: 60 }) +
        para(run(g.caption[0], { font: 'Calibri', b: 1, sz: 17, color: G }), { after: 0 }) +
        para(run(g.caption[1], { font: 'Calibri', sz: 17 }), { after: 0 }) +
        para(run(g.caption[2], { font: 'Calibri', sz: 17 }), { after: 0 });
    });
    var empty = para('', { after: 0 });
    B += tbl([[cells[0], empty, cells[1] || empty]], [4400, 838, 4400]);
    B += para(run(doc.note, { font: 'Calibri', sz: 15, color: G }), { bdr: '<w:top w:val="single" w:sz="4" w:space="6" w:color="B8C4C8"/>', before: 560, after: 0 });

    var documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ' + NS + '><w:body>' + B +
      '<w:sectPr><w:footerReference w:type="default" r:id="rId2"/><w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>';

    var fr = { font: 'Calibri', sz: 15, color: '666666' };
    var footerXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ' + NS + '><w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="4" w:space="6" w:color="B8C4C8"/></w:pBdr><w:jc w:val="center"/></w:pPr>' +
      run('Reference ' + doc.ref + '   |   Page ', fr) +
      '<w:fldSimple w:instr=" PAGE "><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:color w:val="666666"/><w:sz w:val="15"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple>' + run(' of ', fr) +
      '<w:fldSimple w:instr=" NUMPAGES "><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:color w:val="666666"/><w:sz w:val="15"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>';

    var stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ' + NS + '><w:docDefaults><w:rPrDefault><w:rPr>' +
      '<w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Georgia"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>';

    var rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    return [
      { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>' },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="' + rel + '/officeDocument" Target="word/document.xml"/></Relationships>' },
      { name: 'word/_rels/document.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="' + rel + '/styles" Target="styles.xml"/><Relationship Id="rId2" Type="' + rel + '/footer" Target="footer1.xml"/></Relationships>' },
      { name: 'word/document.xml', data: documentXml },
      { name: 'word/styles.xml', data: stylesXml },
      { name: 'word/footer1.xml', data: footerXml }
    ];
  }

  var CRC = (function () {
    var t = [], c, n, k;
    for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

  function zip(files) {
    var enc = new TextEncoder(), parts = [], central = [], offset = 0;
    files.forEach(function (f) {
      var name = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data);
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(12, 0x21, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(14, 0x21, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    });
    var csize = central.reduce(function (a, c) { return a + c.length; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csize, true); end.setUint32(16, offset, true);
    var all = parts.concat(central, [new Uint8Array(end.buffer)]);
    var out = new Uint8Array(offset + csize + 22), pos = 0;
    all.forEach(function (a) { out.set(a, pos); pos += a.length; });
    return out;
  }
  function toDOCX(doc) { return zip(docxFiles(doc)); }

  var api = { makeRef: makeRef, fmtStamp: fmtStamp, buildDoc: buildDoc, toHTML: toHTML, toText: toText, toPDF: toPDF, pdfSupports: pdfSupports, toDOCX: toDOCX };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.POA = api;
})(typeof window !== 'undefined' ? window : this);
