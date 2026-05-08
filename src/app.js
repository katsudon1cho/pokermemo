const SUPABASE_CONFIG = window.POKERMEMO_SUPABASE || {};
const app = document.querySelector("#app");
const THEME_KEY = "pokermemo.theme";

const TYPE_TAGS = ["TAG", "LAG", "Nit", "Calling Station", "Maniac", "Reg", "Fish", "Unknown"];
const ACTION_TAGS = ["VPIP多い", "VPIP少ない", "3bet多い", "3bet少ない", "C-bet多い", "ブラフ多い", "コール多い", "フォールド多い", "ショーダウン弱い", "リバー降りない"];
const SEAT_COUNTS = [6, 8, 9, 10];

const APPEARANCE = {
  regionMarker: ["none", "japanese", "chinese", "korean", "otherAsian", "whiteGroup", "blackGroup", "latino"],
  hairStyle: ["short", "long", "buzz", "none"],
  hat: ["none", "cap", "beanie"],
  glasses: ["none", "glasses", "sunglasses"],
  beard: ["none", "mustache", "goatee", "full"],
  clothing: ["tshirt", "shirt", "hoodie", "jacket"],
  clothingColor: ["black", "white", "gray", "red", "blue", "green"]
};

const APPEARANCE_LABELS = {
  regionMarker: "国/地域マーカー",
  hairStyle: "髪型",
  hat: "帽子",
  glasses: "眼鏡",
  beard: "ひげ",
  clothing: "服タイプ",
  clothingColor: "服色",
  japanese: "日本人",
  chinese: "中国人",
  korean: "韓国人",
  otherAsian: "その他アジア人",
  whiteGroup: "白人",
  blackGroup: "黒人",
  latino: "ラテン系",
  short: "短髪",
  long: "長髪",
  buzz: "坊主",
  none: "なし",
  black: "黒",
  brown: "茶",
  blond: "金",
  gray: "グレー",
  cap: "キャップ",
  beanie: "ニット帽",
  glasses: "眼鏡",
  sunglasses: "サングラス",
  mustache: "口ひげ",
  goatee: "あごひげ",
  full: "フル",
  tshirt: "Tシャツ",
  shirt: "シャツ",
  hoodie: "パーカー",
  jacket: "ジャケット",
  white: "白",
  red: "赤",
  blue: "青",
  green: "緑"
};

const DEFAULT_APPEARANCE = {
  regionMarker: "none",
  hairStyle: "short",
  hat: "none",
  glasses: "none",
  beard: "none",
  clothing: "hoodie",
  clothingColor: "gray"
};

let supabaseClient = null;
let authUser = null;
let route = { name: "sessions" };
let cache = {
  sessions: [],
  players: [],
  seats: []
};

let theme = localStorage.getItem(THEME_KEY) || "dark";
applyTheme(theme);

let isFirstRender = true;
let isTransitioning = false;
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function haptic(ms = 8) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch (_) {}
}

function configured() {
  return Boolean(SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey && window.supabase);
}

function applyTheme(nextTheme) {
  theme = nextTheme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  document.querySelector("meta[name='theme-color']")?.setAttribute("content", theme === "dark" ? "#111315" : "#f7f7f8");
}

function client() {
  if (!configured()) return null;
  if (!supabaseClient) {
    supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
  }
  return supabaseClient;
}

async function init() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  bindGlobalScroll();
  bindSwipeBack();

  if (!configured()) {
    renderConfigMissing();
    return;
  }

  const sb = client();
  const { data } = await sb.auth.getSession();
  authUser = data.session?.user || null;
  sb.auth.onAuthStateChange((_event, session) => {
    authUser = session?.user || null;
    route = { name: authUser ? "sessions" : "auth" };
    isFirstRender = true;
    render();
  });
  route = { name: authUser ? "sessions" : "auth" };
  await render();
  isFirstRender = false;
}

function renderConfigMissing() {
  app.innerHTML = `
    <main class="screen auth-card">
      <h1 class="app-title">Poker Memo</h1>
      <p class="auth-copy">Supabase設定を入れると起動できます。</p>
      <div class="notice">
        <div><strong>config.js</strong> にProject URLとAnon Keyを設定してください。</div>
        <div class="row-subtitle">スキーマは supabase/schema.sql にあります。</div>
      </div>
    </main>
  `;
}

async function render() {
  if (!authUser) {
    renderAuth();
    return;
  }

  if (route.name === "sessions") await renderSessions();
  if (route.name === "new-session") renderNewSession();
  if (route.name === "table") await renderTable(route.sessionId);
  if (route.name === "select-player") await renderPlayerSelect(route.sessionId, route.seatNo);
  if (route.name === "player") await renderPlayer(route.playerId, route.context || {});
  if (route.name === "settings") renderSettings();
}

/* ---------- Navigation with transitions ---------- */

