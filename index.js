// index.js — Dashboard startside

const SUPABASE_URL = "https://irmzonhinqvduifuzrrg.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlybXpvbmhpbnF2ZHVpZnV6cnJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NDM4NjMsImV4cCI6MjA5MTUxOTg2M30.kmCaabgHMFxiTDq30KWsCqJOtOZ-Hsc-bdYdHqrsULo";

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let alleOverblikData = [];
let sorteringsKolonne = "dato";
let sorteringsRetning = "desc";

// --- Dato ---
function saetDato() {
  const nu = new Date();
  const dage = ["Søndag", "Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag"];
  const maaneder = [
    "januar", "februar", "marts", "april", "maj", "juni",
    "juli", "august", "september", "oktober", "november", "december",
  ];
  const el = document.getElementById("velkomst-dato");
  if (el) el.textContent = `${dage[nu.getDay()]} d. ${nu.getDate()}. ${maaneder[nu.getMonth()]} ${nu.getFullYear()}`;
}

// --- Formater dato til dansk ---
function formatDato(datoStr) {
  if (!datoStr) return "—";
  const d = new Date(datoStr);
  return d.toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" });
}

// --- Sorter data ---
function sorterData(data) {
  return [...data].sort((a, b) => {
    let valA, valB;
    switch (sorteringsKolonne) {
      case "dato":
        valA = new Date(a.registreret_at).getTime();
        valB = new Date(b.registreret_at).getTime();
        break;
      case "mark":
        valA = (a.marker?.navn ?? "").toLowerCase();
        valB = (b.marker?.navn ?? "").toLowerCase();
        break;
      case "korntype":
        valA = (a.korntyper?.navn ?? "").toLowerCase();
        valB = (b.korntyper?.navn ?? "").toLowerCase();
        break;
      case "vaegt":
        valA = parseFloat(a.vaegt) || 0;
        valB = parseFloat(b.vaegt) || 0;
        break;
      case "vandprocent":
        valA = parseFloat(a.vandprocent) ?? -1;
        valB = parseFloat(b.vandprocent) ?? -1;
        break;
      default:
        return 0;
    }
    if (valA < valB) return sorteringsRetning === "asc" ? -1 : 1;
    if (valA > valB) return sorteringsRetning === "asc" ? 1 : -1;
    return 0;
  });
}

// --- Opdater header-pile ---
function opdaterSortHeaders() {
  document.querySelectorAll(".data-tabel th.sorterbar").forEach((th) => {
    th.classList.remove("aktiv-asc", "aktiv-desc");
    if (th.dataset.sort === sorteringsKolonne) {
      th.classList.add(sorteringsRetning === "asc" ? "aktiv-asc" : "aktiv-desc");
    }
  });
}

// --- Udfyld mark-filter dropdown ---
function udfyldMarkFilter(data) {
  const select = document.getElementById("mark-filter");
  const unikkeMarker = [...new Map(
    data
      .filter((r) => r.marker?.id)
      .map((r) => [r.marker.id, r.marker])
  ).values()].sort((a, b) => a.navn.localeCompare(b.navn, "da"));

  // Behold valgt mark hvis muligt
  const tidligereValg = select.value;
  select.innerHTML = `<option value="">Alle marker</option>`;
  unikkeMarker.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.navn;
    if (String(m.id) === tidligereValg) opt.selected = true;
    select.appendChild(opt);
  });
}

// --- Opdater statistik baseret på filtreret data ---
function opdaterStatistik(data) {
  if (!data || data.length === 0) {
    document.getElementById("stat-leveringer").textContent = "0";
    document.getElementById("stat-vaegt").textContent = "0";
    document.getElementById("stat-marker").textContent = "0";
    document.getElementById("stat-seneste").textContent = "—";
    return;
  }

  const sorteret = [...data].sort((a, b) =>
    new Date(b.registreret_at) - new Date(a.registreret_at)
  );

  const totalVaegt = data.reduce((sum, r) => sum + (parseFloat(r.vaegt) || 0), 0);
  const unikkeMarker = new Set(data.map((r) => r.marker?.id).filter(Boolean)).size;

  document.getElementById("stat-leveringer").textContent = data.length;
  document.getElementById("stat-vaegt").textContent = (totalVaegt / 1000).toLocaleString("da-DK", { maximumFractionDigits: 1 });
  document.getElementById("stat-marker").textContent = unikkeMarker;
  document.getElementById("stat-seneste").textContent = formatDato(sorteret[0].registreret_at);
}

