/* ============================================================
   MOTION PEAK V3 — scroll-cinema engine
   Six film chapters · website-chrome overlays · uniform
   showcase with autoplay + slow-mo · animated closing.
   ============================================================ */

(function () {
  "use strict";

  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.scrollTo(0, 0);

  var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var COARSE = window.matchMedia("(pointer: coarse)").matches;

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  function progressOf(el) {
    var rect = el.getBoundingClientRect();
    var innerH = window.innerHeight;
    var total = rect.height - innerH;
    if (total <= 0) return 0;
    return clamp01(-rect.top / total);
  }

  /* ============ FILM CHAPTERS ============ */

  var chapterDefs = window.__CHAPTERS__ || [];
  var chapters = [];

  chapterDefs.forEach(function (def) {
    var el = document.getElementById(def.id);
    if (!el) return;
    var seqs = def.seqs.filter(function (s) { return s.count > 0; });
    var total = seqs.reduce(function (n, s) { return n + s.count; }, 0);
    if (!total) return;
    var canvas = el.querySelector("canvas");
    var loadingTag = document.createElement("div");
    loadingTag.className = "film-loading";
    loadingTag.textContent = "LOADING FILM";
    el.querySelector(".film-sticky").appendChild(loadingTag);
    /* overlays: copy layers, world captions AND site-chrome share the window driver */
    var overlays = Array.prototype.slice.call(el.querySelectorAll(".v-copy, .v-caption, .site-chrome"));
    overlays.forEach(function (c) {
      var w = (c.getAttribute("data-window") || "0,1").split(",");
      c._in = parseFloat(w[0]);
      c._out = parseFloat(w[1]);
      c._grow = c.hasAttribute("data-grow");
      c._chrome = c.classList.contains("site-chrome");
    });
    chapters.push({
      el: el,
      canvas: canvas,
      ctx: canvas.getContext("2d"),
      seqs: seqs,
      total: total,
      frames: [],
      loaded: 0,
      started: false,
      lastDrawn: -1,
      current: 0,
      overlays: overlays,
      loadingTag: loadingTag
    });
  });

  function framePath(ch, globalIdx) {
    var i = globalIdx;
    for (var s = 0; s < ch.seqs.length; s++) {
      if (i < ch.seqs[s].count) {
        return ch.seqs[s].path + "frame_" + String(i + 1).padStart(4, "0") + ".webp";
      }
      i -= ch.seqs[s].count;
    }
    return null;
  }

  var dpr = Math.min(window.devicePixelRatio || 1, 2);

  /* ------- crossfade bridge (holds the outgoing world's last frame, dissolves over the incoming) ------- */
  var bridge = document.getElementById("bridge");
  var bctx = bridge ? bridge.getContext("2d") : null;
  var BRIDGE_SPAN = 0.1; /* fraction of a chapter's entry over which the previous frame dissolves */

  function sizeBridge() {
    if (!bridge) return;
    bridge.width = Math.round(window.innerWidth * dpr);
    bridge.height = Math.round(window.innerHeight * dpr);
  }

  function drawBridge(fromCh, alpha) {
    if (!bctx || !fromCh) return;
    var img = fromCh.frames[fromCh.total - 1];
    if (!img || !img.complete || !img.naturalWidth) { bridge.style.opacity = 0; return; }
    var cw = bridge.width, chh = bridge.height;
    var iw = img.naturalWidth, ih = img.naturalHeight;
    var scale = Math.max(cw / iw, chh / ih);
    var dw = iw * scale, dh = ih * scale;
    bctx.clearRect(0, 0, cw, chh);
    bctx.drawImage(img, (cw - dw) / 2, (chh - dh) / 2, dw, dh);
    bridge.style.opacity = alpha.toFixed(3);
  }

  function sizeCanvas(ch) {
    ch.canvas.width = Math.round(ch.canvas.clientWidth * dpr);
    ch.canvas.height = Math.round(ch.canvas.clientHeight * dpr);
    ch.lastDrawn = -1;
    drawFrame(ch, ch.current, true);
  }

  function drawFrame(ch, idx, force) {
    if (!force && idx === ch.lastDrawn) return;
    var img = null, i = idx;
    while (i >= 0) {
      var cand = ch.frames[i];
      if (cand && cand.complete && cand.naturalWidth) { img = cand; break; }
      i--;
    }
    if (!img) return;
    var cw = ch.canvas.width, chh = ch.canvas.height;
    var iw = img.naturalWidth, ih = img.naturalHeight;
    var scale = Math.max(cw / iw, chh / ih);
    var dw = iw * scale, dh = ih * scale;
    ch.ctx.drawImage(img, (cw - dw) / 2, (chh - dh) / 2, dw, dh);
    ch.lastDrawn = idx;
  }

  /* ------- preloader (gates on a small prefix of chapter 0) -------
     the hero used to gate on all 362 of its frames (~23MB) before the
     page showed anything, then immediately fired another ~84MB for every
     later chapter regardless of whether the visitor ever scrolled that
     far — on mobile that's most of a data budget spent before a single
     paint. Now the gate is a short prefix (smooth through the first
     couple of scroll-lengths); the rest of the hero streams in behind
     it, and every later chapter only starts downloading once the
     visitor is actually approaching it. drawFrame() already falls back
     to the nearest loaded frame, so scrolling ahead of what's
     downloaded just holds the last frame instead of breaking. */
  var preloader = document.getElementById("preloader");
  var loadPct = document.getElementById("loadPct");
  var loadBar = document.getElementById("loadBar");
  var nav = document.getElementById("nav");
  var waPill = document.getElementById("waPill");
  var revealed = false;
  var GATE_FRAMES = 26;

  function reveal() {
    if (revealed) return;
    revealed = true;
    setTimeout(function () {
      preloader.classList.add("is-done");
      preloader.setAttribute("aria-hidden", "true");
      nav.classList.add("is-in");
      chapters.forEach(function (ch) { drawFrame(ch, ch.current, true); });
      update();
      loadChapterBackground(chapters[0], GATE_FRAMES);
      observeUpcomingChapters();
    }, 450);
  }

  setTimeout(function () { reveal(); }, 15000);

  /* streams the remainder of an already-gated chapter in without blocking
     anything; shows the same "LOADING FILM" tag other chapters use if the
     visitor scrolls past what has actually downloaded yet. */
  function loadChapterBackground(ch, from) {
    if (ch.bgStarted) return;
    ch.bgStarted = true;
    if (from >= ch.total) return;
    ch.loadingTag.classList.add("is-on");
    for (var i = from; i < ch.total; i++) {
      (function (idx) {
        var img = new Image();
        img.onload = img.onerror = function () {
          ch.loaded++;
          if (ch.loaded >= ch.total) ch.loadingTag.classList.remove("is-on");
          drawFrame(ch, ch.current, false);
        };
        img.src = framePath(ch, idx);
        ch.frames[idx] = img;
      })(i);
    }
  }

  function loadChapter(ch, onDone) {
    if (ch.started) { if (onDone) onDone(); return; }
    ch.started = true;
    var isGate = ch === chapters[0];
    var limit = isGate ? Math.min(GATE_FRAMES, ch.total) : ch.total;
    if (!isGate) ch.loadingTag.classList.add("is-on");
    for (var i = 0; i < limit; i++) {
      (function (idx) {
        var img = new Image();
        img.onload = img.onerror = function () {
          ch.loaded++;
          if (isGate) {
            var pct = Math.round((ch.loaded / limit) * 100);
            if (loadPct) loadPct.textContent = String(pct);
            if (loadBar) loadBar.style.width = pct + "%";
            if (ch.loaded >= limit) reveal();
          } else if (ch.loaded >= ch.total) {
            ch.loadingTag.classList.remove("is-on");
            drawFrame(ch, ch.current, true);
            if (onDone) onDone();
          }
        };
        img.src = framePath(ch, idx);
        ch.frames[idx] = img;
      })(i);
    }
  }

  /* later chapters load only once the visitor is actually approaching
     them (roughly a viewport-height early, so frames are ready in time),
     not the instant the hero gate clears. */
  function observeUpcomingChapters() {
    var rest = chapters.slice(1);
    if (!rest.length) return;
    if (!("IntersectionObserver" in window)) {
      (function next(n) { if (n >= chapters.length) return; loadChapter(chapters[n], function () { next(n + 1); }); })(1);
      return;
    }
    var byEl = new Map();
    rest.forEach(function (ch) { byEl.set(ch.el, ch); });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var ch = byEl.get(e.target);
        if (!ch) return;
        io.unobserve(e.target);
        loadChapter(ch);
      });
    /* percentage rootMargin isn't reliably honoured across engines — use a
       fixed px lead so a chapter's frames are ready well before it's reached */
    }, { rootMargin: Math.round(window.innerHeight * 1.2) + "px 0px" });
    rest.forEach(function (ch) { io.observe(ch.el); });
  }

  function updateChapter(ch) {
    var p = progressOf(ch.el);
    ch.current = Math.min(ch.total - 1, Math.floor(p * (ch.total - 1)));
    drawFrame(ch, ch.current, false);
    ch.overlays.forEach(function (el) {
      var span = el._out - el._in;
      var local = (p - el._in) / span;
      if (local < 0 || local >= 1) { el.style.opacity = 0; return; }
      var o = 1;
      if (local < 0.22 && el._in > 0) o = local / 0.22;
      else if (local > 0.82) o = (1 - local) / 0.18;
      el.style.opacity = o.toFixed(3);
      if (el._chrome) {
        /* chrome settles: slight rise only */
        var rise = (1 - Math.min(1, local / 0.22)) * 18;
        el.style.transform = "translateY(" + rise.toFixed(1) + "px)";
      } else {
        var origin = el._in === 0 ? 0 : 0.5;
        var drift = (local - origin) * -46;
        var t = "translateY(" + drift.toFixed(1) + "px)";
        if (el._grow) t += " scale(" + (1 + local * 0.14).toFixed(3) + ")";
        el.style.transform = t;
      }
    });
  }

  /* ============ SCROLL HINT ============ */
  var scrollHint = document.getElementById("scrollHint");

  /* ============ REVEALS ============ */
  var revealEls = Array.prototype.slice.call(document.querySelectorAll(".reveal"));
  var closingTitle = document.getElementById("closingTitle");
  if ("IntersectionObserver" in window && !REDUCED) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("is-in");
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.2 });
    revealEls.forEach(function (el) { io.observe(el); });
    if (closingTitle) io.observe(closingTitle);
  } else {
    revealEls.forEach(function (el) { el.classList.add("is-in"); });
    if (closingTitle) closingTitle.classList.add("is-in");
  }

  /* ============ VIDEOS: autoplay in view, click = slow-mo ============ */
  var videoButtons = Array.prototype.slice.call(document.querySelectorAll("[data-slow]"));
  if (!REDUCED) {
    var vio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var vid = en.target.querySelector("video");
        if (!vid) return;
        if (en.isIntersecting && en.intersectionRatio >= 0.45) {
          vid.play().catch(function () {});
        } else {
          vid.pause();
        }
      });
    }, { threshold: [0, 0.45, 1] });
    videoButtons.forEach(function (btn) {
      vio.observe(btn);
      btn.addEventListener("click", function () {
        var vid = btn.querySelector("video");
        if (!vid) return;
        var slow = btn.classList.toggle("is-slow");
        vid.playbackRate = slow ? 0.4 : 1;
        var chip = btn.querySelector(".sc-chip");
        if (chip) chip.textContent = slow ? "Normal speed ▸" : "Watch slowly ▸";
        vid.play().catch(function () {});
      });
    });
  }

  /* ============ SELECTED WORK — horizontal scrub driven by vertical scroll ============ */
  var showcase = document.getElementById("showcase");
  var showcaseTrack = document.getElementById("showcaseTrack");
  function updateShowcase() {
    if (!showcase || !showcaseTrack || REDUCED) return;
    var p = progressOf(showcase);
    var max = showcaseTrack.scrollWidth - window.innerWidth + parseFloat(getComputedStyle(showcaseTrack).paddingLeft || 0);
    if (max <= 0) { showcaseTrack.style.transform = ""; return; }
    /* ease the ends so the first/last card rest fully in view */
    var eased = Math.max(0, Math.min(1, (p - 0.06) / 0.88));
    showcaseTrack.style.transform = "translateX(" + (-eased * max).toFixed(1) + "px)";
  }

  /* ============ CURSOR ============ */
  var cursor = document.getElementById("cursor");
  if (cursor && !COARSE && !REDUCED) {
    var cx = -100, cy = -100, tx = -100, ty = -100, seen = false;
    document.addEventListener("mousemove", function (e) {
      tx = e.clientX; ty = e.clientY;
      if (!seen) { seen = true; cx = tx; cy = ty; cursor.style.opacity = 1; }
    });
    cursor.style.opacity = 0;
    (function cursorLoop() {
      cx += (tx - cx) * 0.22;
      cy += (ty - cy) * 0.22;
      cursor.style.transform = "translate(" + cx + "px," + cy + "px) translate(-50%,-50%)";
      requestAnimationFrame(cursorLoop);
    })();
    document.querySelectorAll("a, button, .s-col, .w-card").forEach(function (el) {
      el.addEventListener("mouseenter", function () { cursor.classList.add("is-hover"); });
      el.addEventListener("mouseleave", function () { cursor.classList.remove("is-hover"); });
    });
  }

  /* ============ HERO PARALLAX ============ */
  var heroTitle = document.getElementById("heroTitle");
  if (!COARSE && !REDUCED && heroTitle && chapters[0]) {
    document.addEventListener("mousemove", function (e) {
      if (progressOf(chapters[0].el) > 0.04) { heroTitle.style.transform = ""; return; }
      var dx = (e.clientX / window.innerWidth - 0.5) * 8;
      var dy = (e.clientY / window.innerHeight - 0.5) * 6;
      heroTitle.style.transform = "translate(" + dx.toFixed(1) + "px," + dy.toFixed(1) + "px)";
    });
  }

  /* ============ MASTER UPDATE ============ */
  function updateBridge() {
    if (!bridge) return;
    /* find a world chapter currently in its entry zone; dissolve the previous chapter's last frame over it */
    for (var k = 1; k < chapters.length; k++) {
      var ch = chapters[k];
      if (!ch.el.hasAttribute("data-bridge")) continue;
      var p = progressOf(ch.el);
      var rect = ch.el.getBoundingClientRect();
      /* only when this chapter's sticky owns the viewport (top has reached 0) and we're early in it */
      if (rect.top <= 1 && p > 0 && p < BRIDGE_SPAN) {
        drawBridge(chapters[k - 1], 1 - p / BRIDGE_SPAN);
        return;
      }
    }
    bridge.style.opacity = 0;
  }

  function update() {
    chapters.forEach(updateChapter);
    updateBridge();
    updateShowcase();
    var heroP = chapters[0] ? progressOf(chapters[0].el) : 1;
    if (scrollHint) scrollHint.style.opacity = heroP > 0.02 ? 0 : 1;
    if (waPill) waPill.classList.toggle("is-on", heroP > 0.06);
  }

  window.addEventListener("resize", function () {
    chapters.forEach(sizeCanvas);
    sizeBridge();
    update();
  });

  /* ============ SMOOTH SCROLL ============ */
  if (!REDUCED && window.Lenis) {
    var lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.95 });
    window.__lenis = lenis;
    function raf(time) {
      lenis.raf(time);
      update();
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);
    document.querySelectorAll('a[href^="#"]').forEach(function (a) {
      a.addEventListener("click", function (e) {
        var target = document.querySelector(a.getAttribute("href"));
        if (target) { e.preventDefault(); lenis.scrollTo(target, { duration: 1.6 }); }
      });
    });
  } else {
    window.addEventListener("scroll", update, { passive: true });
    update();
  }

  /* ============ MOBILE MENU ============ */
  var burger = document.getElementById("navBurger");
  var mobileMenu = document.getElementById("mobileMenu");
  if (burger && mobileMenu) {
    function closeMenu() {
      burger.classList.remove("is-open");
      burger.setAttribute("aria-expanded", "false");
      mobileMenu.classList.remove("is-open");
      mobileMenu.setAttribute("aria-hidden", "true");
      document.body.classList.remove("menu-open");
    }
    function openMenu() {
      burger.classList.add("is-open");
      burger.setAttribute("aria-expanded", "true");
      mobileMenu.classList.add("is-open");
      mobileMenu.setAttribute("aria-hidden", "false");
      document.body.classList.add("menu-open");
    }
    burger.addEventListener("click", function () {
      if (mobileMenu.classList.contains("is-open")) closeMenu(); else openMenu();
    });
    mobileMenu.querySelectorAll("a").forEach(function (a) { a.addEventListener("click", closeMenu); });
    window.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenu(); });
    /* a resize past the mobile breakpoint must not leave the overlay stuck open */
    window.addEventListener("resize", function () { if (window.innerWidth > 900) closeMenu(); });
  }

  /* ============ BOOT ============ */
  chapters.forEach(sizeCanvas);
  sizeBridge();

  if (REDUCED) {
    chapters.forEach(function (ch) {
      var img = new Image();
      img.onload = function () { ch.frames[0] = img; ch.total = 1; ch.current = 0; drawFrame(ch, 0, true); };
      img.src = framePath(ch, 0);
    });
    if (waPill) waPill.classList.add("is-on");
    reveal();
  } else if (chapters.length === 0) {
    reveal();
  } else {
    loadChapter(chapters[0]);
  }
})();