async function go(nextRoute, direction = "forward") {
  if (isTransitioning) return;
  hideSheet();
  haptic(direction === "back" ? 6 : 10);

  const currentScreen = app.firstElementChild;
  const skip = isFirstRender || reduceMotion() || !currentScreen
    || direction === "instant" || !app.animate;

  if (skip) {
    route = nextRoute;
    isFirstRender = false;
    await render();
    return;
  }

  isTransitioning = true;

  // Capture current scroll position so the cloned overlay shows the same
  // viewport the user was looking at, not the top of the page.
  const scrollY = window.scrollY || document.documentElement.scrollTop || 0;

  // Snapshot the current screen into a fixed-position overlay so it stays
  // visible while we render the new content into #app.
  const overlay = document.createElement("div");
  overlay.className = "page-overlay";
  const overlayShifter = document.createElement("div");
  overlayShifter.className = "page-overlay-inner";
  if (scrollY) overlayShifter.style.transform = `translate3d(0, ${-scrollY}px, 0)`;
  overlayShifter.appendChild(currentScreen.cloneNode(true));
  overlay.appendChild(overlayShifter);
  document.body.appendChild(overlay);

  // Hide the new content until the animation can start; the user only sees
  // the overlay during render. This avoids any "unanimated flash".
  app.classList.add("page-anim");
  app.style.visibility = "hidden";

  route = nextRoute;
  await render();
  window.scrollTo(0, 0);
  app.style.visibility = "";

  const isForward = direction === "forward";
  // Standard iOS-like decelerated curve: starts with momentum, settles smoothly.
  // Less front-loaded than 0.32/0.72/0/1, so the tail doesn't feel stalled.
  const easing = "cubic-bezier(0.32, 0.08, 0.24, 1)";
  const duration = 340;

  if (isForward) {
    app.style.zIndex = "60";
    overlay.style.zIndex = "50";
  } else {
    app.style.zIndex = "50";
    overlay.style.zIndex = "60";
  }

  // Transform-only animations — no filter — for smoothest GPU compositing.
  // Parallax dim is provided by a separate dimmer element inside the overlay.
  const enterFrames = isForward
    ? [{ transform: "translate3d(100%, 0, 0)" }, { transform: "translate3d(0, 0, 0)" }]
    : [{ transform: "translate3d(-22%, 0, 0)" }, { transform: "translate3d(0, 0, 0)" }];

  const exitFrames = isForward
    ? [{ transform: "translate3d(0, 0, 0)" }, { transform: "translate3d(-22%, 0, 0)" }]
    : [{ transform: "translate3d(0, 0, 0)" }, { transform: "translate3d(100%, 0, 0)" }];

  const enterAnim = app.animate(enterFrames, { duration, easing, fill: "both" });
  const exitAnim = overlay.animate(exitFrames, { duration, easing, fill: "both" });

  try {
    await Promise.all([enterAnim.finished, exitAnim.finished]);
  } catch (_) {}

  enterAnim.cancel();
  exitAnim.cancel();
  overlay.remove();
  app.classList.remove("page-anim");
  app.style.zIndex = "";
  isTransitioning = false;
}

/* ---------- Global scroll: nav scrolled / large title collapse ---------- */

function bindGlobalScroll() {
  const handler = () => {
    const navEl = document.querySelector(".nav");
    if (!navEl) return;
    const hasLarge = document.querySelector(".has-large-title");
    if (hasLarge) {
      const largeTitle = hasLarge.querySelector(".large-title");
      const bottom = largeTitle ? largeTitle.getBoundingClientRect().bottom : 999;
      const collapsed = bottom < 48;
      navEl.classList.toggle("collapsed", collapsed);
      navEl.classList.toggle("scrolled", collapsed);
    } else {
      navEl.classList.toggle("scrolled", (window.scrollY || 0) > 4);
    }
  };
  window.addEventListener("scroll", handler, { passive: true });
  window.addEventListener("resize", handler);
}

/* ---------- Swipe-back gesture ---------- */

function bindSwipeBack() {
  const EDGE_PX = 28;
  const COMPLETE_RATIO = 0.35;
  let startX = null, startY = null, dragging = false, dx = 0, hapticFired = false;
  const screenW = () => window.innerWidth || document.documentElement.clientWidth || 360;

  const getBackRoute = () => {
    const btn = app.querySelector("[data-nav-back]");
    if (!btn) return null;
    try { return JSON.parse(btn.dataset.navBack); } catch { return null; }
  };

  const reset = () => {
    startX = null; startY = null; dragging = false; dx = 0; hapticFired = false;
    app.style.transform = "";
    app.style.transition = "";
  };

  app.addEventListener("touchstart", (event) => {
    if (isTransitioning) return;
    if (event.touches.length !== 1) return;
    const t = event.touches[0];
    if (t.clientX > EDGE_PX) return;
    if (!getBackRoute()) return;
    startX = t.clientX;
    startY = t.clientY;
    dragging = false;
    dx = 0;
    hapticFired = false;
  }, { passive: true });

  app.addEventListener("touchmove", (event) => {
    if (startX == null) return;
    const t = event.touches[0];
    const moveX = t.clientX - startX;
    const moveY = Math.abs(t.clientY - startY);
    if (!dragging) {
      if (moveX > 8 && moveX > moveY) {
        dragging = true;
        app.style.transition = "none";
      } else if (moveY > 8) {
        reset();
        return;
      } else {
        return;
      }
    }
    if (moveX < 0) return;
    dx = moveX;
    app.style.transform = `translateX(${dx}px)`;
    if (!hapticFired && dx > screenW() * COMPLETE_RATIO) {
      haptic(6);
      hapticFired = true;
    }
  }, { passive: true });

  app.addEventListener("touchend", () => {
    if (!dragging) { reset(); return; }
    const w = screenW();
    const passed = dx > w * COMPLETE_RATIO;
    const back = getBackRoute();
    const releasedDx = dx;
    startX = null; startY = null; dragging = false; dx = 0; hapticFired = false;
    if (passed && back) {
      completeSwipeBack(releasedDx, back);
    } else {
      app.style.transition = "transform 220ms cubic-bezier(0.32, 0.72, 0, 1)";
      app.style.transform = "";
      window.setTimeout(() => { app.style.transition = ""; }, 220);
    }
  });

  app.addEventListener("touchcancel", reset);
}