// --- Vis tabel ---
function visTabel(data) {
  const sorteret = sorterData(data).slice(0, 5);
  document.getElementById("seneste-tbody").innerHTML = sorteret.length === 0
    ? `<tr><td colspan="5" class="tabel-tom">Ingen leveringer for denne mark.</td></tr>`
    : sorteret.map((r) => `
        <tr>
          <td>${formatDato(r.registreret_at)}</td>
          <td>${r.marker?.navn ?? "—"}</td>
          <td>${r.korntyper?.navn ?? "—"}</td>
          <td>${r.vaegt != null ? Number(r.vaegt).toLocaleString("da-DK") + " kg" : "—"}</td>
          <td>${r.vandprocent != null ? r.vandprocent + " %" : "—"}</td>
        </tr>
      `).join("");
  opdaterSortHeaders();
}

// --- Anvend filter og opdater alt ---
function anvendFilter() {
  const valgId = document.getElementById("mark-filter").value;
  const filtreret = valgId
    ? alleOverblikData.filter((r) => String(r.marker?.id) === valgId)
    : alleOverblikData;

  opdaterStatistik(filtreret);
  visTabel(filtreret);
}

// --- Hent statistik og seneste leveringer ---
async function hentOverblik() {
  // Hent alle leveringer med join på korntyper og marker
  const { data, error } = await sb
    .from("registreringer")
    .select(`
      id,
      registreret_at,
      vaegt,
      vandprocent,
      korntyper(navn),
      marker(id, navn),
      maskiner(navn)
    `)
    .order("registreret_at", { ascending: false });

  if (error) {
    console.error("Fejl ved hentning:", error);
    return;
  }

  if (!data || data.length === 0) {
    opdaterStatistik([]);
    document.getElementById("seneste-tbody").innerHTML = `
      <tr><td colspan="5" class="tabel-tom">Ingen leveringer endnu. <a href="registrer.html">Registrer din første →</a></td></tr>
    `;
    return;
  }

  alleOverblikData = data;
  udfyldMarkFilter(data);
  anvendFilter();
}

// --- Bruger ---
async function indlaesbruger() {
  const { data: sessionData } = await sb.auth.getSession();

  if (!sessionData.session) {
    window.location.href = "login.html";
    return;
  }

  const bruger = sessionData.session.user;

  const { data: profil } = await sb
    .from("profiles")
    .select("navn")
    .eq("id", bruger.id)
    .single();

  const navn = profil?.navn || bruger.email.split("@")[0];
  const forbogstav = navn.charAt(0).toUpperCase();

  document.getElementById("velkomst-navn").textContent = navn;
  document.getElementById("bruger-navn").textContent = navn;
  document.getElementById("bruger-avatar").textContent = forbogstav;
}

// --- Log ud ---
document.getElementById("log-ud-knap").addEventListener("click", async () => {
  await sb.auth.signOut();
  window.location.href = "login.html";
});

// --- Mark-filter ---
document.getElementById("mark-filter").addEventListener("change", anvendFilter);

// --- Sortering ved klik på headers ---
document.querySelectorAll(".data-tabel th.sorterbar").forEach((th) => {
  th.addEventListener("click", () => {
    const kolonne = th.dataset.sort;
    if (sorteringsKolonne === kolonne) {
      sorteringsRetning = sorteringsRetning === "asc" ? "desc" : "asc";
    } else {
      sorteringsKolonne = kolonne;
      sorteringsRetning = "asc";
    }
    anvendFilter();
  });
});

// --- Start ---
saetDato();
indlaesbruger();
hentOverblik();
