// registrer.js — Registrer levering

const SUPABASE_URL = "https://irmzonhinqvduifuzrrg.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlybXpvbmhpbnF2ZHVpZnV6cnJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NDM4NjMsImV4cCI6MjA5MTUxOTg2M30.kmCaabgHMFxiTDq30KWsCqJOtOZ-Hsc-bdYdHqrsULo";

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let brugerSession = null;

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

// --- Udfyld en <select> ---
function udfyldSelect(selectId, data, navnFelt) {
  const el = document.getElementById(selectId);
  el.innerHTML = `<option value="">Vælg...</option>`;
  if (!data || data.length === 0) {
    el.innerHTML = `<option value="">Ingen data fundet</option>`;
    return;
  }
  data.forEach((raekke) => {
    const option = document.createElement("option");
    option.value = raekke.id;
    option.textContent = raekke[navnFelt] || raekke.id;
    el.appendChild(option);
  });
}

// --- Hent alle dropdown-data ---
async function hentDropdowns() {
  const [markRes, maskineRes] = await Promise.all([
    sb.from("marker").select("id, navn").order("navn"),
    sb.from("maskiner").select("id, navn").order("navn"),
  ]);

  udfyldSelect("mark", markRes.data, "navn");
  udfyldSelect("maskine", maskineRes.data, "navn");
}

// --- Gem levering ---
async function gemLevering() {
  const fejl = document.getElementById("fejlbesked");
  const succes = document.getElementById("succesbesked");
  const knap = document.getElementById("gem-knap");

  fejl.classList.remove("synlig");
  succes.classList.remove("synlig");

  const mark_id = document.getElementById("mark").value;
  const maskine_id = document.getElementById("maskine").value;
  const vaegt = document.getElementById("vaegt").value;
  const tomvaegt = document.getElementById("tomvaegt").value;
  const vandprocent = document.getElementById("vandprocent").value;
  const noter = document.getElementById("noter").value;

  // Validering
  const mangler = [];
  if (!mark_id) mangler.push("mark");
  if (!maskine_id) mangler.push("maskine");
  if (!tomvaegt) mangler.push("tomvægt");

  if (mangler.length > 0) {
    const feltNavne = mangler.join(", ");
    fejl.textContent = `Udfyld venligst: ${feltNavne}.`;
    fejl.classList.add("synlig");
    return;
  }

  knap.disabled = true;
  knap.textContent = "Gemmer...";

  const { error } = await sb.from("registreringer").insert({
    bruger_id: brugerSession.user.id,
    mark_id: parseInt(mark_id),
    maskine_id: parseInt(maskine_id),
    total_vaegt: parseFloat(vaegt),
    tom_vaegt: parseFloat(tomvaegt),
    vandprocent: vandprocent ? parseFloat(vandprocent) : null,
    noter: noter || null,
  });

  if (error) {
    console.error(error);
    fejl.textContent = "Der opstod en fejl ved gemning. Prøv igen.";
    fejl.classList.add("synlig");
    knap.disabled = false;
    knap.textContent = "Gem levering";
    return;
  }

  succes.textContent = "✓ Leveringen er gemt!";
  succes.classList.add("synlig");
  knap.textContent = "Gemt!";

  // Nulstil formular efter 2 sekunder
  setTimeout(() => {
    document.getElementById("mark").value = "";
    document.getElementById("maskine").value = "";
    document.getElementById("vaegt").value = "0";
    document.getElementById("tomvaegt").value = "";
    document.getElementById("vandprocent").value = "0";
    document.getElementById("noter").value = "";
    knap.disabled = false;
    knap.textContent = "Gem levering";
    succes.classList.remove("synlig");
  }, 2000);
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

  await hentDropdowns();
}

document.getElementById("log-ud-knap").addEventListener("click", async () => {
  await sb.auth.signOut();
  window.location.href = "login.html";
});

saetDato();
init();
