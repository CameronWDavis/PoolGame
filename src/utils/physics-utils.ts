import type { Ball } from './types';
import { BALL_RADIUS, TABLE_WIDTH, TABLE_HEIGHT } from './constants';

export const resolveWallCollision = (ball: Ball) => {
    // Left
    if (ball.x - BALL_RADIUS < 0) {
        ball.x = BALL_RADIUS;
        ball.vx = -ball.vx * 0.8;
    }
    // Right
    if (ball.x + BALL_RADIUS > TABLE_WIDTH) {
        ball.x = TABLE_WIDTH - BALL_RADIUS;
        ball.vx = -ball.vx * 0.8;
    }
    // Top
    if (ball.y - BALL_RADIUS < 0) {
        ball.y = BALL_RADIUS;
        ball.vy = -ball.vy * 0.8;
    }
    // Bottom
    if (ball.y + BALL_RADIUS > TABLE_HEIGHT) {
        ball.y = TABLE_HEIGHT - BALL_RADIUS;
        ball.vy = -ball.vy * 0.8;
    }
};

export const resolveBallCollision = (b1: Ball, b2: Ball) => {
    const dx = b2.x - b1.x;
    const dy = b2.y - b1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < BALL_RADIUS * 2) {
        // Collision detected!

        // 1. Resolve Overlap
        const overlap = BALL_RADIUS * 2 - dist;
        const nx = dx / dist; // Normal X
        const ny = dy / dist; // Normal Y

        const moveX = nx * overlap * 0.5;
        const moveY = ny * overlap * 0.5;

        b1.x -= moveX;
        b1.y -= moveY;
        b2.x += moveX;
        b2.y += moveY;

        // 2. Resolve Velocity (Elastic Collision)
        // Normal velocity components
        const v1n = b1.vx * nx + b1.vy * ny;
        const v2n = b2.vx * nx + b2.vy * ny;

        // Tangential velocity components
        // Tangent vector is (-ny, nx)
        const tx = -ny;
        const ty = nx;
        const v1t = b1.vx * tx + b1.vy * ty;
        const v2t = b2.vx * tx + b2.vy * ty;

        // Swap normal velocities
        const v1n_after = v2n;
        const v2n_after = v1n;

        b1.vx = v1n_after * nx + v1t * tx;
        b1.vy = v1n_after * ny + v1t * ty;

        b2.vx = v2n_after * nx + v2t * tx;
        b2.vy = v2n_after * ny + v2t * ty;
    }
};
