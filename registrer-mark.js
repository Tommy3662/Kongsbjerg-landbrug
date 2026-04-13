// registrer-mark.js — Registrer markarbejde

const SUPABASE_URL = "https://irmzonhinqvduifuzrrg.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlybXpvbmhpbnF2ZHVpZnV6cnJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NDM4NjMsImV4cCI6MjA5MTUxOTg2M30.kmCaabgHMFxiTDq30KWsCqJOtOZ-Hsc-bdYdHqrsULo";

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let brugerSession = null;

// --- Dato ---
function saetDato() {
  const nu = new Date();
  const dage = ["Søndag","Mandag","Tirsdag","Onsdag","Torsdag","Fredag","Lørdag"];
  const maaneder = ["januar","februar","marts","april","maj","juni","juli","august","september","oktober","november","december"];
  const el = document.getElementById("velkomst-dato");
  if (el)
    el.textContent = `${dage[nu.getDay()]} d. ${nu.getDate()}. ${maaneder[nu.getMonth()]} ${nu.getFullYear()}`;
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

// --- Hent dropdown-data ---
async function hentDropdowns() {
  const [markRes, maskineRes, kornRes] = await Promise.all([
    sb.from("marker").select("id, navn").order("navn"),
    sb.from("maskiner").select("id, navn").order("navn"),
    sb.from("korn").select("id, korntype").order("korntype"),
  ]);

  udfyldSelect("mark", markRes.data, "navn");
  udfyldSelect("maskine", maskineRes.data, "navn");

  // Byg korn-select manuelt fordi feltet hedder "korntype" ikke "navn"
  const kornEl = document.getElementById("korn");
  kornEl.innerHTML = `<option value="">Vælg kornsort...</option>`;
  (kornRes.data ?? []).forEach((k) => {
    const opt = document.createElement("option");
    opt.value = k.id;
    opt.textContent = k.korntype;
    kornEl.appendChild(opt);
  });
}

// --- Vis/skjul korntype-felt baseret på valgt operation ---
document.getElementById("operation").addEventListener("change", (e) => {
  const val = e.target.value;
  const kornGruppe = document.getElementById("korntype-gruppe");
  kornGruppe.style.display = val === "Såning" ? "" : "none";
  if (val !== "Såning") document.getElementById("korn").value = "";
});

// --- Gem markarbejde ---
async function gemMarkarbejde() {
  const fejl = document.getElementById("fejlbesked");
  const succes = document.getElementById("succesbesked");
  const knap = document.getElementById("gem-knap");

  fejl.classList.remove("synlig");
  succes.classList.remove("synlig");

  const operation = document.getElementById("operation").value;
  const mark_id = document.getElementById("mark").value;
  const maskine_id = document.getElementById("maskine").value;
  const korn_id = document.getElementById("korn").value;
  const dato = new Date().toISOString().split("T")[0]; // altid dagens dato
  const noter = document.getElementById("noter").value.trim();

  // Validering
  const mangler = [];
  if (!operation) mangler.push("operation");
  if (!mark_id) mangler.push("mark");
  if (!maskine_id) mangler.push("maskine / traktor");
  if (operation === "Såning" && !korn_id) mangler.push("kornsort");

  if (mangler.length > 0) {
    fejl.textContent = `Udfyld venligst: ${mangler.join(", ")}.`;
    fejl.classList.add("synlig");
    return;
  }

  knap.disabled = true;
  knap.textContent = "Gemmer...";

  // 1. Indsæt i mark_operationer
  const { error: opError } = await sb.from("mark_operationer").insert({
    mark_id: parseInt(mark_id),
    operation,
    dato,
    noter: noter || null,
  });

  if (opError) {
    console.error("Fejl ved gemning af operation:", opError);
    fejl.textContent = `Fejl ved gemning: ${opError.message}`;
    fejl.classList.add("synlig");
    knap.disabled = false;
    knap.textContent = "Gem markarbejde";
    return;
  }

  // 2. Særlig logik for Såning og Høst → opdater mark_afgroeder
  const aar = new Date(dato).getFullYear();

  if (operation === "Såning" && korn_id) {
    // Upsert: opret eller opdater årets afgrøde for marken
    const { error: afgrødeError } = await sb
      .from("mark_afgroeder")
      .upsert(
        {
          mark_id: parseInt(mark_id),
          korn_id: parseInt(korn_id),
          aar,
          saed_dato: dato,
        },
        { onConflict: "mark_id,aar" }
      );

    if (afgrødeError) {
      console.warn("Kunne ikke opdatere mark_afgroeder ved såning:", afgrødeError);
      // Viser stadig succes — selve operationen er gemt
    }
  }

  if (operation === "Høst") {
    // Opdater host_dato på årets afgrøde for marken
    const { error: høstError } = await sb
      .from("mark_afgroeder")
      .update({ host_dato: dato })
      .eq("mark_id", parseInt(mark_id))
      .eq("aar", aar);

    if (høstError) {
      console.warn("Kunne ikke opdatere host_dato ved høst:", høstError);
    }
  }

  // Vis succes
  succes.textContent = `✓ ${operation} er registreret for marken!`;
  succes.classList.add("synlig");
  knap.textContent = "Gemt!";

  // Nulstil formular efter 2 sek
  setTimeout(() => {
    document.getElementById("operation").value = "";
    document.getElementById("korn").value = "";
    document.getElementById("korntype-gruppe").style.display = "none";
    document.getElementById("mark").value = "";
    document.getElementById("maskine").value = "";

    document.getElementById("noter").value = "";
    knap.disabled = false;
    knap.textContent = "Gem markarbejde";
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
  document.getElementById("bruger-avatar").textContent = navn.charAt(0).toUpperCase();
  document.getElementById("bruger-rolle").textContent = profil?.rolle || "";

  await hentDropdowns();
}

// --- Event listeners ---
document.getElementById("log-ud-knap").addEventListener("click", async () => {
  await sb.auth.signOut();
  window.location.href = "login.html";
});

document.getElementById("gem-knap").addEventListener("click", gemMarkarbejde);

saetDato();
init();
