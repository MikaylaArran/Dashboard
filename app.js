/* app.js - FULL FILE */

/* -----------------------------
   LIVE NEWS (YouTube Embed)
----------------------------- */
const CHANNELS = [
  { name: "SKY NEWS", channelId: "UCoMdktPbSTixAyNGwb-UYkQ" },
  { name: "NBC NEWS", channelId: "UCeY0bbntWzzVIaj2z3QigXg" },
  { name: "CBS NEWS", channelId: "UC8p1vwvWtl6T73JiExfWs1g" },
  { name: "ABC NEWS", channelId: "UCBi2mrWuNuyYy4gbM6fU18Q" },
  { name: "DW NEWS", channelId: "UCknLrEdhRCp1aegoMqRaCZg" },
  { name: "AL JAZEERA", channelId: "UCNye-wNBqNL5ZzHSJj3l8Bg" },
  { name: "FRANCE 24", channelId: "UCQfwfsi5VrQ8yKZ-UWmAEFg" },
  { name: "EURONEWS", channelId: "UCSrZ3UV4jOidv8ppoVuvW9Q" }
];

function liveEmbedUrl(channelId){
  const url = new URL("https://www.youtube.com/embed/live_stream");
  url.searchParams.set("channel", channelId);
  url.searchParams.set("autoplay", "1");
  url.searchParams.set("mute", "1");
  url.searchParams.set("playsinline", "1");
  return url.toString();
}

function initLiveNews(){
  const tabs = document.getElementById("tabs");
  const player = document.getElementById("player");
  if (!tabs || !player) return;

  function setChannel(channelId, tabEl){
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    tabEl.classList.add("active");
    player.src = liveEmbedUrl(channelId);
  }

  tabs.innerHTML = "";
  CHANNELS.forEach((c, i) => {
    const tab = document.createElement("div");
    tab.className = "tab";
    tab.innerText = c.name;
    tab.onclick = () => setChannel(c.channelId, tab);
    tabs.appendChild(tab);
    if (i === 0) setChannel(c.channelId, tab);
  });
}

/* -----------------------------
   INSTABILITY INDEX
----------------------------- */
function severityFor(score){
  if (score >= 80) return { label: "CRITICAL", color: "#ef4444" };
  if (score >= 65) return { label: "HIGH",     color: "#f59e0b" };
  if (score >= 50) return { label: "ELEVATED", color: "#eab308" };
  return              { label: "MODERATE", color: "#22c55e" };
}

async function loadInstabilityFromJson(){
  const res = await fetch("data/instability.json?ts=" + Date.now(), { cache: "no-store" });
  if (!res.ok) throw new Error("instability.json not found");
  return await res.json();
}

function renderInstability(rows, meta){
  const list = document.getElementById("instabilityList");
  const count = document.getElementById("instabilityCount");
  const updated = document.getElementById("instabilityUpdated");
  const windowBadge = document.getElementById("instabilityWindow");
  if (!list || !count || !updated || !windowBadge) return;

  list.classList.remove("is-empty");

  const sorted = [...rows].sort((a,b) => (b.score ?? 0) - (a.score ?? 0));
  count.textContent = sorted.length;

  if (meta?.window_days) windowBadge.textContent = String(meta.window_days) + "D";

  if (meta?.generated_at_utc) {
    const dt = new Date(meta.generated_at_utc);
    updated.textContent = (!isNaN(dt)) ? ("Updated " + dt.toLocaleString()) : ("Updated " + meta.generated_at_utc);
  } else {
    updated.textContent = "No timestamp";
  }

  list.innerHTML = "";
  sorted.forEach(item => {
    const score = Number(item.score ?? 0);
    const sev = severityFor(score);

    const card = document.createElement("div");
    card.className = "country-card";
    card.innerHTML = `
      <div class="country-top">
        <div class="country-left">
          <div class="country-dot" style="background:${sev.color}; box-shadow: 0 0 10px ${sev.color}55;"></div>
          <div class="country-name">${item.country ?? "Unknown"}</div>
        </div>
        <div class="score-wrap">
          <span class="severity" style="border-color:${sev.color}55; background:${sev.color}22; color:${sev.color};">
            ${sev.label}
          </span>
          <div class="score">${score}</div>
        </div>
      </div>
      <div class="bar">
        <div style="width:${Math.max(0, Math.min(100, score))}%; background:${sev.color};"></div>
      </div>
      <div class="breakdown">
        U:${item.U ?? 0} C:${item.C ?? 0} S:${item.S ?? 0} I:${item.I ?? 0}
      </div>
    `;

    card.addEventListener("click", () => openCountryDrawer(item));
    list.appendChild(card);
  });
}

