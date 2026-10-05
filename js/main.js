const $ = (sel) => document.querySelector(sel);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const child of children) {
    node.append(child instanceof Node ? child : document.createTextNode(child));
  }
  return node;
}

function fillSite(site) {
  document.querySelectorAll("[data-town]").forEach((n) => (n.textContent = site.town));
  document.querySelectorAll("[data-author]").forEach((n) => (n.textContent = site.author));
  document.querySelectorAll("[data-school]").forEach((n) => (n.textContent = site.school));
  document.querySelectorAll("[data-teacher]").forEach((n) => (n.textContent = site.teacher));

  const list = $("#how-list");
  site.how.forEach((item) => {
    list.append(el("li", {}, el("strong", {}, item.title + ". "), item.text));
  });
}

function buildTimeline(items) {
  const ol = $("#timeline");
  items.forEach((it) => {
    const btn = el(
      "button", { class: "tl-btn", type: "button", "aria-expanded": "false" },
      el("span", { class: "tl-year" }, it.year),
      el("span", { class: "tl-title" }, it.title),
      el("p", { class: "tl-text" }, it.text)
    );
    const li = el("li", { class: "tl-item" }, btn);
    btn.addEventListener("click", () => {
      const open = li.classList.toggle("open");
      btn.setAttribute("aria-expanded", String(open));
    });
    ol.append(li);
  });
}

function addBaseMap(map, site) {
  const attribution = "© участники OpenStreetMap";
  const offline = site.map_offline;

  function useTiles() {
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution }).addTo(map);
  }

  if (!offline || !offline.image) { useTiles(); return; }

  const probe = new Image();
  probe.onload = () => {
    const bounds = L.latLngBounds(offline.bounds);
    L.imageOverlay(offline.image, bounds, { attribution }).addTo(map);

    map.setMaxBounds(bounds);

    function limitZoom() {
      const minZoom = map.getBoundsZoom(bounds, true);
      map.setMinZoom(minZoom);
      map.setMaxZoom(minZoom + 4);
    }
    limitZoom();
    map.on("resize", limitZoom);
    map.setView(site.map_center, map.getMinZoom() + 1);
  };
  probe.onerror = () => {
    console.warn("Офлайн-карта не найдена, используются онлайн-плитки.");
    useTiles();
  };
  probe.src = offline.image;
}

function buildMap(site, data) {
  if (typeof L === "undefined") {
    $("#map-canvas").textContent =
      "Карта не загрузилась: нет папки vendor/leaflet. Запусти python tools/download_vendor.py";
    return;
  }
  const map = L.map("map-canvas", { zoomSnap: 0.25, maxBoundsViscosity: 1 })
    .setView(site.map_center, site.map_zoom);
  addBaseMap(map, site);

  const markers = [];
  data.places.forEach((p) => {
    const marker = L.marker([p.lat, p.lng]).addTo(map);
    marker.on("click", () => showPlace(p));
    markers.push({ marker, type: p.type });
  });

  const filters = $("#filters");
  const active = new Set(data.types);
  data.types.forEach((type) => {
    const chip = el("button", { class: "chip active", type: "button" }, type);
    chip.addEventListener("click", () => {
      if (active.has(type)) active.delete(type); else active.add(type);
      chip.classList.toggle("active", active.has(type));
      markers.forEach(({ marker, type: t }) => {
        if (active.has(t)) marker.addTo(map); else marker.remove();
      });
    });
    filters.append(chip);
  });
}

function showPlace(p) {
  const card = $("#place-card");
  card.replaceChildren(
    el("span", { class: "type" }, p.type),
    el("h3", {}, p.name),
    el("img", { src: p.photo, alt: p.name, loading: "lazy" }),
    el("p", {}, p.text)
  );
}

