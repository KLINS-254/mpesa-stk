export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  try {
    const { phone, amount } = req.body || {};

    if (!phone || !amount) {
      return res.status(400).json({
        success: false,
        message: "Phone number and amount are required."
      });
    }

    const normalizedPhone = String(phone).trim();
    const paymentAmount = Number(amount);

    if (!/^254[17]\d{8}$/.test(normalizedPhone)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid Kenyan phone number, e.g. 254712345678."
      });
    }

    if (!Number.isInteger(paymentAmount) || paymentAmount < 1) {
      return res.status(400).json({
        success: false,
        message: "Amount must be a whole number greater than zero."
      });
    }

    const {
      CONSUMER_KEY,
      CONSUMER_SECRET,
      SHORTCODE,
      PASSKEY,
      CALLBACK_URL
    } = process.env;

    const missing = [];

    if (!CONSUMER_KEY) missing.push("CONSUMER_KEY");
    if (!CONSUMER_SECRET) missing.push("CONSUMER_SECRET");
    if (!SHORTCODE) missing.push("SHORTCODE");
    if (!PASSKEY) missing.push("PASSKEY");
    if (!CALLBACK_URL) missing.push("CALLBACK_URL");

    if (missing.length) {
      console.error("Missing environment variables:", missing);

      return res.status(500).json({
        success: false,
        message: "Server configuration is incomplete.",
        missing
      });
    }

    // Step 1: Generate Daraja access token.
    const auth = Buffer.from(
      `${CONSUMER_KEY}:${CONSUMER_SECRET}`
    ).toString("base64");

    const tokenResponse = await fetch(
      "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
      {
        method: "GET",
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json"
        }
      }
    );

    const tokenText = await tokenResponse.text();

    let tokenData;

    try {
      tokenData = JSON.parse(tokenText);
    } catch {
      console.error(
        "Daraja token response was not valid JSON. HTTP status:",
        tokenResponse.status,
        "Response:",
        tokenText.slice(0, 500)
      );

      return res.status(502).json({
        success: false,
        stage: "access_token",
        message: "Daraja returned an empty or invalid token response.",
        darajaHttpStatus: tokenResponse.status
      });
    }

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error(
        "Daraja token request failed:",
        tokenResponse.status,
        tokenData
      );

      return res.status(502).json({
        success: false,
        stage: "access_token",
        message: "Could not obtain a Daraja access token.",
        darajaHttpStatus: tokenResponse.status,
        details: tokenData
      });
    }

    // Step 2: Build STK Push password and timestamp.
    const shortcode = String(SHORTCODE);
    const now = new Date();

    const timestamp =
      now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, "0") +
      String(now.getDate()).padStart(2, "0") +
      String(now.getHours()).padStart(2, "0") +
      String(now.getMinutes()).padStart(2, "0") +
      String(now.getSeconds()).padStart(2, "0");

    const password = Buffer.from(
      shortcode + PASSKEY + timestamp
    ).toString("base64");

    // Step 3: Request the STK Push.
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

    const stkText = await stkResponse.text();

    let stkData;

    try {
      stkData = JSON.parse(stkText);
    } catch {
      console.error(
        "Daraja STK response was not valid JSON. HTTP status:",
        stkResponse.status,
        "Response:",
        stkText.slice(0, 500)
      );

      return res.status(502).json({
        success: false,
        stage: "stk_push",
        message: "Daraja returned an empty or invalid STK Push response.",
        darajaHttpStatus: stkResponse.status
      });
    }

    if (!stkResponse.ok) {
      console.error("Daraja STK request failed:", stkResponse.status, stkData);

      return res.status(502).json({
        success: false,
        stage: "stk_push",
        message: "Daraja rejected the STK Push request.",
        darajaHttpStatus: stkResponse.status,
        details: stkData
      });
    }

    console.log("Daraja STK response:", stkData);

    return res.status(200).json(stkData);

  } catch (error) {
    console.error("STK Push backend error:", error);

    return res.status(500).json({
      success: false,
      message: "The server encountered an error.",
      error: error.message
    });
  }
  }
