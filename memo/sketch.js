// MINDOSE — p5.js + Matter.js. No extra on-screen captions.
const M = Matter;
const STORE = "MINDOSE_STAGE_V2";
const COLORS = ["#F2A5BD", "#A9BDEB", "#A6D9B8", "#F1D091", "#CBB4E6"];
const FADE_MS = 30000;
let bottlePNG, bottlePNG2, teethPNG, pouchPNG, canvasRef;
let world,
  engine,
  stage = "home",
  notes = [],
  active = null,
  phys = [];
let paperCanvas,
  paperCtx,
  noteArea,
  rollZone,
  tools = [],
  nav = [],
  overlay;
let roll = null,
  rolling = 0,
  rollingAnim = null,
  pillDrag = null,
  captured = null;
let renderStage = 0,
  fxStart = 0,
  selected = null,
  drawing = false,
  drawId = null;
let bottle = { x: 0, y: 0, w: 0, h: 0 },
  mouth = { x: 0, y: 0, w: 0, h: 0 },
  paper = { x: 0, y: 0, w: 0, h: 0 };
let rxIDs = [],
  bottleWalls = [],
  animationPills = [];
// Visible miniature capsules inside the bottle in the creation screen.
let jarPills = [];
// Capsule flight into the jar: shrink only after the user drops it.
let jarFlight = null;
function largeCapsuleSize() {
  return Math.max(165, Math.min(290, paper.h * 0.86));
}
// Prescription envelopes are titled, timestamped, and have no pill limit.
let rxPack = [],
  rxPacks = [],
  rxDrag = null;
let rxGeom = null;
let rxScroll = 0;
let rxScrollDrag = null;
let eraseCursor = null;
let lastForgottenMs = null;
let selectedPack = null;
let selectedPrescribedAt = null;
let packDetailScroll = 0;
let rxMemoInput = null;
let rxMemoPackId = null;
let paperHoverCurl = 0;

