const state = {
  products: [],
  activeCat: "jeux",
  selectedProduct: null,
  paymentMethod: null,
  config: { enableMoncash: false, whatsapp: null },
};

const CAT_LABELS = { jeux: "Jwèt", streaming: "Streaming", carte: "Kat prepeye", kado: "Kat Kado", finans: "Sèvis Finansye" };

// Capture le lien d'affiliation (?ref=CODE) et le garde en mémoire pour
// l'attacher automatiquement à la prochaine commande.
(function captureParrainage() {
  const ref = new URLSearchParams(window.location.search).get("ref");
  if (ref) localStorage.setItem("rechaj_ref", ref.toUpperCase());
})();

function getCodeParrain() {
  return localStorage.getItem("rechaj_ref") || null;
}

const ICONS = {
  diamant: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M9 3l3 6-3 12M15 3l-3 6 3 12"/></svg>`,
  uc: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M9 9.5c0-1.5 1.3-2.5 3-2.5s3 1 3 2.2c0 2.8-6 2-6 5.3 0 1.5 1.3 2.5 3 2.5s3-1 3-2.5"/></svg>`,
  play: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M10 8.5l6 3.5-6 3.5z" fill="currentColor" stroke="none"/></svg>`,
  carte: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20"/><path d="M6 15h4"/></svg>`,
};

const grid = document.getElementById("product-grid");
const popularGrid = document.getElementById("popular-grid");
const catGrid = document.getElementById("cat-grid");
const catSectionTitle = document.getElementById("cat-section-title");
const overlay = document.getElementById("overlay");
const panel = document.getElementById("order-panel");
const panelContent = document.getElementById("order-panel-content");

async function init() {
  const [produits, config] = await Promise.all([
    fetch("/api/products").then((r) => r.json()),
    fetch("/api/config").then((r) => r.json()),
  ]);
  state.products = produits;
  state.config = config;

  setupWhatsapp();
  renderPopular();
  renderGrid();
}

function setupWhatsapp() {
  const numero = state.config.whatsapp;
  const lyen = numero
    ? `https://wa.me/${numero}`
    : "https://wa.me/";
  document.getElementById("whatsapp-float").href = lyen;
  document.getElementById("side-whatsapp").href = lyen;
}

function iconOuBadge(p) {
  if (p.badge) {
    return `<div class="product-icon badge-icon" style="background:${p.couleur}22; color:${p.couleur};">${p.badge}</div>`;
  }
  return `<div class="product-icon">${ICONS[p.icone] || ICONS.diamant}</div>`;
}

function productCardHTML(p) {
  const prixHTML = p.sou_demand
    ? `<div class="product-price product-price-demand">Sou demand</div>`
    : `<div class="product-price">${p.prix_htg}<span>HTG</span></div>`;
  return `
    <div class="product-card" data-id="${p.id}">
      ${iconOuBadge(p)}
      <div class="product-game">${p.jeu}</div>
      <div class="product-name">${p.nom}</div>
      ${prixHTML}
    </div>
  `;
}

function attachCardListeners(container) {
  container.querySelectorAll(".product-card").forEach((card) => {
    card.addEventListener("click", () => openOrderPanel(card.dataset.id));
  });
}

function renderPopular() {
  // Les 3 premiers produits de chaque catégorie principale = "populaires"
  const vedettes = ["ff-100", "netflix-1mois", "pubg-60"]
    .map((id) => state.products.find((p) => p.id === id))
    .filter(Boolean);

  popularGrid.innerHTML = vedettes
    .map(
      (p, i) => `
    <div class="product-card popular-card" data-id="${p.id}">
      <span class="badge">${i === 0 ? "🔥 #1" : "🔥 POPILÈ"}</span>
      ${iconOuBadge(p)}
      <div class="product-game">${p.jeu}</div>
      <div class="product-name">${p.nom}</div>
      <div class="product-price">${p.prix_htg}<span>HTG</span></div>
    </div>
  `
    )
    .join("");
  attachCardListeners(popularGrid);
}

function renderGrid() {
  const items = state.products.filter((p) => p.categorie === state.activeCat);
  catSectionTitle.innerHTML = `<span>${CAT_LABELS[state.activeCat] || ""}</span>`;
  grid.innerHTML = items.map(productCardHTML).join("");
  attachCardListeners(grid);
}

