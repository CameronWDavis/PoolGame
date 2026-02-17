import type { Ball } from './types';
import { isStripe } from './ball-utils';
import { POCKETS, BALL_RADIUS, RAIL_WIDTH } from './constants';

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

    // AI Logic: Find the best shot
    let bestShot: { vx: number, vy: number, score: number } | null = null;

    // Simplified obstruction check using GAME coordinates
    const checkLineCollision = (start: { x: number, y: number }, end: { x: number, y: number }, ignoreIds: number[]) => {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const len = Math.hypot(dx, dy);
        const nx = dx / len;
        const ny = dy / len;

        for (const ball of balls) {
            if (ignoreIds.includes(ball.number)) continue;

            // Vector from start to ball
            const ocX = ball.x - start.x;
            const ocY = ball.y - start.y;

            // Project onto line
            const proj = ocX * nx + ocY * ny;

            // Closest point on the infinite line
            const closestX = start.x + nx * proj;
            const closestY = start.y + ny * proj;

            // Check if closest point is on segment
            let onSegment = false;
            if (proj >= 0 && proj <= len) onSegment = true;

            // If not on segment, check endpoints? Actually simplified: just check perpendicular distance if on segment
            if (onSegment) {
                const distSq = (ball.x - closestX) ** 2 + (ball.y - closestY) ** 2;
                if (distSq < (BALL_RADIUS * 2) ** 2) return true;
            }
        }
        return false;
    };

    // Target Evaluation
    for (const target of targets) {
        for (const pocket of POCKETS) {
            // Convert pocket to Game Coordinates (remove RAIL_WIDTH offset)
            const pX = pocket.x - RAIL_WIDTH;
            const pY = pocket.y - RAIL_WIDTH;

            // 1. Calculate Ghost Ball Position
            // Vector from Pocket to Object Ball
            const vPx = pX - target.x;
            const vPy = pY - target.y;
            const lenP = Math.hypot(vPx, vPy);

            // Normalized vector from object ball to pocket
            const uPx = vPx / lenP;
            const uPy = vPy / lenP;

            // Ghost ball is 2 radii behind object ball
            const gX = target.x - uPx * (BALL_RADIUS * 2);
            const gY = target.y - uPy * (BALL_RADIUS * 2);

            // 2. Validate Shot Feasibility
            // Vector from Cue Ball to Ghost Ball
            const vCx = gX - cueBall.x;
            const vCy = gY - cueBall.y;
            const lenC = Math.hypot(vCx, vCy);

            // Avoid extremely close or impossible shots
            if (lenC < 1) continue;

            // Angle check: Collision Angle
            // Vector Cue->Ghost vs Vector Ghost->Pocket
            // If dot product is negative enough, it's a cut shot.
            // Ideally we want vCx/vCy aligned with uPx/uPy
            // Dot Product of normalized vectors
            const uCx = vCx / lenC;
            const uCy = vCy / lenC;
            const dot = uCx * uPx + uCy * uPy;

            // If dot < 0, angle is > 90 degrees (impossible cut)
            if (dot < 0.2) continue; // Require somewhat reasonable angle (> 0 means < 90 deg, 0.2 gives padding)

            // 3. Check for Obstructions
            // Path 1: Cue -> Ghost
            if (checkLineCollision(cueBall, { x: gX, y: gY }, [cueBall.number, target.number])) continue;

            // Path 2: Object -> Pocket
            if (checkLineCollision(target, { x: pX, y: pY }, [target.number])) continue;

            // 4. Rate Shot
            // Higher score is better
            // Factors: Low distance, High alignment (dot product close to 1)
            const distScore = 1000 / (lenC + lenP + 1); // Prefer shorter shots
            const angleScore = dot * 500; // Prefer straight shots
            const score = distScore + angleScore;

            if (!bestShot || score > bestShot.score) {
                // Calculate Required Velocity
                // Aim exactly at Ghost Ball
                // Power depends on distance
                const power = Math.min(25, 10 + (lenC + lenP) * 0.03);

                bestShot = {
                    vx: uCx * power,
                    vy: uCy * power,
                    score
                };
            }
        }
    }

    if (bestShot) {
        return { vx: bestShot.vx, vy: bestShot.vy };
    }

    // FALLBACK: If no clear shot, shoot at closest valid ball lightly to avoid foul
    // This is better than passing null (which skips turn)
    let closestFallback: Ball | null = null;
    let minFallbackDist = Infinity;

    for (const target of targets) {
        const dx = target.x - cueBall.x;
        const dy = target.y - cueBall.y;
        const dist = Math.hypot(dx, dy);
        if (dist < minFallbackDist) {
            minFallbackDist = dist;
            closestFallback = target;
        }
    }

    if (closestFallback) {
        const dx = closestFallback.x - cueBall.x;
        const dy = closestFallback.y - cueBall.y;
        const dist = Math.hypot(dx, dy);
        const ndx = dx / dist;
        const ndy = dy / dist;
        const power = 10 + Math.random() * 5;
        return { vx: ndx * power, vy: ndy * power };
    }

    return null;
};