const RX_STORE = "MINDOSE_RX_PACKS_V2";
const OLD_RX_STORE = "MINDOSE_RX_PACKS_V1";
function preload() {
  bottlePNG = loadImage("알약통.png");
  bottlePNG2 = loadImage("알약통2.png");
  teethPNG = loadImage("이빨.png");
  preloadPouch();
}
// Real sealed plastic medicine pouch supplied by the user.
// Crop out the black/transparent band around the photographed pouch.
function preloadPouch() {
  pouchPNG = loadImage(
    "약봉투.png",
    (img) => {
      try {
        pouchPNG = img.get(0, 185, 1083, 1083);
      } catch (e) {
        pouchPNG = img;
      }
    },
    () => {
      pouchPNG = null;
    },
  );
}
function setup() {
  const c = createCanvas(windowWidth, windowHeight);
  canvasRef = c.elt;
  c.elt.style.touchAction = "none";
  pixelDensity(1);
  textFont("Arial");
  engine = M.Engine.create();
  world = engine.world;
  engine.gravity.y = 1.2;
  paperCanvas = document.createElement("canvas");
  paperCtx = paperCanvas.getContext("2d");
  noteArea = document.createElement("textarea");
  document.body.appendChild(noteArea);
  Object.assign(noteArea.style, {
    position: "fixed",
    zIndex: "7",
    border: "0",
    resize: "none",
    background: "transparent",
    outline: "none",
    fontFamily: "Arial",
    fontSize: "16px",
    lineHeight: "1.65",
    color: "#353747",
    padding: "10px",
    boxSizing: "border-box",
  });
  noteArea.placeholder = "";
  // Editable memo on the expanded blue prescription. It is NOT a download.
  rxMemoInput = document.createElement("textarea");
  rxMemoInput.placeholder = "이 처방에 남기고 싶은 생각을 적어보세요";
  rxMemoInput.setAttribute("aria-label", "처방전 메모");
  Object.assign(rxMemoInput.style, {
    position: "fixed",
    zIndex: "45",
    display: "none",
    resize: "none",
    boxSizing: "border-box",
    border: "1px dashed #4383C4",
    borderRadius: "5px",
    outline: "none",
    background: "rgba(255,255,255,0.92)",
    color: "#1855A0",
    fontFamily: "Arial, sans-serif",
    fontSize: "14px",
    lineHeight: "1.5",
    padding: "10px",
    overflowY: "auto",
    boxShadow: "none",
  });
  rxMemoInput.addEventListener("input", () => {
    const pack = rxPacks.find((p) => p.id === rxMemoPackId);
    if (pack) {
      pack.memo = rxMemoInput.value;
      persistPrescription();
    }
  });
  document.body.appendChild(rxMemoInput);

  paperCanvas.style.position = "fixed";
  paperCanvas.style.zIndex = "8";
  paperCanvas.style.touchAction = "none";
  document.body.appendChild(paperCanvas);
  // Eraser outline follows the pointer; never becomes part of saved drawing.
  eraseCursor = document.createElement("div");
  Object.assign(eraseCursor.style, {
    position: "fixed",
    zIndex: "40",
    width: "22px",
    height: "22px",
    border: "1.5px solid #454E75",
    borderRadius: "50%",
    background: "rgba(255,255,255,.18)",
    boxSizing: "border-box",
    pointerEvents: "none",
    display: "none",
    transform: "translate(-50%,-50%)",
  });
  document.body.appendChild(eraseCursor);
  paperCanvas.addEventListener("pointermove", (e) => {
    if (tool === "ERASE" && stage === "create" && !active && !rollingAnim) {
      eraseCursor.style.left = e.clientX + "px";
      eraseCursor.style.top = e.clientY + "px";
      eraseCursor.style.display = "block";
    }
  });
  paperCanvas.addEventListener("pointerleave", () => {
    if (!drawing) eraseCursor.style.display = "none";
  });
  rollZone = document.createElement("div");
  document.body.appendChild(rollZone);
  Object.assign(rollZone.style, {
    position: "fixed",
    zIndex: "12",
    cursor: "ew-resize",
    touchAction: "none",
    background: "transparent",
  });
  rollZone.addEventListener("pointerdown", (e) => {
    if (stage !== "create" || active || rollingAnim) return;
    roll = { id: e.pointerId, start: e.clientX };
    rolling = 0;
    try {
      rollZone.setPointerCapture(e.pointerId);
    } catch {}
    e.preventDefault();
  });
  rollZone.addEventListener("pointermove", (e) => {
    if (!roll || e.pointerId !== roll.id) return;
    rolling = constrain((e.clientX - roll.start) / (paper.w * 0.78), 0, 1);
    applyRoll();
    e.preventDefault();
  });
  rollZone.addEventListener("pointerup", (e) => {
    if (!roll || e.pointerId !== roll.id) return;
    const commit = rolling >= 0.92 && e.type !== "pointercancel";
    roll = null;
    if (commit) beginRoll();
    else {
      rolling = 0;
      applyRoll();
    }
    e.preventDefault();
  });
  rollZone.addEventListener("pointercancel", (e) => {
    if (roll) {
      roll = null;
      rolling = 0;
      applyRoll();
    }
  });
  paperCanvas.addEventListener("pointerdown", penDown);
  paperCanvas.addEventListener("pointermove", penMove);
  paperCanvas.addEventListener("pointerup", penUp);
  paperCanvas.addEventListener("pointercancel", penUp);
  c.elt.addEventListener("pointerdown", down);
  c.elt.addEventListener("pointermove", move);
  c.elt.addEventListener("pointerup", up);
  c.elt.addEventListener("pointercancel", up);
  c.elt.addEventListener("contextmenu", (e) => e.preventDefault());
  c.elt.addEventListener(
    "wheel",
    (e) => {
      if (stage !== "rx") return;
      if (selectedPack) {
        packDetailScroll = constrain(
          packDetailScroll + e.deltaY,
          0,
          maxPackDetailScroll(),
        );
        e.preventDefault();
        return;
      }
      if (!rxGeom || !inScrollLane(pointerPos(e))) return;
      rxScroll = constrain(
        rxScroll +
          (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY),
        0,
        maxRxScroll(),
      );
      e.preventDefault();
    },
    { passive: false },
  );
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (selected) selected = null;
      else if (selectedPack) selectedPack = null;
    }
  });
  loadSaved();
  loadPrescription();
  layout();
  changeStage("home");
}
function uid() {
  return Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

function layout() {
  const mobile = width < 700;

  // 메모지: 화면 왼쪽에 넓고 크게
  paper.w = mobile ? width * 0.7 : width * 0.66;
  paper.h = mobile ? height * 0.4 : height * 0.49;
  paper.x = mobile ? 20 : width * 0.06;
  paper.y = height * 0.31 - 70;

  // 알약통: 오른쪽 위
  const sz = mobile
    ? Math.min(width * 0.3, 180)
    : Math.min(width * 0.21, height * 0.43);

  bottle = {
    x: width * 0.87,
    y: height * 0.29 - 35,
    w: sz,
    h: sz,
  };

  // 입: 오른쪽 아래
  mouth = {
    x: width * 0.87,
    y: height * 0.78 - 65,
    w: sz * 1.25,
    h: sz * 1.14,
  };

  paperCanvas.width = Math.max(1, Math.round(paper.w));
  paperCanvas.height = Math.max(1, Math.round(paper.h));

  placeEditor();
}

function placeEditor() {
  Object.assign(noteArea.style, {
    left: paper.x + 17 + "px",
    top: paper.y + 16 + "px",
    width: Math.max(50, paper.w - 34) + "px",
    height: Math.max(50, paper.h - 32) + "px",
  });
  Object.assign(paperCanvas.style, {
    left: paper.x + "px",
    top: paper.y + "px",
    width: paper.w + "px",
    height: paper.h + "px",
  });
  Object.assign(rollZone.style, {
    left: paper.x + "px",
    top: paper.y + "px",
    width: Math.max(26, paper.w * 0.11) + "px",
    height: paper.h + "px",
  });
}
function changeStage(v) {
  jarFlight = null;
  stage = v;
  selected = null;
  selectedPack = null;
  selectedPrescribedAt = null;
  roll = null;
  rolling = 0;
  const visible = v === "create";
  noteArea.style.display = visible ? "block" : "none";
  paperCanvas.style.display = visible ? "block" : "none";
  rollZone.style.display = visible ? "block" : "none";
  updateTool();
  syncPaperVisibility();
  bottleBuild();
  if (v === "rx") rxScroll = 0; // Always show the first full prescription on entry.
  if (v === "rx") {
    rxIDs = [];
  }
}
let tool = "TEXT";
function updateTool() {
  paperCanvas.style.pointerEvents =
    stage === "create" && tool !== "TEXT" && !rollingAnim && !active
      ? "auto"
      : "none";
  noteArea.style.pointerEvents =
    stage === "create" && tool === "TEXT" && !rollingAnim && !active
      ? "auto"
      : "none";
  paperCanvas.style.zIndex = tool === "TEXT" ? "5" : "8";
  noteArea.style.zIndex = tool === "TEXT" ? "8" : "5";
  rollZone.style.pointerEvents =
    stage === "create" && !rollingAnim && !active ? "auto" : "none";
  paperCanvas.style.cursor = tool === "ERASE" ? "none" : "crosshair";
  if (eraseCursor) eraseCursor.style.display = "none";
}
function penPoint(e) {
  const r = paperCanvas.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) * paperCanvas.width) / r.width,
    y: ((e.clientY - r.top) * paperCanvas.height) / r.height,
  };
}
function penDown(e) {
  if (stage !== "create" || tool === "TEXT" || active || rollingAnim) return;
  drawing = true;
  drawId = e.pointerId;
  try {
    paperCanvas.setPointerCapture(drawId);
  } catch {}
  const p = penPoint(e);
  paperCtx.beginPath();
  paperCtx.moveTo(p.x, p.y);
  paperCtx.lineCap = "round";
  paperCtx.lineJoin = "round";
  paperCtx.lineWidth = tool === "ERASE" ? 22 : 3;
  paperCtx.globalCompositeOperation =
    tool === "ERASE" ? "destination-out" : "source-over";
  paperCtx.strokeStyle = "#454E75";
  paperCtx.lineTo(p.x + 0.01, p.y + 0.01);
  paperCtx.stroke();
  e.preventDefault();
}
function penMove(e) {
  if (!drawing || e.pointerId !== drawId) return;
  const p = penPoint(e);
  paperCtx.lineTo(p.x, p.y);
  paperCtx.stroke();
  e.preventDefault();
}
function penUp(e) {
  if (!drawing || e.pointerId !== drawId) return;
  drawing = false;
  drawId = null;
  if (eraseCursor) eraseCursor.style.display = "none";
  paperCtx.closePath();
  paperCtx.globalCompositeOperation = "source-over";
  e.preventDefault();
}
function contains(x, y, b) {
  return (
    x >= b.x - b.w / 2 &&
    x <= b.x + b.w / 2 &&
    y >= b.y - b.h / 2 &&
    y <= b.y + b.h / 2
  );
}
function pointerPos(e) {
  const r = canvasRef.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) * width) / r.width,
    y: ((e.clientY - r.top) * height) / r.height,
  };
}
function down(e) {
  const p = pointerPos(e);
  if (selected) {
    selected = null;
    return;
  }
  if (selectedPack) {
    handlePackDetailClick(p);
    e.preventDefault();
    return;
  }
  if (stage === "home") {
    const cardW = Math.min(280, width * 0.28);
    const cardH = Math.min(170, height * 0.22);
    const gap = Math.min(110, width * 0.07);

    const centerX = width / 2;
    const centerY = height / 2;

    const leftX = centerX - (cardW + gap) / 2;
    const rightX = centerX + (cardW + gap) / 2;

    if (
      contains(p.x, p.y, {
        x: leftX,
        y: centerY,
        w: cardW,
        h: cardH,
      })
    ) {
      changeStage("create");
    } else if (
      contains(p.x, p.y, {
        x: rightX,
        y: centerY,
        w: cardW,
        h: cardH,
      })
    ) {
      changeStage("rx");
    }
    return;
  }
  if (stage === "create") {
    // 알약 생성 화면: 알약통과 입을 누르면 화면 전환
    if (stage === "create" && !active && !jarFlight && !rollingAnim) {
      // 알약통 터치 → 처방 화면
      if (
        p.x >= bottle.x - bottle.w / 2 &&
        p.x <= bottle.x + bottle.w / 2 &&
        p.y >= bottle.y - bottle.h / 2 &&
        p.y <= bottle.y + bottle.h / 2
      ) {
        changeStage("rx");
        return;
      }

      // 입 터치 → 휴지통 화면
      if (
        p.x >= mouth.x - mouth.w / 2 &&
        p.x <= mouth.x + mouth.w / 2 &&
        p.y >= mouth.y - mouth.h / 2 &&
        p.y <= mouth.y + mouth.h / 2
      ) {
        changeStage("trash");
        return;
      }
    }
    // Top-left arrow: quiet back control.
    if (p.x < 66 && p.y < 68) {
      changeStage("home");
      return;
    }
    // Tools use only three text labels.
    const bx = paper.x,
      by = paper.y - 54;
    if (p.y > by - 8 && p.y < by + 35 && p.x >= bx && p.x <= bx + 185) {
      const i = Math.floor((p.x - bx) / 62);
      tool = ["TEXT", "DRAW", "ERASE"][Math.min(2, i)];
      updateTool();
      if (tool === "TEXT") noteArea.focus();
      return;
    }
    if (
      active &&
      !jarFlight &&
      Math.hypot(p.x - active.x, p.y - active.y) < largeCapsuleSize() * 0.55
    ) {
      pillDrag = { id: e.pointerId, ox: p.x - active.x, oy: p.y - active.y };
      try {
        canvasRef.setPointerCapture(e.pointerId);
      } catch {}
      return;
    }
    // Paper directly: leftmost margin is the roll grip.
    if (
      !active &&
      !rollingAnim &&
      p.x >= paper.x - 18 &&
      p.x <= paper.x + Math.min(48, paper.w * 0.15) &&
      p.y >= paper.y &&
      p.y <= paper.y + paper.h
    ) {
      roll = { id: e.pointerId, start: p.x };
      rolling = 0;
      try {
        canvasRef.setPointerCapture(e.pointerId);
      } catch {}
      e.preventDefault();
      return;
    }
  } else if (stage === "rx") {
    if (p.x < 66 && p.y < 68) {
      changeStage("home");
      return;
    }
    // Touch existing sealed pouches first. Never steal their taps for the seal.
    // Let pointerup decide between a tap (open) and a swipe (scroll).
    if (inScrollLane(p)) {
      rxScrollDrag = {
        id: e.pointerId,
        startX: p.x,
        startY: p.y,
        startScroll: rxScroll,
      };
      try {
        canvasRef.setPointerCapture(e.pointerId);
      } catch (_) {}
      e.preventDefault();
      return;
    }
    // Pick up an actual saved capsule from the enlarged bottle.
    const found = hitPill(p.x, p.y);
    if (found) {
      rxDrag = {
        id: e.pointerId,
        recordId: found.recordId,
        x: p.x,
        y: p.y,
        startX: p.x,
        startY: p.y,
        moved: false,
      };
      try {
        canvasRef.setPointerCapture(e.pointerId);
      } catch (_) {}
      e.preventDefault();
      return;
    }
    // A capsule in a packet can still be opened and read.
    const packetNote = hitPacketPill(p.x, p.y);
    if (packetNote) openNote(packetNote);
  }
}
function move(e) {
  const p = pointerPos(e);
  if (roll && e.pointerId === roll.id) {
    rolling = constrain((p.x - roll.start) / (paper.w * 0.78), 0, 1);
    e.preventDefault();
  }
  if (rxScrollDrag && e.pointerId === rxScrollDrag.id) {
    rxScroll = constrain(
      rxScrollDrag.startScroll + rxScrollDrag.startX - p.x,
      0,
      maxRxScroll(),
    );
    e.preventDefault();
    return;
  }
  if (rxDrag && e.pointerId === rxDrag.id) {
    rxDrag.x = p.x;
    rxDrag.y = p.y;
    if (Math.hypot(p.x - rxDrag.startX, p.y - rxDrag.startY) > 8)
      rxDrag.moved = true;
    e.preventDefault();
  }
  if (pillDrag && e.pointerId === pillDrag.id && active) {
    active.x = p.x - pillDrag.ox;
    active.y = p.y - pillDrag.oy;
    e.preventDefault();
  }
}
function up(e) {
  const p = pointerPos(e);
  if (rxScrollDrag && e.pointerId === rxScrollDrag.id) {
    const dragged = rxScrollDrag;
    rxScrollDrag = null;
    if (Math.hypot(p.x - dragged.startX, p.y - dragged.startY) < 7) {
      // A sealed pouch opens to show ALL its capsules and memories.
      const pack = hitSealedPack(p);
      if (pack) {
        selectedPack = pack.id;
        packDetailScroll = 0;
      } else if (hitSeal(p)) {
        finalizePrescription();
      } else {
        const id = hitPacketPill(p.x, p.y);
        if (id) openNote(id);
      }
    }
    e.preventDefault();
    return;
  }
  if (rxDrag && e.pointerId === rxDrag.id) {
    const dragged = rxDrag;
    rxDrag = null;
    if (e.type !== "pointercancel") {
      if (!dragged.moved) {
        openNote(dragged.recordId);
      } else if (rxGeom && inRect(p, rxGeom.mouth)) {
        deleteNote(dragged.recordId);
      } else if (rxGeom && inScrollLane(p)) {
        packNote(dragged.recordId);
      }
    }
    e.preventDefault();
    return;
  }
  if (roll && e.pointerId === roll.id) {
    const commit = rolling >= 0.92 && e.type !== "pointercancel";
    roll = null;
    if (commit) beginRoll();
    else rolling = 0;
    e.preventDefault();
  }
  if (pillDrag && e.pointerId === pillDrag.id) {
    pillDrag = null;
    if (active && !jarFlight) {
      if (
        contains(active.x, active.y, {
          x: bottle.x,
          y: bottle.y + bottle.h * 0.05,
          w: bottle.w * 0.72,
          h: bottle.h * 0.67,
        })
      ) {
        beginJarFlight();
      } else if (contains(active.x, active.y, mouth)) {
        active = null;
        rolling = 0;
        resetPaper();
      } else {
        active.x = paper.x + paper.w * 0.76;
        active.y = paper.y + paper.h * 0.6;
      }
    }
    e.preventDefault();
  }
}
function applyRoll() {
  const scale = Math.max(0.07, 1 - 0.93 * rolling);
  for (const elem of [noteArea, paperCanvas]) {
    elem.style.transformOrigin = "right center";
    elem.style.transform = `scaleX(${scale})`;
    elem.style.opacity = String(Math.max(0, 1 - rolling * 0.85));
  }
}
function drawn() {
  const d = paperCtx.getImageData(
    0,
    0,
    paperCanvas.width,
    paperCanvas.height,
  ).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true;
  return false;
}
function beginRoll() {
  const text = noteArea.value.trim();
  if (!text && !drawn()) {
    rolling = 0;
    return;
  }
  const record = {
    id: uid(),
    text,
    drawing: drawn() ? paperCanvas.toDataURL("image/png") : null,
    created: Date.now(),
    lastRead: Date.now(),
    color: ["#7900E8", "#F00047", "#075BFF", "#008D46", "#FF8200"][
      notes.length % 5
    ],
  };
  rollingAnim = { record, start: millis(), duration: 2300 };
  rolling = 1;
  applyRoll();
  updateTool();
}
function syncPaperVisibility() {
  // Once the paper has finished rolling, its canvas and textarea disappear.
  // The note data remains in rollingAnim.record / active.record.
  const progress = rollingAnim
    ? constrain((millis() - rollingAnim.start) / rollingAnim.duration, 0, 1)
    : 0;
  const visible = !active && (!rollingAnim || progress < 0.24);
  noteArea.style.visibility = visible ? "visible" : "hidden";
  paperCanvas.style.visibility = visible ? "visible" : "hidden";
  if (!visible && eraseCursor) eraseCursor.style.display = "none";
}
function resetPaper() {
  noteArea.value = "";
  paperCtx.clearRect(0, 0, paperCanvas.width, paperCanvas.height);
  rolling = 0;
  applyRoll();
  updateTool();
  syncPaperVisibility();
}
function beginJarFlight() {
  if (!active || jarFlight) return;
  // Keep the big pill visible as it travels into the PNG jar.
  jarFlight = {
    start: millis(),
    duration: 1700,
    fromX: active.x,
    fromY: active.y,
    fromW: largeCapsuleSize(),
    targetX: bottle.x,
    targetY: bottle.y - bottle.h * 0.06,
    targetW: bottle.w * 0.142,
  };
}
function drawJarFlight() {
  if (!jarFlight || !active) return;
  const f = jarFlight;
  const t = constrain((millis() - f.start) / f.duration, 0, 1);
  // Smooth, deliberately slow movement and compression into the jar.
  const ease = t * t * (3 - 2 * t);
  const x = lerp(f.fromX, f.targetX, ease);
  const y = lerp(f.fromY, f.targetY, ease);
  const w = lerp(f.fromW, f.targetW, ease);
  drawCapsule(x, y, w, color(active.record.color));
  if (t >= 1) {
    jarFlight = null;
    storePill();
  }
}
function storePill() {
  if (!active) return;
  const record = active.record;
  notes.push(record);
  spawnJarPill(record);
  active = null;
  rolling = 0;
  resetPaper();
  persistNotes();
}
// The supplied bottle PNG is visual only. Its transparent central area
// is used as a visible miniature storage chamber for the saved capsules.
// Capsule positions use the actual transparent body of the supplied PNG.
// The artwork's bottle body runs roughly from y=-0.11*size to +0.28*size.
// Two narrow columns fit inside the glass; new capsules land on previous ones.

