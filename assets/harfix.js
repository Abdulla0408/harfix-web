/*
 * Harfix converter — JavaScript port of core/yangi_alifbo/converter.py.
 * Must pass the same shared tests: core/tests/cases*.json
 * (run: node miniapp/tests/run.cjs).
 *
 * Harfix.convertTo(text, "new" | "old" | "cyr")
 */
(function (root) {
  "use strict";

  var TUTUQ = "ʼ"; // ʼ
  var OKINA = "ʻ"; // ʻ
  var APOSTROPHES = "'`‘’ʻʼ´";
  var OG_MARKS = "'`‘’ʻ´"; // without U+02BC (explicit tutuq)
  var TARGETS = ["new", "old", "cyr"];

  function esc(s) { return s.replace(/[\\\]\[^-]/g, "\\$&"); }
  var OG = "[" + esc(OG_MARKS) + "]";
  var AP = "[" + esc(APOSTROPHES) + "]";
  var W = "[\\p{L}\\p{N}_]";

  var LATIN_RULES = [
    [new RegExp("O" + OG, "g"), "Ö"],
    [new RegExp("o" + OG, "g"), "ö"],
    [new RegExp("G" + OG, "g"), "Ğ"],
    [new RegExp("g" + OG, "g"), "ğ"],
    [/S[Hh]/g, "Ş"],
    [/s[Hh]/g, "ş"],
    [/C[Hh]/g, "Ç"],
    [/c[Hh]/g, "ç"],
    [new RegExp("(?<=" + W + ")" + AP + "(?=" + W + ")", "gu"), TUTUQ]
  ];

  var CYR = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "ё": "yo", "ж": "j",
    "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n",
    "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f",
    "х": "x", "ч": "ç", "ш": "ş", "щ": "şç", "ъ": TUTUQ, "ы": "i", "ь": "",
    "э": "e", "ю": "yu", "я": "ya", "ў": "ö", "қ": "q", "ғ": "ğ", "ҳ": "h"
  };
  var CYR_VOWELS = "аеёиоуэюяўАЕЁИОУЭЮЯЎ";
  var CYR_RE = /[Ѐ-ӿ]/;
  var LAT_RE = /[A-Za-zÖöĞğŞşÇç]/;

  function isAlpha(c) { return c !== "" && /\p{L}/u.test(c); }
  function isUpper(c) { return c !== c.toLowerCase() && c === c.toUpperCase(); }
  function has(set, c) { return c !== "" && set.indexOf(c) !== -1; }

  function caseLike(out, text, i) {
    if (out.length === 1) return out.toUpperCase();
    var prev = i > 0 ? text[i - 1] : "";
    var nxt = i + 1 < text.length ? text[i + 1] : "";
    var allCaps = (isAlpha(nxt) && isUpper(nxt)) || (isAlpha(prev) && isUpper(prev));
    return allCaps ? out.toUpperCase() : out[0].toUpperCase() + out.slice(1);
  }

  function cyrChar(text, i) {
    var ch = text[i], low = ch.toLowerCase();
    var prev = i > 0 ? text[i - 1] : "";
    var wordStart = !isAlpha(prev);
    var out;
    if (low === "е") {
      out = (wordStart || has(CYR_VOWELS, prev) || has("ъь", prev.toLowerCase())) ? "ye" : "e";
    } else if (low === "ц") {
      out = has(CYR_VOWELS, prev) ? "ts" : "s";
    } else if (low === "с" && i + 1 < text.length && text[i + 1].toLowerCase() === "ҳ") {
      out = "s" + TUTUQ;
    } else if (Object.prototype.hasOwnProperty.call(CYR, low)) {
      out = CYR[low];
    } else {
      return ch;
    }
    if (ch === low || !out) return out;
    return caseLike(out, text, i);
  }

  function fromCyrillic(text) {
    var out = "";
    for (var i = 0; i < text.length; i++) out += cyrChar(text, i);
    return out;
  }

  function toNew(text) {
    if (CYR_RE.test(text)) text = fromCyrillic(text);
    for (var k = 0; k < LATIN_RULES.length; k++) text = text.replace(LATIN_RULES[k][0], LATIN_RULES[k][1]);
    return text;
  }

  // --- new -> old Latin ----------------------------------------------------
  var OLD = { "ö": "o" + OKINA, "ğ": "g" + OKINA, "ş": "sh", "ç": "ch" };
  function newToOld(text) {
    text = text.replace(/([sScC])([hH])/g, "$1" + TUTUQ + "$2");
    var out = "";
    for (var i = 0; i < text.length; i++) {
      var ch = text[i], low = ch.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(OLD, low)) {
        out += ch === low ? OLD[low] : caseLike(OLD[low], text, i);
      } else {
        out += ch;
      }
    }
    return out;
  }

  // --- new -> Cyrillic -----------------------------------------------------
  var TO_CYR = {
    "a": "а", "b": "б", "c": "с", "d": "д", "e": "е", "f": "ф", "g": "г",
    "h": "ҳ", "i": "и", "j": "ж", "k": "к", "l": "л", "m": "м", "n": "н",
    "o": "о", "p": "п", "q": "қ", "r": "р", "s": "с", "t": "т", "u": "у",
    "v": "в", "w": "в", "x": "х", "y": "й", "z": "з",
    "ö": "ў", "ğ": "ғ", "ş": "ш", "ç": "ч"
  };
  var Y_PAIRS = { "a": "я", "o": "ё", "u": "ю", "e": "е" };
  var LAT_VOWELS = "aeiouö";
  var TS_CYR = /ts(?=i(?:ya|on))/iy;

  function up(rep, ch) { return isUpper(ch) ? rep.toUpperCase() : rep; }

  function newToCyr(text) {
    var out = "", i = 0, n = text.length;
    while (i < n) {
      var ch = text[i], low = ch.toLowerCase();
      var prev = i > 0 ? text[i - 1] : "";
      var nxt = i + 1 < n ? text[i + 1] : "";
      if (low === "y" && Object.prototype.hasOwnProperty.call(Y_PAIRS, nxt.toLowerCase())) {
        out += up(Y_PAIRS[nxt.toLowerCase()], ch);
        i += 2;
        continue;
      }
      if (low === "t" && nxt.toLowerCase() === "s") {
        TS_CYR.lastIndex = i;
        if (TS_CYR.test(text)) {
          out += isUpper(ch) ? "Ц" : "ц";
          i += 2;
          continue;
        }
      }
      if (ch === TUTUQ) {
        if (prev && has("sc", prev.toLowerCase()) && nxt.toLowerCase() === "h") { i += 1; continue; }
        out += (isAlpha(prev) && isAlpha(nxt)) ? "ъ" : ch;
        i += 1;
        continue;
      }
      if (low === "e") {
        var rep = (!isAlpha(prev) || has(LAT_VOWELS, prev.toLowerCase())) ? "э" : "е";
        out += up(rep, ch);
        i += 1;
        continue;
      }
      var r = Object.prototype.hasOwnProperty.call(TO_CYR, low) ? TO_CYR[low] : null;
      out += r === null ? ch : up(r, ch);
      i += 1;
    }
    return out;
  }

  function toOld(text) { return newToOld(toNew(text)); }
  function toCyr(text) {
    if (CYR_RE.test(text) && !LAT_RE.test(text)) return text;
    return newToCyr(toNew(text));
  }

  var PLAIN = { "new": toNew, "old": toOld, "cyr": toCyr };
  var SKIP_RE = /(https?:\/\/\S+|www\.\S+|\S+@\S+\.\S+|[@#][\p{L}\p{N}_.]+|`[^`]*`)/giu;

  function convertTo(text, target) {
    var fn = PLAIN[target || "new"];
    if (!fn) throw new Error("unknown target: " + target);
    var out = "", pos = 0, m;
    SKIP_RE.lastIndex = 0;
    while ((m = SKIP_RE.exec(text)) !== null) {
      out += fn(text.slice(pos, m.index)) + m[0];
      pos = m.index + m[0].length;
    }
    return out + fn(text.slice(pos));
  }

  var api = {
    TARGETS: TARGETS,
    TUTUQ: TUTUQ,
    convertTo: convertTo,
    convert: function (t) { return convertTo(t, "new"); },
    toOldLatin: function (t) { return convertTo(t, "old"); },
    toCyrillic: function (t) { return convertTo(t, "cyr"); }
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Harfix = api;
})(typeof self !== "undefined" ? self : this);
