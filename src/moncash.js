const axios = require("axios");

// Documentation officielle : https://moncashbutton.digicelgroup.com (business portal)
function getHosts() {
  const isProd = process.env.MONCASH_MODE === "production";
  return {
    apiHost: isProd
      ? "https://moncashbutton.digicelgroup.com/Api"
      : "https://sandbox.moncashbutton.digicelgroup.com/Api",
    gatewayHost: isProd
      ? "https://moncashbutton.digicelgroup.com/Moncash-middleware"
      : "https://sandbox.moncashbutton.digicelgroup.com/Moncash-middleware",
  };
}

async function getAccessToken() {
  const { apiHost } = getHosts();
  const clientId = process.env.MONCASH_CLIENT_ID;
  const clientSecret = process.env.MONCASH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "MONCASH_CLIENT_ID / MONCASH_CLIENT_SECRET manquants dans le .env"
    );
  }

  const response = await axios.post(
    `${apiHost}/oauth/token`,
    "scope=read,write&grant_type=client_credentials",
    {
      auth: { username: clientId, password: clientSecret },
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
    }
  );

  return response.data.access_token;
}

// Crée un paiement MonCash pour une commande donnée (orderId = ton ID interne).
// Retourne l'URL de paiement vers laquelle rediriger le client.
async function createPayment(orderId, amountHTG) {
  const { apiHost, gatewayHost } = getHosts();
  const token = await getAccessToken();

  const response = await axios.post(
    `${apiHost}/v1/CreatePayment`,
    { amount: amountHTG, orderId },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    }
  );

  const paymentToken = response.data.payment_token.token;
  const paymentUrl = `${gatewayHost}/Payment/Redirect?token=${paymentToken}`;
  return { paymentUrl, paymentToken };
}

// Vérifie le statut réel d'un paiement à partir de l'orderId (à appeler
// quand MonCash redirige le client vers ton BASE_URL/api/moncash/callback).
async function getPaymentDetailsByOrderId(orderId) {
  const { apiHost } = getHosts();
  const token = await getAccessToken();

  const response = await axios.post(
    `${apiHost}/v1/RetrieveTransactionPayment`,
    { orderId },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    }
  );

  return response.data.payment; // contient message, reference, transaction_id, status...
}

module.exports = { createPayment, getPaymentDetailsByOrderId };
