const SUPABASE_URL = "https://irmzonhinqvduifuzrrg.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlybXpvbmhpbnF2ZHVpZnV6cnJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NDM4NjMsImV4cCI6MjA5MTUxOTg2M30.kmCaabgHMFxiTDq30KWsCqJOtOZ-Hsc-bdYdHqrsULo";

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function logInd() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const knap = document.getElementById("login-knap");
  const fejl = document.getElementById("fejlbesked");

  fejl.classList.remove("synlig");

  if (!email || !password) {
    fejl.textContent = "Udfyld venligst både email og adgangskode.";
    fejl.classList.add("synlig");
    return;
  }

  knap.disabled = true;
  knap.textContent = "Logger ind...";

  const { data, error } = await sb.auth.signInWithPassword({ email, password });

  if (error) {
    fejl.textContent = "Forkert email eller adgangskode. Prøv igen.";
    fejl.classList.add("synlig");
    knap.disabled = false;
    knap.textContent = "Log ind";
    return;
  }

  // Hent brugerens rolle
  const { data: profil } = await sb
    .from("profiles")
    .select("rolle")
    .eq("id", data.user.id)
    .single();

  if (profil?.rolle === "admin") {
    window.location.href = "admin.html";
  } else {
    window.location.href = "index.html";
  }
}

// Log ind ved Enter-tast
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter") logInd();
});

// Tjek om bruger allerede er logget ind
sb.auth.getSession().then(({ data }) => {
  if (data.session) {
    sb.from("profiles")
      .select("rolle")
      .eq("id", data.session.user.id)
      .single()
      .then(({ data: profil }) => {
        if (profil?.rolle === "admin") window.location.href = "admin.html";
        else window.location.href = "index.html";
      });
  }
});
