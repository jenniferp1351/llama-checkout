// Llama Inc. subscription demo, adapted from Stripe's hosted Checkout quickstart
// (https://docs.stripe.com/checkout/quickstart, HTML + Node).
// All keys and price IDs come from environment variables. Never put keys in code.

const express = require('express');
const path = require('path');

const required = ['STRIPE_SECRET_KEY', 'PRICE_MONTHLY', 'PRICE_YEARLY'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const PRICES = { monthly: process.env.PRICE_MONTHLY, yearly: process.env.PRICE_YEARLY };
const TRIAL_DAYS = parseInt(process.env.TRIAL_DAYS || '14', 10);

const app = express();
app.set('trust proxy', true); // so req.protocol is https behind Render's proxy

// In-memory log of recent webhook events, shown at /events for the demo.
// Resets whenever the server restarts. A real integration would store this in a database.
const recentEvents = [];

// Webhook route must read the raw body to verify Stripe's signature,
// so it is registered before express.json().
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('STRIPE_WEBHOOK_SECRET not set; rejecting webhook.');
    return res.status(400).send('Webhook secret not configured');
  }
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], secret);
  } catch (err) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Ignore duplicate deliveries (Stripe may send the same event more than once).
  if (!recentEvents.some((e) => e.id === event.id)) {
    const obj = event.data.object || {};
    recentEvents.unshift({
      id: event.id,
      type: event.type,
      received: new Date().toISOString(),
      object_id: obj.id,
      status: obj.status || null,
    });
    recentEvents.length = Math.min(recentEvents.length, 50);
  }

  switch (event.type) {
    case 'checkout.session.completed':
      console.log('New subscription checkout completed:', event.data.object.subscription);
      break;
    case 'invoice.paid':
      console.log('Invoice paid, keep access active:', event.data.object.id);
      break;
    case 'invoice.payment_failed':
      console.log('Payment failed, ask customer to update card:', event.data.object.id);
      break;
    case 'customer.subscription.trial_will_end':
      console.log('Trial ending in 3 days:', event.data.object.id);
      break;
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      console.log(`${event.type}:`, event.data.object.id, event.data.object.status);
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }
  res.json({ received: true });
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const baseUrl = (req) => `${req.protocol}://${req.get('host')}`;

// Price details for the landing page, read from Stripe so the page always matches the Dashboard.
app.get('/config', async (req, res) => {
  try {
    const [monthly, yearly] = await Promise.all([
      stripe.prices.retrieve(PRICES.monthly, { expand: ['product'] }),
      stripe.prices.retrieve(PRICES.yearly),
    ]);
    const fmt = (p) => ({
      amount: p.unit_amount,
      currency: p.currency,
      interval: p.recurring && p.recurring.interval,
    });
    res.json({
      product: monthly.product.name,
      trialDays: TRIAL_DAYS,
      monthly: fmt(monthly),
      yearly: fmt(yearly),
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Could not load prices. Check PRICE_MONTHLY and PRICE_YEARLY.' });
  }
});

app.post('/create-checkout-session', async (req, res) => {
  const plan = req.body.plan === 'yearly' ? 'yearly' : 'monthly';
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: PRICES[plan], quantity: 1 }],
      subscription_data: { trial_period_days: TRIAL_DAYS },
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      ...(process.env.ENABLE_AUTOMATIC_TAX === 'true' ? { automatic_tax: { enabled: true } } : {}),
      success_url: `${baseUrl(req)}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl(req)}/cancel.html`,
    });
    res.redirect(303, session.url);
  } catch (err) {
    console.error(err.message);
    res.status(500).send(`Could not start checkout: ${err.message}`);
  }
});

// Details for the success page.
app.get('/session-status', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.query.session_id, {
      expand: ['subscription'],
    });
    const sub = session.subscription;
    res.json({
      status: session.status,
      email: session.customer_details && session.customer_details.email,
      subscriptionStatus: sub && sub.status,
      trialEnd: sub && sub.trial_end,
    });
  } catch (err) {
    res.status(400).json({ error: 'Invalid session' });
  }
});

// Customer portal: lets subscribers update their card, switch plans or cancel.
app.post('/create-portal-session', async (req, res) => {
  try {
    const checkoutSession = await stripe.checkout.sessions.retrieve(req.body.session_id);
    const portal = await stripe.billingPortal.sessions.create({
      customer: checkoutSession.customer,
      return_url: `${baseUrl(req)}/`,
    });
    res.redirect(303, portal.url);
  } catch (err) {
    console.error(err.message);
    res.status(500).send(`Could not open customer portal: ${err.message}`);
  }
});

app.get('/events', (req, res) => res.json(recentEvents));

const port = process.env.PORT || 4242;
app.listen(port, () => console.log(`Llama checkout demo running on port ${port}`));