async function initInstability(){
  const list = document.getElementById("instabilityList");
  try {
    const payload = await loadInstabilityFromJson();
    renderInstability(payload.countries || [], payload);
  } catch (e) {
    const updated = document.getElementById("instabilityUpdated");
    if (updated) updated.textContent = "No data yet";
    if (list) {
      list.classList.add("is-empty");
      list.innerHTML = `
        <div class="country-card">
          <strong>Instability data not found.</strong>
          <div class="breakdown">Create <code>data/instability.json</code> then refresh.</div>
        </div>
      `;
    }
  }
}

/* -----------------------------
   SAFE TEXT
----------------------------- */
function safeText(s){
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

/* -----------------------------
   TOP NEWS
----------------------------- */
async function loadTopNews(){
  const res = await fetch("data/top_news.json?ts=" + Date.now(), { cache: "no-store" });
  if (!res.ok) throw new Error("Missing data/top_news.json");
  return await res.json();
}

function renderTopNews(payload){
  const list = document.getElementById("topNewsList");
  const updated = document.getElementById("topNewsUpdated");
  const newsNEl = document.getElementById("newsN");
  const categoryEl = document.getElementById("newsCategory");

  if (!list || !updated || !newsNEl) return;

  list.classList.remove("is-empty");
  list.innerHTML = "";

  // ✅ Support both formats:
  // A) payload = [ ...articles ]
  // B) payload = { generated_at_utc, articles: [...] }
  const rawArticles = Array.isArray(payload)
    ? payload
    : (payload?.articles || []);

  // Updated timestamp
  const ts = Array.isArray(payload) ? null : payload?.generated_at_utc;
  if (ts) {
    const dt = new Date(ts);
    updated.textContent = (!isNaN(dt)) ? ("Updated " + dt.toLocaleString()) : ("Updated " + ts);
  } else {
    updated.textContent = "Updated";
  }

  // Filter by category (only if your JSON includes "category" field per article)
  const chosenCategory = categoryEl ? (categoryEl.value || "all") : "all";
  const filtered = (chosenCategory === "all")
    ? rawArticles
    : rawArticles.filter(a => String(a.category || "").toLowerCase() === chosenCategory);

  if (!filtered.length){
    list.classList.add("is-empty");
    list.innerHTML = `
      <div class="news-item">
        <strong>No news found.</strong>
        <div class="news-meta">Data loaded, but there are no articles for this filter.</div>
      </div>
    `;
    return;
  }

  const n = parseInt(newsNEl.value, 10) || 60;
  const displayCount = Math.min(n, 20);

  filtered.slice(0, displayCount).forEach(a => {
    const item = document.createElement("div");
    item.className = "news-item";

    const title = a.title || "Untitled";
    const link = a.link || "";
    const source = a.source || "";
    const pubDate = a.pubDate || a.published_at || "";

    item.innerHTML = `
      <div>
        ${link
          ? `<a href="${safeText(link)}" target="_blank" rel="noopener noreferrer"><strong>${safeText(title)}</strong></a>`
          : `<strong>${safeText(title)}</strong>`
        }
      </div>
      <div class="news-meta">${safeText(pubDate)}${source ? ` | ${safeText(source)}` : ""}</div>
    `;
    list.appendChild(item);
  });
}

async function refreshTopNews(){
  const list = document.getElementById("topNewsList");
  try {
    const updated = document.getElementById("topNewsUpdated");
    if (updated) updated.textContent = "Loading…";
    const payload = await loadTopNews();
    renderTopNews(payload);
  } catch (e) {
    const updated = document.getElementById("topNewsUpdated");
    if (updated) updated.textContent = "No data yet";
    if (list) {
      list.classList.add("is-empty");
      list.innerHTML = `
        <div class="news-item">
          <strong>Top news data not found.</strong>
          <div class="news-meta">${safeText(e.message)}</div>
          <div class="news-meta">Expected <code>data/top_news.json</code> to exist on GitHub Pages.</div>
        </div>
      `;
    }
  }
}

function initTopNews(){
  const newsCategoryEl = document.getElementById("newsCategory");
  const newsNEl = document.getElementById("newsN");
  const newsRefreshBtn = document.getElementById("newsRefresh");

  if (newsCategoryEl) newsCategoryEl.addEventListener("change", refreshTopNews);
  if (newsNEl) newsNEl.addEventListener("change", refreshTopNews);
  if (newsRefreshBtn) newsRefreshBtn.addEventListener("click", refreshTopNews);

  refreshTopNews();
}
/* -----------------------------
   TOP NEWS (Google RSS JSON files)
----------------------------- */
async function loadTopNews(category){
  const cat = String(category || "all").toLowerCase().trim();
  const file = `data/top_news_${cat}.json?ts=` + Date.now();

  const res = await fetch(file, { cache: "no-store" });

  // fallback if category file missing
  if (!res.ok) {
    const fallback = await fetch("data/top_news_all.json?ts=" + Date.now(), { cache: "no-store" });
    if (!fallback.ok) throw new Error("Missing top news JSON files");
    return await fallback.json();
  }

  return await res.json();
}

function renderTopNews(payload){
  const list = document.getElementById("topNewsList");
  const updated = document.getElementById("topNewsUpdated");
  const newsNEl = document.getElementById("newsN");
  if (!list || !updated || !newsNEl) return;

  list.classList.remove("is-empty");
  list.innerHTML = "";

  if (payload?.generated_at_utc) {
    const dt = new Date(payload.generated_at_utc);
    updated.textContent = (!isNaN(dt)) ? ("Updated " + dt.toLocaleString()) : ("Updated " + payload.generated_at_utc);
  } else {
    updated.textContent = "Updated (no timestamp)";
  }

  if (payload?.summary) {
    const summary = document.createElement("div");
    summary.className = "news-item";
    summary.innerHTML = `
      <div class="summary-title">Summary</div>
      <div class="summary-text">${safeText(payload.summary)}</div>
      <div class="news-meta">
        ${payload?.category ? safeText(payload.category) : ""}${payload?.language ? ` | ${safeText(payload.language)}` : ""}
      </div>
    `;
    list.appendChild(summary);
  }

  const n = parseInt(newsNEl.value, 10) || 60;
  const articles = payload?.articles || [];

  if (!articles.length){
    list.classList.add("is-empty");
    list.innerHTML = `
      <div class="news-item">
        <strong>No news found.</strong>
        <div class="news-meta">The JSON exists but has no articles.</div>
      </div>
    `;
    return;
  }

  const displayCount = Math.min(n, 40);
  articles.slice(0, displayCount).forEach(a => {
    const item = document.createElement("div");
    item.className = "news-item";

    const title = a.title || "Untitled";
    const link = a.link || "";
    const source = a.source || "";
    const pubDate = a.pubDate || "";

    item.innerHTML = `
      <div>
        ${link
          ? `<a href="${safeText(link)}" target="_blank" rel="noopener noreferrer"><strong>${safeText(title)}</strong></a>`
          : `<strong>${safeText(title)}</strong>`
        }
      </div>
      <div class="news-meta">${safeText(pubDate)}${source ? ` | ${safeText(source)}` : ""}</div>
    `;

    list.appendChild(item);
  });
}

async function refreshTopNews(){
  const list = document.getElementById("topNewsList");
  const catEl = document.getElementById("newsCategory");
  const updated = document.getElementById("topNewsUpdated");

  const category = catEl ? catEl.value : "all";

  try {
    if (updated) updated.textContent = "Loading…";
    const payload = await loadTopNews(category);
    renderTopNews(payload);
  } catch (e) {
    if (updated) updated.textContent = "No data yet";
    if (list) {
      list.classList.add("is-empty");
      list.innerHTML = `
        <div class="news-item">
          <strong>Top news data not found.</strong>
          <div class="news-meta">${safeText(e.message)}</div>
          <div class="news-meta">Expected <code>data/top_news_*.json</code> to exist.</div>
        </div>
      `;
    }
  }
}

function initTopNews(){
  const newsCategoryEl = document.getElementById("newsCategory");
  const newsNEl = document.getElementById("newsN");
  const newsRefreshBtn = document.getElementById("newsRefresh");

  if (newsCategoryEl) newsCategoryEl.addEventListener("change", refreshTopNews);
  if (newsNEl) newsNEl.addEventListener("change", refreshTopNews);
  if (newsRefreshBtn) newsRefreshBtn.addEventListener("click", refreshTopNews);

  refreshTopNews();
}

/* -----------------------------
   COUNTRY REPORT DRAWER
----------------------------- */
function trendBadge(delta){
  const d = Number(delta ?? 0);
  if (d > 0) return { txt: `↑ ${d}`, cls: "trend-up" };
  if (d < 0) return { txt: `↓ ${Math.abs(d)}`, cls: "trend-down" };
  return { txt: "→ 0", cls: "trend-flat" };
}

async function openCountryDrawer(item){
  const drawer = document.getElementById("countryDrawer");
  const overlay = document.getElementById("drawerOverlay");
  const title = document.getElementById("drawerCountry");
  const content = document.getElementById("drawerContent");

  if (!drawer || !overlay || !title || !content) return;

  title.textContent = item.country ?? "Unknown";

  const score = Number(item.score ?? 0);
  const sev = severityFor(score);

  const meaningRaw =
    item.meaning ??
    item.what_this_means ??
    item.what_does_it_mean ??
    item.explanation ??
    item.summary ??
    "";

  const meaningText = String(meaningRaw).trim()
    ? safeText(meaningRaw).replace(/\n/g, "<br>")
    : "No explanation available yet (meaning missing in instability.json).";

  const { txt: trendTxt, cls: trendCls } = trendBadge(item.delta);

  const eventsTotal = Number(item.events_total ?? 0);
  const fatalitiesTotal = Number(item.fatalities_total ?? 0);

  const types = Array.isArray(item.top_event_types) ? item.top_event_types : [];
  const typesHtml = types.length
    ? `
      <div class="summary-title" style="margin-top:12px;">Top event types</div>
      <div class="type-list">
        ${types.map(t => `
          <div class="type-row">
            <div><strong>${safeText(t.name)}</strong></div>
            <span>${Number(t.count ?? 0)}</span>
          </div>
        `).join("")}
      </div>
    `
    : `<div class="news-meta" style="margin-top:10px;">No event type breakdown available yet.</div>`;

  content.innerHTML = `
    <div class="news-item">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <div>
          <div class="summary-title">Instability Score</div>
          <div style="font-size:28px; font-weight:900;">
            ${score}<span style="opacity:.6; font-size:14px;">/100</span>
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:10px;">
          <div class="severity" style="border-color:${sev.color}55; background:${sev.color}22; color:${sev.color}; font-weight:800;">
            ${sev.label}
          </div>
          <div class="severity ${trendCls}" style="border-color:rgba(255,255,255,0.15); background:rgba(255,255,255,0.05); font-weight:900;">
            ${trendTxt}
          </div>
        </div>
      </div>

      <div class="bar" style="margin-top:10px;">
        <div style="width:${Math.max(0, Math.min(100, score))}%; background:${sev.color};"></div>
      </div>

      <div class="breakdown" style="margin-top:10px;">
        UNREST: ${item.U ?? 0} &nbsp;|&nbsp; CONFLICT: ${item.C ?? 0} &nbsp;|&nbsp; SOCIETAL: ${item.S ?? 0} &nbsp;|&nbsp; IMPACT: ${item.I ?? 0}
      </div>

      <div class="kv-row">
        <div class="kv">Events: <strong>${eventsTotal}</strong></div>
        <div class="kv">Fatalities: <strong>${fatalitiesTotal}</strong></div>
      </div>

      ${typesHtml}
    </div>

    <div class="news-item">
      <div class="summary-title">What this means</div>
      <div class="summary-text">${meaningText}</div>
      <div class="news-meta">Source: ACLED-derived scoring model</div>
    </div>
  `;

  drawer.classList.add("open");
  overlay.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
  overlay.setAttribute("aria-hidden", "false");
}

function closeCountryDrawer(){
  const drawer = document.getElementById("countryDrawer");
  const overlay = document.getElementById("drawerOverlay");
  if (!drawer || !overlay) return;

  drawer.classList.remove("open");
  overlay.classList.remove("open");
}

function initCountryDrawer(){
  const overlay = document.getElementById("drawerOverlay");
  const closeBtn = document.getElementById("drawerClose");

  if (overlay) overlay.addEventListener("click", closeCountryDrawer);
  if (closeBtn) closeBtn.addEventListener("click", closeCountryDrawer);

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeCountryDrawer();
  });
}

