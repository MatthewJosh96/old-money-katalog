"use strict";
// Pure helpers shared by app.js and the Node tests. Shop data is untrusted.
(function (root) {
  var own = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  function dict(pairs) { var d = Object.create(null); (pairs || []).forEach(function (p) { d[p[0]] = p[1]; }); return d; }

  // keep in sync with radar/urls.py
  var LINK_HOSTS = dict([["zara", ["www.zara.com"]], ["gomez", ["gomez.pl"]], ["answear", ["answear.com"]],
    ["vinted", ["www.vinted.pl"]], ["ralphlauren", ["www.ralphlauren.pl"]], ["mrporter", ["www.mrporter.com"]],
    ["ami", ["www.amiparis.com", "amiparis.com"]], ["levis", ["www.levi.com"]]]);
  var IMAGE_HOSTS = ["static.zara.net", "gomez.pl", "dtcralphlauren.scene7.com", "www.mrporter.com", "cache.mrporter.com",
    "cdn.shopify.com", "www.amiparis.com", "amiparis.com", "lscoglobal.scene7.com", "lsco.scene7.com"];
  var IMAGE_SUFFIXES = [".ans-media.com", ".vinted.net"];

  function parse(u) {
    if (typeof u !== "string") return null;
    var p; try { p = new URL(u); } catch (e) { return null; }
    if (p.protocol !== "https:" || p.username || p.password || (p.port && p.port !== "443")) return null;
    return p;
  }
  function safeLink(u, shop) {
    var p = parse(u); if (!p || !own(LINK_HOSTS, shop)) return null;
    return LINK_HOSTS[shop].indexOf(p.hostname) >= 0 ? p.href : null;
  }
  function safeImage(u) {
    var p = parse(u); if (!p) return null;
    var h = p.hostname;
    var ok = IMAGE_HOSTS.indexOf(h) >= 0 || IMAGE_SUFFIXES.some(function (s) { return h.length > s.length && h.slice(-s.length) === s; });
    return ok ? p.href : null;
  }

  var DEFAULTS = { q: "", sort: "score", sec: "", cat: "", shop: "", brand: "", max: 3000, fresh: false, gone: false };
  var SORTS = ["score", "discount", "price", "price_desc", "new", "fav"];
  // localStorage is user-controlled too: keep only known keys with sane types/values
  function validState(raw) {
    var s = {}; Object.keys(DEFAULTS).forEach(function (k) { s[k] = DEFAULTS[k]; });
    if (!raw || typeof raw !== "object") return s;
    ["q", "sec", "cat", "shop", "brand"].forEach(function (k) { if (own(raw, k) && typeof raw[k] === "string" && raw[k].length < 120) s[k] = raw[k]; });
    if (own(raw, "sort") && SORTS.indexOf(raw.sort) >= 0) s.sort = raw.sort;
    if (own(raw, "max") && typeof raw.max === "number" && isFinite(raw.max)) s.max = Math.min(3000, Math.max(50, raw.max));
    ["fresh", "gone"].forEach(function (k) { if (own(raw, k) && typeof raw[k] === "boolean") s[k] = raw[k]; });
    return s;
  }

  // same normalisation as radar/model.py norm_size: "eu 45" -> "45", "11,5" -> "11.5"
  function normSize(s) {
    return String(s).trim().toUpperCase().replace(/EU ?/g, "").trim().replace(/(\d),(\d)/g, "$1.$2").replace(/\s+/g, " ");
  }
  var GROUP = dict([["shoes", "shoes"], ["trousers", "bottoms"], ["jeans", "bottoms"]]);
  function sizeGroup(cat) { return own(GROUP, cat) ? GROUP[cat] : "tops"; }
  // keep in sync with radar/core.py size_fits
  var ONE_SIZE = ["ONE SIZE", "ONESIZE", "OS", "O/S", "UNI", "U", "TU", "1 SIZE", "UNIWERSALNY", "JEDEN ROZMIAR", "NS"];
  function wantedFor(group, mySizes, shop, byShop) {
    var over = byShop && own(byShop, shop) && byShop[shop] && own(byShop[shop], group) ? byShop[shop][group] : null;
    var list = Array.isArray(over) ? over : (mySizes && own(mySizes, group) && Array.isArray(mySizes[group]) ? mySizes[group] : []);
    return list.map(normSize);
  }
  // same as radar/core.py waist_length: "34/34", "W34 L32", "W34-L32", "34 L32", "34x32", "52 | W34"
  function waistLength(t) {
    var p = /(?:^|[^\d|])W? ?(\d{2}) ?[\/xX\-] ?L? ?(\d{2})(?!\d)/.exec(t);
    if (p) return [p[1], p[2]];
    var w = /(?:^|[^A-Z])W[- ]?(\d{2})(?!\d)/.exec(t), l = /(?:^|[^A-Z])L[- ]?(\d{2})(?!\d)/.exec(t);
    if (w) return [w[1], l ? l[1] : null];
    var lead = /^(\d{2})(?!\d)/.exec(t);
    if (lead && l) return [lead[1], l[1]];
    return [null, null];
  }
  function bottomsFit(n, wanted, lengths) {
    var waists = wanted.filter(function (w) { return /^W?\d{2}$/.test(w); }).map(function (w) { return w.replace(/^W/, ""); });
    var wl = waistLength(n);
    if (wl[0] === null && /^\d{2}$/.test(n)) wl = [n, null];   // a bare stock size "32" is a waist
    if (wl[0] === null) return null;
    return waists.indexOf(wl[0]) >= 0 && (wl[1] === null || !lengths.length || lengths.indexOf(wl[1]) >= 0);
  }
  function isMine(size, cat, mySizes, shop, byShop) {
    var group = sizeGroup(cat), n = normSize(size);
    if (cat === "other" && ONE_SIZE.indexOf(n) >= 0) return true;
    var wanted = wantedFor(group, mySizes, shop, byShop);
    if (group === "bottoms") {
      var lengths = (mySizes && Array.isArray(mySizes.bottoms_length) ? mySizes.bottoms_length : []).map(normSize);
      var fit = bottomsFit(n, wanted, lengths);
      if (fit !== null) return fit;
    }
    var tokens = n.split(/[\/|\- ]+/).filter(Boolean).concat([n]);
    return tokens.some(function (t) { return wanted.indexOf(t) >= 0; });
  }
  // matching sizes first, so truncating the list never hides the one that matters
  function orderSizes(sizes, cat, mySizes, shop, byShop) {
    var list = Array.isArray(sizes) ? sizes.filter(function (s) { return typeof s === "string" || typeof s === "number"; }) : [];
    var mine = function (s) { return isMine(s, cat, mySizes, shop, byShop); };
    return list.filter(mine).concat(list.filter(function (s) { return !mine(s); }));
  }

  function fold(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l"); }
  // every query word must start some word of the text ("welna" finds "wełna", not "bawełna")
  function matches(text, query) {
    var words = fold(text).split(/[^a-z0-9]+/).filter(Boolean);
    return fold(query).split(/\s+/).filter(Boolean).every(function (q) {
      return words.some(function (w) { return w.lastIndexOf(q, 0) === 0; });
    });
  }

  var api = { fold: fold, matches: matches, dict: dict, own: own, safeLink: safeLink, safeImage: safeImage, validState: validState, normSize: normSize,
    isMine: isMine, orderSizes: orderSizes, SORTS: SORTS, DEFAULTS: DEFAULTS };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.OMR = api;
})(typeof window !== "undefined" ? window : this);