function bottleBuild() {
  // 기존 알약과 벽을 물리엔진에서 제거
  for (const p of jarPills) {
    if (p.body) M.Composite.remove(world, p.body);
  }
  for (const wall of bottleWalls) {
    M.Composite.remove(world, wall);
  }

  jarPills = [];
  bottleWalls = [];

  const s = bottle.w;
  const cx = bottle.x;
  const cy = bottle.y;

  // PNG 속 투명한 유리 공간에 맞춘 물리 경계
  const left = cx - s * 0.155;
  const right = cx + s * 0.155;
  const bottom = cy + s * 0.305;
  const top = cy - s * 0.105;

  const options = {
    isStatic: true,
    friction: 0.8,
    restitution: 0.12,
  };

  const wallThickness = Math.max(8, s * 0.045);

  bottleWalls = [
    M.Bodies.rectangle(
      left,
      (top + bottom) / 2,
      wallThickness,
      bottom - top + 25,
      options,
    ),
    M.Bodies.rectangle(
      right,
      (top + bottom) / 2,
      wallThickness,
      bottom - top + 25,
      options,
    ),
    M.Bodies.rectangle(
      cx,
      bottom,
      right - left + wallThickness,
      wallThickness,
      options,
    ),
  ];

  M.Composite.add(world, bottleWalls);

  // 저장된 알약을 다시 물리엔진에 등록
  notes
    .filter(
      (n) =>
        !rxPack.includes(n.id) &&
        !rxPacks.some((pack) => pack.ids.includes(n.id)),
    )
    .slice(-24)
    .forEach((record, i) => {
      spawnJarPill(record, true, i);
    });
}

function spawnJarPill(record, restoring = false, index = 0) {
  const s = bottle.w;

  const pillW = s * 0.142;
  const pillH = pillW * 0.39;

  const body = M.Bodies.rectangle(
    bottle.x + random(-s * 0.05, s * 0.05),
    restoring ? bottle.y - s * 0.06 - index * pillH * 1.4 : bottle.y - s * 0.1,
    pillW,
    pillH,
    {
      chamfer: { radius: pillH * 0.45 },
      restitution: 0.2,
      friction: 0.7,
      frictionStatic: 0.9,
      frictionAir: 0.018,
      density: 0.0018,
      sleepThreshold: 90,
    },
  );

  M.Body.setAngle(body, random(-0.35, 0.35));

  M.Composite.add(world, body);

  jarPills.push({
    recordId: record.id,
    body,
  });

  // 작은 병 안에 표시할 최근 기록 수 제한
  if (jarPills.length > 24) {
    const old = jarPills.shift();
    M.Composite.remove(world, old.body);
  }
}

function drawJarPills() {
  const s = bottle.w;
  const dc = drawingContext;

  // PNG 속 유리병 내부만 보이도록 자르기
  dc.save();
  dc.beginPath();
  dc.roundRect(
    bottle.x - s * 0.16,
    bottle.y - s * 0.11,
    s * 0.32,
    s * 0.45,
    s * 0.055,
  );
  dc.clip();

  for (const item of jarPills) {
    const record = notes.find((n) => n.id === item.recordId);
    if (!record) continue;

    const body = item.body;

    push();
    translate(body.position.x, body.position.y);
    rotate(body.angle);

    drawCapsule(0, 0, s * 0.142, ageColor(record));

    pop();
  }

  dc.restore();
}

function prescribe() {
  if (!notes.length) return;
  rxIDs = notes
    .slice()
    .sort((a, b) => a.lastRead - b.lastRead)
    .slice(0, 3)
    .map((n) => n.id);
}
function ageColor(n) {
  return lerpColor(
    color(n.color),
    color("#A6A7AD"),
    constrain((Date.now() - n.lastRead) / FADE_MS, 0, 1),
  );
}
function draw() {
  M.Engine.update(engine, Math.min(deltaTime || 16.67, 33.33));

  background("#F3F3F1");

  if (stage === "home") {
    drawHome();
    syncRxMemoInput();
    return;
  }

  if (stage === "create") {
    drawCreate();
  } else if (stage === "rx") {
    drawRx();
  }

  if (selectedPack) drawPackDetail();
  if (selected) drawReader();
  syncRxMemoInput();
}

function drawHome() {
  const cardW = Math.min(280, width * 0.28);
  const cardH = Math.min(170, height * 0.22);
  const gap = Math.min(110, width * 0.07);

  const centerX = width / 2;
  const centerY = height / 2;

  const leftX = centerX - (cardW + gap) / 2;
  const rightX = centerX + (cardW + gap) / 2;

  const cards = [
    { x: leftX, label: "알약 생성" },
    { x: rightX, label: "처방" },
  ];

  push();
  rectMode(CENTER);
  textAlign(CENTER, CENTER);

  cards.forEach((card, i) => {
    // 마우스가 카드 위에 있는지 확인
    const hovered = contains(mouseX, mouseY, {
      x: card.x,
      y: centerY,
      w: cardW,
      h: cardH,
    });

    // 형광 노란색 외곽 글로우
    if (hovered) {
      drawingContext.shadowColor = "#EFFF00";
      drawingContext.shadowBlur = 32;
    } else {
      drawingContext.shadowColor = "transparent";
      drawingContext.shadowBlur = 0;
    }

    stroke(hovered ? "#DFFF00" : "#DEDEDE");
    strokeWeight(hovered ? 2.5 : 1.2);
    fill("#FFFFFF");
    rect(card.x, centerY, cardW, cardH, 12);

    // 이미지와 글씨에는 빛이 번지지 않도록 초기화
    drawingContext.shadowColor = "transparent";
    drawingContext.shadowBlur = 0;

    const imageY = centerY - cardH * 0.16;

    if (i === 0) {
      drawCapsule(card.x, imageY, Math.min(92, cardW * 0.34), color("#F00047"));
    } else {
      drawAsset(
        bottlePNG,
        card.x,
        imageY,
        Math.min(100, cardW * 0.38),
        Math.min(100, cardH * 0.52),
      );
    }

    noStroke();
    fill("#242424");
    textStyle(NORMAL);
    textSize(19);
    text(card.label, card.x, centerY + cardH * 0.31);
  });

  pop();
}

