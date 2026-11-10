(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var textIds = ['name','dob','idType','idNumber','phone','email','line1','line2','city','region','postcode','country','since','permanent','sname','smobile','semail','lname','lmobile','lemail','lrel','recipient','purpose','date','evidence'];
  var emailIds = ['email','semail','lemail'];
  var state = { ref: '', stamp: '' };
  var msg = $('msg'), letter = $('letter');

  function g(id) { return $(id).value.trim(); }
  function today() { var n = new Date(); return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0'); }
  function scenarios() {
    return { noBills: $('sc-noBills').checked, noContract: $('sc-noContract').checked, longTerm: $('sc-longTerm').checked, host: $('sc-host').checked };
  }
  function data() {
    var d = { scenarios: scenarios(), permSame: $('permSame').checked, ref: state.ref, stamp: state.stamp };
    textIds.forEach(function (id) { d[id] = g(id); });
    return d;
  }
  function refresh() {
    var now = new Date();
    state.ref = POA.makeRef(now); state.stamp = POA.fmtStamp(now);
    $('ref').value = state.ref;
  }
  function landlordRequired() { var s = scenarios(); return s.noContract || s.host; }

  function sync() {
    $('evidenceWrap').hidden = !$('sc-noBills').checked;
    $('permanent').disabled = $('permSame').checked;
    $('permWrap').style.opacity = $('permSame').checked ? .5 : 1;
    $('lhint').textContent = landlordRequired()
      ? 'Required for your situation. Add their name and a mobile number or email so the letter can be verified. They sign the printed letter.'
      : 'Optional. Add their details if they can confirm you live here. They sign the printed letter.';
  }
  function render() { sync(); letter.innerHTML = POA.toHTML(POA.buildDoc(data())); }

  function validate() {
    var d = data(), missing = [];
    document.querySelectorAll('.bad').forEach(function (n) { n.classList.remove('bad'); });
    function need(id, label) { if (!g(id)) { $(id).classList.add('bad'); missing.push(label); } }
    need('name', 'full name'); need('line1', 'address line 1'); need('city', 'city'); need('country', 'country'); need('since', 'living here since');
    var any = g('lname') || g('lmobile') || g('lemail');
    if (landlordRequired() || any) {
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

  $('btnPdf').addEventListener('click', function () {
    var doc = prepare(); if (!doc) return;
    var J = window.jspdf && window.jspdf.jsPDF;
    if (!J) { msg.textContent = 'The PDF library did not load. Use Print and choose Save as PDF.'; return; }
    if (!POA.pdfSupports(doc)) { msg.textContent = 'This PDF builder cannot embed some characters you typed (for example Bangla or Arabic). Use Print and choose Save as PDF, or download the DOCX.'; return; }
    POA.toPDF(doc, J).save('Proof-of-Address-' + doc.ref + '.pdf');
  });
  $('btnDocx').addEventListener('click', function () {
    var doc = prepare(); if (!doc) return;
    save(new Blob([POA.toDOCX(doc)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'Proof-of-Address-' + doc.ref + '.docx');
  });
  $('btnText').addEventListener('click', function () {
    var doc = prepare(); if (!doc) return;
    save(new Blob([POA.toText(doc)], { type: 'text/plain;charset=utf-8' }), 'Proof-of-Address-' + doc.ref + '.txt');
  });
  $('btnPrint').addEventListener('click', function () { if (prepare()) window.print(); });

  $('form').addEventListener('reset', function () {
    setTimeout(function () { $('date').value = today(); msg.textContent = ''; document.querySelectorAll('.bad').forEach(function (n) { n.classList.remove('bad'); }); refresh(); render(); }, 0);
  });
  $('form').addEventListener('input', render);
  $('form').addEventListener('change', render);

  $('date').value = today();
  refresh(); render();
})();
