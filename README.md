# Rechaj — Recharges jeux, Netflix & cartes prépayées

Site complet : catalogue, commande, paiement MonCash (API réelle) et NatCash
(vérification manuelle, car NatCash n'a pas d'API de paiement en ligne publique).

## Structure

```
rechaj-ht/
  server.js           → serveur Express + toutes les routes API
  src/moncash.js       → intégration à l'API MonCash (Digicel)
  src/db.js            → stockage simple en fichiers JSON
  data/products.json   → ton catalogue (modifiable directement)
  data/orders.json     → les commandes (créé/rempli automatiquement)
  public/               → le site (HTML/CSS/JS)
  .env.example          → variables à copier dans .env
```

## Installation dans Termux

```bash
cd rechaj-ht
pkg install nodejs -y   # si pas déjà installé
npm install
cp .env.example .env
```

Ouvre `.env` et remplis au minimum :
- `MONCASH_CLIENT_ID` / `MONCASH_CLIENT_SECRET` (voir plus bas)
- `NATCASH_MERCHANT_NUMBER` / `NATCASH_MERCHANT_NAME`
- `ADMIN_TOKEN` (choisis un mot de passe fort)

Puis lance le serveur :

```bash
npm start
```

Le site sera accessible sur `http://localhost:3000` (ou l'IP de ton téléphone
sur le réseau local si tu veux le tester depuis un autre appareil).

## Configurer MonCash (obligatoire pour du vrai paiement)

1. Crée un compte business sur le portail sandbox :
   https://sandbox.moncashbutton.digicelgroup.com/Moncash-business/New
2. Dans "General Info", ajoute ton business, et configure :
   - **Return URL** : `TON_URL/api/moncash/callback`
3. Récupère le `Client ID` et le `Client Secret`, mets-les dans `.env`.
4. Teste en mode `MONCASH_MODE=sandbox`. Quand tout marche, demande
   l'activation en production sur le portail officiel (pas sandbox) et
   repasse `MONCASH_MODE=production`.

Le flux : le client choisit MonCash → il est redirigé vers la page de
paiement MonCash → une fois payé, MonCash le renvoie vers
`/api/moncash/callback` → le serveur vérifie le paiement auprès de MonCash
et marque la commande comme payée.

## NatCash — pourquoi c'est "manuel"

NatCash (Natcom) ne propose pas d'API REST publique de paiement en ligne
comme MonCash. Le flux mis en place est donc :

1. Le client voit ton numéro NatCash marchand + le montant à payer.
2. Il paie via `*202#` ou l'app Natcash.
3. Il colle sa **référence de transaction** sur le site.
4. La commande passe en statut `en_verification`.
5. Toi (admin) vérifies que l'argent est bien arrivé, puis tu marques la
   commande `paye` via l'API admin (voir plus bas). Ensuite tu livres le
   produit (diamants, code Netflix, carte...) manuellement, par exemple sur
   WhatsApp — comme tu le fais déjà pour ton bot.

Si NatCash lance un jour une API marchande officielle, il suffira
d'ajouter un fichier `src/natcash.js` sur le même modèle que
`src/moncash.js` pour automatiser cette partie aussi.

## Gérer les commandes (admin)

Toutes les routes admin nécessitent le header `x-admin-token: TON_TOKEN`.

```bash
# Voir toutes les commandes
curl -H "x-admin-token: TON_TOKEN" http://localhost:3000/api/admin/orders

# Marquer une commande comme payée et livrée
curl -X POST -H "x-admin-token: TON_TOKEN" -H "Content-Type: application/json" \
  -d '{"statut":"livre"}' \
  http://localhost:3000/api/admin/orders/ID_DE_LA_COMMANDE/statut
```

Tu peux facilement transformer ça en petite page HTML admin plus tard si tu veux.

## Modifier le catalogue

Édite simplement `data/products.json`. Chaque produit :

```json
{
  "id": "identifiant-unique",
  "categorie": "jeux | netflix | carte",
  "jeu": "Nom affiché en haut de la carte",
  "nom": "Nom du produit",
  "prix_htg": 350,
  "champs_requis": ["id_joueur"]
}
```

`champs_requis` = les infos à demander au client (ID joueur, email, etc.).

## Pòtfèy (Wallet) — peman san verifikasyon chak fwa

Kliyan ka kreye yon pòtfèy sou `/wallet.html` ak yon nimewo telefòn + kòd PIN.
Yo rechaje l ak NatCash (sa mande yon verifikasyon **yon sèl fwa**, tankou yon
kòmand nòmal). Apre sa, tout kòmand yo fè "ak pòtfèy" **pran lajan nan balans
lan otomatikman, e livrezon kòd la fèt lamenm** — pa gen okenn etap
verifikasyon chak fwa yo achte.