async function completeSwipeBack(currentDx, backRoute) {
  if (isTransitioning) return;
  isTransitioning = true;

  const w = window.innerWidth || document.documentElement.clientWidth || 360;

  // Move the currently-translated old screen into an overlay so we can
  // slide it off without holding the live #app hostage. The overlay starts
  // at the exact pixel offset the finger left it at.
  const overlay = document.createElement("div");
  overlay.className = "page-overlay";
  overlay.style.zIndex = "60";
  overlay.style.transform = `translate3d(${currentDx}px, 0, 0)`;
  const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
  const inner = document.createElement("div");
  inner.className = "page-overlay-inner";
  if (scrollY) inner.style.transform = `translate3d(0, ${-scrollY}px, 0)`;
  inner.appendChild(app.firstElementChild.cloneNode(true));
  overlay.appendChild(inner);
  document.body.appendChild(overlay);

  // Reset #app: clear inline transform from the live drag, hide while we
  // render the back target into it. Behind the sliding overlay, #app will
  // hold the destination screen with no animation needed.
  app.style.transform = "";
  app.style.transition = "";
  app.style.visibility = "hidden";

  const renderPromise = (async () => {
    route = backRoute;
    await render();
    window.scrollTo(0, 0);
    app.style.visibility = "";
  })();

  // Animate overlay (old screen) sliding off to the right. Duration scales
  // a little with how far the finger had already pushed it — closer to the
  // edge means a shorter remaining slide.
  const remaining = Math.max(0, w - currentDx);
  const duration = Math.round(160 + (remaining / w) * 180);
  const overlayAnim = overlay.animate(
    [
      { transform: `translate3d(${currentDx}px, 0, 0)` },
      { transform: "translate3d(100%, 0, 0)" }
    ],
    { duration, easing: "cubic-bezier(0.32, 0.72, 0, 1)", fill: "forwards" }
  );

  try {
    await Promise.all([renderPromise, overlayAnim.finished]);
  } catch (_) {}

  overlayAnim.cancel();
  overlay.remove();
  isTransitioning = false;
}

/* ---------- Nav helpers ---------- */

function nav(title, left = "", right = "", options = {}) {
  const small = `
    <header class="nav">
      <div class="nav-left">${left}</div>
      <h1>${escapeHtml(title)}</h1>
      <div class="nav-right">${right}</div>
    </header>
  `;
  if (options.large) {
    return small + `<h1 class="large-title">${escapeHtml(title)}</h1>`;
  }
  return small;
}

function backButton(target = { name: "sessions" }) {
  return `<button class="link-button" data-nav-back='${JSON.stringify(target)}'>戻る</button>`;
}

/* ---------- Screens ---------- */

function renderAuth(mode = "login") {
  app.innerHTML = `
    <main class="screen auth-card">
      <h1 class="app-title">Poker Memo</h1>
      <p class="auth-copy">同卓者を席からすばやく記録。</p>
      <div class="segmented">
        <button class="${mode === "login" ? "active" : ""}" data-auth-mode="login">ログイン</button>
        <button class="${mode === "signup" ? "active" : ""}" data-auth-mode="signup">登録</button>
      </div>
      <form id="auth-form" class="section">
        <div class="field">
          <label>メールアドレス</label>
          <input class="input" name="email" type="email" autocomplete="email" required />
        </div>
        <div class="field">
          <label>パスワード</label>
          <input class="input" name="password" type="password" autocomplete="${mode === "login" ? "current-password" : "new-password"}" required />
        </div>
        <button class="primary-button" type="submit">${mode === "login" ? "ログイン" : "アカウント作成"}</button>
      </form>
      <div class="auth-actions">
        <button class="secondary-button" data-oauth="google">Googleで続ける</button>
        <button class="secondary-button" data-oauth="apple">Appleで続ける</button>
        <button class="link-button" data-reset-password>パスワード再設定メールを送る</button>
      </div>
      <div id="auth-status" class="status"></div>
    </main>
  `;

  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => { haptic(6); renderAuth(button.dataset.authMode); });
  });

  document.querySelector("#auth-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    haptic(10);
    const form = new FormData(event.currentTarget);
    const email = form.get("email");
    const password = form.get("password");
    setStatus("auth-status", "処理中...");
    const sb = client();
    const result = mode === "login"
      ? await sb.auth.signInWithPassword({ email, password })
      : await sb.auth.signUp({ email, password });
    setStatus("auth-status", result.error ? result.error.message : "完了しました");
  });

  document.querySelectorAll("[data-oauth]").forEach((button) => {
    button.addEventListener("click", async () => {
      haptic(10);
      await client().auth.signInWithOAuth({
        provider: button.dataset.oauth,
        options: { redirectTo: location.href.split("#")[0] }
      });
    });
  });

  document.querySelector("[data-reset-password]").addEventListener("click", async () => {
    haptic(8);
    const email = document.querySelector("[name='email']").value;
    if (!email) {
      setStatus("auth-status", "メールアドレスを入力してください");
      return;
    }
    const { error } = await client().auth.resetPasswordForEmail(email, { redirectTo: location.href.split("#")[0] });
    setStatus("auth-status", error ? error.message : "再設定メールを送信しました");
  });
}

