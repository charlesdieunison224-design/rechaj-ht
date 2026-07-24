require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const db = require("./src/db");
const moncash = require("./src/moncash");
const affiliates = require("./src/affiliates");
const codes = require("./src/codes");
const wallets = require("./src/wallets");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const ENABLE_MONCASH = process.env.ENABLE_MONCASH === "true";

// Essaie de livrer automatiquement un code de rechaj pour une commande payée.
// Retourne true si un code a été assigné (commande passe à "livre").
function essayerLivraisonAuto(commande) {
  const code = codes.prendreCode(commande.productId);
  if (code) {
    commande.code_redeem = code;
    commande.statut = "livre";
    commande.livre_le = new Date().toISOString();
    return true;
  }
  // Pas de stock disponible : la commande reste "paye", en attente que
  // l'admin ajoute des codes ou livre manuellement.
  commande.en_attente_stock = true;
  return false;
}

app.get("/api/config", (req, res) => {
  res.json({
    enableMoncash: ENABLE_MONCASH,
    whatsapp: process.env.WHATSAPP_NUMBER || null,
  });
});

// ---------- Produits ----------

app.get("/api/products", (req, res) => {
  res.json(db.getProducts());
});

// ---------- Commandes ----------

// Crée une commande. body: { productId, quantite, champs, methode_paiement: "moncash" | "natcash" }
app.post("/api/orders", async (req, res) => {
  try {
    const { productId, quantite = 1, champs = {}, methode_paiement, code_parrain, telephone_wallet, pin_wallet } = req.body;

    if (!["moncash", "natcash", "wallet"].includes(methode_paiement)) {
      return res.status(400).json({ erreur: "methode_paiement invalide" });
    }

    if (methode_paiement === "moncash" && !ENABLE_MONCASH) {
      return res.status(400).json({ erreur: "MonCash pa disponib kounye a. Sèvi ak NatCash." });
    }

    if (methode_paiement === "wallet") {
      if (!telephone_wallet || !pin_wallet) {
        return res.status(400).json({ erreur: "Antre nimewo ak kòd PIN pòtfèy ou" });
      }
      if (!wallets.verifierPin(telephone_wallet, pin_wallet)) {
        return res.status(401).json({ erreur: "Nimewo oswa kòd PIN pa kòrèk" });
      }
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

    if (methode_paiement === "wallet") {
      const succes = wallets.debiter(telephone_wallet, montant);
      if (!succes) {
        orders.pop(); // annile kreyasyon an, pa gen ase lajan
        return res.status(400).json({
          erreur: "Balans pòtfèy ou pa sifi. Rechaje pòtfèy ou dabò.",
        });
      }
      nouvelleCommande.statut = "paye";
      affiliates.crediterCommission(nouvelleCommande);
      essayerLivraisonAuto(nouvelleCommande);
      db.saveOrders(orders);
      return res.json({ commande: nouvelleCommande });
    }

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
      essayerLivraisonAuto(commande);
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
  if (statut === "paye") {
    essayerLivraisonAuto(commande);
  }
  db.saveOrders(orders);
  res.json(commande);
});

// ---------- Stock de codes de rechaj ----------

// Ajoute des codes au stock d'un produit. body: { productId, codes: ["CODE1","CODE2",...] }
app.post("/api/admin/codes", verifierAdmin, (req, res) => {
  const { productId, codes: nouveauxCodes } = req.body;
  if (!productId || !Array.isArray(nouveauxCodes) || nouveauxCodes.length === 0) {
    return res.status(400).json({ erreur: "productId ak yon lis codes obligatwa" });
  }
  const total = codes.ajouterCodes(productId, nouveauxCodes);
  res.json({ productId, total_en_stock: total });
});

app.get("/api/admin/codes", verifierAdmin, (req, res) => {
  res.json(codes.compterStock());
});

// ---------- Pòtfèy (Wallet) ----------

app.post("/api/wallet/inscription", (req, res) => {
  const { telephone, pin } = req.body;
  if (!telephone || !pin || String(pin).length < 4) {
    return res.status(400).json({ erreur: "Telefòn ak yon kòd PIN (4 chif minimòm) obligatwa" });
  }
  try {
    const wallet = wallets.creerWallet(telephone, pin);
    res.json({ telephone: wallet.telephone, balans_htg: wallet.balans_htg });
  } catch (err) {
    res.status(400).json({ erreur: err.message });
  }
});

app.post("/api/wallet/solde", (req, res) => {
  const { telephone, pin } = req.body;
  if (!wallets.verifierPin(telephone, pin)) {
    return res.status(401).json({ erreur: "Nimewo oswa kòd PIN pa kòrèk" });
  }
  const wallet = wallets.trouverWallet(telephone);
  res.json({ telephone: wallet.telephone, balans_htg: wallet.balans_htg });
});

// Kreye yon demand rechajman pòtfèy (peye via NatCash, tankou yon kòmand)
app.post("/api/wallet/depo", (req, res) => {
  const { telephone, pin, montant } = req.body;
  if (!wallets.verifierPin(telephone, pin)) {
    return res.status(401).json({ erreur: "Nimewo oswa kòd PIN pa kòrèk" });
  }
  if (!montant || montant < 50) {
    return res.status(400).json({ erreur: "Montan minimòm se 50 HTG" });
  }
  const depot = wallets.creerDepot(telephone, montant);
  res.json({
    depot,
    instructions_natcash: {
      numero: process.env.NATCASH_MERCHANT_NUMBER || "À CONFIGURER",
      nom: process.env.NATCASH_MERCHANT_NAME || "À CONFIGURER",
      montant_htg: montant,
    },
  });
});

app.post("/api/wallet/depo/:id/confirmer-natcash", (req, res) => {
  const { reference } = req.body;
  if (!reference) return res.status(400).json({ erreur: "reference manquante" });
  const depot = wallets.soumetReferansDepot(req.params.id, reference);
  if (!depot) return res.status(404).json({ erreur: "Depo pa jwenn" });
  res.json({ message: "Referans resevwa, n ap verifye l", depot });
});

app.get("/api/admin/depots", verifierAdmin, (req, res) => {
  res.json(db.getDepots());
});

app.post("/api/admin/depots/:id/confirmer", verifierAdmin, (req, res) => {
  const depot = wallets.confirmerDepot(req.params.id);
  if (!depot) return res.status(404).json({ erreur: "Depo pa jwenn oswa deja konfime" });
  res.json(depot);
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
