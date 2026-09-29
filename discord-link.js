(() => {
  const panel = document.getElementById('discordLinkPanel');
  const heading = document.getElementById('discordLinkHeading');
  const status = document.getElementById('discordLinkStatus');
  const connect = document.getElementById('discordConnect');
  const disconnect = document.getElementById('discordDisconnect');
  const config = window.LIQUID_LAB_ADMIN_CONFIG;
  if (!panel || !heading || !status || !connect || !disconnect) return;

  if (!config?.supabaseUrl || !config?.supabasePublishableKey || !window.supabase) {
    connect.hidden = true;
    return;
  }

  // Keep customer Discord sessions separate from the admin panel session.
  const db = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { storageKey: 'liquidlab-discord-customer', flowType: 'pkce', detectSessionInUrl: false }
  });
  let linkedUser = null;
  let checkingOut = false;

  // Take the OAuth code out of the URL before the announcement's Supabase client
  // initializes. Only this client owns the PKCE verifier and customer session.
  const callbackUrl = new URL(location.href);
  const authCode = callbackUrl.searchParams.get('code');
  const callbackError = callbackUrl.searchParams.get('error_description');
  if (authCode || callbackError) {
    callbackUrl.searchParams.delete('code');
    callbackUrl.searchParams.delete('sb_flow_id');
    callbackUrl.searchParams.delete('error');
    callbackUrl.searchParams.delete('error_code');
    callbackUrl.searchParams.delete('error_description');
    history.replaceState(history.state, '', callbackUrl.pathname + callbackUrl.search + callbackUrl.hash);
  }

  function discordIdentity(user) {
    const identity = user?.identities?.find((item) => item.provider === 'discord');
    return /^\d{17,20}$/.test(identity?.provider_id || '') ? identity : null;
  }

  function showUser(user) {
    linkedUser = discordIdentity(user) ? user : null;
    const identity = discordIdentity(linkedUser);
    heading.textContent = linkedUser ? 'Discord connected' : 'Link Discord for faster ticket processing';
    status.textContent = linkedUser
      ? `Connected as ${identity?.identity_data?.full_name || identity?.identity_data?.name || identity?.identity_data?.user_name || 'your Discord account'}. Your purchases can be matched to your ticket faster.`
      : 'Optional. You can buy any available product as a guest.';
    connect.hidden = Boolean(linkedUser);
    disconnect.hidden = !linkedUser;
  }

  async function refreshUser() {
    const { data, error } = await db.auth.getUser();
    if (error || !discordIdentity(data?.user)) {
      showUser(null);
      return;
    }
    showUser(data.user);
  }

  db.auth.onAuthStateChange(() => {
    // Wait until the auth callback finishes before reading the verified identity.
    setTimeout(() => { refreshUser().catch(() => showUser(null)); }, 0);
  });
  async function finishSignIn() {
    if (callbackError) {
      showUser(null);
      status.textContent = `Discord could not connect: ${callbackError}`;
      return;
    }
    if (authCode) {
      status.textContent = 'Finishing Discord connection…';
      const { error } = await db.auth.exchangeCodeForSession(authCode);
      if (error) {
        showUser(null);
        status.textContent = `Discord could not connect: ${error.message}. Please try again.`;
        return;
      }
    }
    await refreshUser();
  }
  finishSignIn().catch((error) => {
    showUser(null);
    status.textContent = `Discord could not connect: ${error?.message || 'unknown error'}. Please try again.`;
  });

  connect.addEventListener('click', async () => {
    connect.disabled = true;
    status.textContent = 'Opening Discord…';
    const { error } = await db.auth.signInWithOAuth({
      provider: 'discord',
      options: { redirectTo: `${location.origin}${location.pathname}` }
    });
    if (error) {
      connect.disabled = false;
      status.textContent = 'Discord could not connect right now. Guest checkout still works.';
    }
  });

  disconnect.addEventListener('click', async () => {
    await db.auth.signOut();
    showUser(null);
  });

  // The normal button href stays intact for guests, paused products and ticket-only items.
  // Resolve the final href at click time, after product options and live sales update it.
  document.getElementById('productGrid')?.addEventListener('click', async (event) => {
    const button = event.target.closest('a.buy-btn');
    if (!button || button.getAttribute('aria-disabled') === 'true' || !linkedUser) return;
    const originalHref = button.getAttribute('href');
    if (!originalHref) return;

    let checkout;
    try { checkout = new URL(originalHref, location.href); } catch { return; }
    if (checkout.protocol !== 'https:' || checkout.hostname !== 'buy.stripe.com') return;
    event.preventDefault();
    if (checkingOut) return;
    checkingOut = true;
    button.setAttribute('aria-busy', 'true');
    status.textContent = 'Connecting this checkout to your Discord…';

    try {
      const { data: { session } } = await db.auth.getSession();
      if (!session) throw new Error('Discord session expired');
      const { data, error } = await db.functions.invoke('discord-checkout', {
        body: {
          action: 'create',
          checkoutUrl: checkout.href,
          productId: button.closest('[data-product-id]')?.dataset.productId || null
        }
      });
      if (error || !data?.checkoutUrl) throw error || new Error('No checkout URL returned');
      location.assign(data.checkoutUrl);
    } catch (error) {
      console.warn('Discord checkout linking failed.', error);
      status.textContent = 'This purchase could not be linked to Discord. You can try again or continue as a guest.';
      if (window.confirm('Discord linking did not work for this checkout. Continue as a guest?')) {
        location.assign(checkout.href);
      }
    } finally {
      checkingOut = false;
      button.removeAttribute('aria-busy');
    }
  });
})();
