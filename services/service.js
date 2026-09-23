/* ============================================================
   MOTION PEAK — service subpage engine (vanilla)
   reveals · horizontal scroll scrub · FAQ · cursor · stacked panels
   ============================================================ */
(function () {
  "use strict";
  var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var COARSE = window.matchMedia("(pointer: coarse)").matches;
  function clamp01(v){ return Math.max(0, Math.min(1, v)); }

  /* ---- reveals ---- */
  var reveals = [].slice.call(document.querySelectorAll(".reveal"));
  if ("IntersectionObserver" in window && !REDUCED) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } });
    }, { threshold: 0.18 });
    reveals.forEach(function (el) { io.observe(el); });
  } else { reveals.forEach(function (el) { el.classList.add("is-in"); }); }

  /* ---- horizontal scroll scrub ---- */
  var hs = [].slice.call(document.querySelectorAll(".svc-h"));
  function updateH() {
    /* below 820px the CSS stacks the rail vertically — no horizontal scrub */
    var stacked = window.matchMedia("(max-width:820px)").matches;
    hs.forEach(function (sec) {
      var track = sec.querySelector(".svc-h-track");
      if (!track) return;
      if (stacked) { track.style.transform = ""; return; }
      var rect = sec.getBoundingClientRect();
      var total = rect.height - window.innerHeight;
      if (total <= 0) { track.style.transform = ""; return; }
      var p = clamp01(-rect.top / total);
      var max = track.scrollWidth - window.innerWidth + 40;
      if (max <= 0) { track.style.transform = ""; return; }
      var eased = clamp01((p - 0.06) / 0.88);
      track.style.transform = "translateX(" + (-eased * max).toFixed(1) + "px)";
    });
  }
  if (!REDUCED) {
    window.addEventListener("scroll", updateH, { passive: true });
    window.addEventListener("resize", updateH);
    updateH();
  } else {
    /* no scrub under reduced motion — collapse the tall spacer and let the
       rail scroll natively, otherwise every slide past the first is stranded */
    hs.forEach(function (sec) { sec.classList.add("svc-h-static"); });
  }

  /* ---- video playback ----
     autoplay-in-view is a nicety; click-to-play is the guarantee. The observer
     used to be the ONLY path and was gated behind !REDUCED, so with reduced
     motion on, no video ever played and clicking did nothing. */
  var vids = [].slice.call(document.querySelectorAll("video[data-inview]"));

  vids.forEach(function (v) {
    /* a video the user can start themselves must look like one */
    v.classList.add("is-playable");
    var frame = v.closest(".svc-slide-frame") || v.parentElement;
    if (frame) frame.classList.add("has-video");

    function toggle(ev) {
      /* don't hijack slides that are wrapped in a link to a live site */
      if (v.closest("a")) return;
      ev.preventDefault();
      if (v.paused) { v.play().catch(function () {}); }
      else { v.pause(); }
      if (frame) frame.classList.toggle("is-paused", v.paused);
    }
    (frame || v).addEventListener("click", toggle);
    v.addEventListener("play", function () { if (frame) frame.classList.remove("is-paused"); });
    v.addEventListener("pause", function () { if (frame) frame.classList.add("is-paused"); });
    /* preload="none" means readyState 0 until something asks for data */
    v.addEventListener("loadeddata", function () { v.dataset.ready = "1"; });
  });

  if (!REDUCED && "IntersectionObserver" in window) {
    var vio = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        var v = e.target;
        if (v.dataset.userPaused === "1") return;      // respect a manual pause
        if (e.isIntersecting && e.intersectionRatio > 0.2) v.play().catch(function(){});
        else v.pause();
      });
    }, { threshold: [0, 0.2, 0.6] });
    vids.forEach(function (v) {
      vio.observe(v);
      var frame = v.closest(".svc-slide-frame") || v.parentElement;
      (frame || v).addEventListener("click", function () {
        v.dataset.userPaused = v.paused ? "1" : "0";
      });
    });
  } else {
    /* reduced motion: show the first frame so the rail isn't a wall of black */
    vids.forEach(function (v) { if (v.preload === "none") v.preload = "metadata"; v.load(); });
  }

  /* ---- FAQ accordion ---- */
  [].slice.call(document.querySelectorAll(".faq-q")).forEach(function (q) {
    q.addEventListener("click", function () {
      var item = q.closest(".faq-item");
      var a = item.querySelector(".faq-a");
      var open = item.classList.toggle("open");
      a.style.maxHeight = open ? a.scrollHeight + "px" : "0";
      q.setAttribute("aria-expanded", open ? "true" : "false");
    });
  });

  /* ---- custom cursor ---- */
  var cursor = document.getElementById("cursor");
  if (cursor && !COARSE && !REDUCED) {
    var cx=-100, cy=-100, tx=-100, ty=-100, seen=false;
    document.addEventListener("mousemove", function (e) { tx=e.clientX; ty=e.clientY; if(!seen){seen=true;cx=tx;cy=ty;cursor.style.opacity=1;} });
    cursor.style.opacity=0;
    (function loop(){ cx+=(tx-cx)*0.22; cy+=(ty-cy)*0.22; cursor.style.transform="translate("+cx+"px,"+cy+"px) translate(-50%,-50%)"; requestAnimationFrame(loop); })();
    document.querySelectorAll("a,button,.svc-cell,.svc-slide").forEach(function (el) {
      el.addEventListener("mouseenter", function(){ cursor.classList.add("is-hover"); });
      el.addEventListener("mouseleave", function(){ cursor.classList.remove("is-hover"); });
    });
  }

  /* ---- stacked-panels (cursor-interactive 3D fan) ---- */
  var stage = document.getElementById("panels3d");
  if (stage && !COARSE && !REDUCED) {
    var imgs = (window.__PANEL_IMAGES__ || []);
    var N = imgs.length || 0;
    if (N > 1) {
      var Z = 34, SIGMA = 2.6;
      var host0 = stage.parentElement;
      /* scale panels to the stage so they never collide with the heading */
      function panelSize(i) {
        var t = i / (N - 1);
        var stageH = host0.clientHeight || 480;
        var maxH = Math.max(150, stageH * 0.66);      // tallest panel fits inside the stage
        var h = maxH * (0.72 + t * 0.28);
        return { w: h * 0.72, h: h, t: t };
      }
      var panels = [];
      for (var i = 0; i < N; i++) {
        var sz = panelSize(i), t = sz.t, w = sz.w, h = sz.h;
        var el = document.createElement("div");
        el.className = "p-panel";
        el.style.width = w + "px"; el.style.height = h + "px";
        el.style.marginLeft = (-w/2) + "px"; el.style.marginTop = (-h/2) + "px";
        el.style.opacity = (0.28 + t * 0.72).toFixed(2);
        el.style.transform = "translateZ(" + ((i - (N-1)) * Z) + "px)";
        var im = document.createElement("img"); im.src = imgs[i]; im.alt = ""; im.loading = "lazy";
        var tint = document.createElement("div"); tint.className = "p-tint";
        tint.style.background = i % 2 ? "linear-gradient(160deg,rgba(242,116,11,0.16),rgba(5,5,5,0.35))" : "linear-gradient(160deg,rgba(5,5,5,0.12),rgba(5,5,5,0.42))";
        var edge = document.createElement("div"); edge.className = "p-edge";
        el.appendChild(im); el.appendChild(tint); el.appendChild(edge);
        stage.appendChild(el);
        panels.push({ el: el, baseZ: (i - (N-1)) * Z, y: 0, ty: 0, s: 1, tsc: 1 });
      }
      var rotY = -40, rotX = 16, trotY = -40, trotX = 16;
      var host = stage.parentElement; // .panels-stage
      window.addEventListener("resize", function () {
        panels.forEach(function (p, idx) {
          var s = panelSize(idx);
          p.el.style.width = s.w + "px"; p.el.style.height = s.h + "px";
          p.el.style.marginLeft = (-s.w/2) + "px"; p.el.style.marginTop = (-s.h/2) + "px";
        });
      });
      host.addEventListener("mousemove", function (e) {
        var r = host.getBoundingClientRect();
        var cxp = (e.clientX - r.left) / r.width, cyp = (e.clientY - r.top) / r.height;
        trotY = -40 + (cxp - 0.5) * 16; trotX = 16 + (cyp - 0.5) * -12;
        var cursorPos = cxp * (N - 1);
        panels.forEach(function (p, idx) {
          var d = Math.abs(idx - cursorPos);
          var inf = Math.exp(-(d*d) / (2*SIGMA*SIGMA));
          p.ty = -inf * 66; p.tsc = 0.4 + inf * 0.6;
        });
      });
      host.addEventListener("mouseleave", function () {
        trotY = -40; trotX = 16;
        panels.forEach(function (p) { p.ty = 0; p.tsc = 1; });
      });
      /* the 3D stack is taller than the stage on short viewports —
         measure its real bounding box, then centre and scale it to fit */
      var centerY = 0, fit = 1;
      function fitStack() {
        var hostR = host.getBoundingClientRect();
        var rs = panels.map(function (p) { return p.el.getBoundingClientRect(); });
        var top = Math.min.apply(null, rs.map(function (r) { return r.top; }));
        var bot = Math.max.apply(null, rs.map(function (r) { return r.bottom; }));
        var stackH = (bot - top) / fit;                       // undo current scale
        fit = Math.min(1, (hostR.height * 0.94) / stackH);
        centerY += ((hostR.top + hostR.height / 2) - (top + bot) / 2) / fit;
      }
      requestAnimationFrame(function () { requestAnimationFrame(function () { fitStack(); requestAnimationFrame(fitStack); }); });
      window.addEventListener("resize", function () { setTimeout(fitStack, 60); });

      (function anim(){
        rotY += (trotY - rotY) * 0.08; rotX += (trotX - rotX) * 0.08;
        stage.style.transform = "scale(" + fit.toFixed(3) + ") translateY(" + centerY.toFixed(1) + "px) rotateY(" + rotY.toFixed(2) + "deg) rotateX(" + rotX.toFixed(2) + "deg)";
        panels.forEach(function (p) {
          p.y += (p.ty - p.y) * 0.14; p.s += (p.tsc - p.s) * 0.14;
          p.el.style.transform = "translateZ(" + p.baseZ + "px) translateY(" + p.y.toFixed(1) + "px) scaleY(" + p.s.toFixed(3) + ")";
        });
        requestAnimationFrame(anim);
      })();
    }
  }
})();
