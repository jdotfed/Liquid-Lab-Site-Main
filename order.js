(() => {
  const config = window.LIQUID_LAB_ADMIN_CONFIG;
  const message = document.getElementById('orderMessage');
  const lookupMessage = document.getElementById('lookupMessage');
  if (!config?.supabaseUrl || !config?.supabasePublishableKey || !window.supabase) {
    message.textContent = 'Order lookup is temporarily unavailable.';
    message.classList.add('error');
    return;
  }
  const db = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey);
  const panel = document.getElementById('orderPanel');
  const money = (amount, currency) => new Intl.NumberFormat('en-US', {
    style: 'currency', currency: String(currency || 'usd').toUpperCase()
  }).format(amount / 100);

  async function request(body) {
    const { data, error } = await db.functions.invoke('order-status', { body });
    if (!error && data?.order) return data.order;
    let detail = data?.error;
    if (!detail && error?.context?.json) {
      try { detail = (await error.context.json()).error; } catch { /* use default below */ }
    }
    throw new Error(detail || 'Could not find your order. Try again shortly.');
  }

  function showOrder(order) {
    document.getElementById('orderReference').textContent = order.reference;
    document.getElementById('orderAmount').textContent = money(order.amountTotal, order.currency);
    document.getElementById('discordStatus').textContent = order.discordLinked ? 'Linked at checkout' : 'Guest checkout';
    const items = document.getElementById('orderItems');
    items.replaceChildren();
    (order.items || []).forEach(item => {
      const li = document.createElement('li');
      li.textContent = `${item.name}${item.quantity > 1 ? ` ×${item.quantity}` : ''}`;
      items.append(li);
    });
    if (!items.children.length) {
      const li = document.createElement('li'); li.textContent = 'Stripe purchase'; items.append(li);
    }
    document.getElementById('statusBadge').textContent = 'Payment confirmed';
    panel.hidden = false;
    message.textContent = '';
    document.getElementById('lookupReference').value = order.reference;
  }

  document.getElementById('copyReference').addEventListener('click', async () => {
    const reference = document.getElementById('orderReference').textContent;
    try {
      await navigator.clipboard.writeText(reference);
      document.getElementById('copyMessage').textContent = 'Copied. Paste this in your ticket.';
    } catch {
      document.getElementById('copyMessage').textContent = 'Select the reference above to copy it.';
    }
  });

  document.getElementById('lookupForm').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button');
    button.disabled = true; lookupMessage.textContent = 'Looking up your order…'; lookupMessage.classList.remove('error');
    try {
      const order = await request({ action: 'lookup',
        email: document.getElementById('lookupEmail').value,
        reference: document.getElementById('lookupReference').value });
      showOrder(order); lookupMessage.textContent = '';
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      lookupMessage.textContent = error.message;
      lookupMessage.classList.add('error');
    } finally { button.disabled = false; }
  });

  const sessionId = new URLSearchParams(location.search).get('session_id');
  if (sessionId) {
    message.textContent = 'Confirming your Stripe payment…';
    async function confirmCheckout() {
      // Some payment methods settle shortly after the customer returns from Stripe.
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          const order = await request({ action: 'session', sessionId });
          showOrder(order);
          try { localStorage.removeItem('liquidlab-cart-v1'); } catch { /* private browsing */ }
          return;
        } catch (error) {
          if (attempt === 9 || !/processing|not found/i.test(error.message)) {
            message.textContent = error.message;
            message.classList.add('error');
            return;
          }
          message.textContent = 'Waiting for Stripe to confirm your payment…';
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
    }
    confirmCheckout();
  }
})();
