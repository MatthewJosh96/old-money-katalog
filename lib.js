"use strict";
// Pure helpers shared by app.js and the Node tests. Shop data is untrusted.
(function (root) {
  var own = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  function dict(pairs) { var d = Object.create(null); (pairs || []).forEach(function (p) { d[p[0]] = p[1]; }); return d; }

  // keep in sync with radar/urls.py
  var LINK_HOSTS = dict([["zara", ["www.zara.com"]], ["gomez", ["gomez.pl"]], ["answear", ["answear.com"]],
    ["vinted", ["www.vinted.pl"]], ["ralphlauren", ["www.ralphlauren.pl"]], ["mrporter", ["www.mrporter.com"]],
    ["ami", ["www.amiparis.com", "amiparis.com"]]]);
  var IMAGE_HOSTS = ["static.zara.net", "gomez.pl", "dtcralphlauren.scene7.com", "www.mrporter.com", "cache.mrporter.com",
    "cdn.shopify.com", "www.amiparis.com", "amiparis.com"];
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
  var SORTS = ["score", "discount", "price", "price_desc", "new"];
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
  function isMine(size, cat, mySizes) {
    var wanted = (mySizes && own(mySizes, sizeGroup(cat)) ? mySizes[sizeGroup(cat)] : []).map(normSize);
    var n = normSize(size);
    var tokens = n.split(/[\/|\- ]+/).filter(Boolean).concat([n]);
    tokens = tokens.concat(tokens.filter(function (t) { return /^W\d{2}$/.test(t); }).map(function (t) { return t.slice(1); }));
    return tokens.some(function (t) { return wanted.indexOf(t) >= 0; });
  }
  // matching sizes first, so truncating the list never hides the one that matters
  function orderSizes(sizes, cat, mySizes) {
    var list = Array.isArray(sizes) ? sizes.filter(function (s) { return typeof s === "string" || typeof s === "number"; }) : [];
    return list.filter(function (s) { return isMine(s, cat, mySizes); }).concat(list.filter(function (s) { return !isMine(s, cat, mySizes); }));
  }

  var api = { dict: dict, own: own, safeLink: safeLink, safeImage: safeImage, validState: validState, normSize: normSize,
    isMine: isMine, orderSizes: orderSizes, SORTS: SORTS, DEFAULTS: DEFAULTS };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.OMR = api;
})(typeof window !== "undefined" ? window : this);
