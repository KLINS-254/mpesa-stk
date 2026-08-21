export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({
      message: "Method not allowed"
    });
  }

  try {
    const { phone, amount } = req.body;

    // Validate input
    if (!phone || !amount) {
      return res.status(400).json({
        message: "Phone number and amount are required"
      });
    }

    // Get access token
    const auth = Buffer.from(
      `${process.env.CONSUMER_KEY}:${process.env.CONSUMER_SECRET}`
    ).toString("base64");

    const tokenResponse = await fetch(
      "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
      {
        method: "GET",
        headers: {
          Authorization: `Basic ${auth}`
        }
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      return res.status(500).json({
        message: "Failed to generate access token",
        error: tokenData
      });
    }

    const accessToken = tokenData.access_token;

    // STK Push details
    const shortcode = process.env.SHORTCODE;
    const passkey = process.env.PASSKEY;

    // Create timestamp
    const now = new Date();

    const timestamp =
      now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, "0") +
      String(now.getDate()).padStart(2, "0") +
      String(now.getHours()).padStart(2, "0") +
      String(now.getMinutes()).padStart(2, "0") +
      String(now.getSeconds()).padStart(2, "0");

    // Generate password
    const password = Buffer.from(
      shortcode + passkey + timestamp
    ).toString("base64");

    // Send STK Push request
    const stkResponse = await fetch(
      "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      {
        method: "POST",

        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          BusinessShortCode: shortcode,
          Password: password,
          Timestamp: timestamp,
          TransactionType: "CustomerPayBillOnline",
          Amount: Number(amount),
          PartyA: phone,
          PartyB: shortcode,
          PhoneNumber: phone,
          CallBackURL: process.env.CALLBACK_URL,
          AccountReference: "TestPayment",
          TransactionDesc: "STK Push Test"
        })
      }
    );

    const stkData = await stkResponse.json();

    return res.status(stkResponse.status).json(stkData);

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      message: "Server error",
      error: error.message
    });

  }
        }
