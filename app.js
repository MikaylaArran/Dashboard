/* app.js - FULL FILE (VERCEL LIVE INSTABILITY)
   - Instability now loads from Vercel API instead of local JSON
   - Everything else unchanged
*/

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
   INSTABILITY INDEX (LIVE API)
----------------------------- */

// 🔴 CHANGE THIS TO YOUR REAL VERCEL DOMAIN
const API_BASE = "https://global-monitor-api.vercel.app/api/instability/summary";

function severityFor(score){
  if (score >= 80) return { label: "CRITICAL", color: "#ef4444" };
  if (score >= 65) return { label: "HIGH",     color: "#f59e0b" };
  if (score >= 50) return { label: "ELEVATED", color: "#eab308" };
  return              { label: "MODERATE", color: "#22c55e" };
}

async function loadInstabilityFromJson(){
  const res = await fetch(`${API_BASE}/api/instability/summary?ts=` + Date.now(), { cache: "no-store" });
  if (!res.ok) throw new Error("Instability API not reachable");
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
          <div class="breakdown">API unreachable.</div>
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
   TOP NEWS (unchanged)
----------------------------- */
async function loadTopNews(category){
  const cat = String(category || "all").toLowerCase().trim();
  const file = `data/top_news_${cat}.json?ts=` + Date.now();

  const res = await fetch(file, { cache: "no-store" });

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
    updated.textContent = "Updated";
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
  }
}

function initTopNews(){
  const newsCategoryEl = document.getElementById("newsCategory");
  const newsNEl = document.getElementById("newsN");

  if (newsCategoryEl) newsCategoryEl.addEventListener("change", refreshTopNews);
  if (newsNEl) newsNEl.addEventListener("change", refreshTopNews);

  refreshTopNews();
}

/* -----------------------------
   COUNTRY DRAWER + MAP + BOOT
   (unchanged from your version)
----------------------------- */
