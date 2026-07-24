require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const db = require("./src/db");
const moncash = require("./src/moncash");
const affiliates = require("./src/affiliates");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// ---------- Produits ----------

app.get("/api/products", (req, res) => {
  res.json(db.getProducts());
});

// ---------- Commandes ----------

// Crée une commande. body: { productId, quantite, champs, methode_paiement: "moncash" | "natcash" }
app.post("/api/orders", async (req, res) => {
  try {
    const { productId, quantite = 1, champs = {}, methode_paiement, code_parrain } = req.body;

    if (!["moncash", "natcash"].includes(methode_paiement)) {
      return res.status(400).json({ erreur: "methode_paiement invalide" });
    }

    const produit = db.getProducts().find((p) => p.id === productId);
    if (!produit) {
      return res.status(404).json({ erreur: "Produit introuvable" });
    }

    // Vérifie que les champs requis pour ce produit sont fournis
    for (const champ of produit.champs_requis) {
      if (!champs[champ]) {
        return res.status(400).json({ erreur: `Champ manquant: ${champ}` });
      }
    }

    const montant = produit.prix_htg * quantite;
    const orderId = uuidv4();
    const orders = db.getOrders();
    const affilie = affiliates.trouverParCode(code_parrain);

    const nouvelleCommande = {
      id: orderId,
      productId,
      produit_nom: `${produit.jeu} - ${produit.nom}`,
      quantite,
      champs,
      montant_htg: montant,
      methode_paiement,
      statut: "en_attente", // en_attente | en_verification | paye | livre | annule
      reference_paiement: null,
      parrain: affilie ? affilie.code : null,
      commission_creditee: false,
      cree_le: new Date().toISOString(),
    };

    orders.push(nouvelleCommande);
    db.saveOrders(orders);

    if (methode_paiement === "moncash") {
      const { paymentUrl } = await moncash.createPayment(orderId, montant);
      return res.json({ commande: nouvelleCommande, redirection: paymentUrl });
    }

    // NatCash : pas d'API en ligne — on donne les instructions de paiement manuel
    return res.json({
      commande: nouvelleCommande,
      instructions_natcash: {
        numero: process.env.NATCASH_MERCHANT_NUMBER || "À CONFIGURER",
        nom: process.env.NATCASH_MERCHANT_NAME || "À CONFIGURER",
        montant_htg: montant,
        etape_suivante: `Envoie ${montant} HTG via NatCash (*202# ou l'app), puis soumets ta référence de transaction sur POST /api/orders/${orderId}/confirmer-natcash`,
      },
    });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ erreur: "Erreur lors de la création de la commande" });
  }
});

// Le client colle sa référence de transaction NatCash ici après avoir payé
app.post("/api/orders/:id/confirmer-natcash", (req, res) => {
  const { reference } = req.body;
  if (!reference) {
    return res.status(400).json({ erreur: "reference manquante" });
  }

  const orders = db.getOrders();
  const commande = orders.find((o) => o.id === req.params.id);
  if (!commande) return res.status(404).json({ erreur: "Commande introuvable" });

  commande.reference_paiement = reference;
  commande.statut = "en_verification";
  db.saveOrders(orders);

  res.json({ message: "Référence reçue, en attente de vérification par l'admin", commande });
});

// MonCash redirige le client ici après le paiement (return_url à configurer
// sur le portail business MonCash avec BASE_URL + "/api/moncash/callback")
app.get("/api/moncash/callback", async (req, res) => {
  const { orderId } = req.query;
  try {
    const details = await moncash.getPaymentDetailsByOrderId(orderId);
    const orders = db.getOrders();
    const commande = orders.find((o) => o.id === orderId);

    if (commande && details) {
      commande.statut = "paye";
      commande.reference_paiement = details.transaction_id;
      affiliates.crediterCommission(commande);
      db.saveOrders(orders);
    }

    res.redirect(`/confirmation.html?orderId=${orderId}&statut=paye`);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.redirect(`/confirmation.html?orderId=${orderId}&statut=erreur`);
  }
});

app.get("/api/orders/:id", (req, res) => {
  const commande = db.getOrders().find((o) => o.id === req.params.id);
  if (!commande) return res.status(404).json({ erreur: "Commande introuvable" });
  res.json(commande);
});

// ---------- Admin (protégé par un token simple dans le header) ----------

function verifierAdmin(req, res, next) {
  const token = req.headers["x-admin-token"];
  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ erreur: "Non autorisé" });
  }
  next();
}

app.get("/api/admin/orders", verifierAdmin, (req, res) => {
  res.json(db.getOrders());
});

app.post("/api/admin/orders/:id/statut", verifierAdmin, (req, res) => {
  const { statut } = req.body;
  const orders = db.getOrders();
  const commande = orders.find((o) => o.id === req.params.id);
  if (!commande) return res.status(404).json({ erreur: "Commande introuvable" });

  commande.statut = statut;
  if (statut === "paye" || statut === "livre") {
    affiliates.crediterCommission(commande);
  }
  db.saveOrders(orders);
  res.json(commande);
});

// ---------- Affiliation ----------

// Inscription publique : n'importe qui peut devenir affilié et recevoir un
// code + lien à partager. Les commissions ne sont créditées que lorsque TOI
// (admin) confirmes qu'une commande est payée — donc aucun risque financier
// à laisser cette inscription ouverte.
app.post("/api/affiliates/inscription", (req, res) => {
  const { nom, telephone } = req.body;
  if (!nom || !telephone) {
    return res.status(400).json({ erreur: "nom ak telefòn obligatwa" });
  }
  const affilie = affiliates.creerAffilie(nom, telephone);
  res.json(affilie);
});

// Créer un nouvel affilié depuis l'admin (utile si tu préfères gérer ça toi-même)
app.post("/api/admin/affiliates", verifierAdmin, (req, res) => {
  const { nom, telephone } = req.body;
  if (!nom) return res.status(400).json({ erreur: "nom manquant" });
  const affilie = affiliates.creerAffilie(nom, telephone);
  res.json(affilie);
});

app.get("/api/admin/affiliates", verifierAdmin, (req, res) => {
  res.json(db.getAffiliates());
});

app.listen(PORT, () => {
  console.log(`✅ Rechaj-HT en ligne sur ${BASE_URL}`);
});
