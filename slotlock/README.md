# Slotlock

*Lock the slot. Take the deposit. End no-shows.*

Booking pages with deposits for tattoo artists (and stylists, nail and lash
techs: anyone who books by appointment and gets burned by no-shows).

An artist signs up, adds services (length + deposit), sets their hours, connects
Stripe, and puts `yourdomain.com/theirname` in their Instagram bio. Clients pick
a time, pay the deposit, and get a confirmation and a day-before reminder.
Cancel early and the deposit is refunded automatically; cancel late and the
artist keeps it.

**Business model:** $19/month per artist after a 14-day free trial (no card
needed to start). Deposits go straight to the artist's own Stripe account, and
Slotlock takes no cut. 53 paying artists ≈ $1,000/month. See `LAUNCH.md` for the plan to get there.

## Run it locally

```bash
cd slotlock
npm install
npm run seed      # optional: creates the example page at /demo
npm start         # http://localhost:3002
npm test
```

With no Stripe keys it runs in **demo mode**: deposits and subscriptions are
simulated with a "Pay (demo)" button and emails are printed to the console.
Everything else is real.

## What's in it

| Area | Where |
| --- | --- |
| Signup/login (scrypt passwords, cookie sessions) | `src/routes/auth.js`, `src/lib/auth.js` |
| Dashboard API: profile, services, hours, days off, bookings | `src/routes/artist.js` |
| Public booking page API, holds, cancel/refund, .ics | `src/routes/public.js` |
| Slot engine (timezones + DST without a date library) | `src/lib/time.js`, `src/lib/slots.js` |
| Stripe Connect onboarding, deposit Checkout, subscription billing, webhook | `src/routes/stripe.js`, `src/lib/stripe.js` |
| Emails (Resend) and day-before reminders | `src/lib/email.js`, `src/lib/bookings.js`, `src/jobs/scheduler.js` |
| Landing, dashboard, booking page, booking status page | `public/` |

How a booking works: the server recomputes open slots before inserting, so a
client can only book a time that's actually free. An unpaid booking holds its
slot for 35 minutes (Stripe Checkout expires at 31). If a payment lands after
the slot was lost anyway, it's refunded automatically instead of double-booking.

## Deploy (Railway)

1. New Railway service from this repo, **Root Directory = `slotlock`**.
2. Add a Volume mounted at `/data` and set `DB_PATH=/data/slotlock.db`.
3. Set `BASE_URL` to the public URL (custom domain once you have one).
4. Run `npm run seed` once from the Railway shell if you want `/demo` live.

## Turn on real payments (Stripe)

1. Create a Stripe account and **enable Connect** (Dashboard → Connect → Get
   started, choose "Express" accounts). Deposits are destination charges, so the
   artist's connected account needs to be in the same region as your platform
   account (e.g. US platform → US artists).
2. Create a Product "Slotlock Pro" with a recurring **$19/month** Price. Put the
   price ID in `STRIPE_PRICE_ID`.
3. Add a webhook endpoint at `{BASE_URL}/webhooks/stripe` with events
   `checkout.session.completed`, `checkout.session.expired`,
   `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`. Put its signing secret in
   `STRIPE_WEBHOOK_SECRET`.
4. Turn on the **Customer portal** (Settings → Billing → Customer portal) so
   artists can update cards and cancel.
5. Set `STRIPE_SECRET_KEY`. Test with `sk_test_…` keys first, then switch to live.

## Emails

Sign up at resend.com, verify your domain, and set `RESEND_API_KEY` and
`EMAIL_FROM`. Without it, emails are logged instead of sent.

## Known limits / next up

- One working window per weekday (no split shifts yet).
- Reference images are links, not uploads.
- No SMS reminders yet (Twilio would be the obvious add, and a good upsell).
- SQLite on one instance. Fine for hundreds of artists; the double-booking guard
  would need a transaction or constraint if this moves to Postgres (see
  `src/db/index.js`).
- "Request → approve → pay" flow for big custom pieces isn't built yet; today
  every booking is instant with a deposit.
