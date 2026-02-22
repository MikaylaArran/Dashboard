/* app.js
   Global Monitor Dashboard (Dual)
   - Short Term Insight (default IDs)
   - Long Term (same dashboard with -lt IDs)
   - Map is shared (single map at top)
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

function initLiveNewsFor(suffix = ""){
  const tabs = document.getElementById(`tabs${suffix}`);
  const player = document.getElementById(`player${suffix}`);
  if (!tabs || !player) return;

  function setChannel(channelId, tabEl){
    // only clear tabs inside this tabs container
    tabs.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
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

async function initInstabilityFor(suffix = ""){
  const list = document.getElementById(`instabilityList${suffix}`);
  const updated = document.getElementById(`instabilityUpdated${suffix}`);
  const count = document.getElementById(`instabilityCount${suffix}`);
  const windowBadge = document.getElementById(`instabilityWindow${suffix}`);

  if (!list) return;

  try{
    const res = await fetch("data/instability.json?ts=" + Date.now(), { cache:"no-store" });
    if(!res.ok) throw new Error("instability.json missing");
    const data = await res.json();

    const rows = (data.countries || [])
      .slice()
      .sort((a,b)=>(Number(b.score||0))-(Number(a.score||0)));

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

function renderTopNewsFor(payload, suffix = ""){
  const list = document.getElementById(`topNewsList${suffix}`);
  const updated = document.getElementById(`topNewsUpdated${suffix}`);
  const newsNEl = document.getElementById(`newsN${suffix}`);

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

async function refreshTopNewsFor(suffix = ""){
  const catEl = document.getElementById(`newsCategory${suffix}`);
  const updated = document.getElementById(`topNewsUpdated${suffix}`);
  const category = catEl ? catEl.value : "all";

  try{
    if (updated) updated.textContent = "Loading…";
    const payload = await loadTopNews(category);
    renderTopNewsFor(payload, suffix);
  } catch (e){
    const list = document.getElementById(`topNewsList${suffix}`);
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

function initTopNewsFor(suffix = ""){
  const newsCategoryEl = document.getElementById(`newsCategory${suffix}`);
  const newsNEl = document.getElementById(`newsN${suffix}`);

  if (newsCategoryEl) newsCategoryEl.addEventListener("change", () => refreshTopNewsFor(suffix));
  if (newsNEl) newsNEl.addEventListener("change", () => refreshTopNewsFor(suffix));

  refreshTopNewsFor(suffix);
}

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
const WORLD_COUNTRIES_GEOJSON =
  "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson";

const OUTAGES_API = null;
const OUTAGES_FALLBACK = "/Dashboard/data/outages_mock.json";

let outageEnabled = false;

let outageCountriesLayer = null;
let outageDotsLayer = null;
let lastOutageCountryCodes = new Set();
let outageDetailsByCode = new Map();

function setOutageCount(n){
  const el = document.getElementById("outagesCount");
  if (el) el.textContent = String(n ?? 0);
}

function getIso2FromFeature(feature){
  const props = feature?.properties || {};
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

    dot.bindTooltip(tooltipHtml, { direction: "top", sticky: true, opacity: 0.95 });
    dot.bindPopup(tooltipHtml);

    dots.addLayer(dot);
  });

  dots.addTo(_map);
}

async function refreshOutageLayer(){
  if (!outageEnabled) return;

  try {
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
   DEMOCRACY TRENDS (CSV) — Dual
----------------------------- */
let demChartInstance = null;
let demChartInstanceLT = null;

function destroyChart(ref){
  try { if (ref && typeof ref.destroy === "function") ref.destroy(); } catch (_) {}
}

async function initDemocracyTrendsFor(suffix = ""){
  const body = document.getElementById(`demBody${suffix}`);
  const countrySel = document.getElementById(`demCountry${suffix}`);
  if (!body || !countrySel) return;

  // keep your existing structure; don’t wipe the whole panel layout
  // we only show loading note briefly (optional)
  // body.innerHTML = `<div class="news-meta">Loading democracy data…</div>`;

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

    const canvas = document.getElementById(`demChart${suffix}`);
    if (!canvas) throw new Error(`Canvas #demChart${suffix} not found`);

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

      const years = data.map(d => d.year);
      const datasets = measures.map(m => ({
        label: m.label,
        data: data.map(d => d[m.key]),
        tension: 0.3
      }));

      // destroy proper instance
      if (suffix === "-lt") {
        destroyChart(demChartInstanceLT);
      } else {
        destroyChart(demChartInstance);
      }

      const instance = new Chart(canvas, {
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

      if (suffix === "-lt") demChartInstanceLT = instance;
      else demChartInstance = instance;
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
   BOOT (init both dashboards)
----------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  // Short term (default IDs)
  initLiveNewsFor("");
  initInstabilityFor("");
  initTopNewsFor("");
  initDemocracyTrendsFor("");

  // Long term (same dashboard, -lt IDs)
  initLiveNewsFor("-lt");
  initInstabilityFor("-lt");
  initTopNewsFor("-lt");
  initDemocracyTrendsFor("-lt");

  // Map is single
  initMap();

  // refresh both dashboards
  setInterval(() => initInstabilityFor(""), 60_000);
  setInterval(() => initInstabilityFor("-lt"), 60_000);

  setInterval(() => refreshTopNewsFor(""), 60_000);
  setInterval(() => refreshTopNewsFor("-lt"), 60_000);

  // Outages refresh (only if toggle ON)
  setInterval(refreshOutageLayer, 5 * 60_000);
});

console.log("APP LOADED ✅", new Date().toISOString());
