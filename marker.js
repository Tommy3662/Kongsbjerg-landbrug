// marker.js

const SUPABASE_URL = "https://irmzonhinqvduifuzrrg.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlybXpvbmhpbnF2ZHVpZnV6cnJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NDM4NjMsImV4cCI6MjA5MTUxOTg2M30.kmCaabgHMFxiTDq30KWsCqJOtOZ-Hsc-bdYdHqrsULo";

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Kort-instanser
let overbliksKort = null;
let tegneKort = null;
let tegneLayer = null;
let tegnedPolygon = null; // Den aktuelle tegnede polygon i modalen

// Data
let alleMarker = [];
let markerPolygonLayers = {}; // mark id -> Leaflet layer på overblikskortet

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

// --- Tile-lag definitioner ---
// Satellit med bynavne oven på (hybrid)
const satellit = () =>
  L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { attribution: "© Esri, Maxar, Earthstar Geographics", maxZoom: 19 }
  );
const bynavne = () =>
  L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
    { attribution: "", maxZoom: 19, pane: "shadowPane" }
  );
const gadekort = () =>
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap",
    maxZoom: 19,
  });

function tilfoejLagskifter(kortInstans) {
  const satLag = satellit().addTo(kortInstans);
  const navnLag = bynavne().addTo(kortInstans);
  const gadeLag = gadekort();

  // Vis/skjul bynavne når man skifter til gadekort
  kortInstans.on("baselayerchange", (e) => {
    if (e.name === "Gadekort") {
      kortInstans.removeLayer(navnLag);
    } else {
      navnLag.addTo(kortInstans);
    }
  });

  L.control
    .layers(
      { Satellit: satLag, Gadekort: gadeLag },
      {},
      { position: "topright" }
    )
    .addTo(kortInstans);
}

// --- Initialiser overblikskort ---
function initOverbliksKort() {
  if (overbliksKort) return;
  overbliksKort = L.map("marker-kort").setView([56.0, 10.0], 7);
  tilfoejLagskifter(overbliksKort);
}

// --- Initialiser tegnekort i modal ---
function initTegneKort() {
  if (tegneKort) {
    tegneKort.remove();
    tegneKort = null;
    tegneLayer = null;
    tegnedPolygon = null;
  }

  setTimeout(() => {
    tegneKort = L.map("tegne-kort").setView([56.0, 10.0], 7);
    tilfoejLagskifter(tegneKort);

    tegneLayer = new L.FeatureGroup();
    tegneKort.addLayer(tegneLayer);

    const drawControl = new L.Control.Draw({
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: true,
          shapeOptions: {
            color: "#D4FF6A",
            fillColor: "#D4FF6A",
            fillOpacity: 0.4,
          },
        },
        polyline: false,
        rectangle: false,
        circle: false,
        circlemarker: false,
        marker: false,
      },
      edit: {
        featureGroup: tegneLayer,
        remove: true,
      },
    });
    tegneKort.addControl(drawControl);

    tegneKort.on(L.Draw.Event.CREATED, (e) => {
      if (tegnedPolygon) tegneLayer.removeLayer(tegnedPolygon);
      tegnedPolygon = e.layer;
      tegneLayer.addLayer(tegnedPolygon);
      document.getElementById("kort-hjaelp").style.display = "none";
    });

    tegneKort.on(L.Draw.Event.DELETED, () => {
      tegnedPolygon = null;
      document.getElementById("kort-hjaelp").style.display = "";
    });

    tegneKort.invalidateSize();
  }, 100);
}

// --- Indlæs eksisterende polygon til tegnekort ---
function indlaesPolygonPaaTegneKort(rawPolygon) {
  if (!tegneKort || !rawPolygon) return;
  const geojson = normaliserePolygon(rawPolygon);
  if (!geojson) {
    console.error("Kunne ikke normalisere polygon til tegnekort:", rawPolygon);
    return;
  }
  try {
    const layer = L.geoJSON(geojson, {
      style: { color: "#D4FF6A", fillColor: "#D4FF6A", fillOpacity: 0.4 },
    });
    layer.eachLayer((l) => {
      tegneLayer.addLayer(l);
      tegnedPolygon = l;
    });
    const b = layer.getBounds();
    if (b.isValid()) {
      tegneKort.fitBounds(b, { padding: [30, 30] });
    }
    document.getElementById("kort-hjaelp").style.display = "none";
  } catch (e) {
    console.error("Kunne ikke indlæse polygon:", e, geojson);
  }
}