function drawCreate() {
  syncPaperVisibility();
  drawBack();

  // 알약통
  drawAsset(bottlePNG, bottle.x, bottle.y, bottle.w, bottle.h);
  drawJarPills();

  push();
  noStroke();
  fill(255, 255, 255, 45);
  rect(
    bottle.x - bottle.w * 0.168,
    bottle.y - bottle.h * 0.1,
    bottle.w * 0.038,
    bottle.h * 0.42,
    6,
  );
  pop();

  // 입
  drawAsset(teethPNG, mouth.x, mouth.y, mouth.w, mouth.h);

  // 종이가 말리는 애니메이션 진행 정도
  const progress = rollingAnim
    ? constrain((millis() - rollingAnim.start) / rollingAnim.duration, 0, 1)
    : 0;

  const showSheet = !active && (!rollingAnim || progress < 0.24);

  if (showSheet) {
    const p = rollingAnim ? 1 : rolling;
    const w = paper.w * (1 - 0.93 * p);
    const x = paper.x + paper.w - w;

    // 기본 메모지
    push();
    noStroke();

    drawingContext.shadowBlur = 18;
    drawingContext.shadowColor = "rgba(0,0,0,0.12)";
    fill("#FFFDF8");
    rect(x, paper.y, w, paper.h, 2);

    drawingContext.shadowBlur = 0;
    drawingContext.shadowColor = "transparent";

    // 말기 전 상태에서만 자동 펄럭임 표시

    if (!rollingAnim && rolling < 0.05) {
      const dc = drawingContext;
      const px = paper.x;
      const py = paper.y;
      const ph = paper.h;

      // 천천히 반복되는 작은 종이 말림
      const t = (Math.sin(millis() * 0.0022) + 1) / 2;
      const ease = t * t * (3 - 2 * t);

      // 너무 크게 말리지 않고 왼쪽 끝만 살짝
      const curlW = 15 + ease * 20;

      dc.save();

      // 종이 전체 밖으로 그림자가 번지지 않도록 제한
      dc.beginPath();
      dc.rect(px, py, curlW + 22, ph);
      dc.clip();

      // 회색 사각형 대신 말린 부분 바로 옆의 부드러운 그림자
      const shadow = dc.createLinearGradient(
        px + curlW * 0.45,
        0,
        px + curlW + 20,
        0,
      );
      shadow.addColorStop(0, "rgba(70,65,60,0.10)");
      shadow.addColorStop(0.5, "rgba(70,65,60,0.07)");
      shadow.addColorStop(1, "rgba(70,65,60,0)");

      dc.fillStyle = shadow;
      dc.fillRect(px + curlW * 0.45, py, curlW + 20, ph);

      // 작은 폭으로 둥글게 말리는 종이 표면
      dc.beginPath();
      dc.moveTo(px, py);

      dc.bezierCurveTo(
        px + curlW * 0.38,
        py + ph * 0.12,
        px + curlW * 0.75,
        py + ph * 0.35,
        px + curlW * 0.72,
        py + ph * 0.5,
      );

      dc.bezierCurveTo(
        px + curlW * 0.75,
        py + ph * 0.65,
        px + curlW * 0.38,
        py + ph * 0.88,
        px,
        py + ph,
      );

      dc.closePath();

      // 종이 표면의 은은한 입체 명암
      const surface = dc.createLinearGradient(px, 0, px + curlW, 0);
      surface.addColorStop(0, "#E4E1DB");
      surface.addColorStop(0.22, "#F9F7F2");
      surface.addColorStop(0.55, "#FFFDF8");
      surface.addColorStop(0.82, "#F1EEE8");
      surface.addColorStop(1, "#DCD8D1");

      dc.fillStyle = surface;
      dc.fill();

      // 접힌 가장자리의 매우 얇은 윤곽
      dc.strokeStyle = "rgba(110,105,100,0.10)";
      dc.lineWidth = 0.7;
      dc.stroke();

      dc.restore();
    } else if (!rollingAnim) {
      // 종이를 실제로 드래그하는 동안의 손잡이
      fill("#D7D3C9");
      rect(paper.x + 5, paper.y + paper.h * 0.2, 5, paper.h * 0.6, 3);
    }

    pop();
  }

  // TEXT / DRAW / ERASE 버튼 (한 번만 그리기)
  for (const [i, t] of ["TEXT", "DRAW", "ERASE"].entries()) {
    const x = paper.x + i * 62;
    const y = paper.y - 47;

    noStroke();
    fill(tool === t ? "#252525" : "#E9E9E8");
    rect(x, y, 58, 30, 15);

    fill(tool === t ? "#FFFFFF" : "#777777");
    textAlign(CENTER, CENTER);
    textStyle(NORMAL);
    textSize(10);
    text(t, x + 29, y + 15);
  }

  // 기존 종이 → 알약 애니메이션
  if (rollingAnim) {
    animateRoll();
  }

  // 메모지 아래 왼쪽: 드래그 방향 안내

  if (!active && !rollingAnim && rolling < 0.92) {
    push();

    const x = paper.x;
    const y = paper.y + paper.h * 0.53;

    // 검은색 손그림 느낌의 휘어진 화살표
    noFill();
    stroke("#202020");
    strokeWeight(2.8);
    strokeCap(ROUND);
    strokeJoin(ROUND);

    beginShape();
    vertex(x - 27, y - 14);
    bezierVertex(x - 69, y - 17, x - 48, y + 21, x + 63, y + 4);
    endShape();

    // 손으로 그린 듯한 화살촉
    line(x + 63, y + 4, x + 45, y - 7);
    line(x + 63, y + 4, x + 49, y + 20);

    // 종이와 겹치는 안내 문구
    noStroke();
    fill("#202020");
    textAlign(LEFT, CENTER);
    textStyle(NORMAL);
    textFont("Marker Felt, Comic Sans MS, cursive");
    textSize(19);

    text("drag to roll", x - 35, y + 57);

    pop();
  }

  if (jarFlight) {
    drawJarFlight();
  } else if (active) {
    drawPillDragGuide();

    drawCapsule(
      active.x,
      active.y,
      largeCapsuleSize(),
      color(active.record.color),
    );
  }
}

// A paper roll is lowered into the colored lower half of a vertical capsule.
// White top half descends to close it; only then does the pill rotate horizontally.
// A vertical capsule starts nearly as tall as the original note paper.
// After receiving the roll, it closes, shrinks and turns into the draggable pill.

function drawStandingCapsule(x, y, c, opening, capWidth, halfHeight) {
  const w = capWidth;
  const hh = halfHeight;
  const dc = drawingContext;
  const base = color(c);

  push();
  translate(x, y);
  dc.save();

  // 아래쪽 컬러 캡슐: 진한 유광 플라스틱
  dc.shadowColor = "rgba(18,14,27,0.24)";
  dc.shadowBlur = 12;
  dc.shadowOffsetY = 5;

  const colored = dc.createLinearGradient(-w / 2, 0, w / 2, 0);
  colored.addColorStop(0, lerpColor(base, color("#120719"), 0.48).toString());
  colored.addColorStop(0.2, base.toString());
  colored.addColorStop(
    0.48,
    lerpColor(base, color("#FFFFFF"), 0.08).toString(),
  );
  colored.addColorStop(0.78, base.toString());
  colored.addColorStop(1, lerpColor(base, color("#120719"), 0.48).toString());

  dc.fillStyle = colored;
  dc.beginPath();
  dc.roundRect(-w / 2, 0, w, hh, [5, 5, w / 2, w / 2]);
  dc.fill();

  dc.shadowBlur = 0;
  dc.shadowOffsetY = 0;

  // 아래쪽 캡슐 안쪽으로만 반사광 제한
  dc.save();
  dc.beginPath();
  dc.roundRect(-w / 2, 0, w, hh, [5, 5, w / 2, w / 2]);
  dc.clip();

  const gloss = dc.createLinearGradient(-w * 0.4, 0, w * 0.2, 0);
  gloss.addColorStop(0, "rgba(255,255,255,0)");
  gloss.addColorStop(0.45, "rgba(255,255,255,0.50)");
  gloss.addColorStop(0.8, "rgba(255,255,255,0.12)");
  gloss.addColorStop(1, "rgba(255,255,255,0)");

  dc.fillStyle = gloss;
  dc.beginPath();
  dc.roundRect(-w * 0.22, hh * 0.08, w * 0.33, hh * 0.82, w * 0.14);
  dc.fill();
  dc.restore();

  // 위쪽 흰색 캡슐
  const white = dc.createLinearGradient(-w / 2, 0, w / 2, 0);
  white.addColorStop(0, "#BFC3CB");
  white.addColorStop(0.22, "#FFFFFF");
  white.addColorStop(0.67, "#FCFCFF");
  white.addColorStop(1, "#B4BAC4");

  dc.fillStyle = white;
  dc.beginPath();
  dc.roundRect(-w / 2, -hh - opening, w, hh, [w / 2, w / 2, 5, 5]);
  dc.fill();

  // 흰색 부분의 부드러운 반사광
  dc.save();
  dc.beginPath();
  dc.roundRect(-w / 2, -hh - opening, w, hh, [w / 2, w / 2, 5, 5]);
  dc.clip();

  dc.fillStyle = "rgba(255,255,255,0.45)";
  dc.beginPath();
  dc.roundRect(
    -w * 0.2,
    -hh - opening + hh * 0.1,
    w * 0.25,
    hh * 0.75,
    w * 0.12,
  );
  dc.fill();
  dc.restore();

  dc.restore();
  pop();
}

