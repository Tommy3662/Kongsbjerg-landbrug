// mine-leveringer.js

const SUPABASE_URL = "https://irmzonhinqvduifuzrrg.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlybXpvbmhpbnF2ZHVpZnV6cnJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NDM4NjMsImV4cCI6MjA5MTUxOTg2M30.kmCaabgHMFxiTDq30KWsCqJOtOZ-Hsc-bdYdHqrsULo";

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let brugerSession = null;
let alleMarker = [];
let alleMaskiner = [];
let kornLookup = {};

// Gemmer alle hentede leveringer så vi kan slå dem op ved klik
let leveringerData = {};
let alleLeveringer = [];
let sorteringsKolonne = "dato";
let sorteringsRetning = "desc";

// --- Dato ---
function saetDato() {
  const nu = new Date();
  const dage = [
    "Søndag",
    "Mandag",
    "Tirsdag",
    "Onsdag",
    "Torsdag",
    "Fredag",
    "Lørdag",
  ];
  const maaneder = [
    "januar",
    "februar",
    "marts",
    "april",
    "maj",
    "juni",
    "juli",
    "august",
    "september",
    "oktober",
    "november",
    "december",
  ];
  const el = document.getElementById("velkomst-dato");
  if (el)
    el.textContent = `${dage[nu.getDay()]} d. ${nu.getDate()}. ${
      maaneder[nu.getMonth()]
    } ${nu.getFullYear()}`;
}

// --- Formater dato til dansk visning ---
function formatDato(datoStr) {
  if (!datoStr) return "—";
  const d = new Date(datoStr);
  return d.toLocaleDateString("da-DK", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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
      case "korntype":
        valA = (a.korntype ?? "").toLowerCase();
        valB = (b.korntype ?? "").toLowerCase();
        break;
      case "mark":
        valA = (a.marker?.navn ?? "").toLowerCase();
        valB = (b.marker?.navn ?? "").toLowerCase();
        break;
      case "maskine":
        valA = (a.maskiner?.navn ?? "").toLowerCase();
        valB = (b.maskiner?.navn ?? "").toLowerCase();
        break;
      case "korn_vaegt":
        valA = parseFloat(a.korn_vaegt) || 0;
        valB = parseFloat(b.korn_vaegt) || 0;
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
      th.classList.add(
        sorteringsRetning === "asc" ? "aktiv-asc" : "aktiv-desc"
      );
    }
  });
}

// --- Vis leveringer i tabel ---
function visTabel(data) {
  const tbody = document.getElementById("leveringer-tbody");
  const sorteret = sorterData(data);

  tbody.innerHTML = sorteret
    .map(
      (r) => `
    <tr>
      <td>${formatDato(r.registreret_at)}</td>
      <td>${r.korntype ?? "—"}</td>
      <td>${r.marker?.navn ?? "—"}</td>
      <td>${r.maskiner?.navn ?? "—"}</td>
      <td>${
        r.korn_vaegt != null
          ? Number(r.korn_vaegt).toLocaleString("da-DK")
          : "—"
      }</td>
      <td>${r.vandprocent != null ? r.vandprocent + " %" : "—"}</td>
      <td>
        <button class="rediger-knap" data-id="${r.id}">Rediger</button>
      </td>
    </tr>
  `
    )
    .join("");

  tbody.querySelectorAll(".rediger-knap").forEach((knap) => {
    knap.addEventListener("click", () => {
      const levering = leveringerData[knap.dataset.id];
      if (levering) aabneRediger(levering);
    });
  });

  opdaterSortHeaders();
}

// --- Byg korntype-lookup fra mark_afgroeder (mark_id + år → korntype) ---
async function hentKornLookup() {
  const { data } = await sb
    .from("mark_afgroeder")
    .select("mark_id, aar, korn(korntype)");
  const lookup = {};
  (data ?? []).forEach((a) => {
    if (!lookup[a.mark_id]) lookup[a.mark_id] = {};
    lookup[a.mark_id][a.aar] = a.korn?.korntype ?? null;
  });
  return lookup;
}

