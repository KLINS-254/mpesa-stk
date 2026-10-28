# M-Pesa STK Push (Daraja Sandbox)

## Vercel environment variables
Set these in Vercel Project Settings → Environment Variables, then redeploy:

- `CONSUMER_KEY` — from your Daraja sandbox app
- `CONSUMER_SECRET` — from your Daraja sandbox app (keep private)
- `SHORTCODE` — the sandbox shortcode for your test setup (commonly `174379` in Daraja examples)
- `PASSKEY` — the passkey supplied for the applicable sandbox STK Push test setup
- `CALLBACK_URL` — your deployed callback endpoint, e.g. `https://YOUR-PROJECT.vercel.app/api/callback`

This project calls the Safaricom sandbox endpoints only. Use credentials and shortcode that belong to the same environment. A successful STK initiation does not prove payment completed; verify the callback/result before treating a payment as paid.
