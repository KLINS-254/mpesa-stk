export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    const { phone, amount } = req.body || {};
    if (!phone || amount === undefined || amount === null || amount === "") {
      return res.status(400).json({ success: false, message: "Phone number and amount are required." });
    }

    const normalizedPhone = String(phone).trim().replace(/\s+/g, "");
    const paymentAmount = Number(amount);
    if (!/^254[17]\d{8}$/.test(normalizedPhone)) {
      return res.status(400).json({ success: false, message: "Enter a valid Kenyan phone number, e.g. 254712345678." });
    }
    if (!Number.isInteger(paymentAmount) || paymentAmount < 1) {
      return res.status(400).json({ success: false, message: "Amount must be a whole number greater than zero." });
    }

    const { CONSUMER_KEY, CONSUMER_SECRET, SHORTCODE, PASSKEY, CALLBACK_URL } = process.env;
    const missing = [];
    if (!CONSUMER_KEY) missing.push("CONSUMER_KEY");
    if (!CONSUMER_SECRET) missing.push("CONSUMER_SECRET");
    if (!SHORTCODE) missing.push("SHORTCODE");
    if (!PASSKEY) missing.push("PASSKEY");
    if (!CALLBACK_URL) missing.push("CALLBACK_URL");
    if (missing.length) {
      console.error("Missing Vercel environment variables:", missing.join(", "));
      return res.status(500).json({ success: false, message: "Server configuration is incomplete.", missing });
    }

    // Safely read a response body once, including empty/non-JSON responses.
    async function readJsonResponse(response, stage) {
      const raw = await response.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        console.error(`${stage} returned empty/invalid JSON. HTTP ${response.status}; body length ${raw.length}`);
        return {
          ok: false,
          status: response.status,
          data: {
            success: false,
            stage,
            message: "Safaricom returned an empty or invalid response.",
            darajaHttpStatus: response.status,
            responseBody: raw.slice(0, 300) || "<empty response>"
          }
        };
      }
      return { ok: response.ok, status: response.status, data };
    }

    // 1. Request an OAuth access token.
    const auth = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString("base64");
    const tokenResponse = await fetch(
      "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
      { method: "GET", headers: { Authorization: `Basic ${auth}`, Accept: "application/json" } }
    );
    const tokenResult = await readJsonResponse(tokenResponse, "access_token");
    const tokenData = tokenResult.data;

    if (!tokenResult.ok || !tokenData.access_token) {
      console.error("Daraja token request failed. HTTP status:", tokenResult.status, "Response:", tokenData);
      return res.status(502).json({
        success: false,
        stage: "access_token",
        message: tokenData.message || "Could not obtain a Daraja access token.",
        darajaHttpStatus: tokenResult.status,
        details: tokenData
      });
    }

    // 2. Build STK Push password and timestamp.
    const shortcode = String(SHORTCODE);
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Nairobi",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(new Date());
    const v = Object.fromEntries(parts.map(p => [p.type, p.value]));
    const timestamp = `${v.year}${v.month}${v.day}${v.hour}${v.minute}${v.second}`;
    const password = Buffer.from(`${shortcode}${PASSKEY}${timestamp}`).toString("base64");

    // 3. Request the STK Push.
    const stkResponse = await fetch(
      "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          BusinessShortCode: shortcode,
          Password: password,
          Timestamp: timestamp,
          TransactionType: "CustomerPayBillOnline",
          Amount: paymentAmount,
          PartyA: normalizedPhone,
          PartyB: shortcode,
          PhoneNumber: normalizedPhone,
          CallBackURL: CALLBACK_URL,
          AccountReference: "JabereInterest",
          TransactionDesc: "Payment"
        })
      }
    );

    const stkResult = await readJsonResponse(stkResponse, "stk_push");
    if (!stkResult.ok) {
      console.error("Daraja STK request failed. HTTP status:", stkResult.status, "Response:", stkResult.data);
      return res.status(502).json({
        success: false,
        stage: "stk_push",
        message: stkResult.data.message || "Daraja rejected the STK Push request.",
        darajaHttpStatus: stkResult.status,
        details: stkResult.data
      });
    }

    console.log("Daraja STK response received. HTTP status:", stkResult.status);
    return res.status(stkResult.status).json(stkResult.data);
  } catch (error) {
    console.error("STK Push backend error:", error?.message || error);
    return res.status(500).json({ success: false, message: "Server error while initiating STK Push.", error: error?.message || "Unknown error" });
  }
}
