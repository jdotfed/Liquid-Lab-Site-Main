(() => {
  const config = window.LIQUID_LAB_ADMIN_CONFIG;
  const loading = document.getElementById('loadingView');
  const errorView = document.getElementById('errorView');
  const errorMessage = document.getElementById('errorMessage');
  const accountView = document.getElementById('accountView');
  const fields = document.getElementById('accountFields');
  const copyMessage = document.getElementById('copyMessage');
  const token = new URLSearchParams(location.search).get('token') || '';
  if (token) history.replaceState(history.state, '', location.pathname);
  let copyText = '';
  const labels = {
    username: 'Account Username / PSN', loginEmail: 'Login Email', loginPassword: 'Login Password',
    recoveryEmail: 'Recovery Email', recoveryPassword: 'Recovery Password', notes: 'Account Notes'
  };
  function fail(message) {
    loading.hidden = true; accountView.hidden = true; errorView.hidden = false;
    errorMessage.textContent = message || 'This private link is invalid or has expired.';
  }
  async function copy(value) {
    await navigator.clipboard.writeText(value);
    copyMessage.textContent = 'Copied to clipboard.';
    setTimeout(() => { copyMessage.textContent = ''; }, 2200);
  }
  async function load() {
    if (!config || !window.supabase || !/^[A-Za-z0-9_-]{40,100}$/.test(token)) return fail();
    const db = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey,
      { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db.functions.invoke('instant-accounts', { body: { action: 'reveal', token } });
    if (error || !data?.delivery?.account) return fail(data?.error);
    const delivery = data.delivery;
    document.getElementById('productName').textContent = `${delivery.product.display_name} • ${delivery.product.platform}`;
    const lines = [];
    Object.entries(labels).forEach(([key, label]) => {
      const value = String(delivery.account[key] || '').trim();
      if (!value) return;
      lines.push(`${label}: ${value}`);
      const row = document.createElement('div'); row.className = 'field';
      const text = document.createElement('div'); text.className = 'field-text';
      const name = document.createElement('small'); name.textContent = label;
      const content = document.createElement(key === 'notes' ? 'span' : 'code');
      if (key === 'notes') content.className = 'plain';
      content.textContent = value; text.append(name, content);
      const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Copy';
      button.addEventListener('click', () => void copy(value)); row.append(text, button); fields.append(row);
    });
    copyText = [`Liquid Lab — ${delivery.product.display_name}`, '', ...lines].join('\n');
    document.getElementById('expiry').textContent = `Private link expires ${new Date(delivery.expiresAt).toLocaleString()}.`;
    loading.hidden = true; errorView.hidden = true; accountView.hidden = false;
  }
  document.getElementById('copyAll').addEventListener('click', () => { if (copyText) void copy(copyText); });
  void load().catch(() => fail('Account delivery is temporarily unavailable. Open a support ticket and include your Stripe receipt.'));
})();
