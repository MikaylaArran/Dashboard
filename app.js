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
  CHANNELS.forEach((c,i)=>{
    const tab = document.createElement("div");
    tab.className = "tab";
    tab.innerText = c.name;
    tab.onclick = () => setChannel(c.channelId, tab);
    tabs.appendChild(tab);
    if(i===0) setChannel(c.channelId, tab);
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
  if (score >= 80) return { label:"CRITICAL", color:"#ef4444" };
  if (score >= 65) return { label:"HIGH", color:"#f59e0b" };
  if (score >= 50) return { label:"ELEVATED", color:"#eab308" };
  return { label:"MODERATE", color:"#22c55e" };
}

async function initInstability(){
  const list = document.getElementById("instabilityList");
  const updated = document.getElementById("instabilityUpdated");
  const count = document.getElementById("instabilityCount");

  if (!list) return;

  try{
    const res = await fetch("data/instability.json?ts="+Date.now(), {cache:"no-store"});
    if(!res.ok) throw new Error("instability.json missing");
    const data = await res.json();

    list.innerHTML="";
    const rows = (data.countries || []).sort((a,b)=>(b.score||0)-(a.score||0));
    if(count) count.textContent = rows.length;

    rows.forEach(item=>{
      const sev = severityFor(item.score||0);
      const card = document.createElement("div");
      card.className="country-card";
      card.innerHTML = `
        <div class="country-top">
          <div class="country-left">
            <div class="country-dot" style="background:${sev.color}"></div>
            <div class="country-name">${safeText(item.country)}</div>
          </div>
          <div class="score-wrap">
            <span class="severity">${sev.label}</span>
            <div class="score">${item.score}</div>
          </div>
        </div>
      `;
      list.appendChild(card);
    });

    if(updated){
      const dt = new Date(data.generated_at_utc);
      updated.textContent = isNaN(dt) ? "Updated" : "Updated "+dt.toLocaleString();
    }

  }catch(e){
    list.innerHTML = `
      <div class="news-item">
        <strong>Instability data not found</strong>
        <div class="news-meta">${safeText(e.message)}</div>
      </div>
    `;
  }
}

/* -----------------------------
   TOP NEWS (JSON)
----------------------------- */
async function refreshTopNews(){
  const list = document.getElementById("topNewsList");
  const catEl = document.getElementById("newsCategory");
  const updated = document.getElementById("topNewsUpdated");

  if (!list) return;

  const category = (catEl ? catEl.value : "all").toLowerCase().trim();
  const file = `data/top_news_${category}.json?ts=${Date.now()}`;

  try {
    // show what we're loading (so you can SEE the dropdown works)
    if (updated) updated.textContent = `Loading: ${category}…`;

    list.classList.remove("is-empty");
    list.innerHTML = `
      <div class="news-item">
        <strong>Loading ${safeText(category)}…</strong>
        <div class="news-meta">${safeText(file)}</div>
      </div>
    `;

    const res = await fetch(file, { cache: "no-store" });

    if (!res.ok) {
      // no silent fallback — tell you exactly what's wrong
      throw new Error(`Missing file for "${category}": data/top_news_${category}.json (HTTP ${res.status})`);
    }

    const payload = await res.json();
    renderTopNews(payload);

    // also stamp the category in the badge so you SEE it
    if (updated) {
      const dt = payload?.generated_at_utc ? new Date(payload.generated_at_utc) : null;
      const when = (dt && !isNaN(dt)) ? dt.toLocaleString() : "Updated";
      updated.textContent = `${category.toUpperCase()} • ${when}`;
    }

  } catch (e) {
    if (updated) updated.textContent = "No data";
    list.classList.add("is-empty");
    list.innerHTML = `
      <div class="news-item">
        <strong>Top news failed</strong>
        <div class="news-meta">${safeText(e?.message || String(e))}</div>
      </div>
    `;
    console.error(e);
  }
}


/* -----------------------------
   MAP
----------------------------- */
function initMap(){
  if(!window.L) return;
  const map=L.map("worldMap").setView([15,10],2);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png").addTo(map);
}

/* -----------------------------
   DEMOCRACY TRENDS (CSV)
----------------------------- */
async function initDemocracyTrends(){
  const body = document.getElementById("demBody");
  const countrySel = document.getElementById("demCountry");
  const chartCanvas = document.getElementById("demChart");

  if(!body || !countrySel || !chartCanvas) return;

  body.innerHTML = `<div class="news-meta">Loading democracy data…</div>`;

  try{
    const url="data/VDEM_small.csv?ts="+Date.now();
    const res=await fetch(url,{cache:"no-store"});

    if(!res.ok){
      throw new Error(`CSV not found (${res.status}). Put it at data/VDEM_small.csv`);
    }

    const text=await res.text();
    const parsed=Papa.parse(text,{header:true,dynamicTyping:true});
    const rows=parsed.data.filter(r=>r.country && r.year);

    if(!rows.length){
      body.innerHTML=`<div class="news-item"><strong>No democracy data</strong></div>`;
      return;
    }

    const countries=[...new Set(rows.map(r=>r.country))].sort();
    countrySel.innerHTML=countries.map(c=>`<option>${c}</option>`).join("");
    countrySel.value=countries.includes("South Africa")?"South Africa":countries[0];

    function render(country){
      const data=rows.filter(r=>r.country===country).sort((a,b)=>a.year-b.year);
      const years=data.map(d=>d.year);

      const measures=[
        {key:"electoral_democracy_index",label:"Electoral"},
        {key:"liberal_democracy_index",label:"Liberal"},
        {key:"electoral_fairness_index",label:"Fairness"},
        {key:"vote_buying",label:"Vote Buying"},
        {key:"freedom_of_expression_index",label:"Expression"}
      ];

      const datasets=measures.map(m=>({
        label:m.label,
        data:data.map(d=>d[m.key]),
        tension:0.3
      }));

      if(window.demChart) window.demChart.destroy();

      window.demChart=new Chart(chartCanvas,{
        type:"line",
        data:{labels:years,datasets},
        options:{
          responsive:true,
          maintainAspectRatio:false,
          plugins:{legend:{labels:{color:"#fff"}}},
          scales:{
            x:{ticks:{color:"#aaa"},grid:{color:"rgba(255,255,255,0.05)"}},
            y:{ticks:{color:"#aaa"},grid:{color:"rgba(255,255,255,0.05)"}}
          }
        }
      });

      body.innerHTML="";
    }

    render(countrySel.value);
    countrySel.onchange=e=>render(e.target.value);

  }catch(e){
    body.innerHTML=`
      <div class="news-item">
        <strong>Error loading CSV</strong>
        <div class="news-meta">${safeText(e.message)}</div>
      </div>
    `;
    console.error(e);
  }
}

/* -----------------------------
   BOOT
----------------------------- */
document.addEventListener("DOMContentLoaded",()=>{
  initLiveNews();
  initInstability();
  refreshTopNews();
  initMap();
  initTopNews(); 
  initDemocracyTrends();
});

console.log("APP LOADED ✅");
