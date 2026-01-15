import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://umuxoozwmelzrcylztzt.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_ZSvxuDscbAVexpZCdacgXg_ZA1gMmhc";

const DEFAULT_REDIRECT = "/app1/";
const FORGOT_PATH = "/forgot-password/";
const ENABLE_SIGNUP = true;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function $(id) { return document.getElementById(id); }

function setMsg(el, text) {
  if (el) el.textContent = text || "";
}

function popupFor(input) {
  return input?.closest(".input-group")?.querySelector(".error-popup") || null;
}

function showFieldError(input) {
  popupFor(input)?.classList.add("show");
  input?.setAttribute("aria-invalid", "true");
}

function clearFieldError(input) {
  popupFor(input)?.classList.remove("show");
  input?.removeAttribute("aria-invalid");
}

function validateRequired(inputs) {
  let ok = true;
  for (const input of inputs) {
    const v = String(input?.value || "").trim();
    if (!v) { showFieldError(input); ok = false; }
    else { clearFieldError(input); }
  }
  return ok;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForValidSession(timeoutMs = 2500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data: s } = await supabase.auth.getSession();
    if (s?.session?.access_token) {
      const { data: u, error } = await supabase.auth.getUser();
      if (!error && u?.user?.id) return s.session;
    }
    await sleep(100);
  }
  return null;
}

async function ensureNoStaleSession() {
  const { data: s } = await supabase.auth.getSession();
  if (!s?.session) return;

  const { error } = await supabase.auth.getUser();
  if (error) await supabase.auth.signOut();
}

function safeRedirect(path) {
  const target = path || DEFAULT_REDIRECT;
  if (typeof target === "string" && target.startsWith("/")) {
    window.location.assign(target);
    return;
  }
  window.location.assign(DEFAULT_REDIRECT);
}

document.addEventListener("DOMContentLoaded", async () => {
  const container = $("container");

  const signUpBtn = $("signUp");
  const signInBtn = $("signIn");
  const signUpMobile = $("signUpMobile");
  const signInMobile = $("signInMobile");

  const logForm = $("logForm");
  const regForm = $("regForm");

  const logMsg = $("logMsg");
  const regMsg = $("regMsg");

  const forgotLink = document.querySelector("a.forgot");
  if (forgotLink) forgotLink.href = FORGOT_PATH;

  function showSignup() {
    container?.classList.add("right-panel-active");
    // optional a11y hinting
    document.querySelector(".sign-in-container")?.setAttribute("aria-hidden", "true");
    document.querySelector(".sign-up-container")?.setAttribute("aria-hidden", "false");
  }
  function showSignin() {
    container?.classList.remove("right-panel-active");
    document.querySelector(".sign-in-container")?.setAttribute("aria-hidden", "false");
    document.querySelector(".sign-up-container")?.setAttribute("aria-hidden", "true");
  }

  signUpBtn?.addEventListener("click", (e) => { e.preventDefault(); showSignup(); });
  signUpMobile?.addEventListener("click", (e) => { e.preventDefault(); showSignup(); });
  signInBtn?.addEventListener("click", (e) => { e.preventDefault(); showSignin(); });
  signInMobile?.addEventListener("click", (e) => { e.preventDefault(); showSignin(); });

  // Input popup behavior
  document.querySelectorAll(".input-group input").forEach((input) => {
    input.addEventListener("input", () => clearFieldError(input));
    input.addEventListener("blur", () => {
      if (!String(input.value || "").trim()) showFieldError(input);
    });
  });

  // Clear prefilled password dots on first focus (password managers/autofill).
  const passwordInputs = document.querySelectorAll('input[type="password"]');

  function markPrefilled(inp) {
    if (!inp) return;
    if (String(inp.value || "").length > 0) inp.dataset.prefilled = "1";
  }

  // Detect WebKit autofill via CSS animation (style.css: onAutoFillStart)
  document.addEventListener(
    "animationstart",
    (e) => {
      const t = e.target;
      if (e.animationName === "onAutoFillStart" && t?.tagName === "INPUT" && t.type === "password") {
        t.dataset.prefilled = "1";
      }
    },
    true
  );

  for (const inp of passwordInputs) {
    markPrefilled(inp);
    setTimeout(() => markPrefilled(inp), 250);
    setTimeout(() => markPrefilled(inp), 1000);

    inp.addEventListener("input", () => { inp.dataset.userTyped = "1"; });

    inp.addEventListener("focus", () => {
      if (inp.dataset.prefilled === "1" && inp.dataset.userTyped !== "1" && inp.dataset.cleared !== "1") {
        inp.value = "";
        inp.dataset.cleared = "1";
      }
    });
  }

  // Normalize auth state on load
  try {
    await ensureNoStaleSession();
    const ok = await waitForValidSession(300);
    if (ok) {
      safeRedirect(DEFAULT_REDIRECT);
      return;
    }
  } catch {
    // keep page usable if auth calls fail transiently
  }

  // SIGN IN
  logForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setMsg(logMsg, "");

    const email = $("log-email");
    const pass = $("log-password");
    const submitBtn = logForm.querySelector('button[type="submit"]');

    if (!validateRequired([email, pass])) {
      setMsg(logMsg, "Enter email and password.");
      return;
    }

    if (submitBtn) submitBtn.disabled = true;

    try {
      await ensureNoStaleSession();

      const { error } = await supabase.auth.signInWithPassword({
        email: String(email.value).trim(),
        password: String(pass.value),
      });

      if (error) {
        setMsg(logMsg, error.message || "Login failed.");
        return;
      }

      const session = await waitForValidSession(2500);
      if (!session) {
        setMsg(logMsg, "Signed in, but session not ready. Retry once.");
        return;
      }

      safeRedirect(logForm.dataset.redirect || DEFAULT_REDIRECT);
    } catch (err) {
      setMsg(logMsg, String(err?.message || err || "Login failed."));
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  // SIGN UP
  regForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setMsg(regMsg, "");

    if (!ENABLE_SIGNUP) {
      setMsg(regMsg, "Sign-up not enabled.");
      return;
    }

    const name = $("reg-name");
    const email = $("reg-email");
    const pass = $("reg-password");
    const submitBtn = regForm.querySelector('button[type="submit"]');

    if (!validateRequired([name, email, pass])) {
      setMsg(regMsg, "Complete all fields to register.");
      return;
    }

    if (submitBtn) submitBtn.disabled = true;

    try {
      const { error } = await supabase.auth.signUp({
        email: String(email.value).trim(),
        password: String(pass.value),
        options: { data: { full_name: String(name.value).trim() } },
      });

      if (error) {
        setMsg(regMsg, error.message || "Sign-up failed.");
        return;
      }

      setMsg(regMsg, "Check your email to confirm your account.");
    } catch (err) {
      setMsg(regMsg, String(err?.message || err || "Sign-up failed."));
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
});