(() => {
  'use strict';
  const config = window.LIQUID_LAB_ADMIN_CONFIG;
  if (!config?.supabaseUrl || !config?.supabasePublishableKey || !window.supabase) return;
  const owners = new Set((Array.isArray(config.ownerEmails) ? config.ownerEmails : [])
    .filter(email => typeof email === 'string').map(email => email.trim().toLowerCase()));
  if (!owners.size) return;
  const host = document.querySelector('.nav-actions') || document.querySelector('header .nav-links');
  if (!host) return;

  // Use the admin panel's default Supabase session. Customer Discord auth uses
  // a separate storage key and must never grant visibility to this shortcut.
  const db = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { detectSessionInUrl: false }
  });
  let generation = 0;
  let timer = null;
  let shortcut = null;
  function hide() {
    shortcut?.remove();
    shortcut = null;
  }
  function show() {
    if (shortcut) return;
    shortcut = document.createElement('a');
    shortcut.className = 'll-admin-shortcut';
    shortcut.href = 'admin.html';
    shortcut.textContent = 'Admin Panel';
    if (host.classList.contains('nav-links')) host.insertBefore(shortcut, host.lastElementChild);
    else host.prepend(shortcut);
  }
  async function verifyOwner() {
    const current = ++generation;
    hide();
    try {
      const { data: sessionData, error: sessionError } = await db.auth.getSession();
      if (current !== generation || sessionError || !sessionData?.session) return;
      // A stored session is only a hint: verify the identity with Supabase.
      const { data, error } = await db.auth.getUser();
      if (current !== generation || error || !data?.user) return;
      if (owners.has(String(data.user.email || '').trim().toLowerCase())) show();
    } catch { /* Keep the shortcut absent if the login cannot be verified. */ }
  }
  db.auth.onAuthStateChange((_event, session) => {
    ++generation;
    hide();
    clearTimeout(timer);
    // Read auth outside the SDK callback to avoid its session lock.
    if (session) timer = setTimeout(() => { void verifyOwner(); }, 0);
  });
  window.addEventListener('focus', () => { void verifyOwner(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void verifyOwner();
  });
  void verifyOwner();
})();