function animateRoll() {
  const a = rollingAnim;
  if (!a) return;
  const t = constrain((millis() - a.start) / a.duration, 0, 1);
  const x = paper.x + paper.w * 0.78;
  const sy = paper.y + paper.h / 2;
  const c = color(a.record.color);
  const capHeight = paper.h * 0.86; // nearly original note-sheet height
  const halfH = capHeight / 2;
  const bigWidth = Math.max(36, Math.min(72, paper.h * 0.2));
  const opening = Math.min(58, paper.h * 0.19);

  if (t < 0.2) {
    // The full-height original sheet is completing its roll at this time.
  } else if (t < 0.6) {
    // 종이가 캡슐 안으로 천천히 들어가는 단계
    const q = constrain((t - 0.2) / 0.4, 0, 1);
    const ease = q * q * (3 - 2 * q);

    const rollW = Math.max(14, bigWidth * 0.4);

    // 들어갈수록 종이가 캡슐 안에서 짧아짐
    const rollH = lerp(paper.h * 0.75, halfH * 0.45, ease);

    const startY = sy - halfH - opening - paper.h * 0.34;
    const endY = sy + halfH * 0.42;
    const rollY = lerp(startY, endY, ease);

    // 종이는 캡슐 바닥 아래에 절대 표시하지 않음
    const dc = drawingContext;
    dc.save();
    dc.beginPath();
    dc.rect(
      x - bigWidth / 2,
      sy - halfH - opening - paper.h,
      bigWidth,
      halfH * 2 + opening + paper.h - 2,
    );
    dc.clip();

    push();
    noStroke();
    fill("#F3EEDF");

    rect(x - rollW / 2, rollY - rollH / 2, rollW, rollH, rollW / 2);

    stroke("#D8CFBD");
    strokeWeight(1.2);
    line(
      x - rollW * 0.16,
      rollY - rollH * 0.45,
      x - rollW * 0.16,
      rollY + rollH * 0.45,
    );
    pop();

    dc.restore();

    // 캡슐을 종이 위에 그려 삽입된 부분을 가림
    drawStandingCapsule(x, sy, c, opening, bigWidth, halfH);
  } else if (t < 0.76) {
    // The sheet is entirely inside. The white half seals the capsule.
    const q = constrain((t - 0.6) / 0.16, 0, 1);
    const ease = q * q * (3 - 2 * q);
    drawStandingCapsule(x, sy, c, opening * (1 - ease), bigWidth, halfH);
  } else {
    // Keep the full-size closed pill large; rotate it without shrinking.
    const q = constrain((t - 0.76) / 0.24, 0, 1);
    const ease = q * q * (3 - 2 * q);
    const pillWidth = capHeight;
    push();
    translate(x, sy);
    rotate(-HALF_PI * (1 - ease));
    drawCapsule(0, 0, pillWidth, c);
    pop();
  }
  if (t >= 1) {
    active = { record: a.record, x, y: sy };
    rollingAnim = null;
    rolling = 1;
    syncPaperVisibility();
    updateTool();
  }
}
function drawAsset(img, x, y, w, h) {
  if (img && img.width > 1) {
    imageMode(CENTER);
    image(img, x, y, w, h);
    imageMode(CORNER);
  } else {
    noFill();
    stroke("#A8B7BD");
    ellipse(x, y, w * 0.65, h * 0.7);
  }
}

function drawCapsule(x, y, w, c) {
  const h = w * 0.39;
  const dc = drawingContext;
  const base = color(c);

  push();
  translate(x, y);

  dc.save();

  // 1. 캡슐 전체의 입체 그림자
  dc.shadowColor = "rgba(18, 14, 27, 0.23)";
  dc.shadowBlur = Math.max(3, w * 0.075);
  dc.shadowOffsetY = h * 0.07;

  // 2. 흰색 캡슐 몸체의 곡면과 깊이
  const white = dc.createLinearGradient(0, -h / 2, 0, h / 2);
  white.addColorStop(0, "#B8BBC3");
  white.addColorStop(0.12, "#F9FAFC");
  white.addColorStop(0.31, "#FFFFFF");
  white.addColorStop(0.62, "#FCFCFE");
  white.addColorStop(0.86, "#E4E5EB");
  white.addColorStop(1, "#A5A9B2");

  dc.fillStyle = white;
  dc.beginPath();
  dc.roundRect(-w / 2, -h / 2, w, h, h / 2);
  dc.fill();

  dc.shadowColor = "transparent";
  dc.shadowBlur = 0;
  dc.shadowOffsetY = 0;

  // 3. 진한 유색 캡슐 뚜껑
  const capGrad = dc.createLinearGradient(0, -h / 2, 0, h / 2);
  capGrad.addColorStop(0, lerpColor(base, color("#13071E"), 0.48).toString());
  capGrad.addColorStop(
    0.14,
    lerpColor(base, color("#FFFFFF"), 0.07).toString(),
  );
  capGrad.addColorStop(0.38, base.toString());
  capGrad.addColorStop(
    0.68,
    lerpColor(base, color("#1C0928"), 0.07).toString(),
  );
  capGrad.addColorStop(1, lerpColor(base, color("#120719"), 0.46).toString());

  dc.fillStyle = capGrad;
  dc.beginPath();
  dc.roundRect(-w / 2, -h / 2, w * 0.54, h, [h / 2, h * 0.06, h * 0.06, h / 2]);
  dc.fill();

  // 4. 컬러 캡 내부에 플라스틱 두께감
  dc.save();
  dc.beginPath();
  dc.roundRect(-w / 2, -h / 2, w * 0.54, h, [h / 2, h * 0.06, h * 0.06, h / 2]);
  dc.clip();

  const depth = dc.createLinearGradient(-w / 2, 0, w * 0.04, 0);
  depth.addColorStop(0, "rgba(10, 0, 25, 0.30)");
  depth.addColorStop(0.22, "rgba(255, 255, 255, 0)");
  depth.addColorStop(0.78, "rgba(255, 255, 255, 0.05)");
  depth.addColorStop(1, "rgba(15, 0, 30, 0.23)");

  dc.fillStyle = depth;
  dc.fillRect(-w / 2, -h / 2, w * 0.54, h);

  // 5. 실사 캡슐처럼 넓고 강한 곡면 반사광
  const shine = dc.createLinearGradient(0, -h * 0.46, 0, h * 0.18);
  shine.addColorStop(0, "rgba(255,255,255,0.88)");
  shine.addColorStop(0.22, "rgba(255,255,255,0.52)");
  shine.addColorStop(0.65, "rgba(255,255,255,0.09)");
  shine.addColorStop(1, "rgba(255,255,255,0)");

  dc.fillStyle = shine;
  dc.beginPath();
  dc.moveTo(-w * 0.39, -h * 0.35);
  dc.bezierCurveTo(
    -w * 0.29,
    -h * 0.47,
    -w * 0.1,
    -h * 0.46,
    w * 0.015,
    -h * 0.29,
  );
  dc.lineTo(w * 0.008, -h * 0.06);
  dc.bezierCurveTo(
    -w * 0.15,
    -h * 0.17,
    -w * 0.29,
    -h * 0.07,
    -w * 0.41,
    -h * 0.14,
  );
  dc.closePath();
  dc.fill();

  // 색깔 캡슐 아래쪽의 희미한 반사
  const lowerGlow = dc.createLinearGradient(0, h * 0.08, 0, h * 0.49);
  lowerGlow.addColorStop(0, "rgba(255,255,255,0)");
  lowerGlow.addColorStop(1, "rgba(255,255,255,0.18)");
  dc.fillStyle = lowerGlow;
  dc.fillRect(-w / 2, h * 0.08, w * 0.54, h * 0.42);

  dc.restore();

  // 6. 뚜껑과 몸체가 겹치는 접합선
  dc.fillStyle = "rgba(22, 17, 34, 0.24)";
  dc.fillRect(w * 0.025, -h * 0.43, Math.max(0.7, w * 0.007), h * 0.86);

  // 7. 흰색 플라스틱 표면의 길고 부드러운 하이라이트
  dc.save();
  dc.beginPath();
  dc.roundRect(w * 0.02, -h / 2, w * 0.48, h, [0, h / 2, h / 2, 0]);
  dc.clip();

  const whiteShine = dc.createLinearGradient(0, -h * 0.43, 0, h * 0.1);
  whiteShine.addColorStop(0, "rgba(255,255,255,0.95)");
  whiteShine.addColorStop(0.55, "rgba(255,255,255,0.35)");
  whiteShine.addColorStop(1, "rgba(255,255,255,0)");

  dc.fillStyle = whiteShine;
  dc.beginPath();
  dc.roundRect(w * 0.065, -h * 0.4, w * 0.36, h * 0.27, h * 0.13);
  dc.fill();

  dc.restore();

  dc.restore();
  pop();
}

function drawBack() {
  noFill();
  stroke("#8F8F8F");
  strokeWeight(2);
  line(34, 34, 18, 45);
  line(18, 45, 34, 56);
}

