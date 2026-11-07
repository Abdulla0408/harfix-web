/*
 * Harfix online layer: what the apps show from the remote settings — sponsor
 * cards, an announcement, a "new version" note — and the anonymous daily count.
 * The settings are edited in the admin panel (Mini App, opened from the bot's
 * /admin) and kept in Supabase (harfix_config); config.json on GitHub Pages
 * is the backup copy, read when Supabase cannot be reached.
 *
 * Without internet nothing here shows and the apps work fully offline.
 * Ads appear only when the config says so AND it was just loaded online.
 *
 * The same file is in miniapp/, android/app/src/main/assets/ui/ and
 * desktop/harfix_desktop/ui/ (tests check the copies are identical).
 */
(function (root) {
  "use strict";

  var CONFIG_RPC = "https://lucopmrphagzxticypmq.supabase.co/rest/v1/rpc/harfix_config";
  var CONFIG_URL = "https://abdulla0408.github.io/harfix-app/config.json"; // backup
  // Anonymous count: only {random install id, platform, version}. Publishable key: safe to ship.
  var STATS = {
    url: "https://lucopmrphagzxticypmq.supabase.co/rest/v1/rpc/harfix_ping",
    key: "sb_publishable_mI40X75CzoVl7fyHziSoDQ_-rLXnRyt"
  };
  var GRACE_DAYS = 3; // new users see no ads in their first days

  function obj(x) { return x && typeof x === "object" && !Array.isArray(x) ? x : {}; }
  function str(x, max) { return typeof x === "string" ? x.trim().slice(0, max || 300) : ""; }

  /** Only plain https links leave the app. */
  function safeUrl(u) {
    if (typeof u !== "string" || u.length > 500) return "";
    return /^https:\/\/[^\s"'<>\\]+$/i.test(u) ? u : "";
  }

  /** "1.2.0" > "1.1.9"? */
  function versionNewer(a, b) {
    var x = String(a || "").split("."), y = String(b || "").split(".");
    for (var i = 0; i < Math.max(x.length, y.length); i++) {
      var p = parseInt(x[i], 10) || 0, q = parseInt(y[i], 10) || 0;
      if (p !== q) return p > q;
    }
    return false;
  }

  function today(d) {
    d = d || new Date();
    function two(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate());
  }

  function forPlatform(item, platform) {
    var p = item.platforms;
    return !Array.isArray(p) || !p.length || p.indexOf(platform) >= 0;
  }
  function inDates(item, day) {
    var from = str(item.from, 10), until = str(item.until, 10);
    return (!from || day >= from) && (!until || day <= until);
  }

  function pickSponsor(list, ctx) {
    var ok = (Array.isArray(list) ? list : []).map(obj).filter(function (s) {
      return s.enabled !== false && (str(s.title) || str(s.text)) && safeUrl(s.url) && forPlatform(s, ctx.platform) &&
        inDates(s, ctx.today);
    });
    if (!ok.length) return null;
    var weights = ok.map(function (s) { return typeof s.weight === "number" && s.weight >= 0 ? s.weight : 1; });
    var total = weights.reduce(function (a, b) { return a + b; }, 0);
    if (!total) return null;
    var r = (typeof ctx.random === "number" ? ctx.random : Math.random()) * total;
    for (var i = 0; i < ok.length; i++) {
      r -= weights[i];
      if (r < 0 || i === ok.length - 1) {
        var s = ok[i];
        return { id: str(s.id, 60), title: str(s.title, 80), text: str(s.text, 300), url: safeUrl(s.url),
          button: str(s.button, 30), image: safeUrl(s.image) };
      }
    }
    return null;
  }

  /**
   * What to show now.
   * ctx: { platform: "android"|"windows"|"miniapp", version, today: "YYYY-MM-DD",
   *        installDays, fresh (config loaded online just now), dismissed: [ids], random }
   */
  function plan(config, ctx) {
    var c = obj(config), out = { notice: null, update: null, sponsor: null, banner: null, stats: true };
    var dismissed = Array.isArray(ctx.dismissed) ? ctx.dismissed : [];
    var day = ctx.today || today();
    ctx = { platform: ctx.platform, version: ctx.version, today: day, installDays: +ctx.installDays || 0,
      fresh: !!ctx.fresh, random: ctx.random };

    out.stats = obj(c.stats).enabled !== false;

    var n = obj(c.notice);
    if (n.enabled !== false && str(n.id) && str(n.text) && forPlatform(n, ctx.platform) && inDates(n, day) &&
        dismissed.indexOf("notice:" + str(n.id, 60)) < 0) {
      out.notice = { id: "notice:" + str(n.id, 60), text: str(n.text, 300), url: safeUrl(n.url), button: str(n.button, 30) };
    }

    var latest = obj(obj(c.latest)[ctx.platform]);
    var v = str(latest.version, 20);
    if (v && safeUrl(latest.url) && versionNewer(v, ctx.version) && dismissed.indexOf("update:" + v) < 0) {
      out.update = { id: "update:" + v, version: v, url: safeUrl(latest.url), text: str(latest.text, 200) };
    }

    var ads = obj(c.ads);
    var grace = typeof ads.grace_days === "number" ? ads.grace_days : GRACE_DAYS;
    if (ctx.fresh && ads.enabled === true && ctx.installDays >= grace) {
      out.sponsor = pickSponsor(ads.sponsors, ctx);
      var net = obj(obj(ads.network)[ctx.platform]);
      if (net.enabled === true && str(net.banner_id, 100)) {
        out.banner = { provider: str(net.provider, 20) || "yandex", id: str(net.banner_id, 100) };
      }
    }
    return out;
  }

  /** Where the daily count goes (the config may move it). */
  function statsTarget(config) {
    var s = obj(obj(config).stats);
    return safeUrl(s.url) && str(s.key, 200) ? { url: safeUrl(s.url), key: str(s.key, 200) } : STATS;
  }

  // --- drawing ------------------------------------------------------------------------
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  /**
   * Draws the plan into opts.top (announcement / new version) and opts.ad
   * (sponsor card). opts: { top, ad, L (UI text → new alphabet), open(url), dismiss(id) }.
   * Texts from the config are shown exactly as written there.
   */
  function render(p, opts) {
    var L = opts.L || function (s) { return s; };
    function bar(item, text, button) {
      var b = el("div", "ol-bar");
      b.appendChild(el("span", "ol-text", text));
      if (item.url) {
        var go = el("button", "ol-link", button);
        go.addEventListener("click", function () { opts.open(item.url); });
        b.appendChild(go);
      }
      var x = el("button", "ol-x", "×");
      x.setAttribute("aria-label", L("Yopish"));
      x.addEventListener("click", function () { b.remove(); opts.dismiss(item.id); });
      b.appendChild(x);
      return b;
    }
    if (opts.top) {
      opts.top.textContent = "";
      if (p.update) {
        opts.top.appendChild(bar(p.update, "⬆️ " + L("Yangi versiya") + " " + p.update.version +
          (p.update.text ? " — " + p.update.text : ""), L("Yuklab olish")));
      }
      if (p.notice) opts.top.appendChild(bar(p.notice, "📢 " + p.notice.text, p.notice.button || L("Ochish")));
      opts.top.hidden = !opts.top.childNodes.length;
    }
    if (opts.ad) {
      opts.ad.textContent = "";
      var s = p.sponsor;
      if (s) {
        var card = el("div", "ol-ad");
        var head = el("div", "ol-head");
        head.appendChild(el("span", "ol-tag", L("Reklama")));
        var x = el("button", "ol-x", "×");
        x.setAttribute("aria-label", L("Yopish"));
        x.addEventListener("click", function (e) { e.stopPropagation(); card.remove(); opts.ad.hidden = true; });
        head.appendChild(x);
        card.appendChild(head);
        var body = el("div", "ol-body");
        if (s.image) {
          var img = el("img", "ol-img");
          img.alt = "";
          img.referrerPolicy = "no-referrer";
          img.onerror = function () { img.remove(); };
          img.src = s.image;
          body.appendChild(img);
        }
        var words = el("div", "ol-words");
        if (s.title) words.appendChild(el("b", "ol-title", s.title));
        if (s.text) words.appendChild(el("p", "ol-desc", s.text));
        body.appendChild(words);
        card.appendChild(body);
        card.appendChild(el("button", "ol-go", s.button || L("Batafsil")));
        card.addEventListener("click", function () { opts.open(s.url); });
        opts.ad.appendChild(card);
      }
      opts.ad.hidden = !s;
    }
  }

  /** A random install id (not tied to the person or the device). */
  function newId() {
    var b = new Uint8Array(16);
    (root.crypto || root.msCrypto).getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return (x < 16 ? "0" : "") + x.toString(16); }).join("");
    return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
  }

  /** The settings (browser fetch): Supabase first, then the backup copy; null when offline. */
  function loadConfig(backupUrl) {
    function isObj(c) { return c && typeof c === "object" && !Array.isArray(c) ? c : Promise.reject(new Error("bad")); }
    return fetch(CONFIG_RPC, { method: "POST", headers: { apikey: STATS.key, "Content-Type": "application/json" }, body: "{}" })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status)); })
      .then(isObj)
      .catch(function () {
        return fetch(backupUrl || CONFIG_URL, { cache: "no-cache" })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (c) { return c && typeof c === "object" && !Array.isArray(c) ? c : null; }, function () { return null; });
      });
  }

  var api = { CONFIG_RPC: CONFIG_RPC, CONFIG_URL: CONFIG_URL, STATS: STATS, GRACE_DAYS: GRACE_DAYS, plan: plan,
    render: render, statsTarget: statsTarget, safeUrl: safeUrl, versionNewer: versionNewer, today: today, newId: newId,
    loadConfig: loadConfig };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HarfixOnline = api;
})(typeof window !== "undefined" ? window : this);
