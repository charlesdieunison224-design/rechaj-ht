const db = require("./db");

// Prend un code disponible pour un produit et le retire du stock.
// Retourne le code (string) ou null si le stock est vide.
function prendreCode(productId) {
  const codes = db.getCodes();
  const stock = codes[productId] || [];
  if (stock.length === 0) return null;

  const code = stock.shift();
  codes[productId] = stock;
  db.saveCodes(codes);
  return code;
}

// Ajoute des codes au stock d'un produit (utilisé par l'admin).
function ajouterCodes(productId, nouveauxCodes) {
  const codes = db.getCodes();
  if (!codes[productId]) codes[productId] = [];
  codes[productId].push(...nouveauxCodes);
  db.saveCodes(codes);
  return codes[productId].length;
}

function compterStock() {
  const codes = db.getCodes();
  const resultat = {};
  for (const productId in codes) {
    resultat[productId] = codes[productId].length;
  }
  return resultat;
}

module.exports = { prendreCode, ajouterCodes, compterStock };
