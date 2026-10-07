# Llama Inc. subscription demo (Stripe Checkout, test mode)

A small Node/Express app adapted from Stripe's hosted Checkout quickstart
(HTML + Node). Llama Plus is sold monthly or yearly with a 14-day free trial.

## Pages
- `/` landing page with a monthly/yearly toggle (prices are read live from Stripe)
- `/success.html` confirmation with trial end date and a "Manage subscription" button (customer portal)
- `/cancel.html` shown if the customer backs out of Checkout
- `/events.html` recent webhook events received from Stripe

## Environment variables (set in Render, never in code)
| Name | Where to find it |
|---|---|
| `STRIPE_SECRET_KEY` | Dashboard > Developers > API keys (test mode, starts with `sk_test_`) |
| `PRICE_MONTHLY` / `PRICE_YEARLY` | Product page in the Dashboard (start with `price_`) |
| `STRIPE_WEBHOOK_SECRET` | After creating the webhook endpoint (starts with `whsec_`) |
| `TRIAL_DAYS` | Optional, defaults to 14 |
| `ENABLE_AUTOMATIC_TAX` | Optional, `true` only after Stripe Tax is set up |

## Test cards
| Scenario | Card |
|---|---|
| Succeeds | 4242 4242 4242 4242 |
| Requires 3D Secure | 4000 0025 0000 3155 |
| Declined | 4000 0000 0000 9995 |

Any future expiry date, any CVC, any postal code.

## How AI was used
Built with an AI coding assistant (Claude). The assistant read Stripe's Checkout
quickstart and adapted it: added monthly/yearly prices from environment variables,
the 14-day trial (`subscription_data.trial_period_days`), success/cancel pages,
the customer portal endpoint, webhook signature verification and event logging,
and Llama styling. Stripe Dashboard configuration, testing, and the friction log
were done by hand.
