import { Body } from 'matter-js';
import Cell from './Cell';

const fieldShape = [
  [1, 1, 1, 1],
  [1, 1, 1, 1],
  [1, 1, 1, 1],
  [1, 1, 1, 1],
];

class Field {
  constructor({
    renderer, startingPoint, boxWidth, boxHeight,
  }) {
    this.renderer = renderer;
    this.startingPoint = startingPoint;
    this.boxWidth = boxWidth;
    this.boxHeight = boxHeight;
    this.physicalBodies = [];
    this.spriteBodies = [];
  }

  drawField() {
    for (let i = 0; i < fieldShape.length; i++) {
      for (let j = 0; j < fieldShape[i].length; j++) {
        const nextPosition = {
          x: this.startingPoint.x + j * this.boxWidth,
          y: this.startingPoint.y + i * this.boxHeight,
        };
        const lineStyle = {
          width: 2,
          color: 0xFEEB77,
          alpha: 1,
        };
        const cell = new Cell({
          renderer: this.renderer,
          lineStyle,
          leftCorner: this.startingPoint,
          width: this.boxWidth,
          height: this.boxHeight,
          isMovable: false,
          color: 0xDE3249,
        });

        const { body, sprite } = cell.drawCell();

        Body.setPosition(body, nextPosition);
        this.physicalBodies.push(body);

        sprite.position = nextPosition;
        this.spriteBodies.push(sprite);
      }
    }
    return { physicalBodies: this.physicalBodies, spriteBodies: this.spriteBodies };
  }
}

export default Field;
