(() => {
  const config = window.LIQUID_LAB_ADMIN_CONFIG;
  const select = document.getElementById('premiumAccountOption');
  const price = document.getElementById('premiumAccountPrice');
  const buy = document.getElementById('premiumAccountBuy');
  const stock = document.getElementById('premiumAccountStock');
  if (!config || !window.supabase || !select || !price || !buy || !stock) return;
  const db = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey,
    { auth: { persistSession: false, autoRefreshToken: false } });
  let loading = false;

  function selectedInstant() {
    const option = select.selectedOptions[0];
    return option?.dataset.instantKey ? option : null;
  }
  function renderSelection() {
    const option = selectedInstant();
    if (!option) return;
    const count = Number(option.dataset.stock || 0);
    const live = count > 0 && /^https:\/\/buy\.stripe\.com\//.test(option.dataset.link || '');
    price.textContent = live ? `$${Number(option.value).toFixed(2)}` : 'SOLD OUT';
    if (live) {
      buy.href = option.dataset.link;
      buy.removeAttribute('target');
      buy.removeAttribute('rel');
      buy.removeAttribute('aria-disabled');
      buy.style.pointerEvents = '';
      buy.style.opacity = '';
      buy.innerHTML = 'Buy • Instant Delivery <span>→</span>';
    } else {
      buy.href = '#';
      buy.setAttribute('aria-disabled', 'true');
      buy.style.pointerEvents = 'none';
      buy.style.opacity = '.55';
      buy.innerHTML = 'Sold Out <span>→</span>';
    }
  }
  function unavailable(option, label) {
    option.disabled = true;
    option.dataset.stock = '0';
    option.dataset.link = '';
    option.textContent = `${label} — Sold Out`;
    option.dataset.originalLabel = option.textContent;
  }
  async function refresh() {
    if (loading) return;
    loading = true;
    try {
      const { data, error } = await db.functions.invoke('instant-accounts', { body: { action: 'stock' } });
      if (error || !Array.isArray(data?.products)) throw new Error('Stock unavailable');
      const products = new Map(data.products.map(product => [product.productKey, product]));
      let total = 0;
      for (const option of select.querySelectorAll('option[data-instant-key]')) {
        const product = products.get(option.dataset.instantKey);
        const configured = product?.enabled && product.checkoutUrl && Number(product.priceCents) > 0;
        option.hidden = !configured && option.dataset.instantKey === 'bo2_premade';
        if (!configured) {
          unavailable(option, product?.displayName || (option.dataset.instantKey === 'bo2_premade'
            ? 'BO2 Pre-made Modded Account' : 'BO3 Pre-made Modded Account'));
          continue;
        }
        const count = Math.max(0, Number(product.stock) || 0);
        const dollars = Number(product.priceCents) / 100;
        option.value = String(dollars);
        option.dataset.link = product.checkoutUrl;
        option.dataset.stock = String(count);
        option.disabled = count < 1;
        option.textContent = `${product.displayName} — ${product.platform} — $${dollars.toFixed(2)}${count < 1 ? ' — Sold Out' : ` — ${count} In Stock`}`;
        option.dataset.originalLabel = option.textContent;
        total += count;
      }
      stock.innerHTML = `<i></i> ${total > 0 ? `${total} INSTANT ACCOUNT${total === 1 ? '' : 'S'} IN STOCK` : 'MANUAL ACCOUNT AVAILABLE'}`;
      const current = select.selectedOptions[0];
      if (current?.disabled) {
        const replacement = [...select.options].find(option => !option.disabled && !option.hidden);
        if (replacement) replacement.selected = true;
      }
      select.dispatchEvent(new Event('change', { bubbles: true }));
      renderSelection();
    } catch {
      for (const option of select.querySelectorAll('option[data-instant-key]')) {
        unavailable(option, option.dataset.instantKey === 'bo2_premade'
          ? 'BO2 Pre-made Modded Account' : 'BO3 Pre-made Modded Account');
      }
      stock.innerHTML = '<i></i> MANUAL ACCOUNT AVAILABLE';
      const replacement = [...select.options].find(option => !option.dataset.instantKey && !option.disabled);
      if (replacement) replacement.selected = true;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    } finally { loading = false; }
  }
  select.addEventListener('change', () => queueMicrotask(renderSelection));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
  setInterval(() => { if (!document.hidden) void refresh(); }, 60000);
  void refresh();
})();