async function renderSessions() {
  await loadSessions();
  app.innerHTML = `
    <main class="screen has-large-title">
      ${nav("セッション", "", `<button class="link-button" data-nav='{"name":"settings"}'>設定</button>`, { large: true })}
      <button class="primary-button" data-nav='{"name":"new-session"}'>新規セッション</button>
      <section class="section">
        <div class="list">
          ${cache.sessions.length ? cache.sessions.map(sessionRow).join("") : `<div class="empty">セッションはまだありません</div>`}
        </div>
      </section>
    </main>
  `;
  bindNav();
}

function sessionRow(session) {
  const occupied = cache.seats.filter((seat) => seat.session_id === session.id).length;
  const date = formatDate(session.updated_at || session.created_at);
  return `
    <button class="row" data-nav='${JSON.stringify({ name: "table", sessionId: session.id })}'>
      <div>
        <div class="row-title">${escapeHtml(session.casino_name)}</div>
        <div class="row-subtitle">${session.seat_count}-max / ${occupied}人 / Hero ${session.hero_seat ? `Seat ${session.hero_seat}` : "未設定"} / ${date}</div>
      </div>
      <div class="chevron">›</div>
    </button>
  `;
}

function renderNewSession() {
  app.innerHTML = `
    <main class="screen">
      ${nav("新規セッション", backButton())}
      <form id="session-form">
        <div class="field">
          <label>カジノ名</label>
          <input class="input" name="casino_name" placeholder="Bellagio" required />
        </div>
        <div class="field">
          <label>席数</label>
          <select class="select" name="seat_count">
            ${SEAT_COUNTS.map((count) => `<option value="${count}" ${count === 9 ? "selected" : ""}>${count}-max</option>`).join("")}
          </select>
        </div>
        <button class="primary-button" type="submit">作成</button>
      </form>
      <div id="session-status" class="status"></div>
    </main>
  `;
  bindNav();
  document.querySelector("#session-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    haptic(10);
    const form = new FormData(event.currentTarget);
    const payload = {
      user_id: authUser.id,
      casino_name: String(form.get("casino_name")).trim(),
      seat_count: Number(form.get("seat_count"))
    };
    setStatus("session-status", "作成中...");
    const { data, error } = await client().from("sessions").insert(payload).select().single();
    if (error) {
      setStatus("session-status", error.message);
      return;
    }
    go({ name: "table", sessionId: data.id }, "forward");
  });
}

async function renderTable(sessionId) {
  await loadAllForSession(sessionId);
  const session = cache.sessions.find((item) => item.id === sessionId);
  if (!session) {
    go({ name: "sessions" }, "back");
    return;
  }

  app.innerHTML = `
    <main class="screen screen-fixed">
      ${nav(session.casino_name, backButton(), `<select class="nav-select" id="seat-count">${SEAT_COUNTS.map((count) => `<option value="${count}" ${count === session.seat_count ? "selected" : ""}>${count}-max</option>`).join("")}</select>`)}
      <div class="table-wrap">
        <div class="felt">${session.seat_count}-max</div>
        ${renderSeats(session)}
      </div>
    </main>
  `;
  bindNav();
  document.querySelector("#seat-count").addEventListener("change", async (event) => {
    haptic(6);
    await client().from("sessions").update({ seat_count: Number(event.target.value) }).eq("id", session.id);
    render();
  });
  document.querySelectorAll("[data-seat]").forEach((seatButton) => {
    seatButton.addEventListener("click", () => { haptic(8); openSeatSheet(session, Number(seatButton.dataset.seat)); });
  });
}

