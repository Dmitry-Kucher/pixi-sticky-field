import { Application } from 'pixi.js';
import {
  Engine, Render, MouseConstraint, Mouse, World, Runner, Body, Events, Query,
} from 'matter-js';
import PhysicalObject from './utils/PhysicalObject';
import Cell from './objects/Cell';
import Field from './objects/Field';

const debugMode = false;

const app = new Application({
  resizeTo: window,
});

const { renderer } = app;

const engine = Engine.create();
const { world } = engine;
world.gravity.y = 0;

const boxWidth = 50;
const boxHeight = 50;
const startingPoint = {
  x: 50,
  y: 50,
};

const fieldPhysicalBodies = [];
const fieldSprites = {};

const fieldInstance = new Field({
  renderer,
  startingPoint,
  boxWidth,
  boxHeight,
});

const fieldBodies = fieldInstance.drawField();

fieldBodies.physicalBodies.forEach((body, index) => {
  const sprite = fieldBodies.spriteBodies[index];
  fieldSprites[body.id] = sprite;
  fieldPhysicalBodies.push(body);
  World.addBody(world, body);
  app.stage.addChild(sprite);
});

const cell = new Cell({
  renderer,
  leftCorner: startingPoint,
  width: boxWidth,
  height: boxHeight,
  isMovable: true,
});

const physicalCell = cell.drawCell();

const piece = new PhysicalObject();
piece.body = physicalCell.body;
piece.sprite = physicalCell.sprite;

// World.addBody(world, piece.body);
app.stage.addChild(piece.sprite);

const newCellPoint = {
  x: startingPoint.x,
  y: startingPoint.y + boxHeight,
};
const newCellInstance = new Cell({
  renderer,
  leftCorner: newCellPoint,
  width: boxWidth,
  height: boxHeight,
  isMovable: true,
});

const newCell = newCellInstance.drawCell();

const piece1 = new PhysicalObject();
piece1.body = newCell.body;
piece1.sprite = newCell.sprite;

// World.addBody(world, piece1.body);
app.stage.addChild(piece1.sprite);

const newCellPoint1 = {
  x: startingPoint.x + boxWidth,
  y: startingPoint.y + boxHeight,
};
const newCell1Instance = new Cell({
  renderer,
  leftCorner: newCellPoint1,
  width: boxWidth,
  height: boxHeight,
  isMovable: true,
});

const newCell1 = newCell1Instance.drawCell();

const piece2 = new PhysicalObject();
piece2.body = newCell1.body;
piece2.sprite = newCell1.sprite;

// World.addBody(world, piece1.body);
app.stage.addChild(piece2.sprite);

const movableObjects = [];
movableObjects.push(piece);
movableObjects.push(piece1);
movableObjects.push(piece2);

const testBody = Body.create({
  isMovable: true,
  parts: [piece.body, piece1.body, piece2.body],
});
World.addBody(world, testBody);

app.ticker.add(() => {
  movableObjects.forEach((object) => {
    // Make all pixi sprites follow the position and rotation of their body.
    /* eslint-disable no-param-reassign */
    object.sprite.position = object.body.position;
    object.sprite.rotation = object.body.angle;
  });
});

if (debugMode) {
  const render = Render.create({
    element: document.querySelector('.scene'),
    engine,
  });

  Render.run(render);
} else {
  document.querySelector('.scene').appendChild(app.view);
}

const canvasMouse = Mouse.create(document.querySelector('.scene canvas'));
const mouseConstraint = MouseConstraint.create(engine, {
  canvasMouse,
});

const hoveredSpriteIdList = [];

function onMouseMoveEvent(event) {
  const { body, constraint } = event.source;
  if (!body || !body.isMovable) {
    return;
  }
  const { parts } = body;
  if (parts.length > 0) {
    const hoveredList = [];
    parts.forEach((part, index) => {
      // skip the first part, it's the body itself.
      if (index === 0) return;
      const { position } = part;
      const queryPosition = Query.point(fieldPhysicalBodies, position);
      if (queryPosition.length > 0) {
        part.hoveredBodyId = queryPosition[0].id;
        hoveredList.push(queryPosition[0]);
      }
    });
    if (hoveredSpriteIdList.length) {
      hoveredSpriteIdList.forEach((id) => {
        fieldSprites[id].alpha = 1;
      });
      hoveredSpriteIdList.length = 0;
    }
    if (hoveredList.length !== 0) {
      hoveredList.forEach((hovered) => {
        hoveredSpriteIdList.push(hovered.id);
        fieldSprites[hovered.id].alpha = 0.8;
      });
    }
  }
  const { mouse } = event;
  // use offset to prevent the mouse from being locked to the center of the body
  const offset = constraint.pointB;
  const newPosition = {
    x: mouse.position.x - offset.x,
    y: mouse.position.y - offset.y,
  };

  Body.setPosition(body, newPosition);
}

function moveToHoveredField(event) {
  const { body } = event;
  if (!body || !body.isMovable) {
    return;
  }

  const { parts } = body;

  if (parts.length === hoveredSpriteIdList.length + 1) {
    parts.forEach((part) => {
      const { hoveredBodyId } = part;
      if (hoveredBodyId) {
        const hoveredField = fieldPhysicalBodies.find((obj) => obj.id === hoveredBodyId);
        Body.setPosition(part, hoveredField.position);
      }
    });
  }
}

Events.on(mouseConstraint, 'mousemove', onMouseMoveEvent);
Events.on(mouseConstraint, 'enddrag', moveToHoveredField);

World.add(world, mouseConstraint);

Runner.run(engine);
