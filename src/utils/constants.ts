// Table Dimensions and Aesthetics
export const TABLE_WIDTH = 800;
export const TABLE_HEIGHT = 400;
export const RAIL_WIDTH = 40;
export const POCKET_RADIUS = 20;
export const BALL_RADIUS = 10;
export const POCKETS: { x: number; y: number }[] = [
    { x: RAIL_WIDTH, y: RAIL_WIDTH }, // Top-left
    { x: RAIL_WIDTH + TABLE_WIDTH / 2, y: RAIL_WIDTH - 5 }, // Top-middle
    { x: RAIL_WIDTH + TABLE_WIDTH, y: RAIL_WIDTH }, // Top-right
    { x: RAIL_WIDTH, y: RAIL_WIDTH + TABLE_HEIGHT }, // Bottom-left
    { x: RAIL_WIDTH + TABLE_WIDTH / 2, y: RAIL_WIDTH + TABLE_HEIGHT + 5 }, // Bottom-middle
    { x: RAIL_WIDTH + TABLE_WIDTH, y: RAIL_WIDTH + TABLE_HEIGHT }, // Bottom-right
];

// Physics Constants
export const FRICTION = 0.985; // Air resistance / felt friction per frame
export const STOP_VELOCITY = 0.05; // Velocity below which ball stops
export const POWER_MULTIPLIER = 0.15; // Mouse drag to velocity factor
export const TRAJECTORY_POWER_MULTIPLIER = 4; // Visual line length factor

// Colors
export const FELT_COLOR = '#2e8b57'; // SeaGreen
export const RAIL_COLOR = '#8b4513'; // SaddleBrown
export const POCKET_COLOR = '#000000';