function kornFraLookup(lookup, mark_id, registreret_at) {
  if (!mark_id || !lookup[mark_id]) return null;
  const aar = new Date(registreret_at).getFullYear();
  return lookup[mark_id][aar] ?? null;
}

// --- Hent og vis leveringer ---
async function hentLeveringer() {
  const tbody = document.getElementById("leveringer-tbody");

  const { data, error } = await sb
    .from("registreringer")
    .select(
      `id, registreret_at, mark_id, total_vaegt, tom_vaegt, korn_vaegt, vandprocent, noter,
       marker:mark_id(id, navn), maskiner:maskine_id(navn)`
    )
    .eq("bruger_id", brugerSession.user.id);

  if (error) {
    console.error(error);
    tbody.innerHTML = `<tr><td colspan="7" class="tabel-tom">Kunne ikke hente leveringer.</td></tr>`;
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="tabel-tom">Ingen leveringer endnu. <a href="registrer.html">Registrer din første →</a></td></tr>`;
    document.getElementById("antal-tekst").textContent = "0 leveringer";
    return;
  }

  // Berig med korntype fra mark_afgroeder-lookup
  data.forEach((r) => {
    r.korntype = kornFraLookup(kornLookup, r.mark_id, r.registreret_at);
  });

  leveringerData = {};
  alleLeveringer = data;
  data.forEach((r) => {
    leveringerData[r.id] = r;
  });

  document.getElementById("antal-tekst").textContent = `${
    data.length
  } levering${data.length !== 1 ? "er" : ""}`;

  visTabel(alleLeveringer);
}

// --- Udfyld select i modal ---
function udfyldModalSelect(selectId, data, valgId) {
  const el = document.getElementById(selectId);
  el.innerHTML = `<option value="">Vælg...</option>`;
  data.forEach((r) => {
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = r.navn;
    if (String(r.id) === String(valgId)) opt.selected = true;
    el.appendChild(opt);
  });
}

// --- Åbn rediger-modal ---
function aabneRediger(levering) {
  document.getElementById("rediger-id").value = levering.id;
  document.getElementById("rediger-vaegt").value = levering.total_vaegt ?? "";
  document.getElementById("rediger-tomvaegt").value = levering.tom_vaegt ?? "";
  document.getElementById("rediger-vandprocent").value =
    levering.vandprocent ?? "";
  document.getElementById("rediger-noter").value = levering.noter ?? "";

  udfyldModalSelect("rediger-mark", alleMarker, levering.marker?.id);
  udfyldModalSelect("rediger-maskine", alleMaskiner, levering.maskiner?.id);

  document.getElementById("modal-fejl").classList.remove("synlig");
  document.getElementById("modal-succes").classList.remove("synlig");
  document.getElementById("gem-rediger-knap").disabled = false;
  document.getElementById("gem-rediger-knap").textContent = "Gem ændringer";
  document.getElementById("modal-overlay").classList.add("synlig");
}

// --- Luk modal ---
function lukModal() {
  document.getElementById("modal-overlay").classList.remove("synlig");
}

// --- Gem redigering ---
async function gemRedigering() {
  const fejl = document.getElementById("modal-fejl");
  const succes = document.getElementById("modal-succes");
  const knap = document.getElementById("gem-rediger-knap");

  fejl.classList.remove("synlig");
  succes.classList.remove("synlig");

  const id = document.getElementById("rediger-id").value;
  const mark_id = document.getElementById("rediger-mark").value;
  const maskine_id = document.getElementById("rediger-maskine").value;
  const vaegt = document.getElementById("rediger-vaegt").value;
  const tomvaegt = document.getElementById("rediger-tomvaegt").value;
  const vandprocent = document.getElementById("rediger-vandprocent").value;
  const noter = document.getElementById("rediger-noter").value;

  const mangler = [];
  if (!mark_id) mangler.push("mark");
  if (!maskine_id) mangler.push("maskine");
  if (!tomvaegt) mangler.push("tomvægt");

  if (mangler.length > 0) {
    fejl.textContent = `Udfyld venligst: ${mangler.join(", ")}.`;
    fejl.classList.add("synlig");
    return;
  }

  knap.disabled = true;
  knap.textContent = "Gemmer...";

  const { data: opdateret, error } = await sb
    .from("registreringer")
    .update({
      mark_id: parseInt(mark_id),
      maskine_id: parseInt(maskine_id),
      total_vaegt: parseFloat(vaegt),
      tom_vaegt: parseFloat(tomvaegt),
      vandprocent: vandprocent ? parseFloat(vandprocent) : null,
      noter: noter || null,
    })
    .eq("id", id)
    .eq("bruger_id", brugerSession.user.id)
    .select();

  if (error) {
    console.error("Supabase fejl:", error);
    fejl.textContent = `Fejl ved gemning: ${error.message}`;
    fejl.classList.add("synlig");
    knap.disabled = false;
    knap.textContent = "Gem ændringer";
    return;
  }

  if (!opdateret || opdateret.length === 0) {
    console.error("Ingen rækker opdateret — tjek RLS-politik i Supabase");
    fejl.textContent =
      "Ændringen blev ikke gemt. Du har muligvis ikke adgang til at redigere denne levering.";
    fejl.classList.add("synlig");
    knap.disabled = false;
    knap.textContent = "Gem ændringer";
    return;
  }

  succes.textContent = "✓ Ændringerne er gemt!";
  succes.classList.add("synlig");
  knap.textContent = "Gemt!";

  setTimeout(async () => {
    lukModal();
    await hentLeveringer();
  }, 1200);
}

// --- Init ---
async function init() {
  const { data: sessionData } = await sb.auth.getSession();
  if (!sessionData.session) {
    window.location.href = "login.html";
    return;
  }
  brugerSession = sessionData.session;

  const { data: profil } = await sb
    .from("profiles")
    .select("navn, rolle")
    .eq("id", brugerSession.user.id)
    .single();

  const navn = profil?.navn || brugerSession.user.email.split("@")[0];
  document.getElementById("bruger-navn").textContent = navn;
  document.getElementById("bruger-avatar").textContent = navn
    .charAt(0)
    .toUpperCase();
  document.getElementById("bruger-rolle").textContent = profil?.rolle || "";

  const [markRes, maskineRes, lookup] = await Promise.all([
    sb.from("marker").select("id, navn").order("navn"),
    sb.from("maskiner").select("id, navn").order("navn"),
    hentKornLookup(),
  ]);

  alleMarker = markRes.data ?? [];
  alleMaskiner = maskineRes.data ?? [];
  kornLookup = lookup;

  await hentLeveringer();
}

// --- Event listeners ---
document.getElementById("log-ud-knap").addEventListener("click", async () => {
  await sb.auth.signOut();
  window.location.href = "login.html";
});
document.getElementById("modal-luk").addEventListener("click", lukModal);
document.getElementById("modal-annuller").addEventListener("click", lukModal);
document.getElementById("modal-overlay").addEventListener("click", (e) => {
  if (e.target === document.getElementById("modal-overlay")) lukModal();
});
document
  .getElementById("gem-rediger-knap")
  .addEventListener("click", gemRedigering);

// Sortering ved klik på kolonneheaders
document.querySelectorAll(".data-tabel th.sorterbar").forEach((th) => {
  th.addEventListener("click", () => {
    const kolonne = th.dataset.sort;
    if (sorteringsKolonne === kolonne) {
      sorteringsRetning = sorteringsRetning === "asc" ? "desc" : "asc";
    } else {
      sorteringsKolonne = kolonne;
      sorteringsRetning = "asc";
    }
    visTabel(alleLeveringer);
  });
});

saetDato();
init();