function prescriptionGeometry() {
  // Immersive composition: giant cropped bottle left, mouth right,
  // small scrollable prescriptions in a horizontal bottom tray.
  const sz = Math.min(height * 1.95, width * 1.65, 1800);
  const cx = width * 0.16;
  const cy = height * 0.3 - 210;

  const mouthW = width * 0.65;

  const mouthBox = {
    x: width * 0.8,
    y: height * 0.3,
    w: mouthW,
    h: mouthW * 0.88,
  };
  const laneY = height * 0.795;
  const laneH = height - laneY - 12;
  const pouchH = Math.min(158, laneH * 0.86);
  const pouchW = Math.min(176, pouchH * 1.12);
  const lane = { x: 22, y: laneY, w: width - 44, h: laneH };
  return {
    sz,
    cx,
    cy,
    mouth: mouthBox,
    lane,
    pouch: {
      x: lane.x + pouchW / 2 + 10,
      y: lane.y + lane.h / 2 - 4,
      w: pouchW,
      h: pouchH,
    },
  };
}
function maxRxScroll() {
  const g = rxGeom || prescriptionGeometry();
  // Even when every packet fits on screen, the strip must still be foldable.
  return (rxPacks.length + 1) * (g.pouch.w + 2);
}
function inScrollLane(p) {
  const g = rxGeom || prescriptionGeometry();
  return (
    p.x >= g.lane.x &&
    p.x <= g.lane.x + g.lane.w &&
    p.y >= g.lane.y &&
    p.y <= g.lane.y + g.lane.h
  );
}
function pouchAt(index) {
  const g = rxGeom || prescriptionGeometry();

  const pitch = g.pouch.w + 2;
  const left = g.lane.x + g.pouch.w / 2 + 10;

  const phase = rxScroll / pitch;
  const fold = constrain(phase - index, 0, 1);
  const ease = fold * fold * (3 - 2 * fold);

  // 펼쳐진 봉투의 위치
  const openX = left + index * pitch - rxScroll;

  // 접힌 봉투들이 왼쪽에서 네모난 채 겹치는 위치
  const stackX = left + index * 6;

  return {
    ...g.pouch,
    x: lerp(openX, stackX, ease),
    y: g.pouch.y + (index % 2 === 0 ? -1 : 1) * ease * 3,
    fold: ease,
    faceW: g.pouch.w, // 폭을 줄이지 않음!
    foldDir: index % 2 === 0 ? 1 : -1,
  };
}
function inRect(p, r) {
  return (
    p.x >= r.x - r.w / 2 &&
    p.x <= r.x + r.w / 2 &&
    p.y >= r.y - r.h / 2 &&
    p.y <= r.y + r.h / 2
  );
}
function openNote(id, prescribedAt = null) {
  const n = notes.find((n) => n.id === id);
  if (!n) return;
  lastForgottenMs = Date.now() - (n.lastRead || n.created || Date.now());
  const containingPack = rxPacks.find((pack) => pack.ids.includes(id));
  selectedPrescribedAt =
    prescribedAt || (containingPack ? containingPack.prescribedAt : null);
  selectedPack = null;
  n.lastRead = Date.now();
  selected = n;
  persistNotes();
}
function deleteNote(id) {
  notes = notes.filter((n) => n.id !== id);
  rxPack = rxPack.filter((v) => v !== id);
  rxPacks = rxPacks
    .map((pack) => ({ ...pack, ids: pack.ids.filter((v) => v !== id) }))
    .filter((pack) => pack.ids.length);
  persistNotes();
  persistPrescription();
  bottleBuild();
}
function packNote(id) {
  if (
    !notes.some((n) => n.id === id) ||
    rxPack.includes(id) ||
    rxPacks.some((pack) => pack.ids.includes(id))
  )
    return;
  rxPack.push(id);
  persistPrescription();

  bottleBuild();
}
function finalizePrescription() {
  if (!rxPack.length) return;
  const result = window.prompt(
    "처방전 제목을 입력해 주세요",
    "나에게 필요한 생각들",
  );
  if (result === null) return;
  const title = result.trim() || "무제 처방전";
  const prescribedAt = Date.now();
  rxPacks.push({
    id: uid(),
    title,
    prescribedAt,
    ids: rxPack.slice(),
    memo: "",
  });
  rxPack = [];
  persistPrescription();
  rxScroll = 0; // Keep separate clickable pouches visible after saving.
}
function persistPrescription() {
  try {
    localStorage.setItem(
      RX_STORE,
      JSON.stringify({ open: rxPack, sealed: rxPacks }),
    );
  } catch (err) {
    console.warn(err);
  }
}
function loadPrescription() {
  try {
    const newData = localStorage.getItem(RX_STORE);
    const d = JSON.parse(newData || localStorage.getItem(OLD_RX_STORE) || "{}");
    const valid = (id) => notes.some((n) => n.id === id);
    rxPack = (Array.isArray(d.open) ? d.open : []).filter(valid);
    rxPacks = (Array.isArray(d.sealed) ? d.sealed : [])
      .map((pack, i) => {
        if (Array.isArray(pack))
          return {
            id: uid(),
            title: "이전에 처방한 생각",
            prescribedAt: Date.now(),
            ids: pack.filter(valid),
            memo: "",
          };
        return {
          id: pack.id || uid(),
          title: pack.title || "무제 처방전",
          prescribedAt: Number(pack.prescribedAt) || Date.now(),
          ids: (Array.isArray(pack.ids) ? pack.ids : []).filter(valid),
          memo: typeof pack.memo === "string" ? pack.memo : "",
        };
      })
      .filter((pack) => pack.ids.length);
    if (!newData) persistPrescription();
  } catch (_) {
    rxPack = [];
    rxPacks = [];
  }
}
function formatRxTime(timestamp) {
  const d = new Date(timestamp);
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${z(d.getMonth() + 1)}.${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`;
}
function pouchPillLayout(p, count) {
  // Free count; resize capsules progressively and form rows inside the packet.
  const columns = count > 18 ? 6 : count > 10 ? 5 : count > 5 ? 4 : 3;
  const rows = Math.max(1, Math.ceil(count / columns));
  const usableW = p.w * 0.83,
    usableH = p.h * 0.56;
  const stepX = usableW / columns,
    stepY = usableH / rows;
  const size = Math.min(p.w * 0.27, stepX * 0.85, stepY * 2.05);
  return Array.from({ length: count }, (_, i) => {
    const col = i % columns,
      row = Math.floor(i / columns);
    const rowCount = Math.min(columns, count - row * columns);
    return {
      x: p.x + (col - (rowCount - 1) / 2) * stepX,
      y: p.y - p.h * 0.17 + (row + 0.5) * stepY,
      angle: Math.sin(i * 2.37) * 0.18,
      size,
    };
  });
}
function drawPouch(p, pack, sealed = false, faint = false) {
  const contents = sealed ? pack.ids : pack;
  const fold = p.fold || 0;
  const faceW = Math.max(9, p.faceW || p.w);
  push();
  // Face is compressed around its center: a real left-to-right fanfold.
  // Text and PNG are transformed TOGETHER, so nothing vanishes independently.
  translate(p.x, p.y);

  rectMode(CENTER);
  if (pouchPNG && pouchPNG.width > 1) {
    imageMode(CENTER);
    tint(255, faint ? 150 : 255);
    image(pouchPNG, 0, 0, p.w, p.h);
    noTint();
    imageMode(CORNER);
  } else {
    noStroke();
    fill(255, 255, 255, faint ? 100 : 215);
    rect(0, 0, p.w, p.h);
    stroke(185);
    noFill();
    rect(0, 0, p.w, p.h);
  }
  if (sealed) {
    noStroke();
    textAlign(LEFT, TOP);
    fill("#222");
    textStyle(BOLD);
    textSize(Math.max(13, p.w * 0.09));
    let name = String(pack.title || "무제 처방전").replace(/\s+/g, " ");
    while (name.length > 1 && textWidth(name) > p.w * 0.71)
      name = name.slice(0, -2) + "…";
    text(name, -p.w * 0.37, -p.h * 0.32);
    textStyle(NORMAL);
    textSize(Math.max(9, p.w * 0.055));
    fill("#484848");
    text(formatRxTime(pack.prescribedAt), -p.w * 0.37, -p.h * 0.16);
  } else if (contents.length) {
    // Checked seal still works on an unfolded in-progress pouch.
    const sx = p.w * 0.33,
      sy = -p.h * 0.28;
    noStroke();
    fill("#2E4659");
    circle(sx, sy, 26);
    stroke(255);
    strokeWeight(2);
    noFill();
    line(sx - 6, sy, sx - 1, sy + 5);
    line(sx - 1, sy + 5, sx + 7, sy - 6);
  }
  // Subtle dark edge shifts sides on successive folds.
  if (fold > 0.005) {
    noStroke();
    fill(35, 45, 58, fold * 112);
    const side = p.foldDir > 0 ? -p.w / 2 : p.w / 2 - p.w * 0.09;
    rectMode(CORNER);
    rect(side, -p.h / 2, p.w * 0.09, p.h);
  } // 약봉투 안에 처방된 알약 표시
  const pillIDs = sealed ? pack.ids : pack;

  if (Array.isArray(pillIDs) && pillIDs.length > 0) {
    const spots = pouchPillLayout({ ...p, x: 0, y: 0 }, pillIDs.length);

    pillIDs.forEach((id, i) => {
      const n = notes.find((v) => v.id === id);
      if (!n || !spots[i]) return;

      const q = spots[i];

      push();
      translate(q.x, q.y);
      rotate(q.angle);
      drawCapsule(0, 0, q.size, color(n.color));
      pop();
    });
  }
  pop();
}
function hitSeal(point) {
  if (!rxPack.length || !inScrollLane(point)) return false;
  const p = pouchAt(rxPacks.length);
  const scaleX = (p.faceW || p.w) / p.w;
  return (
    Math.hypot(
      point.x - (p.x + p.w * 0.33 * scaleX),
      point.y - (p.y - p.h * 0.28),
    ) < 20
  );
}
function hitPacketPill(x, y) {
  // Individual pills are inside the prescription view, not drawn on packet skins.
  return null;
}
function hitSealedPack(point) {
  if (!inScrollLane(point)) return null;
  // In expanded mode, each visible pouch gets an independent click zone.
  // The side-by-side packet spacing must use the SAME pouchAt() as drawing.
  const candidates = [];
  for (let i = 0; i < rxPacks.length; i++) {
    const p = pouchAt(i);
    const left = Math.max(rxGeom.lane.x, p.x - p.w / 2);
    const right = Math.min(rxGeom.lane.x + rxGeom.lane.w, p.x + p.w / 2);
    if (
      point.x >= left &&
      point.x <= right &&
      point.y >= p.y - p.h / 2 &&
      point.y <= p.y + p.h / 2
    ) {
      candidates.push({ index: i, distance: Math.abs(point.x - p.x) });
    }
  }
  if (!candidates.length) return null;
  // With folded overlapping packets, a tap selects the frontmost packet;
  // otherwise select the packet nearest the touch center.
  candidates.sort((a, b) => a.distance - b.distance || b.index - a.index);
  return rxPacks[candidates[0].index];
}

function detailGeometry() {
  // The entire digital prescription remains within the viewport.
  const w = Math.min(width * 0.82, 730);
  const h = Math.min(height - 34, 800);
  const x = (width - w) / 2;
  const y = (height - h) / 2;
  // Reserve space for the distinctive arched pharmacy-paper header.
  const archH = Math.min(53, h * 0.082);
  const headerBottom = y + archH + 174;
  const listTop = headerBottom + 28;
  const memoTop = y + h - Math.min(151, h * 0.245);
  const listBottom = Math.max(listTop + 52, memoTop - 17);
  return { x, y, w, h, archH, listTop, listBottom, memoTop, rowH: 94 };
}
function prescriptionOutline(x, y, w, h, archH, inset = 0) {
  const dc = drawingContext;
  dc.beginPath();
  dc.rect(x + inset, y + inset, w - 2 * inset, h - 2 * inset);
  dc.closePath();
}
function maxPackDetailScroll() {
  const pack = rxPacks.find((v) => v.id === selectedPack);
  if (!pack) return 0;
  const g = detailGeometry();
  return Math.max(
    0,
    pack.ids.length * g.rowH - Math.max(1, g.listBottom - g.listTop),
  );
}
function syncRxMemoInput() {
  if (!rxMemoInput) return;
  const pack = rxPacks.find((p) => p.id === selectedPack);
  if (!pack || selected || stage !== "rx") {
    rxMemoInput.style.display = "none";
    rxMemoPackId = null;
    return;
  }
  const g = detailGeometry();
  if (rxMemoPackId !== pack.id) {
    rxMemoPackId = pack.id;
    rxMemoInput.value = pack.memo || "";
  }
  Object.assign(rxMemoInput.style, {
    display: "block",
    left: g.x + 39 + "px",
    top: g.memoTop + 26 + "px",
    width: Math.max(80, g.w - 78) + "px",
    height: Math.max(38, g.y + g.h - g.memoTop - 70) + "px",
  });
}

function handlePackDetailClick(p) {
  const g = detailGeometry();
  const right = g.x + g.w - 31;
  const top = g.y + 25;

  // DELETE 버튼
  if (
    p.x >= right - 117 &&
    p.x <= right - 36 &&
    p.y >= top - 22 &&
    p.y <= top + 22
  ) {
    const pack = rxPacks.find((v) => v.id === selectedPack);

    if (pack && confirm("이 처방전을 삭제할까요?")) {
      const ids = new Set(pack.ids);

      // 처방전과 그 안의 메모 삭제
      rxPacks = rxPacks.filter((v) => v.id !== pack.id);
      notes = notes.filter((v) => !ids.has(v.id));

      selectedPack = null;
      packDetailScroll = 0;

      persistNotes();
      persistPrescription();
      bottleBuild();

      rxScroll = constrain(rxScroll, 0, maxRxScroll());
      syncRxMemoInput();
    }
    return;
  }

  // X 닫기 버튼
  if (
    p.x >= right - 28 &&
    p.x <= right + 18 &&
    p.y >= top - 22 &&
    p.y <= top + 22
  ) {
    selectedPack = null;
    syncRxMemoInput();
    return;
  }

  // 처방전 바깥을 누르면 닫기
  if (p.x < g.x || p.x > g.x + g.w || p.y < g.y || p.y > g.y + g.h) {
    selectedPack = null;
    syncRxMemoInput();
    return;
  }

  // 기존 알약 메모 열기
  const pack = rxPacks.find((v) => v.id === selectedPack);
  if (!pack || p.y < g.listTop || p.y > g.listBottom) return;

  const index = Math.floor((p.y - g.listTop + packDetailScroll) / g.rowH);

  if (index >= 0 && index < pack.ids.length) {
    openNote(pack.ids[index], pack.prescribedAt);
    syncRxMemoInput();
  }
}

function blueDottedLine(x1, y1, x2, y2) {
  push();
  stroke("#2B76C6");
  strokeWeight(1);
  drawingContext.setLineDash([2, 5]);
  line(x1, y1, x2, y2);
  drawingContext.setLineDash([]);
  pop();
}
function drawPackDetail() {
  const pack = rxPacks.find((v) => v.id === selectedPack);
  if (!pack) {
    selectedPack = null;
    syncRxMemoInput();
    return;
  }
  const g = detailGeometry();
  const left = g.x + 31,
    right = g.x + g.w - 31;
  push();
  noStroke();
  fill(0, 105);
  rect(0, 0, width, height);
  // Crisp on-screen prescription silhouette, not a rectangular modal.
  fill("#FFFDF8");
  noStroke();
  prescriptionOutline(g.x, g.y, g.w, g.h, g.archH, 0);
  drawingContext.fill();
  noFill();
  stroke("#246BC1");
  strokeWeight(2);
  prescriptionOutline(g.x, g.y, g.w, g.h, g.archH, 8);
  drawingContext.stroke();
  strokeWeight(0.8);
  prescriptionOutline(g.x, g.y, g.w, g.h, g.archH, 13);
  drawingContext.stroke();
  noStroke();
  fill("#246BC1");
  textAlign(LEFT, TOP);
  textStyle(NORMAL);
  textSize(15);
  textSize(34);
  textStyle(BOLD);
  text("✚", left - 5, g.y + g.archH - 27);

  textSize(24);
  textStyle(BOLD);
  text("MINDOSE", left + 30, g.y + g.archH - 22);
  textStyle(NORMAL);
  textSize(11);
  text(
    "RX  " + String(Math.max(1, rxPacks.indexOf(pack) + 1)).padStart(3, "0"),
    right - 58,
    g.y + g.archH + 18,
  );
  textSize(11);
  text("당신의 생각을 위한 처방전", left + 30, g.y + g.archH + 44);
  blueDottedLine(left, g.y + g.archH + 66, right, g.y + g.archH + 66);
  fill("#246BC1");
  textSize(12);
  text("제목", left, g.y + g.archH + 76);
  fill("#1E3550");
  textStyle(BOLD);
  textSize(Math.min(19, Math.max(13, g.w / 31)));
  text(
    pack.title || "무제 처방전",
    left + 40,
    g.y + g.archH + 74,
    g.w - 110,
    28,
  );
  textStyle(NORMAL);
  blueDottedLine(left, g.y + g.archH + 108, right, g.y + g.archH + 108);
  fill("#246BC1");
  textSize(11);
  text("처방일", left, g.y + g.archH + 117);
  fill("#2C4769");
  text(formatRxTime(pack.prescribedAt), left + 48, g.y + g.archH + 116);
  fill("#246BC1");
  text("처방된 기억", left, g.listTop - 27);
  textAlign(RIGHT, TOP);
  text(`${pack.ids.length}정`, right, g.listTop - 27);
  blueDottedLine(left, g.listTop - 9, right, g.listTop - 9);
  const dc = drawingContext;
  dc.save();
  dc.beginPath();
  dc.rect(left, g.listTop, right - left, g.listBottom - g.listTop);
  dc.clip();
  pack.ids.forEach((id, i) => {
    const n = notes.find((v) => v.id === id);
    if (!n) return;
    const yy = g.listTop + i * g.rowH - packDetailScroll;
    if (yy + g.rowH < g.listTop || yy > g.listBottom) return;
    noStroke();
    fill("#F9FBFE");
    rect(left + 2, yy + 2, right - left - 4, g.rowH - 8, 3);
    drawCapsule(left + 38, yy + 38, 48, color(n.color));
    fill("#275D9D");
    textAlign(LEFT, TOP);
    textSize(12);
    textStyle(NORMAL);
    const snippet = String(n.text || (n.drawing ? "그림으로 남긴 생각" : ""));
    text(snippet, left + 79, yy + 17, right - left - 106, 58);
    if (n.drawing) {
      const img = getCachedImage(n);
      if (img) {
        imageMode(CORNER);
        image(img, right - 69, yy + 14, 57, 63);
      }
    }
    blueDottedLine(left + 8, yy + g.rowH - 5, right - 8, yy + g.rowH - 5);
  });
  dc.restore();
  if (maxPackDetailScroll() > 0) {
    const maxS = maxPackDetailScroll(),
      v = g.listBottom - g.listTop;
    const th = Math.max(22, (v * v) / (v + maxS));
    noStroke();
    fill("#4383C4");
    rect(right - 2, g.listTop + ((v - th) * packDetailScroll) / maxS, 2, th);
  }
  blueDottedLine(left, g.memoTop - 10, right, g.memoTop - 10);
  fill("#246BC1");
  textAlign(LEFT, TOP);
  textSize(16);
  textStyle(BOLD);
  text("✚ 메모", left, g.memoTop + 2);
  textStyle(NORMAL);
  textSize(10);
  text("FOR YOUR FUTURE SELF", left, g.y + g.h - 30);
  textAlign(RIGHT, TOP);
  text("잊힌 생각을, 다시 만나는 시간", right, g.y + g.h - 30);

  // 오른쪽 위 DELETE + X 버튼
  const buttonY = g.y + 38;

  // DELETE
  push();
  noStroke();
  fill("#246BC1");
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  textSize(13);
  text("Delete", right - 76, buttonY);
  pop();

  // X 닫기 — 기존보다 크게
  push();
  stroke("#246BC1");
  strokeWeight(2.8);
  strokeCap(ROUND);

  const closeX = right - 5;
  const closeY = buttonY;

  line(closeX - 9, closeY - 9, closeX + 9, closeY + 9);

  line(closeX + 9, closeY - 9, closeX - 9, closeY + 9);
  pop();
}
function drawRx() {
  drawBack();
  rxGeom = prescriptionGeometry();
  const { sz, cx, cy, pouch, mouth: mouthBox } = rxGeom;
  drawAsset(bottlePNG2, cx, cy, sz, sz);
  const dc = drawingContext;
  dc.save();
  dc.beginPath();
  dc.roundRect(
    cx - sz * 0.16,
    cy - sz * 0.11,
    sz * 0.32,
    sz * 0.48,
    sz * 0.055,
  );
  dc.clip();
  animationPills = [];
  const factor = sz / bottle.w;
  const capsuleSize = sz * 0.135; // Bold readable capsules, matching the enlarged bottle physics.
  for (const item of jarPills) {
    const n = notes.find((v) => v.id === item.recordId);
    if (!n) continue;
    const body = item.body;
    const x = cx + (body.position.x - bottle.x) * factor;
    const y = cy + (body.position.y - bottle.y) * factor;
    animationPills.push({ recordId: n.id, x, y, w: capsuleSize });
    if (rxDrag && rxDrag.recordId === n.id) continue;
    push();
    translate(x, y);
    rotate(body.angle);
    drawCapsule(0, 0, capsuleSize, ageColor(n));
    pop();
  }
  dc.restore();
  drawAsset(teethPNG, mouthBox.x, mouthBox.y, mouthBox.w, mouthBox.h);
  // Horizontal scrolling prescription tray at the bottom.
  // A faint tray surface covers the cropped bottle/mouth underneath it.
  noStroke();
  // No solid tray behind the clear physical packet strip.

  rxScroll = constrain(rxScroll, 0, maxRxScroll());
  dc.save();
  dc.beginPath();
  dc.rect(rxGeom.lane.x, rxGeom.lane.y, rxGeom.lane.w, rxGeom.lane.h);
  dc.clip();
  rxPacks.forEach((pack, i) => {
    const position = pouchAt(i);
    if (
      position.x + position.faceW / 2 >= rxGeom.lane.x &&
      position.x - position.faceW / 2 <= rxGeom.lane.x + rxGeom.lane.w
    )
      drawPouch(position, pack, true);
  });
  const current = pouchAt(rxPacks.length);
  if (
    current.x + current.faceW / 2 >= rxGeom.lane.x &&
    current.x - current.faceW / 2 <= rxGeom.lane.x + rxGeom.lane.w
  )
    drawPouch(current, rxPack, false);
  dc.restore();
  // Slim horizontal scrollbar below the pouches.
  const scrollMax = maxRxScroll();
  if (scrollMax > 0) {
    const track = rxGeom.lane;
    const thumbW = Math.max(38, (track.w * track.w) / (track.w + scrollMax));
    const thumbX = track.x + (track.w - thumbW) * (rxScroll / scrollMax);
    noStroke();
    fill(166, 171, 176, 155);
    rect(thumbX, track.y + track.h - 4, thumbW, 3, 2);
  }
  // 아이패드: 병 속 알약을 잡기 전에 두 목적지 안내.
  // 병 → 입, 병 → 아래 약봉투. 드래그가 시작되면 숨긴다.
  // Visible outside of the bottle clipping. Guide only two actions.
  if (!rxDrag && !selected && !selectedPack) {
    drawRxDragGuide();
  }
  if (rxDrag) {
    const n = notes.find((v) => v.id === rxDrag.recordId);
    if (n) drawCapsule(rxDrag.x, rxDrag.y, capsuleSize, ageColor(n));
  }
}

function hitPill(x, y) {
  if (stage !== "rx") return null;
  for (let i = animationPills.length - 1; i >= 0; i--) {
    let p = animationPills[i];
    if (Math.hypot(p.x - x, p.y - y) < Math.max(17, p.w * 0.55)) return p;
  }
  return null;
}
function drawReader() {
  const n = selected;
  if (!n) return;
  noStroke();
  fill(0, 110);
  rect(0, 0, width, height);
  const w = Math.min(width * 0.8, 680),
    h = Math.min(height * 0.65, 360),
    x = (width - w) / 2,
    y = (height - h) / 2;
  fill("#FFFDF7");
  rect(x, y, w, h, 4);
  drawingContext.save();
  drawingContext.beginPath();
  drawingContext.rect(x + 20, y + 20, w - 40, h - 40);
  drawingContext.clip();
  fill("#383B4A");
  textAlign(LEFT, TOP);
  textStyle(NORMAL);
  textSize(16);
  // Reveal how long the thought had been out of mind before opening it.
  // The elapsed time was captured by openNote() BEFORE updating lastRead.
  const elapsedMs = Math.max(0, lastForgottenMs || 0);
  const elapsedDays = Math.floor(elapsedMs / 86400000);
  const elapsedHours = Math.floor(elapsedMs / 3600000);
  const elapsedMinutes = Math.floor(elapsedMs / 60000);
  const elapsedText =
    elapsedDays >= 1
      ? `${elapsedDays}일`
      : elapsedHours >= 1
        ? `${elapsedHours}시간`
        : elapsedMinutes >= 1
          ? `${elapsedMinutes}분`
          : "1분 미만";
  const ageLabel = selectedPrescribedAt
    ? `${formatRxTime(selectedPrescribedAt)}에 처방된 메모`
    : `${elapsedText} 동안 잊혀진 메모`;
  fill("#7B8292");
  textSize(12);
  text(ageLabel, x + 35, y + 24);
  fill("#383B4A");
  textSize(16);
  text(n.text || "", x + 35, y + 52, w - 70, h - 78);
  if (n.drawing) {
    const img = getCachedImage(n);
    if (img) {
      image(img, x + 20, y + 20, w - 40, h - 40);
    }
  }
  drawingContext.restore();
}
const previewCache = {};
function getCachedImage(n) {
  if (!n.drawing) return null;
  if (Object.prototype.hasOwnProperty.call(previewCache, n.id))
    return previewCache[n.id];
  previewCache[n.id] = null;
  loadImage(n.drawing, (img) => {
    previewCache[n.id] = img;
  });
  return null;
}
function persistNotes() {
  try {
    localStorage.setItem(STORE, JSON.stringify(notes));
  } catch (e) {
    console.warn("Storage quota exceeded", e);
  }
}
function loadSaved() {
  try {
    notes = JSON.parse(localStorage.getItem(STORE) || "[]");
    if (!Array.isArray(notes)) notes = [];
  } catch (e) {
    notes = [];
  }
}
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  const before = document.createElement("canvas");
  before.width = paperCanvas.width;
  before.height = paperCanvas.height;
  before.getContext("2d").drawImage(paperCanvas, 0, 0);
  layout();
  paperCtx.drawImage(before, 0, 0, paperCanvas.width, paperCanvas.height);
  bottleBuild();
}

function drawPillDragGuide() {
  if (!active || rollingAnim || jarFlight || pillDrag) return;

  const x = active.x;
  const y = active.y;
  const pulse = (Math.sin(millis() * 0.004) + 1) / 2;

  push();
  noFill();
  stroke("#9A9A9A");
  strokeWeight(1.8);
  drawingContext.setLineDash([4, 7]);

  // 알약통 방향
  const upperX = lerp(x + 85, bottle.x - 25, 0.6);
  const upperY = lerp(y - 35, bottle.y + 45, 0.6);

  line(x + 75, y - 25, upperX, upperY - pulse * 12);

  // 입 방향
  const lowerX = lerp(x + 85, mouth.x - 40, 0.6);
  const lowerY = lerp(y + 35, mouth.y - 25, 0.6);

  line(x + 75, y + 25, lowerX, lowerY + pulse * 12);

  drawingContext.setLineDash([]);

  // 움직이는 화살촉
  fill("#9A9A9A");
  noStroke();

  // 알약통 방향 화살촉 ↗
  triangle(
    upperX + 9,
    upperY - 9 - pulse * 12,
    upperX - 7,
    upperY - 7 - pulse * 12,
    upperX + 7,
    upperY + 7 - pulse * 12,
  );

  // 입 방향 화살촉 ↘
  triangle(
    lowerX + 9,
    lowerY + 9 + pulse * 12,
    lowerX - 7,
    lowerY + 7 + pulse * 12,
    lowerX + 7,
    lowerY - 7 + pulse * 12,
  );

  pop();
}

function drawRxDragGuide() {
  const w = width;
  const h = height;

  // 기존 화살표 위치 그대로 유지
  const startX = w * 0.39;
  const startY = h * 0.45 - 20;

  // 알약 생성 화면처럼 부드럽게 보잉보잉
  const pulse = (Math.sin(millis() * 0.004) + 1) / 2;
  const bounce = pulse * 12;

  function arrow(x1, y1, x2, y2) {
    const angle = Math.atan2(y2 - y1, x2 - x1);

    // 화살촉이 가리키는 방향으로 12px 움직임
    const endX = x2 + Math.cos(angle) * bounce;
    const endY = y2 + Math.sin(angle) * bounce;

    push();
    stroke("#9A9A9A");
    strokeWeight(1.8);
    noFill();

    // 생성 화면과 동일한 점선
    drawingContext.setLineDash([4, 7]);
    line(x1, y1, endX, endY);
    drawingContext.setLineDash([]);

    // 움직이는 삼각형 화살촉
    translate(endX, endY);
    rotate(angle);
    noStroke();
    fill("#9A9A9A");
    triangle(12, 0, -8, -6, -8, 6);

    pop();
  }
  // 병 → 입
  arrow(startX - 30, startY, w * 0.7, h * 0.46 - 30);

  // 병 → 왼쪽 첫 번째 약봉투
  const firstPouch = pouchAt(0);

  arrow(
    startX + w * 0.01 - 250,
    startY + h * 0.1,
    firstPouch.x + 100,
    firstPouch.y - firstPouch.h * 0.25,
  );
}
