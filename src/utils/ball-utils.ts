import type { Ball } from './types';
import { BALL_RADIUS } from './constants';

export const getBallColor = (num: number): string => {
    if (num === 0) return '#ffffff'; // Cue ball
    if (num === 8) return '#000000'; // 8-ball is black

    const colors = [
        '#eab308', // 1/9 Yellow
        '#3b82f6', // 2/10 Blue
        '#ef4444', // 3/11 Red
        '#a855f7', // 4/12 Purple
        '#f97316', // 5/13 Orange
        '#22c55e', // 6/14 Green
        '#7f1d1d', // 7/15 Maroon (Dark Red/Brown)
    ];

    const index = (num > 8 ? num - 9 : num - 1) % 7;
    return colors[index];
};

export const isStripe = (num: number): boolean => {
    return num > 8;
};

export const getRackBalls = (startX: number, startY: number): Ball[] => {
    const balls: Ball[] = [];
    const rows = 5;
    const radius = BALL_RADIUS;
    const diameter = radius * 2;
    const rowDepth = Math.sqrt(3) * radius;

    const rackPattern = [
        1, // Apex
        9, 2, // Row 2
        3, 8, 4, // Row 3
        5, 6, 7, 10, // Row 4
        11, 12, 13, 14, 15 // Row 5
    ];

    let ballIndex = 0;
    for (let row = 0; row < rows; row++) {
        const numInRow = row + 1;
        const x = startX + (row * rowDepth);
        const rowStartY = startY - ((numInRow - 1) * radius);

        for (let col = 0; col < numInRow; col++) {
            const y = rowStartY + (col * diameter);
            if (ballIndex < rackPattern.length) {
                balls.push({
                    x,
                    y,
                    vx: 0,
                    vy: 0,
                    number: rackPattern[ballIndex]
                });
                ballIndex++;
            }
        }
    }
    return balls;
};
