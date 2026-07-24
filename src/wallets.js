const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const db = require("./db");

function hashPin(pin) {
  return crypto.createHash("sha256").update(String(pin)).digest("hex");
}

function trouverWallet(telephone) {
  return db.getWallets().find((w) => w.telephone === telephone) || null;
}

function creerWallet(telephone, pin) {
  const wallets = db.getWallets();
  if (wallets.find((w) => w.telephone === telephone)) {
    throw new Error("Yon pòtfèy deja egziste pou nimewo sa a");
  }
  const wallet = {
    telephone,
    pin_hash: hashPin(pin),
    balans_htg: 0,
    cree_le: new Date().toISOString(),
  };
  wallets.push(wallet);
  db.saveWallets(wallets);
  return wallet;
}

function verifierPin(telephone, pin) {
  const wallet = trouverWallet(telephone);
  if (!wallet) return false;
  return wallet.pin_hash === hashPin(pin);
}

function crediter(telephone, montant) {
  const wallets = db.getWallets();
  const wallet = wallets.find((w) => w.telephone === telephone);
  if (!wallet) throw new Error("Pòtfèy pa jwenn");
  wallet.balans_htg += montant;
  db.saveWallets(wallets);
  return wallet.balans_htg;
}

// Retire lajan nan pòtfèy la si li gen ase. Retounen true si sa reyisi.
function debiter(telephone, montant) {
  const wallets = db.getWallets();
  const wallet = wallets.find((w) => w.telephone === telephone);
  if (!wallet || wallet.balans_htg < montant) return false;
  wallet.balans_htg -= montant;
  db.saveWallets(wallets);
  return true;
}

// ---------- Dépôts (rechajman pòtfèy via NatCash) ----------

function creerDepot(telephone, montant) {
  const depots = db.getDepots();
  const depot = {
    id: uuidv4(),
    telephone,
    montant_htg: montant,
    statut: "en_attente", // en_attente | en_verification | paye
    reference_paiement: null,
    cree_le: new Date().toISOString(),
  };
  depots.push(depot);
  db.saveDepots(depots);
  return depot;
}

function trouverDepot(id) {
  return db.getDepots().find((d) => d.id === id) || null;
}

function soumetReferansDepot(id, reference) {
  const depots = db.getDepots();
  const depot = depots.find((d) => d.id === id);
  if (!depot) return null;
  depot.reference_paiement = reference;
  depot.statut = "en_verification";
  db.saveDepots(depots);
  return depot;
}

function confirmerDepot(id) {
  const depots = db.getDepots();
  const depot = depots.find((d) => d.id === id);
  if (!depot || depot.statut === "paye") return null;
  depot.statut = "paye";
  db.saveDepots(depots);
  crediter(depot.telephone, depot.montant_htg);
  return depot;
}

module.exports = {
  creerWallet,
  trouverWallet,
  verifierPin,
  crediter,
  debiter,
  creerDepot,
  trouverDepot,
  soumetReferansDepot,
  confirmerDepot,
};
