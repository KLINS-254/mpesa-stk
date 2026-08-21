export default async function handler(req, res) {
  console.log("M-Pesa Callback:", req.body);

  return res.status(200).json({
    ResultCode: 0,
    ResultDesc: "Success"
  });
}
