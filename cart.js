(() => {
  const grid = document.getElementById('productGrid');
  const drawer = document.getElementById('cartDrawer');
  if (!grid || !drawer) return;
  const key = 'liquidlab-cart-v1';
  const toggle = document.getElementById('cartToggle');
  const count = document.getElementById('cartCount');
  const backdrop = document.getElementById('cartBackdrop');
  const itemsHost = document.getElementById('cartItems');
  const totalHost = document.getElementById('cartTotal');
  const checkout = document.getElementById('cartCheckout');
  const message = document.getElementById('cartMessage');
  const notice = document.getElementById('cartNotice');
  const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
  const cards = new Map([...grid.querySelectorAll('.product-card[data-product-id]')]
    .map(card => [card.dataset.productId, card]));
  let cart = [];
  let busy = false;
  let noticeTimer;

  function optionFor(card, optionIndex) {
    if (optionIndex === -1) return null;
    const select = card?.querySelector('select');
    return [...(select?.options || [])].find((option, index) =>
      Number(option.dataset.controlIndex ?? index) === optionIndex) || null;
  }
  function info(item) {
    const card = cards.get(item.productId);
    if (!card) return null;
    const option = optionFor(card, item.optionIndex);
    if (item.optionIndex !== -1 && !option) return null;
    const link = option?.dataset.link || card.querySelector('a.buy-btn')?.dataset.originalHref
      || card.querySelector('a.buy-btn')?.getAttribute('href');
    if (option?.dataset.instantKey || option?.dataset.ticket === 'true' || !/^https:\/\/buy\.stripe\.com\//.test(link || '')) return null;
    const controls = window.LiquidLabProductControls;
    const productControl = controls?.products?.find(row => row.product_id === item.productId);
    const optionControl = controls?.options?.find(row => row.product_id === item.productId
      && Number(row.option_index) === item.optionIndex);
    const sale = [optionControl, productControl].find(row => row?.sale_enabled
      && Number(row.sale_price) > 0 && /^https:\/\/buy\.stripe\.com\//.test(row.sale_link || ''));
    const cents = sale ? Math.round(Number(sale.sale_price) * 100) : Math.round(Number(
      option?.value || card.querySelector('.price strong')?.dataset.regularText?.replace(/[^0-9.]/g, '')
      || card.querySelector('.price strong')?.textContent?.replace(/[^0-9.]/g, '') || 0) * 100);
    const label = option ? (option.dataset.originalLabel || option.textContent).replace(/\s*[—-]\s*\$\d+(?:\.\d{2})?.*$/, '').trim() : card.querySelector('h3')?.textContent?.trim();
    return { title: card.querySelector('h3')?.textContent?.trim() || 'Product', label,
      cents, image: card.querySelector('.product-image img')?.getAttribute('src') || '',
      available: card.dataset.paused !== 'true' && (!option || !option.disabled)
        && productControl?.status !== 'paused' && optionControl?.status !== 'paused' };
  }
  function save() {
    try { localStorage.setItem(key, JSON.stringify(cart)); } catch { /* Private browsing can block storage. */ }
  }
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '[]');
    if (Array.isArray(saved)) cart = saved.filter(item =>
      item && typeof item.productId === 'string' && Number.isInteger(item.optionIndex)
      && Number.isInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 10 && info(item)).slice(0, 20);
  } catch { cart = []; }

  function flash(text) {
    notice.textContent = text;
    notice.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice.hidden = true; }, 4000);
  }
  function open() {
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    backdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    drawer.focus();
  }
  function close() {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    backdrop.hidden = true;
    document.body.style.overflow = '';
    toggle.focus();
  }
  function action(label, type, index) {
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.action = type; button.dataset.index = String(index);
    button.textContent = label;
    button.setAttribute('aria-label', type === 'remove' ? `Remove ${cart[index].productId}` : `${type} quantity`);
    return button;
  }
  function render() {
    itemsHost.replaceChildren();
    let total = 0;
    let unavailable = false;
    for (const [index, item] of cart.entries()) {
      const itemInfo = info(item);
      if (!itemInfo) { unavailable = true; continue; }
      const row = document.createElement('div'); row.className = 'll-cart-row';
      if (itemInfo.image) {
        const image = document.createElement('img'); image.className = 'll-cart-thumb';
        image.src = itemInfo.image; image.alt = ''; image.loading = 'lazy'; row.append(image);
      }
      const content = document.createElement('div'); content.className = 'll-cart-info';
      const title = document.createElement('strong'); title.textContent = itemInfo.title;
      const label = document.createElement('small'); label.textContent = itemInfo.label || '';
      const price = document.createElement('em'); price.textContent = money(itemInfo.cents * item.quantity);
      content.append(title, label, price);
      if (!itemInfo.available) {
        const warning = document.createElement('small'); warning.className = 'll-cart-unavailable';
        warning.textContent = 'Unavailable — remove to continue'; content.append(warning);
        unavailable = true;
      }
      const actions = document.createElement('div'); actions.className = 'll-cart-row-actions';
      const quantity = document.createElement('div'); quantity.className = 'll-cart-quantity';
      const minus = action('−', 'decrease', index), plus = action('+', 'increase', index);
      minus.disabled = item.quantity <= 1; plus.disabled = item.quantity >= 10;
      const current = document.createElement('span'); current.textContent = String(item.quantity);
      quantity.append(minus, current, plus);
      const remove = action('Remove', 'remove', index); remove.className = 'll-cart-remove';
      actions.append(quantity, remove); content.append(actions); row.append(content); itemsHost.append(row);
      total += itemInfo.cents * item.quantity;
    }
    if (!cart.length) {
      const empty = document.createElement('p'); empty.className = 'll-cart-empty';
      empty.textContent = 'Your cart is empty. Add a service to get started.'; itemsHost.append(empty);
    }
    count.textContent = String(cart.reduce((n, item) => n + item.quantity, 0));
    totalHost.textContent = money(total);
    checkout.disabled = busy || !cart.length || unavailable;
    save();
  }
  function updateAdd(card) {
    const button = card.querySelector('.ll-add-cart');
    if (!button) return;
    const selected = card.querySelector('select')?.selectedOptions[0];
    const href = selected?.dataset.link || card.querySelector('.buy-btn')?.getAttribute('href');
    button.hidden = card.dataset.paused === 'true' || Boolean(selected?.disabled)
      || selected?.dataset.instantKey || selected?.dataset.ticket === 'true' || !/^https:\/\/buy\.stripe\.com\//.test(href || '');
  }
  for (const card of cards.values()) {
    const stripeOption = [...(card.querySelector('select')?.options || [])]
      .some(option => !option.dataset.instantKey && /^https:\/\/buy\.stripe\.com\//.test(option.dataset.link || '') && option.dataset.ticket !== 'true');
    if (!stripeOption && !/^https:\/\/buy\.stripe\.com\//.test(card.querySelector('.buy-btn')?.getAttribute('href') || '')) continue;
    const add = document.createElement('button'); add.type = 'button'; add.className = 'll-add-cart';
    add.textContent = '+ Add to cart';
    card.querySelector('.product-bottom')?.after(add);
    card.querySelector('select')?.addEventListener('change', () => queueMicrotask(() => updateAdd(card)));
    add.addEventListener('click', () => {
      const option = card.querySelector('select')?.selectedOptions[0];
      const optionIndex = option ? Number(option.dataset.controlIndex ?? card.querySelector('select').selectedIndex) : -1;
      const item = { productId: card.dataset.productId, optionIndex, quantity: 1 };
      const current = cart.find(entry => entry.productId === item.productId && entry.optionIndex === optionIndex);
      if (!info(item)?.available || add.hidden) return;
      if (current) {
        if (current.quantity >= 10 || cart.reduce((n, entry) => n + entry.quantity, 0) >= 40) return flash('Cart quantity limit reached.');
        current.quantity++;
      } else {
        if (cart.length >= 20 || cart.reduce((n, entry) => n + entry.quantity, 0) >= 40) return flash('Cart limit reached.');
        cart.push(item);
      }
      message.textContent = ''; render(); flash('Added to cart');
    });
    updateAdd(card);
  }
  window.addEventListener('liquidlab:products-updated', () => {
    for (const card of cards.values()) updateAdd(card);
    render();
  });
  toggle.addEventListener('click', open);
  document.getElementById('cartClose').addEventListener('click', close);
  document.getElementById('cartContinue').addEventListener('click', close);
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && drawer.classList.contains('open')) close(); });
  itemsHost.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const index = Number(button.dataset.index);
    if (!cart[index]) return;
    if (button.dataset.action === 'remove') cart.splice(index, 1);
    if (button.dataset.action === 'increase') cart[index].quantity = Math.min(10, cart[index].quantity + 1);
    if (button.dataset.action === 'decrease') cart[index].quantity = Math.max(1, cart[index].quantity - 1);
    message.textContent = ''; render();
  });
  checkout.addEventListener('click', async () => {
    if (busy || !cart.length || cart.some(item => !info(item)?.available)) return;
    busy = true; message.textContent = ''; checkout.textContent = 'Opening secure checkout…'; render();
    try {
      const customer = window.LiquidLabCustomerAuth;
      const config = window.LIQUID_LAB_ADMIN_CONFIG;
      if (!config || !window.supabase) throw new Error('Checkout is temporarily unavailable.');
      const db = customer?.client || window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey);
      const linkedUser = customer?.getLinkedUser?.();
      const { data, error } = await db.functions.invoke('cart-checkout', {
        body: { items: cart, linkDiscord: Boolean(linkedUser) }
      });
      if (error || !data?.checkoutUrl) {
        let detail = data?.error;
        if (!detail && error?.context?.json) {
          try { detail = (await error.context.json()).error; } catch { /* Fall back below. */ }
        }
        throw new Error(detail || error?.message || 'Could not create checkout.');
      }
      location.assign(data.checkoutUrl);
    } catch (error) {
      message.textContent = error.message || 'Checkout is temporarily unavailable. Please try again.';
      busy = false; checkout.textContent = 'Checkout with Stripe →'; render();
    }
  });
  if (new URLSearchParams(location.search).get('cart') === 'success') {
    cart = []; render(); flash('Thanks! Your Stripe checkout was submitted. Check your email for confirmation.');
    const url = new URL(location.href);
    url.searchParams.delete('cart'); url.searchParams.delete('session_id');
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  }
  render();
})();
