/* Signature image tool: load an image, crop it and remove its background.
   The pixel helpers (medianBorder, process, bbox) are pure and exported for testing. */
(function (root) {
  'use strict';
  var MAX_SRC = 1600, MAX_OUT = 900, HANDLE = 14, MIN_BOX = 12;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // Typical background colour: median of the pixels around the image border
  function medianBorder(d, w, h) {
    var r = [], g = [], b = [];
    var ring = Math.max(2, Math.floor(Math.min(w, h) * 0.02)), step = Math.max(1, Math.floor(Math.min(w, h) / 60));
    function add(x, y) { var i = (y * w + x) * 4; if (d[i + 3] < 10) return; r.push(d[i]); g.push(d[i + 1]); b.push(d[i + 2]); }
    var x, y, k;
    for (x = 0; x < w; x += step) for (k = 0; k < ring; k += Math.max(1, ring - 1)) { add(x, k); add(x, h - 1 - k); }
    for (y = 0; y < h; y += step) for (k = 0; k < ring; k += Math.max(1, ring - 1)) { add(k, y); add(w - 1 - k, y); }
    function med(a) { if (!a.length) return 255; a.sort(function (p, q) { return p - q; }); return a[a.length >> 1]; }
    return [med(r), med(g), med(b)];
  }

  // Makes pixels close to the background colour transparent (in place on an RGBA array)
  function process(d, o) {
    var bg = o.bg, tol = o.tol, feather = Math.max(20, tol * 0.8);
    var ink = o.ink === 'black' ? [17, 17, 17] : o.ink === 'blue' ? [20, 40, 120] : null;
    for (var i = 0; i < d.length; i += 4) {
      var dist = Math.max(Math.abs(d[i] - bg[0]), Math.abs(d[i + 1] - bg[1]), Math.abs(d[i + 2] - bg[2]));
      var a = clamp((dist - tol) / feather, 0, 1);
      if (a <= 0) { d[i + 3] = 0; continue; }
      if (ink) { d[i] = ink[0]; d[i + 1] = ink[1]; d[i + 2] = ink[2]; }
      else if (a < 1) { for (var c = 0; c < 3; c++) d[i + c] = clamp(Math.round((d[i + c] - bg[c] * (1 - a)) / a), 0, 255); }
      d[i + 3] = Math.round(d[i + 3] * a);
    }
  }

  function bbox(d, w, h, thr) {
    var x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > thr) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  var api = { process: process, medianBorder: medianBorder, bbox: bbox };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SigTool = api;
  if (typeof document === 'undefined') return;

  /* ---------------- Editor dialog ---------------- */
  var S = { src: null, ctx: null, crop: null, bg: [255, 255, 255], picking: false, drag: null, scale: 1, done: null, finished: true };
  var el = null;
  function $(id) { return document.getElementById(id); }
  function init() {
    el = {};
    ['sigDlg', 'sigCrop', 'sigOut', 'sigBg', 'sigTol', 'sigInk', 'sigPickBg', 'sigFit', 'sigReset', 'sigApply', 'sigCancel', 'sigSwatch', 'sigMsg'].forEach(function (id) { el[id] = $(id); });
    el.sigTol.addEventListener('input', renderPreview);
    el.sigInk.addEventListener('change', renderPreview);
    el.sigBg.addEventListener('change', function () { el.sigTol.disabled = el.sigInk.disabled = el.sigPickBg.disabled = !el.sigBg.checked; renderPreview(); });
    el.sigPickBg.addEventListener('click', function () {
      S.picking = !S.picking;
      el.sigPickBg.textContent = S.picking ? 'Click the background in the image' : 'Pick background colour';
      el.sigCrop.style.cursor = S.picking ? 'crosshair' : 'default';
    });
    el.sigFit.addEventListener('click', fitCrop);
    el.sigReset.addEventListener('click', function () { resetCrop(); refresh(); });
    el.sigApply.addEventListener('click', apply);
    el.sigCancel.addEventListener('click', function () { finish(null); });
    el.sigDlg.addEventListener('close', function () { finish(null); });
    var c = el.sigCrop;
    c.addEventListener('pointerdown', down); c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    c.addEventListener('keydown', key);
  }

  function say(t) { el.sigMsg.textContent = t || ''; }
  function finish(res, err) {
    if (S.finished) return;
    S.finished = true;
    if (el.sigDlg.hasAttribute('open')) { if (el.sigDlg.close && el.sigDlg.showModal) el.sigDlg.close(); else el.sigDlg.removeAttribute('open'); }
    S.done(res, err);
  }

  function edit(file, done) {
    if (!el) init();
    if (!file || !/^image\//.test(file.type)) return done(null, 'Please choose an image file (PNG, JPG or WebP).');
    if (file.size > 15 * 1024 * 1024) return done(null, 'That image is larger than 15 MB. Please choose a smaller one.');
    var fr = new FileReader();
    fr.onerror = function () { done(null, 'That file could not be read.'); };
    fr.onload = function () {
      var img = new Image();
      img.onload = function () { setup(img, done); };
      img.onerror = function () { done(null, 'That file could not be read as an image.'); };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  }

  function setup(img, done) {
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    var f = Math.min(1, MAX_SRC / Math.max(iw, ih)), w = Math.max(1, Math.round(iw * f)), h = Math.max(1, Math.round(ih * f));
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    S.src = c; S.ctx = ctx; S.done = done; S.finished = false; S.picking = false;
    S.bg = medianBorder(ctx.getImageData(0, 0, w, h).data, w, h);
    var maxW = Math.min(520, el.sigCrop.parentNode.clientWidth || 520);
    S.scale = Math.min(maxW / w, 360 / h);
    el.sigCrop.width = Math.max(1, Math.round(w * S.scale)); el.sigCrop.height = Math.max(1, Math.round(h * S.scale));
    el.sigBg.checked = true; el.sigTol.disabled = el.sigInk.disabled = el.sigPickBg.disabled = false;
    el.sigPickBg.textContent = 'Pick background colour'; el.sigCrop.style.cursor = 'default';
    say(''); resetCrop();
    if (el.sigDlg.showModal) { if (!el.sigDlg.open) el.sigDlg.showModal(); } else el.sigDlg.setAttribute('open', '');
    refresh();
    el.sigCrop.focus();
  }

  function resetCrop() { S.crop = { x: 0, y: 0, w: S.src.width, h: S.src.height }; }
  function disp() { var c = S.crop, k = S.scale; return { x: c.x * k, y: c.y * k, w: c.w * k, h: c.h * k }; }
  function refresh() { drawCrop(); renderPreview(); }

  function drawCrop() {
    var c = el.sigCrop, g = c.getContext('2d'), r = disp();
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(S.src, 0, 0, c.width, c.height);
    g.save(); g.fillStyle = 'rgba(0,0,0,.5)'; g.beginPath(); g.rect(0, 0, c.width, c.height); g.rect(r.x, r.y, r.w, r.h); g.fill('evenodd'); g.restore();
    g.lineWidth = 2; g.strokeStyle = '#fff'; g.strokeRect(r.x, r.y, r.w, r.h);
    g.lineWidth = 1; g.strokeStyle = '#0f5c63'; g.strokeRect(r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3);
    g.fillStyle = '#fff'; g.strokeStyle = '#0f5c63';
    corners(r).forEach(function (p) { g.fillRect(p.x - 5, p.y - 5, 10, 10); g.strokeRect(p.x - 5, p.y - 5, 10, 10); });
  }
  function corners(r) {
    return [{ x: r.x, y: r.y, ax: r.x + r.w, ay: r.y + r.h }, { x: r.x + r.w, y: r.y, ax: r.x, ay: r.y + r.h },
            { x: r.x, y: r.y + r.h, ax: r.x + r.w, ay: r.y }, { x: r.x + r.w, y: r.y + r.h, ax: r.x, ay: r.y }];
  }

  function swatch() { el.sigSwatch.style.background = 'rgb(' + S.bg.join(',') + ')'; }
  function renderOut(target, wantNew) {
    var cr = S.crop, f = Math.min(1, MAX_OUT / cr.w), w = Math.max(1, Math.round(cr.w * f)), h = Math.max(1, Math.round(cr.h * f));
    var c = wantNew ? document.createElement('canvas') : target; c.width = w; c.height = h;
    var g = c.getContext('2d', { willReadFrequently: true });
    g.clearRect(0, 0, w, h);
    g.drawImage(S.src, cr.x, cr.y, cr.w, cr.h, 0, 0, w, h);
    if (el.sigBg.checked) {
      var im = g.getImageData(0, 0, w, h);
      process(im.data, { bg: S.bg, tol: +el.sigTol.value, ink: el.sigInk.value });
      g.putImageData(im, 0, 0);
    }
    return c;
  }
  function renderPreview() { swatch(); renderOut(el.sigOut, false); }

  // Crop box = bounding box of everything that is not background
  function fitCrop() {
    var w = S.src.width, h = S.src.height, d = new Uint8ClampedArray(S.ctx.getImageData(0, 0, w, h).data);
    process(d, { bg: S.bg, tol: +el.sigTol.value, ink: 'keep' });
    var bb = bbox(d, w, h, 40);
    if (!bb) { say('No signature found. Try a lower background sensitivity or pick the background colour.'); return; }
    var pad = Math.round(Math.max(w, h) * 0.02), x0 = Math.max(0, bb.x - pad), y0 = Math.max(0, bb.y - pad);
    S.crop = { x: x0, y: y0, w: Math.min(w, bb.x + bb.w + pad) - x0, h: Math.min(h, bb.y + bb.h + pad) - y0 };
    say(''); refresh();
  }

  function apply() {
    var c = renderOut(null, true), g = c.getContext('2d', { willReadFrequently: true }), box = { x: 0, y: 0, w: c.width, h: c.height };
    if (el.sigBg.checked) {
      box = bbox(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height, 20);
      if (!box) { say('No signature found in the crop. Lower the background sensitivity or crop around the signature.'); return; }
      var pad = Math.round(Math.max(c.width, c.height) * 0.01) + 2, x0 = Math.max(0, box.x - pad), y0 = Math.max(0, box.y - pad);
      box = { x: x0, y: y0, w: Math.min(c.width, box.x + box.w + pad) - x0, h: Math.min(c.height, box.y + box.h + pad) - y0 };
    }
    var t = document.createElement('canvas'); t.width = box.w; t.height = box.h;
    t.getContext('2d').drawImage(c, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
    finish({ data: t.toDataURL('image/png'), w: box.w, h: box.h });
  }

  /* ---- pointer and keyboard handling for the crop box ---- */
  function pos(e) {
    var c = el.sigCrop, r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / (r.width || c.width)), y: (e.clientY - r.top) * (c.height / (r.height || c.height)) };
  }
  function setBox(x0, y0, x1, y1) {
    var W = el.sigCrop.width, H = el.sigCrop.height;
    x0 = clamp(x0, 0, W); x1 = clamp(x1, 0, W); y0 = clamp(y0, 0, H); y1 = clamp(y1, 0, H);
    var l = Math.min(x0, x1), t = Math.min(y0, y1), w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
    if (w < MIN_BOX || h < MIN_BOX) return;
    S.crop = { x: l / S.scale, y: t / S.scale, w: w / S.scale, h: h / S.scale };
    refresh();
  }
  function isFull() { return S.crop.w >= S.src.width * 0.98 && S.crop.h >= S.src.height * 0.98; }   // untouched box: dragging draws a new one
  function down(e) {
    var p = pos(e);
    if (S.picking) {
      var x = clamp(Math.round(p.x / S.scale), 1, S.src.width - 2), y = clamp(Math.round(p.y / S.scale), 1, S.src.height - 2);
      var px = S.ctx.getImageData(x - 1, y - 1, 3, 3).data, s = [0, 0, 0];
      for (var i = 0; i < px.length; i += 4) { s[0] += px[i]; s[1] += px[i + 1]; s[2] += px[i + 2]; }
      S.bg = s.map(function (v) { return Math.round(v / 9); });
      S.picking = false; el.sigPickBg.textContent = 'Pick background colour'; el.sigCrop.style.cursor = 'default';
      refresh(); return;
    }
    var r = disp(), hit = null;
    corners(r).forEach(function (c) { if (!hit && Math.abs(p.x - c.x) <= HANDLE && Math.abs(p.y - c.y) <= HANDLE) hit = c; });
    if (el.sigCrop.setPointerCapture && e.pointerId != null) { try { el.sigCrop.setPointerCapture(e.pointerId); } catch (err) {} }
    if (hit) S.drag = { mode: 'resize', ax: hit.ax, ay: hit.ay };
    else if (!isFull() && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) S.drag = { mode: 'move', dx: p.x - r.x, dy: p.y - r.y };
    else S.drag = { mode: 'resize', ax: p.x, ay: p.y };
  }
  function move(e) {
    if (!S.drag) return;
    var p = pos(e), d = S.drag;
    if (d.mode === 'resize') setBox(d.ax, d.ay, p.x, p.y);
    else {
      var r = disp(), W = el.sigCrop.width, H = el.sigCrop.height;
      var x = clamp(p.x - d.dx, 0, W - r.w), y = clamp(p.y - d.dy, 0, H - r.h);
      S.crop.x = x / S.scale; S.crop.y = y / S.scale; refresh();
    }
  }
  function up() { S.drag = null; }
  function key(e) {
    var k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!k) return;
    e.preventDefault();
    var st = Math.max(2, Math.round(S.src.width * 0.01)), c = S.crop;
    if (e.shiftKey) { c.w = clamp(c.w + k[0] * st, MIN_BOX / S.scale, S.src.width - c.x); c.h = clamp(c.h + k[1] * st, MIN_BOX / S.scale, S.src.height - c.y); }
    else { c.x = clamp(c.x + k[0] * st, 0, S.src.width - c.w); c.y = clamp(c.y + k[1] * st, 0, S.src.height - c.h); }
    refresh();
  }

  api.edit = edit;
})(typeof window !== 'undefined' ? window : this);
