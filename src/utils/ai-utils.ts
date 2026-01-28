import type { Ball } from './types';
import { isStripe } from './ball-utils';

export const calculateAIShot = (balls: Ball[], aiGroup: 'solids' | 'stripes' | null): { vx: number, vy: number } | null => {
    const cueBall = balls.find(b => b.number === 0);
    if (!cueBall) return null;

    // Filter potential target balls
    let targets = balls.filter(b => b.number !== 0);

    // Filter targets based on group assignment
    if (aiGroup) {
        const groupBalls = targets.filter(b => {
            if (b.number === 8) return false;
            const stripe = isStripe(b.number);
            return aiGroup === 'stripes' ? stripe : !stripe;
        });

        if (groupBalls.length > 0) {
            targets = groupBalls;
        } else {
            // Target 8-ball if group is cleared
            targets = targets.filter(b => b.number === 8);
        }
    } else {
        // Table Open: Target any ball except 8
        targets = targets.filter(b => b.number !== 8);
    }

    if (targets.length === 0) return null;

    // Simple Heuristic: Find the closest target ball
    let bestTarget: Ball | null = null;
    let minDistance = Infinity;

    for (const target of targets) {
        const dx = target.x - cueBall.x;
        const dy = target.y - cueBall.y;
        const dist = dx * dx + dy * dy;

        if (dist < minDistance) {
            minDistance = dist;
            bestTarget = target;
        }
    }

    if (!bestTarget) return null;

    // Calculate shot vector
    const dx = bestTarget.x - cueBall.x;
    const dy = bestTarget.y - cueBall.y;
    const mag = Math.sqrt(dx * dx + dy * dy);

    // Normalize
    const ndx = dx / mag;
    const ndy = dy / mag;

    // Power
    const power = 15 + Math.random() * 10;

    return {
        vx: ndx * power,
        vy: ndy * power
    };
};
