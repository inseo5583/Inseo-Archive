const Engine = Matter.Engine;
const Bodies = Matter.Bodies;
const Composite = Matter.Composite;

let engine;

let bigBall;
let middleBall;
let smallBall;

let topWall;

function setup() {
  createCanvas(windowWidth, windowHeight);

  engine = Engine.create();

  //처음 아래로 떨어지게
  engine.gravity.x = 0;
  engine.gravity.y = 1;
  engine.gravity.scale = 0.001;

  let margin = 20;

  let bottomWall = Bodies.rectangle(width / 2, height - margin, width, margin, {
    isStatic: true,
    restitution: 1,
  });

  let leftWall = Bodies.rectangle(margin, height / 2, margin, height, {
    isStatic: true,
    restitution: 1,
  });

  let rightWall = Bodies.rectangle(width - margin, height / 2, margin, height, {
    isStatic: true,
    restitution: 1,
  });

  Composite.add(engine.world, [bottomWall, leftWall, rightWall]);

  //위쪽 벽
  topWall = Bodies.rectangle(width / 2, margin, width, margin, {
    isStatic: true,
    restitution: 1,
  });

  //
  bigBall = Bodies.circle(width * 0.5, -160, 120, {
    restitution: 0.99,
    friction: 0,
    frictionAir: 0,
  });

  //
  middleBall = Bodies.circle(width * 0.42, -70, 65, {
    restitution: 0.99,
    friction: 0,
    frictionAir: 0,
  });

  //
  smallBall = Bodies.circle(width * 0.58, 0, 32, {
    restitution: 0.99,
    friction: 0,
    frictionAir: 0,
  });

  Composite.add(engine.world, [bigBall, middleBall, smallBall]);
}

function draw() {
  background(250);

  if (millis() < 1000) {
    engine.gravity.x = 0;
    engine.gravity.y = 1;
    engine.gravity.scale = 0.001;
  } else {
    engine.gravity.x = -1;
    engine.gravity.y = -1;
    engine.gravity.scale = 0.00004;

    // 위쪽 벽 추가
    // 한 번만 추가되도록
    if (!Composite.get(engine.world, topWall.id, "body")) {
      Composite.add(engine.world, topWall);
    }
  }

  Engine.update(engine);

  drawBall(bigBall, 120, 7, 42);
  drawBall(middleBall, 65, 5, 28);
  drawBall(smallBall, 32, 2, 18);
}

// 탱탱볼
function drawBall(body, r, spikeLen, spikeCount) {
  push();

  translate(body.position.x, body.position.y);

  rotate(body.angle);

  stroke("#F4FF4A");

  strokeWeight(max(14, r * 0.01));

  drawingContext.lineCap = "round";

  for (let i = 0; i < spikeCount; i++) {
    let a = map(i, 0, spikeCount, 0, TWO_PI);

    // 가시 시작점
    let x1 = cos(a) * (r * 0.9);

    let y1 = sin(a) * (r * 0.9);

    // 가시 끝점
    let x2 = cos(a) * (r + spikeLen);

    let y2 = sin(a) * (r + spikeLen);

    line(x1, y1, x2, y2);

    // 가시 끝 둥글게
    noStroke();

    fill("#F7FF70");

    circle(x2, y2, max(8, r * 0.1));

    stroke("#f7fcb8");

    strokeWeight(max(14, r * 0.1));
  }

  noStroke();

  fill("#EFFF00");

  circle(0, 0, r * 2);

  pop();
}
