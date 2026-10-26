"use strict";
// Shop data is untrusted: only textContent and validated https URLs, no HTML parsing of data.
(function () {
  var SECTIONS = [["", "Wszystko"], ["rl_ami", "Ralph Lauren i AMI"], ["levis", "Levi's"], ["style", "Styl old money"], ["used", "Używane (Vinted)"]];
  var O = window.OMR;
  var CATS = { sweater: "Swetry", knitwear_other: "Dzianina", shirt: "Koszule", polo: "Polo", trousers: "Spodnie",
    jeans: "Jeansy", shoes: "Buty", coat: "Płaszcze", jacket: "Kurtki", blazer: "Marynarki", other: "Inne" };
  var SHOPS = { breuninger: "Breuninger", peek: "Peek & Cloppenburg", massimodutti: "Massimo Dutti", zalando: "Zalando", zalando_lounge: "Zalando Lounge", zara: "Zara", ralphlauren: "Ralph Lauren", ami: "AMI Paris", gomez: "Gomez", answear: "Answear",
    mrporter: "Mr Porter", vinted: "Vinted", levis: "Levi's" };
  var PAGE = 96;
  var data = null, shown = PAGE;
  var st = load();
  var $ = function (id) { return document.getElementById(id); };
  var fmt = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 0 });

  function load() {
    try { return O.validState(JSON.parse(localStorage.getItem("omr-state") || "{}")); } catch (e) { return O.validState(null); }
  }
  function save() { try { localStorage.setItem("omr-state", JSON.stringify(st)); } catch (e) {} }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function money(v, cur) { return v == null ? "" : fmt.format(v) + (cur && cur !== "PLN" ? " " + (cur === "EUR" ? "€" : cur) : " zł"); }
  function day(ts) { var d = new Date(ts * 1000); return ("0" + d.getDate()).slice(-2) + "." + ("0" + (d.getMonth() + 1)).slice(-2); }


  // skip: one filter to ignore, so a chip row's counts reflect all the *other* active filters
  function filtered(skip) {
    return data.items.filter(function (it) {
      if (it.gone && !st.gone) return false;
      if (skip !== "sec" && st.sec && it.sec !== st.sec) return false;
      if (skip !== "cat" && st.cat && it.cat !== st.cat) return false;
      if (st.shop && it.shop !== st.shop) return false;
      if (st.brand && it.brand_key !== st.brand) return false;
      if (it.pln > st.max && st.max < 3000) return false;
      if (st.fresh && !it.fresh) return false;
      if (st.q && !O.matches(it.brand + " " + it.title + " " + (it.desc || ""), st.q)) return false;
      return true;
    });
  }

  function sorted(list) {
    var f = O.dict([["score", function (a, b) { return b.score - a.score; }]]);
    var g = { score: function (a, b) { return b.score - a.score; }, discount: function (a, b) { return b.off - a.off || a.pln - b.pln; },
      price: function (a, b) { return a.pln - b.pln; }, price_desc: function (a, b) { return b.pln - a.pln; },
      "new": function (a, b) { return b.first - a.first || b.score - a.score; },
      fav: function (a, b) { return (b.fav || 0) - (a.fav || 0) || b.score - a.score; } };
    O.SORTS.forEach(function (k) { f[k] = g[k]; });
    return list.slice().sort(O.own(f, st.sort) ? f[st.sort] : f.score);
  }

  function chips(box, entries, key) {
    box.textContent = "";
    entries.forEach(function (e) {
      var b = el("button", "chip", e[1]); b.type = "button";
      b.setAttribute("aria-pressed", String(st[key] === e[0]));
      if (e[2] != null) b.appendChild(el("span", "n", String(e[2])));
      b.addEventListener("click", function () { st[key] = e[0]; shown = PAGE; save(); render(); });
      box.appendChild(b);
    });
  }

  function card(it, mySizes, byShop) {
    var li = el("li", "card" + (it.gone ? " gone" : ""));
    var url = O.safeLink(it.url, it.shop);
    var media = el("a", "media"); if (url) { media.href = url; media.target = "_blank"; media.rel = "noopener noreferrer"; }
    media.setAttribute("aria-label", it.brand + " — " + it.title);
    var img = O.safeImage(it.img);
    if (img) {
      var im = el("img"); im.src = img; im.alt = ""; im.loading = "lazy"; im.decoding = "async"; im.referrerPolicy = "no-referrer";
      im.addEventListener("error", function () { im.remove(); media.appendChild(el("span", "noimg", (it.brand || "?").slice(0, 2))); });
      media.appendChild(im);
    } else media.appendChild(el("span", "noimg", (it.brand || "?").slice(0, 2)));
    var badges = el("div", "badges");
    if (it.off) badges.appendChild(el("span", "badge off", "−" + it.off + "%"));
    if (it.fresh === "new") badges.appendChild(el("span", "badge new", "Nowe"));
    if (it.fresh === "drop") badges.appendChild(el("span", "badge drop", "Potaniało"));
    if (it.used) badges.appendChild(el("span", "badge used", "Używane"));
    if (it.gone) badges.appendChild(el("span", "badge", "Zniknęło z przecen " + day(it.last)));
    media.appendChild(badges); li.appendChild(media);

    var body = el("div", "body");
    body.appendChild(el("span", "brand", it.brand));
    var h = el("h2", "title"); var a = el("a", null, it.title);
    if (url) { a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; }
    h.appendChild(a); body.appendChild(h);
    var p = el("div", "price"); p.appendChild(el("span", "now", money(it.price, it.cur)));
    if (it.old) p.appendChild(el("span", "was", money(it.old, it.cur)));
    if (it.cur && it.cur !== "PLN" && typeof it.pln === "number") p.appendChild(el("span", "approx", "≈ " + money(it.pln)));
    // second hand: what the same kind of piece costs new (median regular price seen in the shops)
    if (it.used && typeof it.ref === "number" && it.ref > it.price)
      p.appendChild(el("span", "approx", "nowy ≈ " + money(it.ref) + " (−" + Math.round(100 * (1 - it.price / it.ref)) + "%)"));
    body.appendChild(p);
    if (it.desc) body.appendChild(el("p", "desc", it.desc));
    var sz = el("div", "sizes");
    if (!it.sk) sz.appendChild(el("span", "size", "rozmiar do sprawdzenia"));
    O.orderSizes(it.sizes, it.cat, mySizes, it.shop, byShop).slice(0, 10).forEach(function (s) {
      sz.appendChild(el("span", "size" + (O.isMine(s, it.cat, mySizes, it.shop, byShop) ? " mine" : ""), String(s)));
    });
    body.appendChild(sz);
    if (it.hist && it.hist.length > 1) {
      var first = it.hist[0];
      if (first[1] > it.price) body.appendChild(el("span", "hist", "⬇ było " + money(first[1], it.cur) + " (" + day(first[0]) + ")"));
    }
    var fr = el("div", "foot-row");
    fr.appendChild(el("span", null, (O.own(SHOPS, it.shop) ? SHOPS[it.shop] : String(it.shop)) +
      (typeof it.fav === "number" && it.fav > 0 ? " · ♥ " + it.fav : "")));
    fr.appendChild(el("span", null, it.stale && !it.gone ? "sprawdzone " + day(it.last) : "od " + day(it.first)));
    body.appendChild(fr);
    li.appendChild(body);
    return li;
  }

  function counts(list, key) { var c = O.dict(); list.forEach(function (it) { c[it[key]] = (c[it[key]] || 0) + 1; }); return c; }

  function render() {
    var visible = data.items.filter(function (it) { return st.gone || !it.gone; });
    var forSec = filtered("sec"), secC = counts(forSec, "sec");
    chips($("sections"), SECTIONS.map(function (s) { return [s[0], s[1], s[0] ? secC[s[0]] || 0 : forSec.length]; }), "sec");
    var catC = counts(filtered("cat"), "cat");
    chips($("categories"), [["", "Wszystkie kategorie", null]].concat(Object.keys(CATS).filter(function (k) { return catC[k] || st.cat === k; })
      .map(function (k) { return [k, CATS[k], catC[k] || 0]; })), "cat");
    $("q").value = st.q; $("sort").value = st.sort; $("shop").value = st.shop; $("brand").value = st.brand;
    $("max").value = st.max; $("maxlbl").textContent = st.max >= 3000 ? "bez limitu" : money(st.max);
    $("fresh").checked = st.fresh; $("gone").checked = st.gone;

    var list = sorted(filtered()), mySizes = data.my_sizes || {}, byShop = data.sizes_by_shop || {}, grid = $("grid");
    grid.textContent = "";
    var frag = document.createDocumentFragment();
    list.slice(0, shown).forEach(function (it) { frag.appendChild(card(it, mySizes, byShop)); });
    grid.appendChild(frag);
    if (list.length > shown) {
      var li = el("li", "more"); var b = el("button", "chip", "Pokaż więcej (" + (list.length - shown) + ")"); b.type = "button";
      b.addEventListener("click", function () { shown += PAGE; render(); }); li.appendChild(b); grid.appendChild(li);
    }
    $("count").textContent = list.length + " z " + visible.length + " rzeczy";
    $("empty").hidden = list.length > 0;
  }

  function fillSelect(sel, pairs) { pairs.forEach(function (p) { var o = el("option", null, p[1]); o.value = p[0]; sel.appendChild(o); }); }

  function init(d) {
    data = d;
    var ok = (d.shops || []).filter(function (s) { return s.status === "ok"; }).map(function (s) { return O.own(SHOPS, s.name) ? SHOPS[s.name] : String(s.name); });
    var fresh = d.items.filter(function (it) { return it.fresh && !it.gone; }).length;
    $("meta").textContent = "Aktualizacja " + new Date(d.generated_at * 1000).toLocaleString("pl-PL", { dateStyle: "medium", timeStyle: "short" }) +
      " · " + fresh + " nowych lub tańszych · sklepy: " + (ok.join(", ") || "—");
    var shops = O.dict(), brands = O.dict();
    d.items.forEach(function (it) { shops[it.shop] = 1; brands[it.brand_key] = brands[it.brand_key] || String(it.brand); });
    fillSelect($("shop"), Object.keys(shops).sort().map(function (s) { return [s, O.own(SHOPS, s) ? SHOPS[s] : s]; }));
    fillSelect($("brand"), Object.keys(brands).sort().map(function (k) { return [k, brands[k]]; }));
    ["q", "sort", "shop", "brand", "max", "fresh", "gone"].forEach(function (id) {
      var n = $(id);
      n.addEventListener(id === "q" || id === "max" ? "input" : "change", function () {
        st[id] = n.type === "checkbox" ? n.checked : id === "max" ? +n.value : n.value; shown = PAGE; save(); render();
      });
    });
    if (window.matchMedia("(min-width: 900px)").matches || st.shop || st.brand || st.fresh || st.gone || st.max < 3000) $("morebox").open = true;
    render();
  }

  fetch("items.json", { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(init).catch(function () { $("meta").textContent = "Nie udało się wczytać danych."; });
})();
