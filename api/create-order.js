
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("Missing Supabase server environment variables.");
    return res.status(500).json({
      error: "Order service is not configured."
    });
  }

  const { request_id, items, policy_accepted } = req.body || {};

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (
    typeof request_id !== "string" ||
    !uuidPattern.test(request_id) ||
    !Array.isArray(items) ||
    items.length < 1 ||
    items.length > 50 ||
    policy_accepted !== true
  ) {
    return res.status(400).json({
      error: "Invalid checkout details or policy acceptance."
    });
  }

  for (const item of items) {
    if (
      !item ||
      typeof item.id !== "string" ||
      !uuidPattern.test(item.id) ||
      !Number.isInteger(item.qty) ||
      item.qty < 1 ||
      item.qty > 99
    ) {
      return res.status(400).json({
        error: "Invalid cart item."
      });
    }
  }

  try {
    const response = await fetch(
      `${url.replace(/\/+$/, "")}/rest/v1/rpc/create_order_with_token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": key,
          "Authorization": `Bearer ${key}`
        },
        body: JSON.stringify({
          p_request_id: request_id,
          p_items: items.map(({ id, qty }) => ({ id, qty: String(qty) })),
          p_policy_accepted: true
        })
      }
    );

    const result = await response.json().catch(() => null);

    if (!response.ok) {
      console.error("Supabase order creation failed:", {
        status: response.status,
        message: result?.message || "Unknown database error"
      });

      return res.status(400).json({
        error: "Could not create the order. Please check your cart and try again."
      });
    }

    if (!result?.token || !result?.order_id) {
      console.error("Unexpected order creation response.");
      return res.status(502).json({
        error: "Unexpected response from the order service."
      });
    }

    return res.status(200).json({
      order_id: result.order_id,
      token: result.token,
      status: result.status
    });
  } catch (error) {
    console.error("Order API request failed:", error.message);

    return res.status(502).json({
      error: "Order service temporarily unavailable."
    });
  }
};
