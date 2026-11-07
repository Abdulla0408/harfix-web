/* Harfix website: converter, files, test, menu and the online layer (sponsor card, announcement,
 * anonymous daily count — managed in the admin panel like in the apps). */
(function () {
  "use strict";

  var H = window.Harfix, O = window.HarfixOnline;
  var SITE_VERSION = "1.0";
  var CYR = document.documentElement.lang === "uz-Cyrl";
  // UI texts are written in Latin; the Cyrillic pages show them in Cyrillic.
  function T(s) { return CYR ? H.convertTo(s, "cyr") : s; }
  function $(sel, el) { return (el || document).querySelector(sel); }
  function $$(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  function store(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      localStorage.setItem(k, v);
    } catch (e) { return null; }
  }
  var toastTimer;
  function toast(text) {
    var el = $("#toast");
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2200);
  }
  function save(blob, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (ok, no) {
      var t = document.createElement("textarea");
      t.value = text;
      t.style.position = "fixed";
      t.style.opacity = "0";
      document.body.appendChild(t);
      t.select();
      var done = false;
      try { done = document.execCommand("copy"); } catch (e) { /* old browser */ }
      t.remove();
      if (done) ok(); else no();
    });
  }
  var NAMES = { "new": T("Yangi lotin"), "old": T("Eski lotin"), "cyr": "Кирилл" };

  // --- menu ------------------------------------------------------------------------------
  var menu = $(".menu"), nav = $("#nav");
  if (menu) {
    menu.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      menu.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  // --- alphabet choice ------------------------------------------------------------------
  function targets(section, initial, onChange) {
    var current = initial;
    function paint() {
      $$(".targets button", section).forEach(function (b) {
        b.classList.toggle("on", b.dataset.target === current);
        b.setAttribute("aria-checked", b.dataset.target === current ? "true" : "false");
        b.setAttribute("role", "radio");
      });
    }
    $$(".targets button", section).forEach(function (b) {
      b.addEventListener("click", function () { current = b.dataset.target; paint(); onChange(current); });
    });
    paint();
    return function () { return current; };
  }

  // --- converter ----------------------------------------------------------------------------
  $$('[data-tool="convert"]').forEach(function (tool) {
    var src = $("textarea", tool), out = $('[data-out="result"]', tool), result = "";
    src.placeholder = T("Matnni shu yerga yozing yoki qoʻying (lotin yoki kirill)…");
    var target = targets(tool, tool.dataset.target || "new", render);
    function render() {
      var text = src.value;
      result = text ? H.convertTo(text, target()) : "";
      out.textContent = result || T("Natija shu yerda chiqadi");
      out.classList.toggle("empty", !result);
      $('[data-out="count"]', tool).textContent = text.length ? T(text.length + " ta belgi") : "";
      $('[data-out="badge"]', tool).textContent = !text ? NAMES[target()]
        : result === text ? T("✓ oʻzgarish yoʻq") : NAMES[target()];
      $('[data-act="copy"]', tool).disabled = $('[data-act="download"]', tool).disabled = !result;
    }
    src.addEventListener("input", render);
    $('[data-act="clear"]', tool).addEventListener("click", function () { src.value = ""; render(); src.focus(); });
    $('[data-act="copy"]', tool).addEventListener("click", function () {
      if (!result) return;
      copyText(result).then(function () { toast(T("Nusxalandi ✓")); },
        function () { toast(T("Nusxalab boʻlmadi — natijani belgilab nusxalang")); });
    });
    $('[data-act="download"]', tool).addEventListener("click", function () {
      if (result) save(new Blob([result], { type: "text/plain;charset=utf-8" }), "harfix.txt");
    });
    render();
  });

  // --- files ----------------------------------------------------------------------------------
  var filesTool = $('[data-tool="files"]');
  if (filesTool) {
    var queue = [], running = false;
    var ERR = {
      unsupported: T("Bu fayl turi qoʻllab-quvvatlanmaydi (.docx .xlsx .pptx .txt)"),
      too_big: T("Fayl juda katta"),
      broken: T("Faylni ochib boʻlmadi: buzilgan yoki parol bilan himoyalangan")
    };
    var fileTarget = targets(filesTool, "new", function () {
      queue.forEach(function (q) { if (q.status === "done") { q.status = "wait"; q.result = null; } });
      paintFiles();
    });
    var input = $("#file-input"), drop = $(".drop", filesTool);
    function size(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }
    function add(files) {
      Array.prototype.forEach.call(files, function (f) {
        var ok = window.HarfixOffice && HarfixOffice.isSupported(f.name);
        queue.push({ file: f, status: ok ? "wait" : "error", error: ok ? "" : "unsupported" });
      });
      paintFiles();
    }
    function paintFiles() {
      $('[data-out="files"]', filesTool).hidden = !queue.length;
      var done = queue.filter(function (q) { return q.status === "done"; }).length;
      $('[data-out="files-title"]', filesTool).textContent = T(queue.length + " ta fayl") +
        (done ? " · " + T(done + " ta tayyor") : "");
      var list = $('[data-out="list"]', filesTool);
      list.textContent = "";
      queue.forEach(function (q, i) {
        var li = document.createElement("li");
        var icon = document.createElement("span");
        icon.textContent = q.status === "done" ? "✅" : q.status === "error" ? "⚠️" : "📄";
        var grow = document.createElement("div");
        grow.className = "grow";
        var name = document.createElement("div");
        name.className = "name";
        name.textContent = q.status === "done" ? q.result.name : q.file.name;
        var st = document.createElement("div");
        st.className = "st" + (q.status === "done" ? " ok" : q.status === "error" ? " bad" : "");
        st.textContent = q.status === "working" ? T("Oʻgirilmoqda…") : q.status === "done" ? T("Tayyor") + " · " + size(q.result.blob.size)
          : q.status === "error" ? ERR[q.error] || ERR.broken : size(q.file.size);
        grow.appendChild(name);
        grow.appendChild(st);
        li.appendChild(icon);
        li.appendChild(grow);
        if (q.status === "done") {
          var dl = document.createElement("button");
          dl.type = "button";
          dl.className = "btn";
          dl.textContent = T("Yuklab olish");
          dl.addEventListener("click", function () { save(q.result.blob, q.result.name); });
          li.appendChild(dl);
        } else if (!running) {
          var x = document.createElement("button");
          x.type = "button";
          x.className = "x";
          x.textContent = "×";
          x.setAttribute("aria-label", T("Olib tashlash"));
          x.addEventListener("click", function () { queue.splice(i, 1); paintFiles(); });
          li.appendChild(x);
        }
        list.appendChild(li);
      });
      var btn = $('[data-act="convert-files"]', filesTool);
      btn.disabled = running || !queue.some(function (q) { return q.status === "wait"; });
      btn.textContent = running ? T("Oʻgirilmoqda…") : T("Oʻgirish");
    }
    input.addEventListener("change", function () { add(input.files); input.value = ""; });
    ["dragenter", "dragover"].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("over"); });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("over"); });
    });
    drop.addEventListener("drop", function (e) { if (e.dataTransfer && e.dataTransfer.files) add(e.dataTransfer.files); });
    $('[data-act="clear-files"]', filesTool).addEventListener("click", function () { if (!running) { queue = []; paintFiles(); } });
    $('[data-act="convert-files"]', filesTool).addEventListener("click", function () {
      var todo = queue.filter(function (q) { return q.status === "wait"; });
      if (!todo.length || running) return;
      running = true;
      paintFiles();
      var t = fileTarget();
      todo.reduce(function (chain, q) {
        return chain.then(function () {
          q.status = "working";
          paintFiles();
          return HarfixOffice.convertFile(q.file, t).then(function (res) {
            q.status = "done";
            q.result = res;
          }, function (err) {
            q.status = "error";
            q.error = (err && err.code) || "broken";
          }).then(paintFiles);
        });
      }, Promise.resolve()).then(function () {
        running = false;
        paintFiles();
        var ok = queue.filter(function (q) { return q.status === "done"; });
        if (ok.length === 1) save(ok[0].result.blob, ok[0].result.name);
        toast(T("Tayyor! «Yuklab olish» tugmasini bosing."));
      });
    });
  }

  // --- test ------------------------------------------------------------------------------------
  var quizTool = $('[data-tool="quiz"]');
  if (quizTool) {
    var WORDS = ["Oʻzbekiston", "Toshkent", "shahar", "choʻl", "togʻ", "bogʻ", "qoʻshiq", "oʻqituvchi",
      "gʻisht", "choy", "chiroyli", "shamol", "quyosh", "ishchi", "oʻyin", "sogʻliq", "yashil", "tushlik",
      "choʻntak", "qishloq", "oʻrik", "gʻoya", "ochiq", "kecha", "kuchli", "oʻtmish", "sharbat", "chaqmoq",
      "oʻgʻil", "qizgʻaldoq", "ogʻir", "choʻqqi", "shirin", "ishonch", "Fargʻona", "Shahrisabz", "Chirchiq",
      "Qoʻqon", "Margʻilon", "Urganch", "Toʻrtkoʻl", "Gʻijduvon", "goʻsht", "toʻgʻri", "chegara", "koʻcha"];
    var LOOK = { "ö": "üõô", "ğ": "ǧĝg", "ş": "šśs", "ç": "čćc", "Ö": "ÜÕÔ", "Ğ": "ǦĜG", "Ş": "ŠŚS", "Ç": "ČĆC" };
    var QUIZ_LEN = 10;
    var quiz = {};
    var q$ = function (n) { return $('[data-out="' + n + '"]', quizTool); };
    var next = $('[data-act="qnext"]', quizTool);
    var shuffle = function (a) {
      for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    };
    var wrongs = function (word, right) {
      var c = {};
      c[word.replace(/ʻ/g, "'")] = 1;
      c[right.replace(/[öğşçÖĞŞÇ]/g, function (ch) { return "ogscOGSC"["öğşçÖĞŞÇ".indexOf(ch)]; })] = 1;
      for (var k = 0; k < 12; k++) {
        var chars = right.split(""), idx = [];
        chars.forEach(function (ch, i) { if (LOOK[ch]) idx.push(i); });
        if (!idx.length) break;
        shuffle(idx).slice(0, 1 + Math.floor(Math.random() * idx.length)).forEach(function (i) {
          var opts = LOOK[chars[i]];
          chars[i] = opts[Math.floor(Math.random() * opts.length)];
        });
        c[chars.join("")] = 1;
      }
      delete c[right];
      return shuffle(Object.keys(c)).slice(0, 3);
    };
    var makeQuiz = function () {
      var qs = [];
      shuffle(WORDS.slice()).forEach(function (w) {
        if (qs.length >= QUIZ_LEN) return;
        var right = H.convert(w), bad = wrongs(w, right);
        if (bad.length < 3) return;
        var opts = shuffle([right].concat(bad));
        var text = qs.length % 2 ? T("«" + w + "» yangi alifboda qanday yoziladi?") : T("Qaysi soʻz yangi alifboda toʻgʻri yozilgan?");
        qs.push({ text: text, opts: opts, right: opts.indexOf(right), expl: w + " → " + right });
      });
      return qs;
    };
    var show = function () {
      var q = quiz.qs[quiz.i];
      q$("qnum").textContent = T("Savol " + (quiz.i + 1) + " / " + quiz.qs.length);
      q$("qscore").textContent = "✓ " + quiz.score;
      q$("qbar").style.width = (quiz.i / quiz.qs.length * 100) + "%";
      q$("qtext").textContent = q.text;
      q$("qexpl").textContent = "";
      next.hidden = true;
      q$("qopts").textContent = "";
      q.opts.forEach(function (o, i) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "opt";
        b.textContent = o;
        b.addEventListener("click", function () { answer(i); });
        q$("qopts").appendChild(b);
      });
    };
    var answer = function (i) {
      var q = quiz.qs[quiz.i];
      $$(".opt", quizTool).forEach(function (b, k) {
        b.disabled = true;
        if (k === q.right) b.classList.add("ok"); else if (k === i) b.classList.add("bad");
      });
      if (i === q.right) quiz.score++;
      q$("qscore").textContent = "✓ " + quiz.score;
      q$("qexpl").textContent = T("Toʻgʻri javob: ") + q.expl;
      next.textContent = quiz.i + 1 < quiz.qs.length ? T("Keyingi savol") : T("Natijani koʻrish");
      next.hidden = false;
    };
    var start = function () { quiz = { qs: makeQuiz(), i: 0, score: 0 }; show(); };
    next.addEventListener("click", function () {
      if (quiz.finished) { start(); return; }
      quiz.i++;
      if (quiz.i < quiz.qs.length) { show(); return; }
      quiz.finished = true;
      var k = quiz.score / quiz.qs.length;
      var best = Math.max(quiz.score, parseInt(store("harfix.best") || "0", 10) || 0);
      store("harfix.best", String(best));
      q$("qbar").style.width = "100%";
      q$("qnum").textContent = T("Test tugadi");
      q$("qtext").innerHTML = '<div class="final">' + (k === 1 ? "🏆" : k >= 0.8 ? "🥇" : k >= 0.6 ? "🥈" : "📚") + "</div>";
      q$("qopts").textContent = "";
      q$("qexpl").textContent = T("Natija: " + quiz.score + " / " + quiz.qs.length + " · eng yaxshi: " + best);
      next.textContent = T("Qaytadan boshlash");
    });
    start();
  }

  // --- online: announcement, sponsor card, anonymous daily count -------------------------------
  // Same settings as the apps (admin panel). Without internet nothing shows.
  if (!O || !window.fetch) return;
  function statsOn() { return store("harfix.stats") !== "0"; }
  var statsBtn = $('[data-act="stats"]');
  function paintStats() {
    if (statsBtn) statsBtn.textContent = T("Anonim statistika: ") + (statsOn() ? T("yoqilgan") : T("oʻchirilgan"));
  }
  if (statsBtn) {
    statsBtn.addEventListener("click", function () {
      store("harfix.stats", statsOn() ? "0" : "1");
      paintStats();
      toast(statsOn() ? T("Anonim statistika yoqildi") : T("Anonim statistika oʻchirildi"));
    });
  }
  paintStats();
  function dismissed() {
    try { var d = JSON.parse(store("harfix.dismissed") || "[]"); return Array.isArray(d) ? d : []; } catch (e) { return []; }
  }
  function installDays() {
    var first = store("harfix.first");
    if (!/^\d{4}-\d\d-\d\d$/.test(first || "")) { first = O.today(); store("harfix.first", first); }
    return Math.max(0, Math.floor((Date.parse(O.today()) - Date.parse(first)) / 864e5));
  }
  function ping(config) {
    if (!statsOn() || store("harfix.ping") === O.today()) return;
    var id = store("harfix.id");
    if (!/^[0-9a-f-]{36}$/.test(id || "")) {
      id = O.newId();
      store("harfix.id", id);
      if (store("harfix.id") !== id) return; // no storage: every visit would look like a new person
    }
    var t = O.statsTarget(config);
    fetch(t.url, { method: "POST", headers: { apikey: t.key, "Content-Type": "application/json" },
      body: JSON.stringify({ p_id: id, p_platform: "web", p_version: SITE_VERSION }) })
      .then(function (r) { if (r.ok) store("harfix.ping", O.today()); }, function () { /* offline */ });
  }
  O.loadConfig().then(function (config) {
    var plan = O.plan(config, { platform: "web", version: SITE_VERSION, installDays: installDays(), fresh: !!config,
      dismissed: dismissed() });
    O.render(plan, { top: $("#online-top"), ad: $("#online-ad"), L: T,
      open: function (url) { window.open(url, "_blank", "noopener"); },
      dismiss: function (id) { store("harfix.dismissed", JSON.stringify(dismissed().concat([id]).slice(-50))); } });
    if (plan.stats) ping(config);
  }, function () { /* offline */ });
})();
