// script.js
// ======================
//  Chart (dummy data for now)
// ======================
const ctx = document.getElementById("portfolioChart").getContext("2d");

const dataSets = {
  "1w":  [102000, 101000, 103500, 104000, 104096],
  "1m":  [98000, 99000, 101000, 103000, 104000],
  "3m":  [94000, 96000, 98000, 100000, 104000],
  "all": [50000, 65000, 72000, 85000, 104000],
};

const chart = new Chart(ctx, {
  type: "line",
  data: {
    labels: ["Day 1", "Day 2", "Day 3", "Today"],
    datasets: [
      {
        label: "Portfolio Value",
        data: dataSets["1w"],
        borderColor: "#a78bfa",
        borderWidth: 2,
        fill: false,
        tension: 0.3,
      },
    ],
  },
  options: {
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: "#94a3b8" }, grid: { color: "#1e293b" } },
      y: { ticks: { color: "#94a3b8" }, grid: { color: "#1e293b" } },
    },
  },
});

// Tabs to switch dummy chart ranges
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const active = document.querySelector(".tab.active");
    if (active) active.classList.remove("active");
    tab.classList.add("active");
    const range = tab.dataset.range;
    chart.data.datasets[0].data = dataSets[range];
    chart.update();
  });
});

/* ======================
   Globals / helpers
   ====================== */

const AUTO_POLL_INTERVAL_MS = 60 * 1000; // 1 minute refresh
const DEBOUNCE_MS = 350;
let _autoPollTimer = null;

