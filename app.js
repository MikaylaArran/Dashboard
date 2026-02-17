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
    // hard fallback to all (so UI keeps working even if one file missing)
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

  // Updated badge
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

  // your UI currently caps at 40 for readability
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

  // initial load
  refreshTopNews();
}

// Support inline onchange="refreshTopNews()" if you keep it in HTML:
window.refreshTopNews = refreshTopNews;

/* -----------------------------
   MAP
----------------------------- */
let _map;

function initMap(){
  const el = document.getElementById("worldMap");
  if (!el || !window.L) return;

  // prevent double-init if script reloads
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

  // Fix Leaflet sizing in CSS grids
  function fixSize(){
    setTimeout(() => _map && _map.invalidateSize(), 150);
  }
  window.addEventListener("load", fixSize);
  window.addEventListener("resize", fixSize);
}

/* -----------------------------
   DEMOCRACY TRENDS (CSV)
----------------------------- */
async function initDemocracyTrends(){
  const body = document.getElementById("demBody");
  const countrySel = document.getElementById("demCountry");
  const chartCanvas = document.getElementById("demChart");

  if (!body || !countrySel || !chartCanvas) return;

  // Keep a private chart instance (NOT on window)
  let chartInstance = null;

  // Small helper
  const destroyChart = () => {
    try {
      if (chartInstance && typeof chartInstance.destroy === "function") {
        chartInstance.destroy();
      }
    } catch (_) {
      // ignore
    } finally {
      chartInstance = null;
    }
  };

  body.innerHTML = `<div class="news-meta">Loading democracy data…</div>`;

  try {
    const url = "data/VDEM_small.csv?ts=" + Date.now();
    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) {
      throw new Error(`CSV not found (${res.status}). Put it at data/VDEM_small.csv`);
    }

    const text = await res.text();
    const parsed = Papa.parse(text, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true
    });

    const rows = (parsed.data || []).filter(r => r && r.country && r.year);

    if (!rows.length) {
      body.innerHTML = `<div class="news-item"><strong>No democracy data</strong></div>`;
      return;
    }

    // Countries dropdown
    const countries = [...new Set(rows.map(r => String(r.country).trim()))]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    countrySel.innerHTML = countries
      .map(c => `<option value="${safeText(c)}">${safeText(c)}</option>`)
      .join("");

    countrySel.value = countries.includes("South Africa") ? "South Africa" : countries[0];

    // Render shell ONCE (do not wipe the whole panel on change)
    body.innerHTML = `
      <div class="dem-chart-wrap">
        <canvas id="demChart"></canvas>
      </div>
      <div class="news-meta" id="demNote" style="margin-top:10px;"></div>
    `;

    const canvas = document.getElementById("demChart");
    const note = document.getElementById("demNote");

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
        .sort((a,b) => Number(a.year) - Number(b.year));

      if (!data.length) {
        destroyChart();
        if (note) note.textContent = "No rows found for this country in the CSV.";
        return;
      }

      const years = data.map(d => d.year);

      const datasets = measures.map(m => ({
        label: m.label,
        data: data.map(d => d[m.key]),
        tension: 0.3
      }));

      destroyChart();

      chartInstance = new Chart(canvas, {
        type: "line",
        data: { labels: years, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: "#fff" } }
          },
          scales: {
            x: { ticks: { color: "#aaa" }, grid: { color: "rgba(255,255,255,0.05)" } },
            y: { ticks: { color: "#aaa" }, grid: { color: "rgba(255,255,255,0.05)" } }
          }
        }
      });

      if (note) note.textContent = "";
    }

    render(countrySel.value);

    // IMPORTANT: avoid stacking multiple listeners if init runs again
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
  initTopNews();          // attaches listeners + loads news
  initMap();
  initDemocracyTrends();

  // auto refresh (safe)
  setInterval(initInstability, 60_000);
  setInterval(refreshTopNews, 60_000);
});

console.log("APP LOADED ✅", new Date().toISOString());
