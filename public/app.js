const state = {
  products: [],
  activeCat: "jeux",
  selectedProduct: null,
  paymentMethod: null,
};

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
const tabs = document.getElementById("cat-tabs");
const overlay = document.getElementById("overlay");
const panel = document.getElementById("order-panel");
const panelContent = document.getElementById("order-panel-content");

async function init() {
  const res = await fetch("/api/products");
  state.products = await res.json();
  renderGrid();
}

function renderGrid() {
  const items = state.products.filter((p) => p.categorie === state.activeCat);
  grid.innerHTML = items
    .map(
      (p) => `
    <div class="product-card" data-id="${p.id}">
      <div class="product-icon">${ICONS[p.icone] || ICONS.diamant}</div>
      <div class="product-game">${p.jeu}</div>
      <div class="product-name">${p.nom}</div>
      <div class="product-price">${p.prix_htg}<span>HTG</span></div>
    </div>
  `
    )
    .join("");

  grid.querySelectorAll(".product-card").forEach((card) => {
    card.addEventListener("click", () => openOrderPanel(card.dataset.id));
  });
}

tabs.querySelectorAll(".cat-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.querySelectorAll(".cat-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    state.activeCat = tab.dataset.cat;
    renderGrid();
  });
});

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
  state.paymentMethod = null;

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
        <div class="pay-options">
          <div class="pay-option" data-method="moncash">MonCash</div>
          <div class="pay-option" data-method="natcash">NatCash</div>
        </div>
      </div>

      <div id="natcash-info"></div>
      <div class="error-msg" id="order-error"></div>
      <button type="submit" class="btn btn-primary" style="margin-top:8px;">Kòmande kounye a</button>
    </form>
  `;

  panelContent.querySelectorAll(".pay-option").forEach((opt) => {
    opt.addEventListener("click", () => {
      panelContent.querySelectorAll(".pay-option").forEach((o) => o.classList.remove("selected"));
      opt.classList.add("selected");
      state.paymentMethod = opt.dataset.method;
    });
  });

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
  for (const [key, value] of formData.entries()) champs[key] = value;

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

    // NatCash : afficher les instructions + champ pour soumettre la référence
    const info = data.instructions_natcash;
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
      const r = await fetch(`/api/orders/${data.commande.id}/confirmer-natcash`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference }),
      });
      const rd = await r.json();
      document.getElementById("ref-msg").textContent = r.ok
        ? "Mèsi ! Kòmand ou an ap tann verifikasyon."
        : rd.erreur || "Erè pandan soumisyon an.";
    });
  } catch (err) {
    errorEl.textContent = "Pa t rive kontakte sèvè a.";
  }
}

init();