**Konfime yon rechajman pòtfèy (kredite balans lan):**
```bash
curl -X POST -H "x-admin-token: TON_TOKEN" \
  http://localhost:3000/api/admin/depots/ID_DEPO/confirmer
```

**Wè tout demand rechajman:**
```bash
curl -H "x-admin-token: TON_TOKEN" http://localhost:3000/api/admin/depots
```

⚠️ Sistèm PIN sa a senp (pa gen "modpase bliye" pou kounye a) — bon pou
kòmanse, men pa yon sistèm sekirite bancaire konplè.

## Livrezon otomatik ak kòd rechaj

Kounye a, lè yon kòmand konfime **paye**, sistèm lan bay kliyan an yon kòd
otomatikman — ou pa oblije voye l manyèlman sou WhatsApp.

Men jan l mache:
1. Ou dwe **plede kòd yo davans** nan stock pou chak pwodwi.
2. Lè yon kòmand NatCash konfime "paye" (oswa yon kòmand MonCash peye
   otomatikman), sèvè a pran yon kòd nan stock la, kole l sou kòmand lan,
   e chanje estati a pou "livre".
3. Si pa gen kòd ki disponib, kòmand lan rete "paye" ak yon `en_attente_stock`
   — ou dwe ajoute plis kòd, epi remake statut la "paye" ankò pou l eseye
   livre otomatikman.
4. Kliyan an ka wè kòd li a sou paj `/suivi.html` ak nimewo kòmand li.

**Ajoute kòd nan stock:**
```bash
curl -X POST -H "x-admin-token: TON_TOKEN" -H "Content-Type: application/json" \
  -d '{"productId":"ff-100","codes":["CODE-ABC123","CODE-XYZ456"]}' \
  http://localhost:3000/api/admin/codes
```

**Wè konbyen kòd ki rete pou chak pwodwi:**
```bash
curl -H "x-admin-token: TON_TOKEN" http://localhost:3000/api/admin/codes
```

**Konfime yon kòmand NatCash peye (deklanche livrezon otomatik):**
```bash
curl -X POST -H "x-admin-token: TON_TOKEN" -H "Content-Type: application/json" \
  -d '{"statut":"paye"}' \
  http://localhost:3000/api/admin/orders/ID_KOMAND/statut
```

## MonCash dezaktive pou kounye a

Paske ou pa gen kont business MonCash, `ENABLE_MONCASH=false` nan `.env`.
Sit la montre sèlman NatCash kòm opsyon peman. Lè ou gen enfòmasyon MonCash
yo, mete `ENABLE_MONCASH=true` epi ranpli `MONCASH_CLIENT_ID` /
`MONCASH_CLIENT_SECRET` — bouton MonCash a ap parèt otomatikman ankò.

## Bouton WhatsApp ak paj suivi

- Bouton WhatsApp flotan an itilize `WHATSAPP_NUMBER` nan `.env`.
- Kliyan yo ka swiv kòmand yo sou `/suivi.html` ak ID kòmand yo resevwa a.

## Programme d'affiliation

N'importe qui peut s'inscrire sur `/afilye.html` pour devenir affilié : il
reçoit un code + un lien du type `TON_URL/?ref=SONCODE`. Quand un client
arrive par ce lien et passe commande, le code est automatiquement attaché
à sa commande.

La commission (8% par défaut, modifiable dans `src/affiliates.js` via
`TAUX_COMMISSION`) est créditée **seulement quand toi, l'admin, marques la
commande comme "paye"** (manuellement pour NatCash, ou automatiquement
pour MonCash). Donc aucun risque : personne ne peut se créditer une
commission sans qu'une vraie commande soit confirmée payée par toi.

Voir les affiliés et leurs gains :
```bash
curl -H "x-admin-token: TON_TOKEN" http://localhost:3000/api/admin/affiliates
```

## Mettre le site en ligne

Depuis Termux tu peux développer, mais pour que le site soit accessible
24/7 à tes clients il te faudra un hébergement (VPS pas cher, Render,
Railway...). Dis-moi si tu veux de l'aide pour choisir et déployer — je
peux te guider selon ton budget.

## Sécurité avant la mise en production

- Change `ADMIN_TOKEN` pour quelque chose de long et aléatoire.
- Ne mets jamais `.env` sur GitHub (ajoute-le à `.gitignore`).
- Passe en HTTPS obligatoire une fois hébergé (MonCash l'exige en prod).
