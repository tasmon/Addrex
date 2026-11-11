(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var textIds = ['name','dob','idType','idNumber','phone','email','line1','line2','city','region','postcode','country','since','pline1','pline2','pcity','pregion','ppostcode','pcountry','sname','smobile','semail','lname','lmobile','lemail','lrel','recipient','purpose','date','evidence'];
  var emailIds = ['email','semail','lemail'];
  var state = { ref: '', stamp: '' };
  var msg = $('msg'), letter = $('letter');

  function g(id) { return $(id).value.trim(); }
  function today() { var n = new Date(); return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0'); }
  function scenarios() {
    return { noBills: $('sc-noBills').checked, noContract: $('sc-noContract').checked, longTerm: $('sc-longTerm').checked, host: $('sc-host').checked };
  }
  function data() {
    var d = { scenarios: scenarios(), permOn: $('permOn').checked, ref: state.ref, stamp: state.stamp };
    textIds.forEach(function (id) { d[id] = g(id); });
    return d;
  }
  function refresh() {
    var now = new Date();
    state.ref = POA.makeRef(now); state.stamp = POA.fmtStamp(now);
    $('ref').value = state.ref;
  }

  function sync() {
    $('evidenceWrap').hidden = !$('sc-noBills').checked;
    var on = $('permOn').checked;
    $('permAddr').hidden = !on;
    $('addrGrid').classList.toggle('two', on);
    document.querySelector('.layout').classList.toggle('wide', on);
  }
  function render() { sync(); letter.innerHTML = POA.toHTML(POA.buildDoc(data())); }

  function validate() {
    var d = data(), missing = [];
    document.querySelectorAll('.bad').forEach(function (n) { n.classList.remove('bad'); });
    function need(id, label) { if (!g(id)) { $(id).classList.add('bad'); missing.push(label); } }
    need('name', 'full name'); need('line1', 'address line 1'); need('city', 'city'); need('country', 'country'); need('since', 'living here since');
    if ($('permOn').checked) { need('pline1', 'permanent address line 1'); need('pcity', 'permanent city'); need('pcountry', 'permanent country'); }
    var any = g('lname') || g('lmobile') || g('lemail');
    if (any) {                                   // the landlord section is optional, but a partial entry must be usable
      need('lname', 'landlord name');
      if (!g('lmobile') && !g('lemail')) { $('lmobile').classList.add('bad'); $('lemail').classList.add('bad'); missing.push('landlord mobile or email'); }
    }
    emailIds.forEach(function (id) {
      if (g(id) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g(id))) { $(id).classList.add('bad'); missing.push('a valid ' + ({email:'personal',semail:'spouse',lemail:'landlord'}[id]) + ' email'); }
    });
    if (g('since') && g('date') && g('since') > g('date')) { $('since').classList.add('bad'); missing.push('a move-in date that is not after the letter date'); }
    msg.textContent = missing.length ? 'Please fix: ' + missing.join(', ') + '.' : '';
    return !missing.length;
  }

  function save(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function prepare() {           // validate, stamp a fresh reference, re-render
    if (!validate()) return null;
    refresh(); render();
    return POA.buildDoc(data());
  }

  $('permOn').addEventListener('change', function () { if (this.checked) $('pline1').focus(); });
  $('permCopy').addEventListener('click', function () {
    ['line1','line2','city','region','postcode','country'].forEach(function (k) { $('p' + k).value = $(k).value; });
    render();
  });
  // PDF library: use the page's copy if loaded, else try vendor/, the same folder, then a CDN as a last resort
  var PDF_SOURCES = ['vendor/jspdf.umd.min.js', 'jspdf.umd.min.js', 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js'];
  function hasPdf() { return !!(window.jspdf && window.jspdf.jsPDF); }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var el = document.createElement('script');
      el.src = src; el.onload = resolve; el.onerror = reject;
      document.head.appendChild(el);
    });
  }
  var pdfPromise = null;
  function ensurePdf() {
    if (hasPdf()) return Promise.resolve(window.jspdf.jsPDF);
    if (!pdfPromise) {
      pdfPromise = PDF_SOURCES.reduce(function (p, src) {
        return p.catch(function () { return loadScript(src).then(function () { if (!hasPdf()) throw new Error('bad library'); }); });
      }, Promise.reject()).then(function () { return window.jspdf.jsPDF; }, function (e) { pdfPromise = null; throw e; });
    }
    return pdfPromise;
  }

  $('btnPdf').addEventListener('click', function () {
    var doc = prepare(); if (!doc) return;
    if (!POA.pdfSupports(doc)) { msg.textContent = 'This PDF builder cannot embed some characters you typed (for example Bangla or Arabic). Please download the DOCX instead.'; return; }
    ensurePdf().then(function (J) {
      POA.toPDF(doc, J).save('Proof-of-Address-' + doc.ref + '.pdf');
    }, function () {
      msg.textContent = 'The PDF library could not be loaded. Check that the vendor folder (with jspdf.umd.min.js) sits next to index.html, or download the DOCX instead.';
    });
  });
  $('btnDocx').addEventListener('click', function () {
    var doc = prepare(); if (!doc) return;
    save(new Blob([POA.toDOCX(doc)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'Proof-of-Address-' + doc.ref + '.docx');
  });
  $('form').addEventListener('reset', function () {
    setTimeout(function () { $('date').value = today(); msg.textContent = ''; document.querySelectorAll('.bad').forEach(function (n) { n.classList.remove('bad'); }); refresh(); render(); }, 0);
  });
  $('form').addEventListener('input', render);
  $('form').addEventListener('change', render);

  // Light / dark toggle: remembers the choice, otherwise follows the system setting
  var root = document.documentElement, themeBtn = $('themeBtn'), KEY = 'poa-theme';
  function applyTheme(t) {
    root.dataset.theme = t;
    themeBtn.setAttribute('aria-pressed', String(t === 'dark'));
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', t === 'dark' ? '#17222a' : '#0f5c63');
  }
  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  applyTheme(root.dataset.theme || (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  themeBtn.addEventListener('click', function () {
    var next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(KEY, next); } catch (e) {}
  });
  if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) { if (!stored()) applyTheme(e.matches ? 'dark' : 'light'); });

  // Terms of use: modal on first visit, must be read to the end and accepted
  var dlg = $('terms'), body = $('termsBody'), ok = $('termsOk'), accept = $('termsAccept'), TKEY = 'poa-terms', TVER = 'v1';
  var shell = [document.querySelector('.bar'), document.querySelector('.layout')];
  var accepted = false, reading = false;
  function termsStored() { try { return localStorage.getItem(TKEY) === TVER; } catch (e) { return false; } }
  function setInert(on) { shell.forEach(function (n) { if (on) n.setAttribute('inert', ''); else n.removeAttribute('inert'); }); }
  function atEnd() { return body.scrollHeight - body.clientHeight - body.scrollTop <= 4; }
  function checkRead() {
    if (accepted || !atEnd()) return;
    ok.disabled = false; $('termsNote').hidden = true;
  }
  function openTerms(mustAccept) {
    reading = !mustAccept;                       // re-reading after acceptance
    $('termsCheckWrap').hidden = $('termsNote').hidden = reading;
    accept.textContent = reading ? 'Close' : 'Accept and continue';
    accept.disabled = !reading; ok.checked = reading; ok.disabled = true;
    $('termsNote').hidden = reading;
    body.scrollTop = 0;
    setInert(true);
    if (dlg.showModal) { if (!dlg.open) dlg.showModal(); } else { dlg.setAttribute('open', ''); dlg.classList.add('fallback'); }
    if (!reading) setTimeout(checkRead, 0);
    body.focus();
  }
  function closeTerms() {
    setInert(false);
    if (dlg.close && dlg.showModal) dlg.close(); else dlg.removeAttribute('open');
  }
  body.addEventListener('scroll', checkRead);
  window.addEventListener('resize', checkRead);
  ok.addEventListener('change', function () { accept.disabled = !ok.checked; });
  accept.addEventListener('click', function () {
    if (!reading) { if (!ok.checked) return; accepted = true; try { localStorage.setItem(TKEY, TVER); } catch (e) {} }
    closeTerms();
  });
  dlg.addEventListener('cancel', function (e) { if (!accepted && !reading) e.preventDefault(); });
  dlg.addEventListener('close', function () {
    if (accepted || reading) setInert(false);
    else if (!dlg.classList.contains('fallback')) openTerms(true);
  });
  $('termsLink').addEventListener('click', function () { openTerms(false); });
  if (termsStored()) accepted = true; else openTerms(true);

  ensurePdf().catch(function () {});             // warm up quietly so the first PDF click is instant
  $('date').value = today();
  refresh(); render();
})();