function buildCompare(items) {
  const tabs = $("#compare-tabs");
  const range = $("#compare-range");
  const then = $("#compare-then");
  const line = $("#compare-line");
  const box = $("#compare");
  const imgThen = $("#img-then");

  function setPos(v) {
    then.style.width = v + "%";
    line.style.left = v + "%";
  }
  function fitThen() { imgThen.style.width = box.clientWidth + "px"; }

  function show(i) {
    const it = items[i];
    imgThen.src = it.then;
    $("#img-now").src = it.now;
    $("#compare-caption").textContent = it.caption;
    [...tabs.children].forEach((b, j) => b.classList.toggle("active", i === j));
    range.value = 50;
    setPos(50);
    fitThen();
  }

  items.forEach((it, i) => {
    const b = el("button", { class: "chip", type: "button" }, it.title);
    b.addEventListener("click", () => show(i));
    tabs.append(b);
  });

  range.addEventListener("input", () => setPos(range.value));
  window.addEventListener("resize", fitThen);
  show(0);
}
const GEN_COL = 154;
const GEN_ROW = 46;
const GEN_NODE_W = 140, GEN_NODE_H = 38;
const WAR_LABELS = { "Фронт": "Фронтовик", "Партизан": "Партизан", "Блокада": "Блокада Ленинграда", "Погиб": "Погиб на войне" };
const GEN_TITLES = ["Серафима", "Родители", "Бабушки и дедушки", "Прадеды", "Прапрадеды", "5-е поколение", "6-е поколение"];

function buildGenerations(gen) {
  $("#gen-intro").textContent = gen.intro;
  $("#gen-source").textContent = "Источник: " + gen.source;

  const byId = {};
  gen.people.forEach((p) => (byId[p.id] = p));

  let nextRow = 0;
  function place(p) {
    const parents = (p.parents || []).map((id) => byId[id]);
    parents.forEach(place);
    p.row = parents.length ? parents.reduce((sum, q) => sum + q.row, 0) / parents.length : nextRow++;
  }
  place(gen.people.find((p) => p.gen === 0));

  const maxGen = Math.max(...gen.people.map((p) => p.gen));
  const width = maxGen * GEN_COL + GEN_NODE_W;
  const height = (nextRow + 1) * GEN_ROW;
  const left = (p) => p.gen * GEN_COL;
  const top = (p) => (p.row + 1) * GEN_ROW;

  const tree = $("#gen-tree");
  tree.style.width = width + "px";
  tree.style.height = height + "px";

  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  gen.people.forEach((child) => {
    (child.parents || []).forEach((id) => {
      const parent = byId[id];
      const x1 = left(child) + GEN_NODE_W, y1 = top(child) + GEN_NODE_H / 2;
      const x2 = left(parent), y2 = top(parent) + GEN_NODE_H / 2;
      const mid = (x1 + x2) / 2;
      const path = document.createElementNS(NS, "path");
      path.setAttribute("d", `M${x1} ${y1} H${mid} V${y2} H${x2}`);
      svg.append(path);
    });
  });
  tree.append(svg);

  for (let g = 0; g <= maxGen; g++) {
    const title = el("div", { class: "gen-title" }, GEN_TITLES[g] || g + "-е поколение");
    title.style.left = g * GEN_COL + "px";
    tree.append(title);
  }

  gen.people.forEach((p) => {
    const shortName = p.name.split(" ").slice(0, 2).join(" ");
    const node = el("button", { class: "gen-node", type: "button", title: p.name }, el("span", { class: "gen-name" }, shortName));
    if (p.war) {
      node.classList.add("war");
      if (p.photo) node.prepend(el("img", { src: p.photo, alt: "" }));
      node.addEventListener("click", () => openPerson(p));
    }
    if (p.gen === 0) node.classList.add("me");
    node.style.left = left(p) + "px";
    node.style.top = top(p) + "px";
    tree.append(node);
  });

  const others = $("#gen-others");
  gen.others.forEach((p) => {
    const card = el("button", { class: "gen-card", type: "button" },
      p.photo ? el("img", { src: p.photo, alt: "", loading: "lazy" }) : el("div", { class: "person-nophoto" }, "Фото не сохранилось"),
      el("span", { class: "type" }, WAR_LABELS[p.war] || p.war),
      el("strong", {}, p.name),
      el("span", { class: "gen-card-years" }, p.years || ""));
    card.addEventListener("click", () => openPerson(p));
    others.append(card);
  });
}

function openPerson(p) {
  const photo = p.photo
    ? el("img", { src: p.photo, alt: p.name })
    : el("div", { class: "person-nophoto" }, "Фото не сохранилось");
  const facts = el("div", { class: "person-facts" },
    el("span", { class: "type" }, WAR_LABELS[p.war] || p.war),
    el("h3", { id: "person-name" }, p.name),
    el("p", { class: "person-years" }, p.years || ""));

  if (p.relation) facts.append(el("p", {}, el("strong", {}, "Кем приходится Серафиме: "), p.relation));
  if (p.link) facts.append(el("p", {}, el("strong", {}, "Кто это: "), p.link));
  if (p.kin) facts.append(el("p", { class: "person-kin" }, "По программе «FamilyTree»: " +
    (p.kin.startsWith("Кровного") ? "кровного родства нет" : "Серафима — " + p.kin.toLowerCase())));
  $("#person-body").replaceChildren(
    el("div", { class: "person-head" }, photo, facts),
    el("p", { class: "person-text" }, p.text || ""));
  $("#person").showModal();
}

