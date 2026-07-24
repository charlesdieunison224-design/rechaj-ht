const { v4: uuidv4 } = require("uuid");
const db = require("./db");

const TAUX_COMMISSION = 0.08; // 8% du montant de chaque commande payée

function genererCode(nom) {
  const base = (nom || "AFIL")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 5) || "AFIL";
  const suffixe = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${base}${suffixe}`;
}

function creerAffilie(nom, telephone) {
  const affilies = db.getAffiliates();
  const affilie = {
    id: uuidv4(),
    nom,
    telephone,
    code: genererCode(nom),
    commande_count: 0,
    commission_totale_htg: 0,
    cree_le: new Date().toISOString(),
  };
  affilies.push(affilie);
  db.saveAffiliates(affilies);
  return affilie;
}

function trouverParCode(code) {
  if (!code) return null;
  return db.getAffiliates().find((a) => a.code === code.toUpperCase()) || null;
}

// Crédite la commission une seule fois par commande (évite le double comptage
// si le statut "paye" est déclenché plusieurs fois pour la même commande).
function crediterCommission(commande) {
  if (!commande.parrain || commande.commission_creditee) return;

  const affilies = db.getAffiliates();
  const affilie = affilies.find((a) => a.code === commande.parrain);
  if (!affilie) return;

  const commission = Math.round(commande.montant_htg * TAUX_COMMISSION);
  affilie.commande_count += 1;
  affilie.commission_totale_htg += commission;
  db.saveAffiliates(affilies);

  commande.commission_creditee = true;
  commande.commission_htg = commission;
}

module.exports = { TAUX_COMMISSION, creerAffilie, trouverParCode, crediterCommission };
