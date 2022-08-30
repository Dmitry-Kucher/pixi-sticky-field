import {
  Graphics, Sprite,
} from 'pixi.js';
import { Bodies } from 'matter-js';

class Cell {
  constructor({
    renderer,
    leftCorner,
    width,
    height,
    isMovable = false,
    color = 0x00ff00,
    lineStyle = { width: 2, color: 0xff0000, alpha: 1 },
  }) {
    this.renderer = renderer;
    this.leftCorner = leftCorner;
    this.width = width;
    this.height = height;
    this.color = color;
    this.lineStyle = lineStyle;
    this.isMovable = isMovable;
  }

  drawCell() {
    const sprite = this.drawSprite();
    const body = this.drawBody();

    return { sprite, body };
  }

  drawSprite() {
    const { width, color, alpha } = this.lineStyle;
    const graphics = new Graphics();
    graphics.beginFill(this.color);
    graphics.lineStyle(width, color, alpha);
    graphics.drawRect(this.leftCorner.x, this.leftCorner.y, this.width, this.height);
    graphics.endFill();
    const texture = this.renderer.generateTexture(graphics);

    const sprite = new Sprite(texture);
    sprite.width = this.width;
    sprite.height = this.height;
    sprite.anchor.set(0.5, 0.5);

    return sprite;
  }

  drawBody() {
    const options = {
      isMovable: false,
      isStatic: true,
      isSensor: true,
    };
    if (this.isMovable) {
      options.isMovable = true;
      options.isStatic = true;
    }
    return Bodies.rectangle(this.leftCorner.x, this.leftCorner.y, this.width, this.height, options);
  }
}

export default Cell;