function setupPersonDialog() {
  const dialog = $("#person");
  dialog.querySelector(".person-close").addEventListener("click", () => dialog.close());

  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
}
function buildQuiz(quiz) {
  $("#quiz-title").textContent = quiz.title;
  $("#quiz-lead").textContent = quiz.lead;
  const box = $("#quiz-box");
  const total = quiz.questions.length;
  let index = 0;
  let score = 0;

  function showQuestion() {
    const q = quiz.questions[index];
    const options = el("div", { class: "quiz-options" });
    const explain = el("p", { class: "quiz-explain" });
    const next = el("button", { class: "btn quiz-next", type: "button" }, index + 1 < total ? "Дальше" : "Узнать результат");
    next.hidden = true;
    next.addEventListener("click", () => { index++; index < total ? showQuestion() : showResult(); });

    q.options.forEach((text, i) => {
      const option = el("button", { class: "quiz-option", type: "button" }, text);
      option.addEventListener("click", () => {
        if (i === q.answer) score++;

        [...options.children].forEach((b, j) => {
          b.disabled = true;
          if (j === q.answer) b.classList.add("right");
        });
        if (i !== q.answer) option.classList.add("wrong");
        explain.textContent = (i === q.answer ? "Верно! " : "Неверно. ") + q.explain;
        next.hidden = false;
        next.focus();
      });
      options.append(option);
    });

    box.replaceChildren(
      el("p", { class: "quiz-progress" }, `Вопрос ${index + 1} из ${total}`),
      el("h3", {}, q.q),
      options, explain, next);
  }

  function showResult() {
    const again = el("button", { class: "btn", type: "button" }, "Пройти ещё раз");
    again.addEventListener("click", () => { index = 0; score = 0; showQuestion(); });
    box.replaceChildren(
      el("p", { class: "quiz-progress" }, "Результат"),
      el("p", { class: "quiz-score" }, `${score} из ${total}`),
      el("p", {}, quiz.finish),
      again);
  }

  showQuestion();
}

function buildPresent(items) {
  const wrap = $("#present-cards");
  items.forEach((it) => {
    wrap.append(
      el("div", { class: "card" },
        el("div", { class: "big" }, it.big),
        el("h3", {}, it.title),
        el("p", {}, it.text))
    );
  });
}

function buildFuture(items) {
  const wrap = $("#future-cards");
  const result = $("#future-result");
  const picked = new Set();

  function renderResult() {
    if (picked.size === 0) {
      result.textContent = "Выбери хотя бы одну идею, и здесь появится твой проект.";
      return;
    }
    const names = items.filter((i) => picked.has(i.id)).map((i) => i.title.toLowerCase());
    result.textContent =
      `Твой проект развития: ${names.join(", ")}. ` +
      `Выбрано идей: ${picked.size} из ${items.length}.`;
  }

  items.forEach((it) => {
    const card = el("button", { class: "card", type: "button", "aria-pressed": "false" },
      el("div", { class: "big" }, it.big),
      el("h3", {}, it.title),
      el("p", {}, it.text));
    card.addEventListener("click", () => {
      if (picked.has(it.id)) picked.delete(it.id); else picked.add(it.id);
      card.classList.toggle("picked", picked.has(it.id));
      card.setAttribute("aria-pressed", String(picked.has(it.id)));
      renderResult();
    });
    wrap.append(card);
  });
  renderResult();
}

function init() {
  try {
    const all = window.SITE_DATA;
    if (!all) throw new Error("Не найден data/data.js. Запусти: python tools/build_data.py");
    const { site, timeline, places, presentFuture: pf } = all;
    fillSite(site);
    buildTimeline(timeline);
    buildMap(site, places);
    buildCompare(places.compare);
    setupPersonDialog();
    buildGenerations(all.generations);
    buildQuiz(all.quiz);
    buildPresent(pf.present);
    buildFuture(pf.future);
  } catch (err) {
    console.error(err);
    document.body.prepend(
      el("p", { style: "background:#b3122b;color:#fff;padding:1rem;margin:0" },
        "Ошибка при запуске сайта: " + err.message)
    );
  }
}

init();