function renderSeats(session) {
  return Array.from({ length: session.seat_count }, (_, index) => {
    const seatNo = index + 1;
    const { x, y } = seatPosition(index, session.seat_count);
    const seat = cache.seats.find((item) => item.session_id === session.id && item.seat_no === seatNo);
    const player = seat ? cache.players.find((item) => item.id === seat.player_id) : null;
    const hero = session.hero_seat === seatNo;
    const typeClass = player ? typeStyleClass(player.current_type_tags || []) : "";
    const tags = player ? [...(player.current_type_tags || []), ...(player.current_action_tags || [])].slice(0, 2) : [];
    return `
      <button class="seat ${hero ? "hero" : ""} ${typeClass} ${player ? "" : "empty"}" style="left:${x}%; top:${y}%;" data-seat="${seatNo}">
        ${player ? `<div class="seat-flag">${escapeHtml(regionFlag(player.appearance?.regionMarker))}</div>` : ""}
        <div class="seat-no">Seat ${seatNo}${hero ? " / Hero" : ""}</div>
        ${player ? avatar(player.appearance, "avatar") : ""}
        <div class="seat-name">${escapeHtml(player ? playerName(player) : "Empty")}</div>
        <div class="seat-tags">${tags.map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`).join("")}</div>
      </button>
    `;
  }).join("");
}

function typeStyleClass(typeTags) {
  const primaryType = typeTags.find((tag) => TYPE_TAGS.includes(tag)) || "Unknown";
  const styles = {
    TAG: "type-tag",
    LAG: "type-lag",
    Nit: "type-nit",
    "Calling Station": "type-calling-station",
    Maniac: "type-maniac",
    Reg: "type-reg",
    Fish: "type-fish",
    Unknown: "type-unknown"
  };
  return styles[primaryType] || "type-unknown";
}

function seatPosition(index, seatCount) {
  const xRadius = 40;
  const yRadius = 37;
  const startAngle = 128;
  const endAngle = 412;
  const angle = startAngle + ((endAngle - startAngle) * index) / Math.max(1, seatCount - 1);
  return {
    x: 50 + xRadius * Math.cos((angle * Math.PI) / 180),
    y: 50 + yRadius * Math.sin((angle * Math.PI) / 180)
  };
}

function openSeatSheet(session, seatNo) {
  const seat = cache.seats.find((item) => item.session_id === session.id && item.seat_no === seatNo);
  const player = seat ? cache.players.find((item) => item.id === seat.player_id) : null;
  const actions = player ? [
    ["人物詳細を見る", () => go({ name: "player", playerId: player.id, context: { sessionId: session.id, seatNo } }, "forward")],
    ["席から外す", () => removeSeat(seat.id)],
    ["Hero席にする", () => setHero(session.id, seatNo)]
  ] : [
    ["既存人物を選ぶ", () => go({ name: "select-player", sessionId: session.id, seatNo }, "forward")],
    ["新規人物を作る", () => createEmptyPlayer(session.id, seatNo)],
    ["Hero席にする", () => setHero(session.id, seatNo)]
  ];
  showSheet(`Seat ${seatNo}`, actions);
}

async function renderPlayerSelect(sessionId, seatNo) {
  await loadPlayersAndSeats();
  const query = route.query || "";
  const filtered = filterPlayers(query, route.typeFilter, route.actionFilter);
  app.innerHTML = `
    <main class="screen">
      ${nav("人物を選択", backButton({ name: "table", sessionId }), `<button class="link-button" id="new-player">新規</button>`)}
      <div class="field">
        <label>検索</label>
        <input class="input" id="player-search" value="${escapeAttr(query)}" placeholder="名前、外見メモ、カジノ" />
      </div>
      <div class="section-title">タイプタグ</div>
      <div class="tag-grid">${TYPE_TAGS.map((tag) => tagButton(tag, route.typeFilter, "type-filter")).join("")}</div>
      <div class="section-title">行動タグ</div>
      <div class="tag-grid">${ACTION_TAGS.map((tag) => tagButton(tag, route.actionFilter, "action-filter")).join("")}</div>
      <section class="section">
        <div class="list">
          ${filtered.length ? filtered.map((player) => playerSelectRow(player, sessionId, seatNo)).join("") : `<div class="empty">該当する人物がいません</div>`}
        </div>
      </section>
    </main>
  `;
  bindNav();
  document.querySelector("#new-player").addEventListener("click", () => createEmptyPlayer(sessionId, seatNo));
  document.querySelector("#player-search").addEventListener("input", (event) => {
    route.query = event.target.value;
    renderPlayerSelect(sessionId, seatNo);
  });
  document.querySelectorAll("[data-type-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      haptic(6);
      route.typeFilter = route.typeFilter === button.dataset.typeFilter ? "" : button.dataset.typeFilter;
      render();
    });
  });
  document.querySelectorAll("[data-action-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      haptic(6);
      route.actionFilter = route.actionFilter === button.dataset.actionFilter ? "" : button.dataset.actionFilter;
      render();
    });
  });
  document.querySelectorAll("[data-pick-player]").forEach((button) => {
    button.addEventListener("click", () => assignPlayer(sessionId, seatNo, button.dataset.pickPlayer));
  });
}

function playerSelectRow(player) {
  const last = latestPlayerTouch(player.id);
  const tags = [...(player.current_type_tags || []), ...(player.current_action_tags || [])].slice(0, 3);
  return `
    <button class="row player-row" data-pick-player="${player.id}">
      ${avatar(player.appearance, "avatar")}
      <div>
        <div class="row-title">${escapeHtml(playerName(player))}</div>
        <div class="row-subtitle">${tags.join(" / ") || "タグなし"}${last ? ` / ${escapeHtml(last.casino_name || "")} ${formatDate(last.date)}` : ""}</div>
      </div>
      <div class="chevron">›</div>
    </button>
  `;
}

async function renderPlayer(playerId, context) {
  await loadPlayersAndSeats();
  if (context.sessionId && !cache.sessions.some((item) => item.id === context.sessionId)) {
    const { data } = await client().from("sessions").select("*").eq("id", context.sessionId).single();
    if (data) cache.sessions = [data, ...cache.sessions];
  }
  const player = cache.players.find((item) => item.id === playerId);
  if (!player) {
    go({ name: "sessions" }, "back");
    return;
  }
  app.innerHTML = `
    <main class="screen">
      ${nav("人物詳細", backButton(context.sessionId ? { name: "table", sessionId: context.sessionId } : { name: "sessions" }), `<button class="link-button" id="save-player-top" type="button">保存</button>`)}
      <div id="avatar-preview">${avatar(player.appearance, "avatar large")}</div>
      <form id="player-form">
        <div class="field">
          <label>ニックネーム</label>
          <input class="input" name="nickname" value="${escapeAttr(player.nickname || "")}" placeholder="Unknown" />
        </div>
        <div class="section-title">外見アイコン</div>
        <div class="appearance-grid">
          ${appearanceControls(player.appearance || {})}
        </div>
        <div class="field">
          <label>外見自由メモ</label>
          <textarea class="textarea" name="appearance_note" placeholder="赤いイヤホン、時計など">${escapeHtml(player.appearance_note || "")}</textarea>
        </div>
        <div class="field">
          <label>自由メモ</label>
          <textarea class="textarea" name="memo" placeholder="プレイ傾向、注意点など">${escapeHtml(player.memo || "")}</textarea>
        </div>
        <div class="section-title">現在のタイプタグ</div>
        <div class="tag-grid">${TYPE_TAGS.map((tag) => tagButton(tag, player.current_type_tags || [], "current-type")).join("")}</div>
        <div class="section-title">現在の行動タグ</div>
        <div class="tag-grid">${ACTION_TAGS.map((tag) => tagButton(tag, player.current_action_tags || [], "current-action")).join("")}</div>
        <button class="primary-button section" type="submit">保存</button>
      </form>
      <button class="danger-button" id="delete-player">人物を削除</button>
      <div id="player-status" class="status"></div>
    </main>
  `;
  bindNav();
  bindTagToggles();
  bindAppearancePreview();
  document.querySelector("#player-form").addEventListener("submit", (event) => savePlayer(event, player, context));
  document.querySelector("#save-player-top").addEventListener("click", () => {
    haptic(8);
    document.querySelector("#player-form").requestSubmit();
  });
  document.querySelector("#delete-player").addEventListener("click", () => confirmDeletePlayer(player.id, context.sessionId));
}

function appearanceControls(appearance) {
  const values = { ...DEFAULT_APPEARANCE, ...appearance };
  return Object.entries(APPEARANCE).map(([key, options]) => `
    <div class="field">
      <label>${APPEARANCE_LABELS[key]}</label>
      <select class="select" name="appearance.${key}">
        ${options.map((option) => `<option value="${option}" ${values[key] === option ? "selected" : ""}>${APPEARANCE_LABELS[option]}</option>`).join("")}
      </select>
    </div>
  `).join("");
}

function renderSettings() {
  app.innerHTML = `
    <main class="screen has-large-title">
      ${nav("設定", backButton(), "", { large: true })}
      <section class="section">
        <div class="section-title">表示</div>
        <div class="list">
          <div class="row">
            <div>
              <div class="row-title">テーマ</div>
              <div class="row-subtitle">ダーク/ライトを切り替え</div>
            </div>
            <div class="segmented theme-toggle">
              <button class="${theme === "dark" ? "active" : ""}" data-theme-choice="dark">Dark</button>
              <button class="${theme === "light" ? "active" : ""}" data-theme-choice="light">Light</button>
            </div>
          </div>
        </div>
      </section>
      <section class="section">
        <div class="list">
          <div class="row">
            <div>
              <div class="row-title">ログイン中</div>
              <div class="row-subtitle">${escapeHtml(authUser.email || authUser.id)}</div>
            </div>
          </div>
          <button class="row" id="password-reset">
            <div><div class="row-title">パスワード再設定</div></div>
            <div class="chevron">›</div>
          </button>
          <button class="row" id="logout">
            <div><div class="row-title">ログアウト</div></div>
            <div class="chevron">›</div>
          </button>
        </div>
      </section>
      <button class="danger-button" id="delete-account">アカウント削除</button>
      <div class="notice">アカウント削除を実行すると、このアカウントの保存データも削除されます。</div>
      <div id="settings-status" class="status"></div>
    </main>
  `;
  bindNav();
  document.querySelectorAll("[data-theme-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      haptic(6);
      applyTheme(button.dataset.themeChoice);
      renderSettings();
    });
  });
  document.querySelector("#logout").addEventListener("click", () => { haptic(8); client().auth.signOut(); });
  document.querySelector("#password-reset").addEventListener("click", async () => {
    haptic(8);
    const { error } = await client().auth.resetPasswordForEmail(authUser.email, { redirectTo: location.href.split("#")[0] });
    setStatus("settings-status", error ? error.message : "再設定メールを送信しました");
  });
  document.querySelector("#delete-account").addEventListener("click", () => {
    if (!confirm("アカウントと保存データを削除しますか？")) return;
    haptic(15);
    client().functions.invoke("delete-account").then(async ({ error }) => {
      if (error) {
        setStatus("settings-status", error.message);
        return;
      }
      await client().auth.signOut();
    });
  });
}

async function loadSessions() {
  const sb = client();
  const [{ data: sessions }, { data: seats }] = await Promise.all([
    sb.from("sessions").select("*").order("updated_at", { ascending: false }),
    sb.from("session_seats").select("*")
  ]);
  cache.sessions = sessions || [];
  cache.seats = seats || [];
}

async function loadPlayersAndSeats() {
  const sb = client();
  const [{ data: players }, { data: seats }, { data: sessions }] = await Promise.all([
    sb.from("players").select("*").order("updated_at", { ascending: false }),
    sb.from("session_seats").select("*"),
    sb.from("sessions").select("*").order("updated_at", { ascending: false })
  ]);
  cache.players = players || [];
  cache.seats = seats || [];
  cache.sessions = sessions || [];
}

async function loadAllForSession(sessionId) {
  const sb = client();
  const [{ data: sessions }, { data: seats }, { data: players }] = await Promise.all([
    sb.from("sessions").select("*").eq("id", sessionId),
    sb.from("session_seats").select("*").eq("session_id", sessionId),
    sb.from("players").select("*").order("updated_at", { ascending: false })
  ]);
  cache.sessions = sessions || [];
  cache.seats = seats || [];
  cache.players = players || [];
}

async function createEmptyPlayer(sessionId, seatNo) {
  hideSheet();
  haptic(8);
  const { data, error } = await client().from("players").insert({
    user_id: authUser.id,
    appearance: DEFAULT_APPEARANCE,
    current_type_tags: ["Unknown"],
    current_action_tags: []
  }).select().single();
  if (error) {
    alert(error.message);
    return;
  }
  await assignPlayer(sessionId, seatNo, data.id, { openPlayer: true });
}

async function assignPlayer(sessionId, seatNo, playerId, options = {}) {
  await client().from("session_seats").upsert({
    user_id: authUser.id,
    session_id: sessionId,
    seat_no: seatNo,
    player_id: playerId
  }, { onConflict: "session_id,seat_no" });
  await client().from("sessions").update({ updated_at: new Date().toISOString() }).eq("id", sessionId);
  if (options.openPlayer) {
    go({ name: "player", playerId, context: { sessionId, seatNo } }, "forward");
  } else {
    go({ name: "table", sessionId }, "back");
  }
}

async function removeSeat(seatId) {
  hideSheet();
  haptic(8);
  await client().from("session_seats").delete().eq("id", seatId);
  render();
}

async function setHero(sessionId, seatNo) {
  hideSheet();
  haptic(8);
  await client().from("sessions").update({ hero_seat: seatNo }).eq("id", sessionId);
  render();
}

async function savePlayer(event, player, context = {}) {
  event.preventDefault();
  haptic(10);
  const form = new FormData(event.currentTarget);
  const appearance = appearanceFromForm(form);
  const payload = {
    nickname: String(form.get("nickname") || "").trim() || null,
    appearance,
    appearance_note: String(form.get("appearance_note") || ""),
    memo: String(form.get("memo") || ""),
    current_type_tags: selectedTags("current-type"),
    current_action_tags: selectedTags("current-action")
  };
  const { error } = await client().from("players").update(payload).eq("id", player.id);
  setStatus("player-status", error ? error.message : "保存しました");
  if (!error) {
    if (context.sessionId) go({ name: "table", sessionId: context.sessionId }, "back");
    else go({ name: "sessions" }, "back");
  }
}

function bindAppearancePreview() {
  const form = document.querySelector("#player-form");
  const preview = document.querySelector("#avatar-preview");
  if (!form || !preview) return;
  const updatePreview = () => {
    preview.innerHTML = avatar(appearanceFromForm(new FormData(form)), "avatar large");
  };
  form.querySelectorAll("select[name^='appearance.']").forEach((select) => {
    select.addEventListener("change", updatePreview);
  });
}

function appearanceFromForm(form) {
  const appearance = {};
  for (const key of Object.keys(APPEARANCE)) {
    appearance[key] = form.get(`appearance.${key}`);
  }
  return appearance;
}

function confirmDeletePlayer(playerId, sessionId) {
  if (!confirm("この人物を削除しますか？関連する席とメモも削除されます。")) return;
  haptic(15);
  client().from("players").delete().eq("id", playerId).then(() => {
    if (sessionId) go({ name: "table", sessionId }, "back");
    else go({ name: "sessions" }, "back");
  });
}

function filterPlayers(query = "", typeFilter = "", actionFilter = "") {
  const q = query.trim().toLowerCase();
  return cache.players.filter((player) => {
    const searchText = [
      player.nickname,
      player.appearance_note,
      player.memo,
      ...(player.current_type_tags || []),
      ...(player.current_action_tags || []),
      ...playerCasinoHistory(player.id)
    ].join(" ").toLowerCase();
    const typeOk = !typeFilter || (player.current_type_tags || []).includes(typeFilter);
    const actionOk = !actionFilter || (player.current_action_tags || []).includes(actionFilter);
    return typeOk && actionOk && (!q || searchText.includes(q));
  });
}

function latestPlayerTouch(playerId) {
  return cache.seats
    .filter((seat) => seat.player_id === playerId)
    .map((seat) => {
      const session = cache.sessions.find((item) => item.id === seat.session_id);
      return session ? { casino_name: session.casino_name, date: session.updated_at || session.created_at } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}

function playerCasinoHistory(playerId) {
  const fromSeats = cache.seats
    .filter((seat) => seat.player_id === playerId)
    .map((seat) => cache.sessions.find((session) => session.id === seat.session_id)?.casino_name)
    .filter(Boolean);
  return [...new Set(fromSeats)];
}

function bindNav() {
  document.querySelectorAll("[data-nav]").forEach((button) => {
    button.addEventListener("click", () => go(JSON.parse(button.dataset.nav), "forward"));
  });
  document.querySelectorAll("[data-nav-back]").forEach((button) => {
    button.addEventListener("click", () => go(JSON.parse(button.dataset.navBack), "back"));
  });
}

function tagButton(tag, selected, dataName) {
  const list = Array.isArray(selected) ? selected : selected ? [selected] : [];
  const active = list.includes(tag);
  return `<button class="tag ${active ? "selected" : ""}" type="button" data-${dataName}="${escapeAttr(tag)}">${escapeHtml(tag)}</button>`;
}

function bindTagToggles() {
  ["current-type", "current-action"].forEach((name) => {
    document.querySelectorAll(`[data-${name}]`).forEach((button) => {
      button.addEventListener("click", () => { haptic(5); button.classList.toggle("selected"); });
    });
  });
}

function selectedTags(dataName) {
  return Array.from(document.querySelectorAll(`[data-${dataName}].selected`)).map((button) => button.dataset[toCamel(dataName)]);
}

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function showSheet(title, actions) {
  hideSheet();
  haptic(6);
  const backdrop = document.createElement("div");
  backdrop.className = "sheet-backdrop";
  backdrop.innerHTML = `
    <div class="sheet">
      <div class="sheet-panel">
        <div class="sheet-title">${escapeHtml(title)}</div>
        ${actions.map(([label], index) => `<button class="sheet-action" data-action-index="${index}">${escapeHtml(label)}</button>`).join("")}
      </div>
      <button class="sheet-cancel">キャンセル</button>
    </div>
  `;
  document.body.appendChild(backdrop);
  const sheet = backdrop.querySelector(".sheet");

  if (!reduceMotion() && backdrop.animate) {
    const easing = "cubic-bezier(0.32, 0.08, 0.24, 1)";
    backdrop.animate(
      [{ background: "rgba(0,0,0,0)" }, { background: "rgba(0,0,0,0.4)" }],
      { duration: 280, easing, fill: "forwards" }
    );
    sheet.animate(
      [{ transform: "translate3d(0, 100%, 0)" }, { transform: "translate3d(0, 0, 0)" }],
      { duration: 320, easing, fill: "forwards" }
    );
  } else {
    backdrop.style.background = "rgba(0,0,0,0.4)";
    sheet.style.transform = "translate3d(0, 0, 0)";
  }

  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop || event.target.classList.contains("sheet-cancel")) {
      haptic(5);
      hideSheet();
    }
  });
  backdrop.querySelectorAll("[data-action-index]").forEach((button) => {
    button.addEventListener("click", () => { haptic(8); actions[Number(button.dataset.actionIndex)][1](); });
  });
}

async function hideSheet() {
  const backdrop = document.querySelector(".sheet-backdrop");
  if (!backdrop) return;
  if (reduceMotion() || !backdrop.animate) { backdrop.remove(); return; }
  const easing = "cubic-bezier(0.32, 0.08, 0.24, 1)";
  const sheet = backdrop.querySelector(".sheet");
  const a = backdrop.animate(
    [{ background: "rgba(0,0,0,0.4)" }, { background: "rgba(0,0,0,0)" }],
    { duration: 240, easing, fill: "forwards" }
  );
  const b = sheet ? sheet.animate(
    [{ transform: "translate3d(0, 0, 0)" }, { transform: "translate3d(0, 100%, 0)" }],
    { duration: 280, easing, fill: "forwards" }
  ) : null;
  try {
    await Promise.all([a.finished, b ? b.finished : Promise.resolve()]);
  } catch (_) {}
  backdrop.remove();
}

function avatar(appearance = {}, className = "avatar") {
  const a = { ...DEFAULT_APPEARANCE, ...(appearance || {}) };
  const skin = "#d7a37b";
  const hair = a.regionMarker === "whiteGroup" ? "#7b5a34" : "#24211f";
  const clothes = { black: "#25282c", white: "#f7f7f8", gray: "#8c949e", red: "#c94d4d", blue: "#2f6fca", green: "#268663" }[a.clothingColor];
  const marker = regionFlag(a.regionMarker);
  const glasses = a.glasses !== "none" ? `<g fill="none" stroke="${a.glasses === "sunglasses" ? "#111" : "#333"}" stroke-width="3"><circle cx="38" cy="46" r="8"/><circle cx="62" cy="46" r="8"/><path d="M46 46h8"/></g>` : "";
  const beard = {
    none: "",
    mustache: `<path d="M42 62c6 4 10 4 16 0" stroke="#3b2a21" stroke-width="4" stroke-linecap="round"/>`,
    goatee: `<path d="M48 68h8l-4 8z" fill="#3b2a21"/>`,
    full: `<path d="M34 58c5 19 31 19 36 0v10c-6 18-30 18-36 0z" fill="#3b2a21"/>`
  }[a.beard];
  const hairShape = {
    short: `<path d="M28 38c5-22 42-24 48 0-16-9-31 2-48 0z" fill="${hair}"/>`,
    long: `<path d="M26 37c4-23 45-24 50 0v28c-8-8-10-22-25-22s-17 14-25 22z" fill="${hair}"/>`,
    buzz: `<path d="M31 36c8-15 34-15 42 0z" fill="${hair}"/>`,
    none: ""
  }[a.hairStyle];
  const hat = {
    none: "",
    cap: `<path d="M27 35c8-14 40-14 48 0v7H27z" fill="#334155"/><path d="M70 40h18c-7 8-15 9-23 5z" fill="#334155"/>`,
    beanie: `<path d="M28 37c4-24 44-24 48 0v7H28z" fill="#7c3aed"/>`
  }[a.hat];
  return `
    <svg class="${className}" viewBox="0 0 100 100" aria-hidden="true">
      <rect x="14" y="10" width="72" height="84" rx="30" fill="#eef1f4"/>
      <path d="M24 92c5-24 20-34 26-34s21 10 26 34z" fill="${clothes}"/>
      <circle cx="50" cy="48" r="24" fill="${skin}"/>
      ${hairShape}
      ${hat}
      <circle cx="41" cy="50" r="2.5" fill="#1b1b1b"/>
      <circle cx="59" cy="50" r="2.5" fill="#1b1b1b"/>
      <path d="M45 61c4 3 8 3 12 0" fill="none" stroke="#8a4b3a" stroke-width="2" stroke-linecap="round"/>
      ${glasses}
      ${beard}
      ${marker ? `<circle cx="75" cy="78" r="13" fill="#ffffff"/><text x="75" y="83" text-anchor="middle" font-size="14">${escapeHtml(marker)}</text>` : ""}
    </svg>
  `;
}

function regionFlag(regionMarker) {
  return {
    japanese: "🇯🇵",
    chinese: "🇨🇳",
    korean: "🇰🇷",
    otherAsian: "🌏",
    whiteGroup: "🌐",
    blackGroup: "🌍",
    latino: "🌎"
  }[regionMarker] || "";
}

function playerName(player) {
  return player.nickname || "Unknown";
}

function setStatus(id, message) {
  const node = document.querySelector(`#${id}`);
  if (node) node.textContent = message;
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

init();