/* -----------------------------
   MAP
----------------------------- */
function initMap(){
  const el = document.getElementById("worldMap");
  if (!el || typeof L === "undefined") {
    console.warn("Map not initialised:", { elExists: !!el, leaflet: typeof L });
    return;
  }

  const map = L.map("worldMap", {
    zoomControl: true,
    attributionControl: false,
    worldCopyJump: true
  }).setView([15, 10], 2);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 19
  }).addTo(map);

  const points = [
    { name: "South Africa", lat: -29, lon: 24,  color: "#f59e0b" },
    { name: "UK",           lat: 55,  lon: -3,  color: "#22c55e" },
    { name: "India",        lat: 22,  lon: 78,  color: "#ef4444" },
    { name: "USA",          lat: 37,  lon: -95, color: "#60a5fa" }
  ];

  points.forEach(p => {
    L.circleMarker([p.lat, p.lon], {
      radius: 6,
      weight: 1,
      color: p.color,
      fillColor: p.color,
      fillOpacity: 0.85,
      opacity: 0.95
    })
    .bindTooltip(p.name, { direction: "top", offset: [0, -6] })
    .addTo(map);
  });

  function updateMapTime(){
    const now = new Date();
    const label = document.getElementById("mapTime");
    if (label) label.textContent = now.toUTCString().replace("GMT","UTC");
  }
  updateMapTime();
  setInterval(updateMapTime, 1000);

  function fixMapSize(){
    setTimeout(() => map.invalidateSize(), 150);
  }
  window.addEventListener("load", fixMapSize);
  window.addEventListener("resize", fixMapSize);
}

/* -----------------------------
   BOOT
----------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  initCountryDrawer();
  initLiveNews();
  initInstability();
  initTopNews();
  initMap();
  initTopNews(); 

  // Auto-refresh
  setInterval(initInstability, 60_000);
  setInterval(refreshTopNews, 60_000);
});
console.log("APP.JS LOADED ✅", new Date().toISOString());
