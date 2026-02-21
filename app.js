/* app.js
   Global Monitor Dashboard
   - Live News (YouTube)
   - Instability (local JSON)
   - Top News (local JSON)
   - Democracy Trends (CSV + Chart.js)
*/

/* -----------------------------
   LIVE NEWS (YouTube)
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
    if (tabEl) tabEl.classList.add("active");
    player.src = liveEmbedUrl(channelId);
  }

  tabs.innerHTML = "";
  CHANNELS.forEach((c, i) => {
    const tab = document.createElement("div");
    tab.className = "tab";
    tab.innerText = c.name;
    tab.addEventListener("click", () => setChannel(c.channelId, tab));
    tabs.appendChild(tab);
    if (i === 0) setChannel(c.channelId, tab);
  });
}

/* -----------------------------
   SAFE TEXT
----------------------------- */
function safeText(s){
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

/* -----------------------------
   INSTABILITY (JSON)
----------------------------- */
function severityFor(score){
  const x = Number(score ?? 0);
  if (x >= 80) return { label:"CRITICAL", color:"#ef4444" };
  if (x >= 65) return { label:"HIGH", color:"#f59e0b" };
  if (x >= 50) return { label:"ELEVATED", color:"#eab308" };
  return { label:"MODERATE", color:"#22c55e" };
}

async function initInstability(){
  const list = document.getElementById("instabilityList");
  const updated = document.getElementById("instabilityUpdated");
  const count = document.getElementById("instabilityCount");
  const windowBadge = document.getElementById("instabilityWindow");

  if (!list) return;

  try{
    const res = await fetch("data/instability.json?ts=" + Date.now(), { cache:"no-store" });
    if(!res.ok) throw new Error("instability.json missing");
    const data = await res.json();

    const rows = (data.countries || []).slice().sort((a,b)=>(Number(b.score||0))-(Number(a.score||0)));
    if(count) count.textContent = rows.length;

    if (windowBadge && data?.window_days) windowBadge.textContent = `${data.window_days}D`;

    list.classList.remove("is-empty");
    list.innerHTML = "";

    rows.forEach(item=>{
      const score = Number(item.score ?? 0);
      const sev = severityFor(score);

      const card = document.createElement("div");
      card.className="country-card";
      card.innerHTML = `
        <div class="country-top">
          <div class="country-left">
            <div class="country-dot" style="background:${sev.color}; box-shadow:0 0 10px ${sev.color}55;"></div>
            <div class="country-name">${safeText(item.country ?? "Unknown")}</div>
          </div>
          <div class="score-wrap">
            <span class="severity" style="border-color:${sev.color}55; background:${sev.color}22; color:${sev.color};">${sev.label}</span>
            <div class="score">${score}</div>
          </div>
        </div>
      `;
      list.appendChild(card);
    });

    if(updated){
      if (data?.generated_at_utc){
        const dt = new Date(data.generated_at_utc);
        updated.textContent = isNaN(dt) ? "Updated" : "Updated " + dt.toLocaleString();
      } else {
        updated.textContent = "Updated";
      }
    }

  }catch(e){
    if (updated) updated.textContent = "No data";
    list.classList.add("is-empty");
    list.innerHTML = `
      <div class="news-item">
        <strong>Instability data not found</strong>
        <div class="news-meta">${safeText(e?.message || String(e))}</div>
      </div>
    `;
    console.error(e);
  }
}

/* -----------------------------
   TOP NEWS (JSON)
----------------------------- */
async function loadTopNews(category){
  const cat = String(category || "all").toLowerCase().trim();
  const file = `data/top_news_${cat}.json?ts=${Date.now()}`;
  const res = await fetch(file, { cache: "no-store" });

  if (!res.ok) {
    const fallback = await fetch(`data/top_news_all.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!fallback.ok) throw new Error(`Missing top news JSON (tried ${file} and fallback top_news_all.json)`);
    return await fallback.json();
  }
  return await res.json();
}

function renderTopNews(payload){
  const list = document.getElementById("topNewsList");
  const updated = document.getElementById("topNewsUpdated");
  const newsNEl = document.getElementById("newsN");

  if (!list) return;

  list.classList.remove("is-empty");
  list.innerHTML = "";

  if (updated){
    if (payload?.generated_at_utc){
      const dt = new Date(payload.generated_at_utc);
      updated.textContent = isNaN(dt) ? "Updated" : ("Updated " + dt.toLocaleString());
    } else {
      updated.textContent = "Updated";
    }
  }

  const nWanted = parseInt(newsNEl?.value || "60", 10) || 60;
  const articles = Array.isArray(payload?.articles) ? payload.articles : [];

  if (!articles.length){
    list.classList.add("is-empty");
    list.innerHTML = `
      <div class="news-item">
        <strong>No news found.</strong>
        <div class="news-meta">JSON loaded but has no articles.</div>
      </div>
    `;
    return;
  }

  const displayCount = Math.min(nWanted, 40);

  articles.slice(0, displayCount).forEach(a => {
    const title = a?.title || "Untitled";
    const link = a?.link || "";
    const source = a?.source || "";
    const pubDate = a?.pubDate || "";

    const item = document.createElement("div");
    item.className = "news-item";
    item.innerHTML = `
      <div>
        ${
          link
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
  const catEl = document.getElementById("newsCategory");
  const updated = document.getElementById("topNewsUpdated");
  const category = catEl ? catEl.value : "all";

  try{
    if (updated) updated.textContent = "Loading…";
    const payload = await loadTopNews(category);
    renderTopNews(payload);
  } catch (e){
    const list = document.getElementById("topNewsList");
    if (updated) updated.textContent = "No data";
    if (list){
      list.classList.add("is-empty");
      list.innerHTML = `
        <div class="news-item">
          <strong>Top news failed</strong>
          <div class="news-meta">${safeText(e?.message || String(e))}</div>
        </div>
      `;
    }
    console.error(e);
  }
}

function initTopNews(){
  const newsCategoryEl = document.getElementById("newsCategory");
  const newsNEl = document.getElementById("newsN");

  if (newsCategoryEl) newsCategoryEl.addEventListener("change", refreshTopNews);
  if (newsNEl) newsNEl.addEventListener("change", refreshTopNews);

  refreshTopNews();
}

window.refreshTopNews = refreshTopNews;

/* -----------------------------
   MAP
----------------------------- */
let _map;

function initMap(){
  const el = document.getElementById("worldMap");
  if (!el || !window.L) return;
  if (_map) return;

  _map = L.map("worldMap", {
    zoomControl: true,
    attributionControl: false,
    worldCopyJump: true
  }).setView([15, 10], 2);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 19
  }).addTo(_map);

  function updateMapTime(){
    const label = document.getElementById("mapTime");
    if (!label) return;
    const now = new Date();
    label.textContent = now.toUTCString().replace("GMT", "UTC");
  }

  updateMapTime();
  setInterval(updateMapTime, 1000);

  function fixSize(){
    setTimeout(() => _map && _map.invalidateSize(), 150);
  }
  window.addEventListener("load", fixSize);
  window.addEventListener("resize", fixSize);

  initOutageToggle();
}

/* -----------------------------
   INTERNET OUTAGES (Dots + Hover Insight)
----------------------------- */

// Countries GeoJSON (for geometry / bounds)
const WORLD_COUNTRIES_GEOJSON =
  "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson";

// Live endpoint (later you’ll replace with a real proxy)
const OUTAGES_API = null;

// Fallback to local file so this works now
const OUTAGES_FALLBACK = "./data/outages_mock.json";

let outageEnabled = false;

let outageCountriesLayer = null;     // geo layer (used for bounds)
let outageDotsLayer = null;          // dot markers
let lastOutageCountryCodes = new Set();
let outageDetailsByCode = new Map();

function setOutageCount(n){
  const el = document.getElementById("outagesCount");
  if (el) el.textContent = String(n ?? 0);
}

function getIso2FromFeature(feature){
  const props = feature?.properties || {};
  // dataset usually uses ISO_A2
  const code = (props.ISO_A2 || props.iso_a2 || props.ISO2 || props.id || "").toString().toUpperCase();
  return code;
}

function ensureOutageDotsLayer(){
  if (!outageDotsLayer) outageDotsLayer = L.layerGroup();
  return outageDotsLayer;
}

function clearOutageDots(){
  if (outageDotsLayer) outageDotsLayer.clearLayers();
}

async function loadCountriesLayer(){
  if (outageCountriesLayer) return outageCountriesLayer;

  const res = await fetch(WORLD_COUNTRIES_GEOJSON, { cache: "force-cache" });
  if (!res.ok) throw new Error("Could not load countries GeoJSON");
  const geo = await res.json();

  // IMPORTANT:
  // We make this layer invisible (no grey borders everywhere).
  // We use it ONLY to compute country bounds/centers.
  outageCountriesLayer = L.geoJSON(geo, {
    style: () => ({
      color: "transparent",
      weight: 0,
      fillColor: "transparent",
      fillOpacity: 0
    })
  });

  return outageCountriesLayer;
}

// Parse payload into country codes + store tooltip insight per code
function parseOutageCountryCodes(payload){
  const annotations = payload?.result?.annotations || payload?.annotations || [];
  const set = new Set();

  outageDetailsByCode = new Map();

  annotations.forEach(a => {
    const locs = Array.isArray(a?.locations) ? a.locations : [];
    const start = a?.startDate || a?.start || a?.started_at || "";
    const end = a?.endDate || a?.end || a?.ended_at || "";
    const cause = a?.outage?.outageCause || a?.cause || "";
    const type  = a?.outage?.outageType  || a?.type  || "";
    const summary = a?.summary || a?.description || "";

    locs.forEach(code => {
      if (!code) return;
      const c = String(code).toUpperCase();
      set.add(c);

      if (!outageDetailsByCode.has(c)) {
        outageDetailsByCode.set(c, { code: c, start, end, cause, type, summary });
      }
    });
  });

  return set;
}

async function fetchOutagePayload(){
  const tryFetch = async (url) => {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`Fetch failed (${r.status})`);
    return await r.json();
  };

  try {
    return await tryFetch(OUTAGES_API);
  } catch (e1) {
    console.warn("Outages live API failed, using fallback:", e1?.message || e1);
    return await tryFetch(OUTAGES_FALLBACK + "?ts=" + Date.now());
  }
}

function buildOutageDots(){
  if (!outageEnabled || !_map || !outageCountriesLayer) return;

  const dots = ensureOutageDotsLayer();
  clearOutageDots();

  // For each country polygon, if it’s in outage set -> place dot at its center
  outageCountriesLayer.eachLayer(layer => {
    const feature = layer?.feature;
    const code = getIso2FromFeature(feature);
    if (!code || !lastOutageCountryCodes.has(code)) return;

    const props = feature?.properties || {};
    const name = props.ADMIN || props.name || code;

    const info = outageDetailsByCode.get(code) || { code };
    const center = layer.getBounds().getCenter();

    const tooltipHtml = `
      <div style="min-width:200px">
        <strong>${safeText(name)} (${safeText(code)})</strong>
        <div style="font-size:11px; opacity:0.9; margin-top:6px; line-height:1.35">
          ${info.type ? `Type: ${safeText(info.type)}<br>` : ""}
          ${info.cause ? `Cause: ${safeText(info.cause)}<br>` : ""}
          ${info.start ? `Start: ${safeText(String(info.start))}<br>` : ""}
          ${info.end ? `End: ${safeText(String(info.end))}<br>` : ""}
          ${info.summary ? `<div style="margin-top:6px">${safeText(info.summary)}</div>` : ""}
        </div>
      </div>
    `;

    const dot = L.circleMarker(center, {
      radius: 6,
      weight: 1,
      color: "#ef4444",
      fillColor: "#ef4444",
      fillOpacity: 0.85
    });

    // Hover insight
    dot.bindTooltip(tooltipHtml, { direction: "top", sticky: true, opacity: 0.95 });

    // Optional click (same info)
    dot.bindPopup(tooltipHtml);

    dots.addLayer(dot);
  });

  dots.addTo(_map);
}

async function refreshOutageLayer(){
  if (!outageEnabled) return;

  try {
    // Ensure geo layer exists (invisible) so we can compute centers
    await loadCountriesLayer();
    if (_map && !(_map.hasLayer(outageCountriesLayer))) outageCountriesLayer.addTo(_map);

    const payload = await fetchOutagePayload();
    lastOutageCountryCodes = parseOutageCountryCodes(payload);

    setOutageCount(lastOutageCountryCodes.size);

    buildOutageDots();
  } catch (e) {
    console.error(e);
    setOutageCount(0);
    clearOutageDots();
  }
}

async function enableOutages(){
  outageEnabled = true;
  await refreshOutageLayer();
}

function disableOutages(){
  outageEnabled = false;
  setOutageCount(0);
  lastOutageCountryCodes = new Set();
  outageDetailsByCode = new Map();

  if (_map && outageDotsLayer) _map.removeLayer(outageDotsLayer);
  if (_map && outageCountriesLayer) _map.removeLayer(outageCountriesLayer);

  clearOutageDots();
}

function initOutageToggle(){
  const cb = document.getElementById("toggleOutages");
  if (!cb) return;

  cb.addEventListener("change", async (e) => {
    const on = !!e.target.checked;
    if (on) await enableOutages();
    else disableOutages();
  });
}

/* -----------------------------
   DEMOCRACY TRENDS (CSV)
   FIX: do NOT use window.demChart (Safari treats #demChart as window.demChart)
----------------------------- */
let demChartInstance = null;

function destroyDemChart(){
  try {
    if (demChartInstance && typeof demChartInstance.destroy === "function") {
      demChartInstance.destroy();
    }
  } catch (_) {
    // ignore
  } finally {
    demChartInstance = null;
  }
}

async function initDemocracyTrends(){
  const body = document.getElementById("demBody");
  const countrySel = document.getElementById("demCountry");
  if (!body || !countrySel) return;

  body.innerHTML = `<div class="news-meta">Loading democracy data…</div>`;

  try {
    const url = "data/VDEM_small.csv?ts=" + Date.now();
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`CSV not found (${res.status}). Put it at data/VDEM_small.csv`);

    const text = await res.text();
    const parsed = Papa.parse(text, { header:true, dynamicTyping:true, skipEmptyLines:true });
    const rows = (parsed.data || []).filter(r => r && r.country && r.year);

    if (!rows.length) {
      body.innerHTML = `<div class="news-item"><strong>No democracy data</strong></div>`;
      return;
    }

    const countries = [...new Set(rows.map(r => String(r.country).trim()))]
      .filter(Boolean)
      .sort((a,b)=>a.localeCompare(b));

    countrySel.innerHTML = countries.map(c => `<option value="${safeText(c)}">${safeText(c)}</option>`).join("");
    countrySel.value = countries.includes("South Africa") ? "South Africa" : countries[0];

    if (!document.getElementById("demChart")) {
      body.innerHTML = `
        <div class="dem-chart-wrap">
          <canvas id="demChart"></canvas>
        </div>
        <div class="news-meta" id="demNote" style="margin-top:10px;"></div>
      `;
    } else {
      if (!document.getElementById("demNote")) {
        body.insertAdjacentHTML("beforeend", `<div class="news-meta" id="demNote" style="margin-top:10px;"></div>`);
      }
    }

    const canvas = document.getElementById("demChart");
    const note = document.getElementById("demNote");
    if (!canvas) throw new Error("Canvas #demChart not found in DOM");

    const measures = [
      { key:"electoral_democracy_index", label:"Electoral" },
      { key:"liberal_democracy_index", label:"Liberal" },
      { key:"electoral_fairness_index", label:"Fairness" },
      { key:"vote_buying", label:"Vote Buying" },
      { key:"freedom_of_expression_index", label:"Expression" }
    ];

    function render(country){
      const data = rows
        .filter(r => String(r.country).trim() === String(country).trim())
        .sort((a,b)=>Number(a.year)-Number(b.year));

      if (!data.length) {
        destroyDemChart();
        if (note) note.textContent = "No rows found for this country in the CSV.";
        return;
      }

      const years = data.map(d => d.year);
      const datasets = measures.map(m => ({
        label: m.label,
        data: data.map(d => d[m.key]),
        tension: 0.3
      }));

      destroyDemChart();

      demChartInstance = new Chart(canvas, {
        type: "line",
        data: { labels: years, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: "#fff" } } },
          scales: {
            x: { ticks: { color: "#aaa" }, grid: { color: "rgba(255,255,255,0.05)" } },
            y: { ticks: { color: "#aaa" }, grid: { color: "rgba(255,255,255,0.05)" } }
          }
        }
      });

      if (note) note.textContent = "";
    }

    render(countrySel.value);
    countrySel.onchange = (e) => render(e.target.value);

  } catch (e) {
    body.innerHTML = `
      <div class="news-item">
        <strong>Error loading CSV</strong>
        <div class="news-meta">${safeText(e?.message || String(e))}</div>
      </div>
    `;
    console.error(e);
  }
}

/* -----------------------------
   BOOT
----------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  initLiveNews();
  initInstability();
  initTopNews();
  initMap();
  initDemocracyTrends();

  setInterval(initInstability, 60_000);
  setInterval(refreshTopNews, 60_000);

  // Refresh outage dots every 5 minutes (only does work if toggle is ON)
  setInterval(refreshOutageLayer, 5 * 60_000);
});

console.log("APP LOADED ✅", new Date().toISOString());