// --- Vis alle marker på overblikskortet ---
function visMarkerPaaKort(marker) {
  // Ryd eksisterende lag
  Object.values(markerPolygonLayers).forEach((l) =>
    overbliksKort.removeLayer(l)
  );
  markerPolygonLayers = {};

  const bounds = [];

  marker.forEach((m) => {
    if (!m.polygon) return;
    const geojson = normaliserePolygon(m.polygon);
    if (!geojson) {
      console.warn(
        `Mark "${m.navn}": polygon-format ikke understøttet`,
        m.polygon
      );
      return;
    }
    try {
      const layer = L.geoJSON(geojson, {
        style: {
          color: "#D4FF6A",
          fillColor: "#D4FF6A",
          fillOpacity: 0.35,
          weight: 2,
        },
      }).addTo(overbliksKort);

      layer.bindTooltip(m.navn, { permanent: false, direction: "center" });
      markerPolygonLayers[m.id] = layer;

      layer.eachLayer((l) => {
        if (l.getBounds) bounds.push(l.getBounds());
      });
    } catch (e) {
      console.error(
        `Polygon for mark "${m.navn}" kunne ikke vises:`,
        e,
        geojson
      );
    }
  });

  if (bounds.length > 0) {
    const combined = bounds.reduce((acc, b) => acc.extend(b));
    overbliksKort.fitBounds(combined, { padding: [30, 30] });
  }
}

// --- Vis liste over marker ---
function visMarkerliste(marker) {
  const liste = document.getElementById("marker-liste");
  document.getElementById("antal-marker").textContent = `${marker.length} mark${
    marker.length !== 1 ? "er" : ""
  }`;

  if (marker.length === 0) {
    liste.innerHTML = `<p class="tabel-tom" style="padding:24px">Ingen marker endnu. Opret din første mark.</p>`;
    return;
  }

  liste.innerHTML = marker
    .map(
      (m) => `
    <div class="mark-kort" data-id="${m.id}">
      <div class="mark-kort-info">
        <span class="mark-kort-navn">${m.navn}</span>
        <span class="mark-kort-meta">
          ${
            m.storrelse_ha
              ? `${Number(m.storrelse_ha).toLocaleString("da-DK", {
                  maximumFractionDigits: 1,
                })} ha`
              : "Størrelse ikke beregnet"
          }
        </span>
      </div>
      <button class="info-knap mark-info" data-id="${m.id}">Info</button>
    </div>
  `
    )
    .join("");

  // Klik på mark-kort eller info-knap → vis mark-info
  liste.querySelectorAll(".mark-kort").forEach((el) => {
    el.addEventListener("click", () => {
      const mark = alleMarker.find((m) => m.id === parseInt(el.dataset.id));
      if (mark) visMarkInfo(mark);
    });
  });
}