function escapeHtml(s) {
  return (s + "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[m]));
}

function formatNumber(v) {
  const n = Number(v);
  if (isNaN(n)) return v;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatSigned(v) {
  const n = Number(v);
  if (isNaN(n)) return v;
  return (n > 0 ? "+" : "") + n.toFixed(2);
}

/* ======================
   Search + Modal
   ====================== */

const searchInput = document.querySelector(".search-bar");
const containerParent = searchInput
  ? searchInput.closest(".profile-title") || document.body
  : document.body;

if (!searchInput) {
  console.warn("No .search-bar found — search disabled.");
} else {
  // ---------- dropdown ----------
  const searchResultsBox = document.createElement("div");
  searchResultsBox.className = "search-results";
  searchResultsBox.style.display = "none";
  searchResultsBox.style.zIndex = 9999;
  containerParent.appendChild(searchResultsBox);

  // ---------- modal elements ----------
  const modal             = document.getElementById("companyModal");
  const modalBackdrop     = document.getElementById("modalBackdrop");
  const modalClose        = document.getElementById("modalClose");
  const modalName         = document.getElementById("modalName");
  const modalSymbol       = document.getElementById("modalSymbol");
  const modalPrice        = document.getElementById("modalPrice");
  const modalChange       = document.getElementById("modalChange");
  const modalOpen         = document.getElementById("modalOpen");
  const modalHigh         = document.getElementById("modalHigh");
  const modalLow          = document.getElementById("modalLow");
  const modalPrev         = document.getElementById("modalPrev");
  const modalChartEl      = document.getElementById("modalChart");
  const modalQty          = document.getElementById("modalQty");
  const modalBuyBtn       = document.getElementById("modalBuyBtn");
  const addToPortfolioBtn = document.getElementById("addToPortfolio");

  let modalChart = null;

  // debounce
  function debounce(fn, wait = DEBOUNCE_MS) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  // --- Search ---
  async function doSearch(query) {
    if (!query || query.length < 2) {
      searchResultsBox.style.display = "none";
      return;
    }

    try {
      const res = await fetch(`/api/search?query=${encodeURIComponent(query)}`);
      if (!res.ok) {
        console.warn("Search failed", res.status);
        searchResultsBox.style.display = "none";
        return;
      }
      const results = await res.json();
      if (!results || results.length === 0) {
        searchResultsBox.style.display = "none";
        return;
      }

      searchResultsBox.innerHTML = results
        .map((r) => {
          const sym  = r.symbol;
          const name = r.name || r.description || r.displaySymbol || sym;
          return `
            <div class="result-item"
                 data-symbol="${escapeHtml(sym)}"
                 data-name="${escapeHtml(name)}"
                 style="padding:8px;cursor:pointer;display:flex;
                        justify-content:space-between;
                        border-bottom:1px solid rgba(255,255,255,0.03);">
              <div>
                <strong>${escapeHtml(name)}</strong>
                <div style="font-size:0.85rem;color:var(--text-muted);">
                  ${escapeHtml(sym)}
                </div>
              </div>
              <div style="align-self:center;color:var(--text-muted);">
                ${escapeHtml(sym)}
              </div>
            </div>`;
        })
        .join("");

      const rect = searchInput.getBoundingClientRect();
      const parentRect = containerParent.getBoundingClientRect();
      searchResultsBox.style.position = "absolute";
      searchResultsBox.style.left = `${rect.left - parentRect.left}px`;
      searchResultsBox.style.top  = `${rect.bottom - parentRect.top + 6}px`;
      searchResultsBox.style.width = `${rect.width}px`;
      searchResultsBox.style.maxHeight = "300px";
      searchResultsBox.style.overflow = "auto";
      searchResultsBox.style.background = "var(--card-bg, #0b1220)";
      searchResultsBox.style.borderRadius = "8px";
      searchResultsBox.style.boxShadow = "0 6px 18px rgba(2,6,23,0.6)";
      searchResultsBox.style.display = "block";

      // click handlers
      searchResultsBox.querySelectorAll(".result-item").forEach((item) => {
        item.addEventListener("click", async () => {
          const symbol = item.getAttribute("data-symbol");
          const name   = item.getAttribute("data-name") || symbol;
          searchInput.value = symbol;
          searchResultsBox.style.display = "none";
          await openCompanyModal(symbol, name);
        });
      });
    } catch (err) {
      console.error("Search error", err);
      searchResultsBox.style.display = "none";
    }
  }

  const debouncedSearch = debounce(
    (e) => doSearch(e.target.value.trim()),
    DEBOUNCE_MS
  );
  searchInput.addEventListener("input", debouncedSearch);

  document.addEventListener("click", (ev) => {
    if (!containerParent.contains(ev.target)) {
      searchResultsBox.style.display = "none";
    }
  });

  // --- Modal helpers ---
  function openModal() {
    if (!modal) return;
    modal.setAttribute("aria-hidden", "false");
    modal.style.display = "block";
  }
  function closeModal() {
    if (!modal) return;
    modal.setAttribute("aria-hidden", "true");
    modal.style.display = "none";
  }
  if (modalClose)    modalClose.addEventListener("click", closeModal);
  if (modalBackdrop) modalBackdrop.addEventListener("click", closeModal);
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") closeModal();
  });

  // --- Draw modal mini-chart ---
  function drawModalChart(points) {
    if (!modalChartEl) return;
    const labels = (points || []).map((p) =>
      p.date || new Date((p.t || 0) * 1000).toISOString().slice(0, 10)
    );
    const data = (points || []).map((p) => p.close ?? p.c ?? p.close);

    if (modalChart) {
      modalChart.data.labels = labels;
      modalChart.data.datasets[0].data = data;
      modalChart.update();
      return;
    }

    modalChart = new Chart(modalChartEl.getContext("2d"), {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            data,
            borderWidth: 2,
            fill: false,
            tension: 0.25,
            borderColor: "#a78bfa",
          },
        ],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: "#94a3b8" }, grid: { color: "#1e293b" } },
          y: { ticks: { color: "#94a3b8" }, grid: { color: "#1e293b" } },
        },
        maintainAspectRatio: false,
      },
    });
  }

  // --- Open company modal (quote + timeseries) ---
  async function openCompanyModal(symbol, name) {
    if (!modal) return;
    openModal();
    modalName.textContent = name;
    modalSymbol.textContent = symbol;
    modalPrice.textContent = "Loading...";
    modalChange.textContent = "";
    modalOpen.textContent =
      modalHigh.textContent =
      modalLow.textContent =
      modalPrev.textContent = "—";

    try {
      const [quoteRes, tsRes] = await Promise.all([
        fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`).then((r) =>
          r.json()
        ),
        fetch(
          `/api/timeseries?symbol=${encodeURIComponent(symbol)}&range=1m`
        )
          .then((r) => r.json())
          .catch(() => []),
      ]);

      const q = quoteRes || {};

      const price     = q.price ?? q.c ?? null;
      const open      = q.open ?? q.o ?? null;
      const high      = q.high ?? q.h ?? null;
      const low       = q.low ?? q.l ?? null;
      const prevClose = q.previousClose ?? q.pc ?? null;

      let change        = q.change;
      let changePercent = q.changePercent;

      if (price != null && prevClose != null) {
        change = price - prevClose;
        changePercent = prevClose === 0 ? 0 : (change / prevClose) * 100;
      }

      modalPrice.textContent = price != null ? formatNumber(price) : "N/A";

      if (change != null) {
        const formattedChange = formatSigned(change);
        const pctText =
          changePercent != null ? `${changePercent.toFixed(2)}%` : null;
        modalChange.textContent = pctText
          ? `${formattedChange} (${pctText})`
          : formattedChange;
      } else {
        modalChange.textContent = "N/A";
      }

      modalOpen.textContent  = open      != null ? formatNumber(open)      : "—";
      modalHigh.textContent  = high      != null ? formatNumber(high)      : "—";
      modalLow.textContent   = low       != null ? formatNumber(low)       : "—";
      modalPrev.textContent  = prevClose != null ? formatNumber(prevClose) : "—";

      if (change > 0)      modalChange.style.color = "var(--green, #4ade80)";
      else if (change < 0) modalChange.style.color = "#fb7185";
      else                 modalChange.style.color = "var(--text-muted)";

      const points = Array.isArray(tsRes) ? tsRes : tsRes.data || [];
      drawModalChart(points);
    } catch (err) {
      console.warn("openCompanyModal error", err);
      modalPrice.textContent = "Error";
      modalChange.textContent = "—";
      drawModalChart([]);
    }
  }

  // --- Buy from modal ---
  async function handleBuyFromModal() {
    const qty = Math.floor(Number(modalQty?.value || 0));
    const symbol = (modalSymbol?.textContent || "").trim();
    if (!symbol || qty <= 0) {
      alert("Invalid symbol or qty");
      return;
    }

    try {
      modalBuyBtn.disabled = true;
      modalBuyBtn.textContent = "Buying...";

      const res = await fetch("/api/buy", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, qty }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert("Buy failed: " + (err.error || res.statusText));
        modalBuyBtn.disabled = false;
        modalBuyBtn.textContent = "Buy";
        return;
      }

      await refreshPricesOnServer(); // update prices + portfolio
      modalBuyBtn.textContent = "Bought ✓";
      setTimeout(() => {
        modalBuyBtn.textContent = "Buy";
        modalBuyBtn.disabled = false;
      }, 1200);
    } catch (err) {
      console.error("Buy error", err);
      alert("Buy failed (network)");
      modalBuyBtn.disabled = false;
      modalBuyBtn.textContent = "Buy";
    }
  }

  if (modalBuyBtn) {
    modalBuyBtn.addEventListener("click", handleBuyFromModal);
  }

  // --- Add to portfolio (qty=1 shortcut) ---
  if (addToPortfolioBtn) {
    addToPortfolioBtn.addEventListener("click", async () => {
      const symbol = (modalSymbol?.textContent || "").trim();
      if (!symbol) return;
      try {
        addToPortfolioBtn.disabled = true;
        addToPortfolioBtn.textContent = "Adding...";
        const res = await fetch("/api/buy", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol, qty: 1 }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          addToPortfolioBtn.textContent = "Error";
          console.warn("Add failed", err);
        } else {
          addToPortfolioBtn.textContent = "Added";
          await refreshPricesOnServer();
        }
      } catch (e) {
        console.error("Add error", e);
        addToPortfolioBtn.textContent = "Error";
      } finally {
        setTimeout(() => {
          addToPortfolioBtn.textContent = "Add to Portfolio";
          addToPortfolioBtn.disabled = false;
        }, 1200);
      }
    });
  }
}

/* ======================
   SELL handler (global)
   ====================== */

async function handleSell(symbol, qty) {
  try {
    const res = await fetch("/api/sell", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, qty }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert("Sell failed: " + (err.error || res.statusText));
      return;
    }

    await refreshPricesOnServer();
  } catch (err) {
    console.error("Sell error", err);
    alert("Sell failed (network error)");
  }
}

/* ======================
   Portfolio rendering & polling
   ====================== */

function renderHoldingsFromServer(holdings) {
  const container = document.getElementById("holdingsList");
  if (!container) return;

  if (!holdings || holdings.length === 0) {
    container.innerHTML =
      `<div style="color:var(--text-muted);">No holdings yet.</div>`;
    return;
  }

  let html = `
    <table style="width:100%; border-collapse:collapse;">
      <thead style="text-align:left; color:var(--text-muted); font-size:0.9rem;">
        <tr>
          <th style="padding:8px;">Symbol</th>
          <th>Qty</th>
          <th>Avg Price</th>
          <th>Market Value</th>
          <th>Unrealized P/L</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
  `;

  holdings.forEach((h) => {
    const qty = Number(h.qty || 0);
    const avg = Number(h.avg_cost || h.avg_price || 0);
    const mv  = Number(
      h.market_value ||
      qty * (h.last_price || avg || 0)
    );
    const pl  = (h.unrealized_pl != null)
      ? Number(h.unrealized_pl)
      : mv - qty * avg;

    const plPrefix = pl >= 0 ? "+" : "";
    const plColor  = pl >= 0 ? "var(--green)" : "#fb7185";

    html += `
      <tr style="border-top:1px solid rgba(255,255,255,0.03);">
        <td style="padding:8px 6px;">
          <strong>${escapeHtml(h.symbol)}</strong>
          <div style="font-size:0.85rem;color:var(--text-muted);">
            ${escapeHtml(h.name || "")}
          </div>
        </td>
        <td style="padding:8px 6px;">${qty}</td>
        <td style="padding:8px 6px;">$${formatNumber(avg)}</td>
        <td style="padding:8px 6px;">$${formatNumber(mv)}</td>
        <td style="padding:8px 6px; color:${plColor};">
          ${plPrefix}$${formatNumber(pl)}
        </td>
        <td style="padding:8px 6px;">
          <button
            class="sell-btn"
            data-symbol="${escapeHtml(h.symbol)}"
            style="padding:4px 10px;border-radius:6px;border:none;
                   background:#ef4444;color:#fff;cursor:pointer;font-size:0.8rem;">
            Sell
          </button>
        </td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;

  container.querySelectorAll(".sell-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const symbol = btn.getAttribute("data-symbol");
      const qtyStr = prompt(`How many shares of ${symbol} do you want to sell?`);
      const qty = Math.floor(Number(qtyStr));
      if (!qty || qty <= 0) return;
      handleSell(symbol, qty);
    });
  });
}

