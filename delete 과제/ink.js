class Ink {
  constructor(x, y, r, power, vx, vy) {
    this.r = r;
    this.drawR = r;

    this.maxR = r * random(1.7, 2.4);
    this.power = power;

    this.alpha = 140 * power;

    this.death = false;

    this.body = Bodies.circle(x, y, r, {
      frictionAir: 0.2,
      restitution: 0.1,
      isSensor: true,
    });

    Composite.add(engine.world, this.body);

    Body.setVelocity(this.body, {
      x: vx * 0.015,
      y: vy * 0.015,
    });

    this.c = random(3);
  }

  update() {
    if (this.drawR < this.maxR) {
      this.drawR += 0.07;
    }

    this.alpha *= 0.986;

    if (this.alpha < 1) {
      this.death = true;

      Composite.remove(engine.world, this.body);
    }
  }

  display() {
    let pos = this.body.position;

    noStroke();

    fill(255, 245, 225, this.alpha * 0.05);

    circle(pos.x, pos.y, this.drawR * 4.2);

    if (this.c < 1) {
      // 노랑 / 주황
      fill(255, 190, 110, this.alpha * 0.18);
    } else if (this.c < 2) {
      // 핑크
      fill(255, 190, 225, this.alpha * 0.17);
    } else {
      // 블루 / 민트
      fill(175, 225, 255, this.alpha * 0.17);
    }

    circle(
      pos.x + this.drawR * 0.2,
      pos.y - this.drawR * 0.08,
      this.drawR * 3.3,
    );

    fill(255, 215, 145, this.alpha * 0.11);

    circle(
      pos.x - this.drawR * 0.15,
      pos.y + this.drawR * 0.12,
      this.drawR * 2.8,
    );

    fill(255, 245, 225, this.alpha * 0.22);

    circle(pos.x, pos.y, this.drawR * 2);

    fill(255, 252, 240, this.alpha * 0.28);

    circle(pos.x, pos.y, this.drawR * 1.1);

    if (random(1) < 0.18) {
      fill(255, 200, 120, this.alpha * 0.22);

      circle(
        pos.x + random(-this.drawR, this.drawR),
        pos.y + random(-this.drawR, this.drawR),
        random(2, 6),
      );
    }

    if (random(1) < 0.12) {
      fill(180, 225, 255, this.alpha * 0.2);

      circle(
        pos.x + random(-this.drawR, this.drawR),
        pos.y + random(-this.drawR, this.drawR),
        random(2, 5),
      );
    }

    if (this.power > 0.9) {
      fill(255, 225, 160, this.alpha * 0.26);

      circle(pos.x, pos.y, this.drawR * 0.8);
    }
  }

  checkDeath() {
    return this.death;
  }
}
