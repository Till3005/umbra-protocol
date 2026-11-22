// UMBRA PROTOCOL — a top-down infiltration stealth game.
// Tuning constants, the handcrafted level and the guard rota.

export const STEP = 1 / 60;
export const TILE = 48;
export const COLS = 24;
export const ROWS = 14;
export const VIEW_W = COLS * TILE; // 1152
export const VIEW_H = ROWS * TILE; // 672

// Tiles: # wall · . floor · , dark floor · * lit floor · C crate · T terminal · X exit · P start
export const MAP = [
  '########################',
  '#..,..C........#.....,X#',
  '#..,...........#..,.,..#',
  '#..,..####.....#..T,,..#',
  '#.....#..#........,,...#',
  '#.....#..#..C.....,....#',
  '#..*..#..#..#..........#',
  '#..*.....#..#...#..C...#',
  '#..*.....#..C...#......#',
  '#.....####..####....#..#',
  '#..P................#..#',
  '#....C....*.C.....C....#',
  '#......................#',
  '########################',
];

export const WALL = 0;
export const FLOOR = 1;
export const CRATE = 2;
export const TERMINAL = 3;
export const EXIT = 4;
export const ZONE_NORMAL = 0;
export const ZONE_DARK = 1;
export const ZONE_LIT = 2;

export const PLAYER = {
  radius: 13,
  walk: 168,
  sneak: 96,
  noiseWalk: 1.6,
  noiseRun: 4.2,
  noiseSneak: 0,
  light: 3.1, // visibility radius in tiles (readability glow)
};

export const GUARD = {
  radius: 14,
  patrol: 92,
  chase: 205,
  coneHalf: Math.PI / 4, // 90° cone
  coneRange: 5.6 * TILE,
  seeBase: 1.15, // detection per second at point blank, walking, normal light
  decay: 0.22,
  chaseDecay: 0.14,
  suspiciousAt: 0.32,
  chaseAt: 0.72,
  catchDist: 0.62 * TILE,
  turnSpeed: 7.5,
  investigateTime: 3.2,
};

export const LIGHT_RATE = { [ZONE_NORMAL]: 1, [ZONE_DARK]: 0.45, [ZONE_LIT]: 1.7 };

export const ALARM_DECAY = 0.09;
export const NOISE_RING_EVERY = 0.38;

export const COLORS = {
  bg: '#05070c',
  floorA: '#1b2331',
  floorB: '#19202d',
  floorDark: '#121722',
  floorLit: '#26221c',
  wall: '#2b3244',
  wallTop: '#3d4760',
  wallEdge: '#12161f',
  crate: '#4d3d27',
  crateEdge: '#755d36',
  crateSlats: '#3a2e1d',
  player: '#39e6c8',
  guard: '#e8595c',
  cone: [255, 214, 110],
  alarm: [255, 92, 74],
};

// Waypoints in tile coordinates; guards glide between them on clear straight lines.
export const GUARDS = [
  { name: 'SENTRY-01', waypoints: [[2, 12], [17, 12]] },
  { name: 'SENTRY-02', waypoints: [[10, 4], [11, 4], [11, 8], [10, 8]] },
  { name: 'SENTRY-03', waypoints: [[16, 5], [21, 5], [21, 8], [17, 8]] },
  { name: 'SENTRY-04', waypoints: [[7, 1], [14, 1], [14, 2], [7, 2]] },
];

export const PLAYER_START = { x: 3.5, y: 10.5 };
export const TERMINAL_AT = { x: 18.5, y: 3.5 };
export const EXIT_AT = { x: 22.5, y: 1.5 };