function updateStatsFromServer(account) {
  const statEls = document.querySelectorAll(".stats-grid .stat h3");
  if (!statEls || statEls.length < 5) return;

  const netWorth = Number(account.net_worth || 0);
  const gains    = Number(account.overall_gains || 0);
  const retPct   = Number(account.overall_returns_pct || 0);
  const buying   = Number(account.buying_power ?? account.cash ?? 0);
  const cash     = Number(account.cash || 0);

  statEls[0].textContent = `$${formatNumber(netWorth)}`;
  statEls[1].textContent =
    (gains >= 0 ? "$" : "-$") + formatNumber(Math.abs(gains));
  statEls[1].classList.toggle("green", gains >= 0);
  statEls[2].textContent = `${formatNumber(retPct)}%`;
  statEls[3].textContent = `$${formatNumber(buying)}`;
  statEls[4].textContent = `$${formatNumber(cash)}`;
}

async function loadPortfolioFromServer() {
  try {
    const res = await fetch("/api/portfolio", { credentials: "include" });
    if (res.status === 401) {
      console.warn("Not logged in — portfolio requires auth.");
      return;
    }
    if (!res.ok) {
      console.warn("Failed to fetch portfolio", res.status);
      return;
    }
    const data = await res.json();
    const { account, holdings } = data;
    renderHoldingsFromServer(holdings || []);
    updateStatsFromServer(account || {});
  } catch (err) {
    console.error("loadPortfolioFromServer error", err);
  }
}

async function refreshPricesOnServer() {
  try {
    const res = await fetch("/api/refresh-prices", { credentials: "include" });
    if (!res.ok) {
      console.warn("refresh-prices failed", res.status);
      return;
    }
    await res.json();
    await loadPortfolioFromServer();
  } catch (err) {
    console.error("refreshPricesOnServer error", err);
  }
}

function startAutoUpdates() {
  loadPortfolioFromServer().catch((e) =>
    console.warn("initial portfolio load failed", e)
  );

  if (_autoPollTimer) clearInterval(_autoPollTimer);
  _autoPollTimer = setInterval(() => {
    refreshPricesOnServer().catch((e) =>
      console.warn("periodic price refresh failed", e)
    );
  }, AUTO_POLL_INTERVAL_MS);
}

function stopAutoUpdates() {
  if (_autoPollTimer) {
    clearInterval(_autoPollTimer);
    _autoPollTimer = null;
  }
}

// DOM ready
document.addEventListener("DOMContentLoaded", () => {
  loadPortfolioFromServer();
  startAutoUpdates();
});