// --- Vis info for en enkelt mark i højre panel ---
async function visMarkInfo(mark) {
  const aar = new Date().getFullYear();

  // Opdater header
  document.getElementById("kort-titel").textContent = mark.navn;
  document.getElementById("tilbage-knap").style.display = "";
  document.getElementById("mark-info-panel").style.display = "";

  // Reducer kortet lidt når info vises over det
  document.getElementById("marker-kort").style.height = "300px";

  // Fremhæv valgt mark på kortet og zoom til den
  Object.entries(markerPolygonLayers).forEach(([id, layer]) => {
    const erValgt = parseInt(id) === mark.id;
    layer.setStyle({
      color: erValgt ? "#c8860a" : "#4a5c2f",
      fillColor: erValgt ? "#c8860a" : "#4a5c2f",
      fillOpacity: erValgt ? 0.5 : 0.15,
      weight: erValgt ? 3 : 2,
    });
  });
  const valgtLayer = markerPolygonLayers[mark.id];
  if (valgtLayer) overbliksKort.fitBounds(valgtLayer.getBounds(), { padding: [40, 40] });
  overbliksKort.invalidateSize();

  // Hent kornsort for i år fra mark_afgroeder
  const { data: afgrøde } = await sb
    .from("mark_afgroeder")
    .select("korn(korntype)")
    .eq("mark_id", mark.id)
    .eq("aar", aar)
    .maybeSingle();

  document.getElementById("mark-info-korn").textContent =
    afgrøde?.korn?.korntype ?? "Ikke registreret";

  // Hent markoperationer for i år
  const { data: operationer } = await sb
    .from("mark_operationer")
    .select("dato, operation, noter")
    .eq("mark_id", mark.id)
    .gte("dato", `${aar}-01-01`)
    .lte("dato", `${aar}-12-31`)
    .order("dato", { ascending: false });

  const tbody = document.getElementById("operationer-tbody");
  if (!operationer || operationer.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="tabel-tom">Ingen operationer registreret for ${aar}.</td></tr>`;
  } else {
    tbody.innerHTML = operationer
      .map(
        (o) => `
        <tr>
          <td>${o.dato ? new Date(o.dato).toLocaleDateString("da-DK", { day: "numeric", month: "short" }) : "—"}</td>
          <td>${o.operation ?? "—"}</td>
          <td>${o.noter ?? "—"}</td>
        </tr>
      `
      )
      .join("");
  }
}

// --- Tilbage til overblik (alle marker) ---
function visOverblikVisning() {
  document.getElementById("kort-titel").textContent = "Overblik";
  document.getElementById("tilbage-knap").style.display = "none";
  document.getElementById("mark-info-panel").style.display = "none";
  document.getElementById("marker-kort").style.height = "";

  // Nulstil alle polygon-farver
  Object.values(markerPolygonLayers).forEach((layer) => {
    layer.setStyle({
      color: "#4a5c2f",
      fillColor: "#4a5c2f",
      fillOpacity: 0.35,
      weight: 2,
    });
  });

  // Zoom til alle marker
  const allBounds = Object.values(markerPolygonLayers)
    .map((l) => { try { return l.getBounds(); } catch { return null; } })
    .filter(Boolean);
  if (allBounds.length > 0) {
    overbliksKort.fitBounds(
      allBounds.reduce((acc, b) => acc.extend(b)),
      { padding: [30, 30] }
    );
  }
  overbliksKort.invalidateSize();
}

// --- WKB hex → GeoJSON (Supabase returnerer PostGIS geometry som EWKB hex) ---
function wkbHexTilGeoJSON(hex) {
  try {
    const buf = new Uint8Array(hex.match(/.{2}/g).map((b) => parseInt(b, 16)));
    const view = new DataView(buf.buffer);
    let offset = 0;

    const le = view.getUint8(offset++) === 1; // byte order: 1 = little endian
    const geomType = view.getUint32(offset, le);
    offset += 4;

    if (geomType & 0x20000000) offset += 4; // har SRID – spring over
    const baseType = geomType & 0xffff;

    if (baseType === 3) {
      // Polygon
      const numRings = view.getUint32(offset, le);
      offset += 4;
      const rings = [];
      for (let r = 0; r < numRings; r++) {
        const numPts = view.getUint32(offset, le);
        offset += 4;
        const ring = [];
        for (let p = 0; p < numPts; p++) {
          const x = view.getFloat64(offset, le);
          offset += 8;
          const y = view.getFloat64(offset, le);
          offset += 8;
          ring.push([x, y]);
        }
        rings.push(ring);
      }
      return { type: "Polygon", coordinates: rings };
    }

    if (baseType === 6) {
      // MultiPolygon
      const numPolygons = view.getUint32(offset, le);
      offset += 4;
      const polygons = [];
      for (let i = 0; i < numPolygons; i++) {
        offset += 1; // byte order per polygon
        const subType = view.getUint32(offset, le);
        offset += 4;
        if (subType & 0x20000000) offset += 4;
        const numRings = view.getUint32(offset, le);
        offset += 4;
        const rings = [];
        for (let r = 0; r < numRings; r++) {
          const numPts = view.getUint32(offset, le);
          offset += 4;
          const ring = [];
          for (let p = 0; p < numPts; p++) {
            const x = view.getFloat64(offset, le);
            offset += 8;
            const y = view.getFloat64(offset, le);
            offset += 8;
            ring.push([x, y]);
          }
          rings.push(ring);
        }
        polygons.push(rings);
      }
      return { type: "MultiPolygon", coordinates: polygons };
    }

    console.warn("WKB baseType ikke understøttet:", baseType);
    return null;
  } catch (e) {
    console.error("WKB parsing fejl:", e);
    return null;
  }
}

// --- Hjælpefunktion: normaliser polygon-data fra Supabase ---
function normaliserePolygon(raw) {
  if (!raw) return null;

  // WKB hex: hexadecimal string (Supabase returnerer PostGIS geography sådan)
  if (typeof raw === "string" && /^[0-9A-Fa-f]+$/.test(raw)) {
    return wkbHexTilGeoJSON(raw);
  }

  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (
      obj.type === "Feature" ||
      obj.type === "Polygon" ||
      obj.type === "MultiPolygon" ||
      obj.type === "FeatureCollection"
    ) {
      return obj;
    }
    console.warn("Ukendt polygon-format:", obj);
    return null;
  } catch (e) {
    console.error("Kunne ikke parse polygon:", e, raw);
    return null;
  }
}

// --- Hent marker ---
async function hentMarker() {
  const { data, error } = await sb
    .from("marker")
    .select("id, navn, storrelse_ha, polygon")
    .order("navn");

  if (error) {
    console.error(error);
    document.getElementById(
      "marker-liste"
    ).innerHTML = `<p class="tabel-tom" style="padding:24px">Kunne ikke hente marker.</p>`;
    return;
  }

  console.log("Marker hentet fra Supabase:", data);

  alleMarker = data ?? [];
  visMarkerliste(alleMarker);
  visMarkerPaaKort(alleMarker);
}

// --- Åbn modal (opret) ---
function aabneOpret() {
  document.getElementById("rediger-mark-id").value = "";
  document.getElementById("mark-navn").value = "";
  document.getElementById("modal-titel").textContent = "Opret ny mark";
  document.getElementById("kort-hjaelp").style.display = "";
  document.getElementById("modal-fejl").classList.remove("synlig");
  document.getElementById("modal-succes").classList.remove("synlig");
  document.getElementById("gem-mark-knap").textContent = "Gem mark";
  document.getElementById("gem-mark-knap").disabled = false;
  document.getElementById("modal-overlay").classList.add("synlig");
  initTegneKort();
}

// --- Åbn modal (rediger) ---
function aabneRediger(mark) {
  document.getElementById("rediger-mark-id").value = mark.id;
  document.getElementById("mark-navn").value = mark.navn ?? "";
  document.getElementById("modal-titel").textContent = "Rediger mark";
  document.getElementById("modal-fejl").classList.remove("synlig");
  document.getElementById("modal-succes").classList.remove("synlig");
  document.getElementById("gem-mark-knap").textContent = "Gem ændringer";
  document.getElementById("gem-mark-knap").disabled = false;
  document.getElementById("modal-overlay").classList.add("synlig");

  initTegneKort();

  // Indlæs eksisterende polygon efter kort er initialiseret
  if (mark.polygon) {
    setTimeout(() => {
      indlaesPolygonPaaTegneKort(mark.polygon);
    }, 400);
  }
}

// --- Luk modal ---
function lukModal() {
  document.getElementById("modal-overlay").classList.remove("synlig");
}

// --- Konverter GeoJSON til WKT (SRID=4326) til PostGIS ---
function geojsonTilWkt(geojson) {
  const coords = geojson.geometry
    ? geojson.geometry.coordinates[0]
    : geojson.coordinates[0];
  const punkter = coords.map(([lng, lat]) => `${lng} ${lat}`).join(", ");
  return `SRID=4326;POLYGON((${punkter}))`;
}

// --- Beregn areal i hektar fra GeoJSON polygon ---
function beregnHektar(geojson) {
  try {
    const coords = geojson.geometry
      ? geojson.geometry.coordinates[0]
      : geojson.coordinates[0];

    // Shoelace-formel på sfæriske koordinater (approksimation)
    const R = 6371000;
    let areal = 0;
    for (let i = 0; i < coords.length - 1; i++) {
      const [lon1, lat1] = coords[i];
      const [lon2, lat2] = coords[i + 1];
      const phi1 = (lat1 * Math.PI) / 180;
      const phi2 = (lat2 * Math.PI) / 180;
      const dLon = ((lon2 - lon1) * Math.PI) / 180;
      areal += dLon * (2 + Math.sin(phi1) + Math.sin(phi2));
    }
    areal = Math.abs((areal * R * R) / 2);
    return parseFloat((areal / 10000).toFixed(2)); // m² → ha
  } catch {
    return null;
  }
}

// --- Gem mark ---
async function gemMark() {
  const fejl = document.getElementById("modal-fejl");
  const succes = document.getElementById("modal-succes");
  const knap = document.getElementById("gem-mark-knap");

  fejl.classList.remove("synlig");
  succes.classList.remove("synlig");

  const id = document.getElementById("rediger-mark-id").value;
  const navn = document.getElementById("mark-navn").value.trim();

  const mangler = [];
  if (!navn) mangler.push("marknavn");
  if (!tegnedPolygon) mangler.push("polygon (tegn marken på kortet)");

  if (mangler.length > 0) {
    fejl.textContent = `Udfyld venligst: ${mangler.join(", ")}.`;
    fejl.classList.add("synlig");
    return;
  }

  knap.disabled = true;
  knap.textContent = "Gemmer...";

  // Konverter polygon til WKT for PostGIS
  const geojson = tegnedPolygon.toGeoJSON();
  const storrelse_ha = beregnHektar(geojson.geometry ?? geojson);
  const wkt = geojsonTilWkt(geojson);

  const payload = {
    navn,
    polygon: wkt,
    storrelse_ha,
  };

  let error;
  if (id) {
    // Opdater
    ({ error } = await sb.from("marker").update(payload).eq("id", id));
  } else {
    // Indsæt
    ({ error } = await sb.from("marker").insert(payload));
  }

  if (error) {
    console.error(error);
    fejl.textContent = `Fejl ved gemning: ${error.message}`;
    fejl.classList.add("synlig");
    knap.disabled = false;
    knap.textContent = id ? "Gem ændringer" : "Gem mark";
    return;
  }

  succes.textContent = `✓ Marken er ${id ? "opdateret" : "oprettet"}!`;
  succes.classList.add("synlig");
  knap.textContent = "Gemt!";

  setTimeout(async () => {
    lukModal();
    await hentMarker();
    knap.disabled = false;
    knap.textContent = id ? "Gem ændringer" : "Gem mark";
  }, 1200);
}

// --- Init ---
async function init() {
  const { data: sessionData } = await sb.auth.getSession();
  if (!sessionData.session) {
    window.location.href = "login.html";
    return;
  }

  const { data: profil } = await sb
    .from("profiles")
    .select("navn, rolle")
    .eq("id", sessionData.session.user.id)
    .single();

  const navn = profil?.navn || sessionData.session.user.email.split("@")[0];
  document.getElementById("bruger-navn").textContent = navn;
  document.getElementById("bruger-avatar").textContent = navn
    .charAt(0)
    .toUpperCase();
  document.getElementById("bruger-rolle").textContent = profil?.rolle || "";

  initOverbliksKort();
  await hentMarker();
}

// --- Event listeners ---
document.getElementById("log-ud-knap").addEventListener("click", async () => {
  await sb.auth.signOut();
  window.location.href = "login.html";
});
document.getElementById("ny-mark-knap").addEventListener("click", aabneOpret);
document.getElementById("tilbage-knap").addEventListener("click", visOverblikVisning);
document.getElementById("gem-mark-knap").addEventListener("click", gemMark);
document.getElementById("modal-luk").addEventListener("click", lukModal);
document.getElementById("modal-annuller").addEventListener("click", lukModal);
document.getElementById("modal-overlay").addEventListener("click", (e) => {
  if (e.target === document.getElementById("modal-overlay")) lukModal();
});

saetDato();
init();
