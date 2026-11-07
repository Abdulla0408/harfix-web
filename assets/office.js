/*
 * Word / Excel / PowerPoint / txt files converted in the browser — nothing is
 * uploaded. Only the text inside text nodes changes; fonts, styles, tables,
 * images and formulas are copied as they are. Port of core/harfix_files
 * (and android Documents.kt). Needs JSZip and harfix.js.
 */
(function (root) {
  "use strict";

  var W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  var A = "http://schemas.openxmlformats.org/drawingml/2006/main";
  var S = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  // text element -> elements that group its runs into one paragraph
  var TEXT_TO_PARA = {};
  TEXT_TO_PARA[W + "|t"] = [W + "|p"];
  TEXT_TO_PARA[A + "|t"] = [A + "|p"];
  TEXT_TO_PARA[S + "|t"] = [S + "|si", S + "|is"];
  // which parts of each format hold user text
  var PARTS = {
    docx: /^word\/(document|header\d*|footer\d*|footnotes|endnotes|comments|diagrams\/data\d*)\.xml$/,
    pptx: /^ppt\/(slides\/slide\d+|notesSlides\/notesSlide\d+|diagrams\/data\d+)\.xml$/,
    xlsx: /^xl\/(sharedStrings|worksheets\/sheet\d+)\.xml$/
  };
  var FAMILY = { docx: "docx", docm: "docx", pptx: "pptx", pptm: "pptx", xlsx: "xlsx", xlsm: "xlsx" };
  var MIME = {
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    docm: "application/vnd.ms-word.document.macroEnabled.12",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    pptm: "application/vnd.ms-powerpoint.presentation.macroEnabled.12"
  };
  var MAX_BYTES = 60 * 1024 * 1024;

  var APOS = "'`‘’ʻʼ´";
  var PAIRS = ["sh", "ch"];
  "og".split("").forEach(function (c) { APOS.split("").forEach(function (a) { PAIRS.push(c + a); }); });
  var PAIRS_CYR = PAIRS.concat(["ya", "yo", "yu", "ye", "ts"]);

  function H() { return root.Harfix; }
  function isPair(a, b, target) { return (target === "cyr" ? PAIRS_CYR : PAIRS).indexOf((a + b).toLowerCase()) >= 0; }

  /** A run converted with the end of the previous run as context. */
  function segment(text, prev, target) {
    if (!prev) return H().convertTo(text, target);
    var ctx = prev.slice(-1);
    var full = H().convertTo(ctx + text, target), pre = H().convertTo(ctx, target);
    return full.indexOf(pre) === 0 ? full.slice(pre.length) : H().convertTo(text, target);
  }

  /** A paragraph split into formatted runs, converted keeping the number of runs.
   *  A digraph split across runs ("s" | "h") is moved into the first run. */
  function convertRuns(runs, target) {
    var r = runs.slice();
    for (var i = 0; i < r.length - 1; i++) {
      if (r[i] && r[i + 1] && isPair(r[i].slice(-1), r[i + 1][0], target)) {
        r[i] += r[i + 1][0];
        r[i + 1] = r[i + 1].slice(1);
      }
    }
    var prev = "";
    return r.map(function (run) {
      if (!run) return run;
      var out = segment(run, prev, target);
      prev = run;
      return out;
    });
  }

  function ext(name) { var m = /\.([^.]+)$/.exec(name || ""); return m ? m[1].toLowerCase() : ""; }
  function isSupported(name) { return !!FAMILY[ext(name)] || ext(name) === "txt"; }

  /** Result file name: the name is converted too; unchanged names get " (Harfix)". */
  function outName(name, target) {
    var dot = name.lastIndexOf(".");
    var base = dot > 0 ? name.slice(0, dot) : name, tail = dot > 0 ? name.slice(dot) : ".txt";
    var conv = H().convertTo(base, target);
    return (conv === base ? base + " (Harfix)" : conv) + tail;
  }

  function decodeText(bytes) {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes); // strips a BOM itself
    } catch (e) {
      return new TextDecoder("windows-1251").decode(bytes); // old Cyrillic files
    }
  }

  function key(n) { return (n.namespaceURI || "") + "|" + n.localName; }

  /** One XML part; null when nothing changed (the part is then kept byte for byte). */
  function convertXml(xml, target) {
    var doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) throw new Error("xml");
    var groups = new Map(), order = [];
    var walker = doc.createTreeWalker(doc.documentElement, 1 /* elements */);
    for (var n = walker.currentNode; n; n = walker.nextNode()) {
      var paras = TEXT_TO_PARA[key(n)];
      if (!paras) continue;
      var p = n.parentNode;
      while (p && p.nodeType === 1 && paras.indexOf(key(p)) < 0) p = p.parentNode;
      var g = p && p.nodeType === 1 ? p : n;
      if (!groups.has(g)) { groups.set(g, []); order.push(g); }
      groups.get(g).push(n);
    }
    var changed = false;
    order.forEach(function (g) {
      var els = groups.get(g);
      var old = els.map(function (e) { return e.textContent; });
      var neu = convertRuns(old, target);
      els.forEach(function (e, i) {
        if (old[i] !== neu[i]) { e.textContent = neu[i]; changed = true; }
      });
    });
    if (!changed) return null;
    var out = new XMLSerializer().serializeToString(doc);
    var decl = /^\s*<\?xml[^>]*\?>(\r?\n)?/.exec(xml); // keep the header exactly as Office wrote it
    if (decl && !/^<\?xml/.test(out)) out = decl[0].replace(/^\s+/, "") + out;
    return out;
  }

  function fail(code) { var e = new Error(code); e.code = code; return e; }

  /** File → Promise<{ blob, name }>. Errors: unsupported, too_big, broken. */
  function convertFile(file, target) {
    var e = ext(file.name);
    if (!isSupported(file.name)) return Promise.reject(fail("unsupported"));
    if (file.size > MAX_BYTES) return Promise.reject(fail("too_big"));
    if (e === "txt") {
      return file.arrayBuffer().then(function (buf) {
        var text = H().convertTo(decodeText(new Uint8Array(buf)), target);
        return { blob: new Blob([text], { type: "text/plain;charset=utf-8" }), name: outName(file.name, target) };
      });
    }
    if (!root.JSZip) return Promise.reject(fail("broken"));
    var re = PARTS[FAMILY[e]];
    return root.JSZip.loadAsync(file).then(function (zip) {
      var jobs = [];
      zip.forEach(function (path, entry) {
        if (entry.dir || !re.test(path)) return;
        jobs.push(entry.async("string").then(function (xml) {
          var out = convertXml(xml, target);
          if (out !== null) zip.file(path, out);
        }));
      });
      return Promise.all(jobs).then(function () {
        return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 }, mimeType: MIME[e] });
      });
    }).then(function (blob) {
      return { blob: blob, name: outName(file.name, target) };
    }, function (err) {
      throw err && err.code ? err : fail("broken");
    });
  }

  var api = { convertFile: convertFile, convertXml: convertXml, convertRuns: convertRuns, isSupported: isSupported,
    outName: outName, decodeText: decodeText };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HarfixOffice = api;
})(typeof window !== "undefined" ? window : this);
