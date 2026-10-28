export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ResultCode: 1, ResultDesc: "Method not allowed" });
  }

  // Callback payloads are useful for checking final transaction status.
  // Do not treat an STK initiation response alone as proof of payment.
  console.log("M-Pesa callback received:", JSON.stringify(req.body || {}).slice(0, 4000));
  return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
}