catGrid.querySelectorAll(".cat-icon-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    catGrid.querySelectorAll(".cat-icon-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.activeCat = btn.dataset.cat;
    renderGrid();
    document.getElementById("cat-section-title").scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

// ---------- Menu latéral ----------

const menuBtn = document.getElementById("menu-btn");
const sideMenu = document.getElementById("side-menu");
const menuOverlay = document.getElementById("menu-overlay");

function openMenu() {
  sideMenu.classList.add("open");
  menuOverlay.classList.add("visible");
}
function closeMenu() {
  sideMenu.classList.remove("open");
  menuOverlay.classList.remove("visible");
}
menuBtn.addEventListener("click", openMenu);
document.getElementById("close-menu").addEventListener("click", closeMenu);
menuOverlay.addEventListener("click", closeMenu);

// ---------- Panneau de commande ----------

function champLabel(champ) {
  const labels = {
    id_joueur: "ID jwè",
    email_compte: "Imèl kont Netflix",
    nom_complet: "Non konplè",
    telephone: "Nimewo telefòn",
  };
  return labels[champ] || champ;
}

function openOrderPanel(productId) {
  const produit = state.products.find((p) => p.id === productId);
  state.selectedProduct = produit;

  // Pwodwi "sou demand" (sèvis finansye) : pa gen katalòg pri fiks, se yon
  // demand kontak sou WhatsApp ak enfòmasyon kliyan an bay.
  if (produit.sou_demand) {
    panelContent.innerHTML = `
      <h2 style="font-family:var(--font-display); margin-top:8px;">${produit.jeu} — ${produit.nom}</h2>
      <p style="color:var(--text-dim); font-size:14px;">Sèvis sa a sou demand — ranpli enfòmasyon yo epi nou kontakte w sou WhatsApp ak detay yo.</p>
      <form id="demand-form">
        ${produit.champs_requis
          .map(
            (champ) => `
          <div class="field-group">
            <label>${champLabel(champ)}</label>
            <input type="text" name="${champ}" required />
          </div>
        `
          )
          .join("")}
        <button type="submit" class="btn btn-primary" style="margin-top:8px;">Kontakte nou sou WhatsApp</button>
      </form>
    `;
    document.getElementById("demand-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const detay = produit.champs_requis.map((c) => `${champLabel(c)}: ${formData.get(c)}`).join(", ");
      const mesaj = encodeURIComponent(`Bonjou, mwen enterese nan ${produit.jeu} - ${produit.nom}. ${detay}`);
      const numero = state.config.whatsapp;
      window.open(`https://wa.me/${numero}?text=${mesaj}`, "_blank");
    });
    overlay.classList.add("visible");
    panel.classList.add("open");
    return;
  }

  state.paymentMethod = "natcash";

  const optionsPeman = `
    <div class="pay-options">
      ${state.config.enableMoncash ? `<div class="pay-option" data-method="moncash">MonCash</div>` : ""}
      <div class="pay-option selected" data-method="natcash">NatCash</div>
      <div class="pay-option" data-method="wallet">Pòtfèy</div>
    </div>
  `;

  panelContent.innerHTML = `
    <h2 style="font-family:var(--font-display); margin-top:8px;">${produit.jeu} — ${produit.nom}</h2>
    <div class="product-price" style="margin-bottom:10px;">${produit.prix_htg}<span>HTG</span></div>

    <form id="order-form">
      ${produit.champs_requis
        .map(
          (champ) => `
        <div class="field-group">
          <label>${champLabel(champ)}</label>
          <input type="text" name="${champ}" required />
        </div>
      `
        )
        .join("")}

      <div class="field-group">
        <label>Metòd peman</label>
        ${optionsPeman}
      </div>

      <div id="wallet-fields"></div>

      <div class="error-msg" id="order-error"></div>
      <button type="submit" class="btn btn-primary" style="margin-top:8px;">Kòmande kounye a</button>
    </form>
  `;

  panelContent.querySelectorAll(".pay-option").forEach((opt) => {
    opt.addEventListener("click", () => {
      panelContent.querySelectorAll(".pay-option").forEach((o) => o.classList.remove("selected"));
      opt.classList.add("selected");
      state.paymentMethod = opt.dataset.method;
      renderWalletFields();
    });
  });

  function renderWalletFields() {
    const zone = document.getElementById("wallet-fields");
    if (state.paymentMethod !== "wallet") {
      zone.innerHTML = "";
      return;
    }
    zone.innerHTML = `
      <div class="field-group">
        <label>Nimewo pòtfèy ou</label>
        <input type="text" name="telephone_wallet" required />
      </div>
      <div class="field-group">
        <label>Kòd PIN</label>
        <input type="password" name="pin_wallet" required />
      </div>
      <p style="font-size:12.5px; color:var(--text-dim);">Poko gen yon pòtfèy? <a href="/wallet.html" style="color:var(--lime);">Kreye youn</a></p>
    `;
  }

  document.getElementById("order-form").addEventListener("submit", submitOrder);

  overlay.classList.add("visible");
  panel.classList.add("open");
}

