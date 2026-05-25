export interface LayoutCoords {
  x: number;
  y: number;
  z: number;
}

export interface SnakeLayoutState {
  board?: LayoutCoords;
  hud?: LayoutCoords;
}

export const snakeLayoutState: SnakeLayoutState = {};

export function setSnakeLayoutCoords(
  key: keyof SnakeLayoutState,
  coords: LayoutCoords | undefined,
) {
  snakeLayoutState[key] = coords;
}
