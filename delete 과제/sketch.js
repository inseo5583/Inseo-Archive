const Engine = Matter.Engine;
const Bodies = Matter.Bodies;
const Composite = Matter.Composite;
const Body = Matter.Body;

let engine;
let inks = [];

let paperLayer;
let textLayer;

let pressX, pressY;
let prevX, prevY;

let pressTime = 0;
let burnSeed = 0;

function setup() {
  createCanvas(windowWidth, windowHeight);

  engine = Engine.create();
  engine.gravity.y = 0;

  makePaper();
  makeText();
}

function draw() {
  background(200);

  Engine.update(engine);

  image(paperLayer, 0, 0);
  image(textLayer, 0, 0);

  if (mouseIsPressed) {
    touch();
  }

  blendMode(SCREEN);

  for (let ink of inks) {
    ink.update();
    ink.display();
  }

  blendMode(BLEND);

  for (let i = inks.length - 1; i >= 0; i--) {
    if (inks[i].checkDeath()) {
      inks.splice(i, 1);
    }
  }
}

// =============================
// 종이
// =============================

function makePaper() {
  paperLayer = createGraphics(width, height);
  paperLayer.background(235);
}

// =============================
// 글씨
// =============================

function makeText() {
  textLayer = createGraphics(width, height);

  textLayer.clear();

  textLayer.textAlign(CENTER, CENTER);
  textLayer.textStyle(BOLD);

  let size = min(width * 0.16, height * 0.21);

  textLayer.textSize(size);
  textLayer.noStroke();
  textLayer.fill(95, 95, 100);

  textLayer.text("ERASE ME", width / 2, height * 0.25);
  textLayer.text("ERASE ME", width / 2, height * 0.5);
  textLayer.text("ERASE ME", width / 2, height * 0.75);
}

function mousePressed() {
  pressX = mouseX;
  pressY = mouseY;

  prevX = mouseX;
  prevY = mouseY;

  pressTime = 0;

  burnSeed = random(1000);
}

function touch() {
  let move = dist(mouseX, mouseY, pressX, pressY);

  // DRAG
  if (move > 8) {
    pressTime = 0;

    dragBrush(prevX, prevY, mouseX, mouseY);
  }

  // LONG PRESS
  else {
    pressTime++;

    let power = map(pressTime, 0, 90, 0.3, 1.5);

    power = constrain(power, 0.3, 1.5);

    // 누르는 동안 빛
    inks.push(new Ink(mouseX, mouseY, 10, power, 0, 0));

    // 일정 시간 후 타기 시작
    if (pressTime > 45) {
      burnPaper(mouseX, mouseY, pressTime);
    }
  }

  prevX = mouseX;
  prevY = mouseY;
}

// =============================
// 드래그
// =============================

function dragBrush(x1, y1, x2, y2) {
  let speed = dist(x1, y1, x2, y2);

  let count = max(1, floor(speed / 2));

  for (let i = 0; i <= count; i++) {
    let t = i / count;

    let x = lerp(x1, x2, t);
    let y = lerp(y1, y2, t);

    let size = map(speed, 0, 15, 18, 11);

    size = constrain(size, 11, 18);

    // 빛
    inks.push(new Ink(x, y, size, 0.7, x2 - x1, y2 - y1));

    // 글씨 지우기
    eraseText(x, y, size);
  }
}
// 드래그로 글씨 지우기

function eraseText(x, y, r) {
  textLayer.erase(70, 70);
  textLayer.circle(x, y, r * 3);

  textLayer.erase(190, 190);
  textLayer.circle(x, y, r * 1.8);

  textLayer.noErase();
}

function eraseTap(x, y) {
  textLayer.erase(255, 255);

  textLayer.circle(x, y, 70);

  textLayer.noErase();

  // 순간 빛
  for (let i = 0; i < 5; i++) {
    inks.push(
      new Ink(x + random(-4, 4), y + random(-4, 4), random(8, 14), 0.7, 0, 0),
    );
  }
}

// 종이 태우기

function burnPaper(x, y, time) {
  let r = map(time, 45, 180, 7, 70);

  r = constrain(r, 7, 70);

  paperLayer.noStroke();

  // 얇은 검은 테두리

  paperLayer.fill(150, 90, 40, 22);

  burnShape(paperLayer, x, y, r * 1.12, burnSeed);

  paperLayer.fill(85, 45, 20, 40);

  burnShape(paperLayer, x, y, r * 1.05, burnSeed + 10);

  paperLayer.fill(25, 18, 12, 80);

  burnShape(paperLayer, x, y, r, burnSeed + 20);

  paperLayer.erase(255, 255);

  burnShape(paperLayer, x, y, r * 0.88, burnSeed + 20);

  paperLayer.noErase();

  // 글씨도 같이 삭제
  textLayer.erase(255, 255);

  burnShape(textLayer, x, y, r * 0.9, burnSeed + 20);

  textLayer.noErase();
}

function burnShape(layer, x, y, r, seed) {
  layer.beginShape();

  for (let a = 0; a < TWO_PI; a += 0.2) {
    let n = noise(cos(a) + seed, sin(a) + seed);

    let rr = r * map(n, 0, 1, 0.85, 1.15);

    layer.vertex(x + cos(a) * rr, y + sin(a) * rr);
  }

  layer.endShape(CLOSE);
}