function closePanel() {
  overlay.classList.remove("visible");
  panel.classList.remove("open");
}

document.getElementById("close-panel").addEventListener("click", closePanel);
overlay.addEventListener("click", closePanel);

async function submitOrder(e) {
  e.preventDefault();
  const errorEl = document.getElementById("order-error");
  errorEl.textContent = "";

  if (!state.paymentMethod) {
    errorEl.textContent = "Chwazi yon metòd peman.";
    return;
  }

  const formData = new FormData(e.target);
  const champs = {};
  let telephoneWallet = null;
  let pinWallet = null;
  for (const [key, value] of formData.entries()) {
    if (key === "telephone_wallet") telephoneWallet = value;
    else if (key === "pin_wallet") pinWallet = value;
    else champs[key] = value;
  }

  try {
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: state.selectedProduct.id,
        quantite: 1,
        champs,
        methode_paiement: state.paymentMethod,
        code_parrain: getCodeParrain(),
        telephone_wallet: telephoneWallet,
        pin_wallet: pinWallet,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      errorEl.textContent = data.erreur || "Yon erè pase.";
      return;
    }

    if (state.paymentMethod === "moncash") {
      window.location.href = data.redirection;
      return;
    }

    if (state.paymentMethod === "wallet") {
      const c = data.commande;
      panelContent.innerHTML = `
        <h2 style="font-family:var(--font-display);">Kòmand konfime ✅</h2>
        <p style="color:var(--text-dim);">Peye ak pòtfèy — livrezon instantane.</p>
        ${c.code_redeem
          ? `<div class="affil-link-box">${c.code_redeem}</div>`
          : `<p style="color:var(--text-dim); font-size:13px;">Kòd ou ap parèt sou /suivi.html byento — stock ap ranpli.</p>`
        }
        <a href="/suivi.html?id=${c.id}" class="btn btn-secondary" style="margin-top:12px;">Swiv kòmand ou →</a>
      `;
      return;
    }

    // NatCash : afficher les instructions + champ pour soumettre la référence
    const info = data.instructions_natcash;
    const orderId = data.commande.id;
    panelContent.innerHTML = `
      <h2 style="font-family:var(--font-display);">Peye ak NatCash</h2>
      <div class="natcash-box">
        Voye <span class="mono">${info.montant_htg} HTG</span> nan nimewo
        <span class="mono">${info.numero}</span> (${info.nom}) via *202# oswa app Natcash.
      </div>
      <form id="ref-form">
        <div class="field-group">
          <label>Referans tranzaksyon NatCash lan</label>
          <input type="text" name="reference" required />
        </div>
        <button type="submit" class="btn btn-primary">Soumèt referans lan</button>
      </form>
      <p id="ref-msg" style="margin-top:12px; color:var(--text-dim); font-size:13px;"></p>
    `;

    document.getElementById("ref-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const reference = ev.target.reference.value;
      const r = await fetch(`/api/orders/${orderId}/confirmer-natcash`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference }),
      });
      const rd = await r.json();

      if (r.ok) {
        document.getElementById("ref-msg").innerHTML = `
          Mèsi ! Kòmand ou an ap tann verifikasyon.<br/>
          Nimewo kòmand ou: <span class="mono">${orderId}</span><br/>
          <a href="/suivi.html?id=${orderId}" style="color:var(--lime);">Swiv kòmand ou isit la →</a>
        `;
      } else {
        document.getElementById("ref-msg").textContent = rd.erreur || "Erè pandan soumisyon an.";
      }
    });
  } catch (err) {
    errorEl.textContent = "Pa t rive kontakte sèvè a.";
  }
}

init();
