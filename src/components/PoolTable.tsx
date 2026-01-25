import React, { useRef, useEffect } from 'react';
import {
    TABLE_WIDTH, TABLE_HEIGHT, RAIL_WIDTH, POCKET_RADIUS, BALL_RADIUS,
    FELT_COLOR, RAIL_COLOR, POCKET_COLOR,
    FRICTION, STOP_VELOCITY, POWER_MULTIPLIER, TRAJECTORY_POWER_MULTIPLIER,
    POCKETS
} from '../utils/constants';
import type { Ball } from '../utils/types';
import { getBallColor, isStripe, getRackBalls } from '../utils/ball-utils';
import { resolveWallCollision, resolveBallCollision } from '../utils/physics-utils';

const RACK_APEX_X = 600;
const RACK_APEX_Y = 200;

const INITIAL_BALLS: Ball[] = [
    { x: 200, y: 200, vx: 0, vy: 0, number: 0 }, // Cue ball
    ...getRackBalls(RACK_APEX_X, RACK_APEX_Y)
];

const PoolTable: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Game State Refs
    const ballsRef = useRef<Ball[]>(INITIAL_BALLS);
    const isDraggingRef = useRef<boolean>(false);
    const mousePosRef = useRef<{ x: number, y: number }>({ x: 0, y: 0 });

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;

        const updatePhysics = () => {
            const balls = ballsRef.current;
            const ballsToRemove: number[] = [];

            // 1. Movement, Friction, Rails, Pockets
            for (let i = 0; i < balls.length; i++) {
                const ball = balls[i];

                // Apply velocity
                ball.x += ball.vx;
                ball.y += ball.vy;

                // Apply friction
                ball.vx *= FRICTION;
                ball.vy *= FRICTION;

                // Stop if too slow
                if (Math.abs(ball.vx) < STOP_VELOCITY) ball.vx = 0;
                if (Math.abs(ball.vy) < STOP_VELOCITY) ball.vy = 0;

                // Rail Collisions (Helper)
                resolveWallCollision(ball);

                // Pocket Collisions
                for (const pocket of POCKETS) {
                    const cx = ball.x + RAIL_WIDTH;
                    const cy = ball.y + RAIL_WIDTH;
                    const dx = cx - pocket.x;
                    const dy = cy - pocket.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < POCKET_RADIUS) {
                        if (ball.number === 0) {
                            // Scratch! Reset Cue Ball
                            ball.x = 200;
                            ball.y = 200;
                            ball.vx = 0;
                            ball.vy = 0;
                        } else {
                            // Pot object ball
                            ballsToRemove.push(i);
                        }
                        break; // Ball handled, move to next ball
                    }
                }
            }

            // Remove potted balls (in reverse order to keep indices valid during loop, or filter)
            if (ballsToRemove.length > 0) {
                // Filter out balls that are in the removal list
                // We need to keep the ORIGINAL array reference or update the ref? 
                // Updating the ref is safer for react 'ref' pattern, though we are mutating objects inside.
                // We should replace the array.
                ballsRef.current = balls.filter((_, index) => !ballsToRemove.includes(index));
            }

            // 2. Ball-Ball Collisions
            // We re-read ballsRef.current in case balls were removed
            const activeBalls = ballsRef.current;
            for (let i = 0; i < activeBalls.length; i++) {
                for (let j = i + 1; j < activeBalls.length; j++) {
                    resolveBallCollision(activeBalls[i], activeBalls[j]);
                }
            }
        };

        const render = () => {
            updatePhysics();

            // Clear canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // 1. Draw Rails
            ctx.fillStyle = RAIL_COLOR;
            ctx.fillRect(0, 0, TABLE_WIDTH + RAIL_WIDTH * 2, TABLE_HEIGHT + RAIL_WIDTH * 2);

            // 2. Draw Felt
            ctx.fillStyle = FELT_COLOR;
            ctx.fillRect(RAIL_WIDTH, RAIL_WIDTH, TABLE_WIDTH, TABLE_HEIGHT);

            // 3. Draw Pockets
            ctx.fillStyle = POCKET_COLOR;
            POCKETS.forEach(pocket => {
                ctx.beginPath();
                ctx.arc(pocket.x, pocket.y, POCKET_RADIUS, 0, Math.PI * 2);
                ctx.fill();
            });

            // 4. Draw Balls
            ballsRef.current.forEach(ball => {
                const cx = ball.x + RAIL_WIDTH;
                const cy = ball.y + RAIL_WIDTH;
                const color = getBallColor(ball.number);
                const stripe = isStripe(ball.number);

                // Clip 
                ctx.save();
                ctx.beginPath();
                ctx.arc(cx, cy, BALL_RADIUS, 0, Math.PI * 2);
                ctx.clip();

                if (stripe) {
                    ctx.fillStyle = '#ffffff';
                    ctx.fill();
                    ctx.fillStyle = color;
                    ctx.fillRect(cx - BALL_RADIUS, cy - BALL_RADIUS / 2, BALL_RADIUS * 2, BALL_RADIUS);
                } else {
                    ctx.fillStyle = color;
                    ctx.fill();
                }

                // Number
                if (ball.number !== 0) {
                    ctx.beginPath();
                    ctx.arc(cx, cy, BALL_RADIUS * 0.4, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                    ctx.fill();
                    ctx.fillStyle = '#000';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.font = 'bold 8px Arial';
                    ctx.fillText(ball.number.toString(), cx, cy + 1);
                }
                ctx.restore();

                // Shine
                ctx.beginPath();
                ctx.arc(cx - 3, cy - 3, BALL_RADIUS / 3, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                ctx.fill();

                // Border
                ctx.strokeStyle = 'rgba(0,0,0,0.5)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(cx, cy, BALL_RADIUS, 0, Math.PI * 2);
                ctx.stroke();
            });

            // 5. Draw Aim Line (if dragging)
            if (isDraggingRef.current) {
                const cueBall = ballsRef.current.find(b => b.number === 0);
                if (cueBall) {
                    const cx = cueBall.x + RAIL_WIDTH;
                    const cy = cueBall.y + RAIL_WIDTH;

                    const dx = cx - mousePosRef.current.x;
                    const dy = cy - mousePosRef.current.y;
                    const mag = Math.hypot(dx, dy);

                    if (mag > 0) {
                        const ndx = dx / mag;
                        const ndy = dy / mag;

                        const maxDistance = mag * TRAJECTORY_POWER_MULTIPLIER;

                        let tMin = Infinity;
                        let targetBall: Ball | null = null;

                        for (const ball of ballsRef.current) {
                            if (ball.number === 0) continue;

                            const tCx = ball.x + RAIL_WIDTH;
                            const tCy = ball.y + RAIL_WIDTH;
                            const ocX = tCx - cx;
                            const ocY = tCy - cy;

                            const proj = ocX * ndx + ocY * ndy;

                            if (proj > 0) {
                                const distSq = (ocX * ocX + ocY * ocY) - (proj * proj);
                                const radiusSum = BALL_RADIUS * 2;

                                if (distSq < radiusSum * radiusSum) {
                                    const offset = Math.sqrt(radiusSum * radiusSum - distSq);
                                    const t = proj - offset;

                                    if (t < tMin && t > 0) {
                                        tMin = t;
                                        targetBall = ball;
                                    }
                                }
                            }
                        }

                        if (targetBall && tMin > maxDistance) {
                            targetBall = null;
                        }

                        // Draw Line
                        ctx.beginPath();
                        ctx.moveTo(cx, cy);

                        if (targetBall) {
                            const tx = cx + ndx * tMin;
                            const ty = cy + ndy * tMin;

                            ctx.lineTo(tx, ty);
                            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                            ctx.lineWidth = 2;
                            ctx.setLineDash([5, 5]);
                            ctx.stroke();
                            ctx.setLineDash([]);

                            // Ghost Ball
                            ctx.beginPath();
                            ctx.arc(tx, ty, BALL_RADIUS, 0, Math.PI * 2);
                            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                            ctx.lineWidth = 1;
                            ctx.stroke();

                            // Target Path (Red line)
                            const tBallX = targetBall.x + RAIL_WIDTH;
                            const tBallY = targetBall.y + RAIL_WIDTH;
                            const colDx = tBallX - tx;
                            const colDy = tBallY - ty;
                            const colMag = Math.hypot(colDx, colDy);
                            if (colMag > 0) {
                                const cnx = colDx / colMag;
                                const cny = colDy / colMag;
                                ctx.beginPath();
                                ctx.moveTo(tBallX, tBallY);
                                ctx.lineTo(tBallX + cnx * 100, tBallY + cny * 100);
                                ctx.strokeStyle = 'rgba(255, 0, 0, 0.6)';
                                ctx.stroke();
                            }

                        } else {
                            ctx.lineTo(cx + ndx * maxDistance, cy + ndy * maxDistance);
                            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                            ctx.lineWidth = 2;
                            ctx.setLineDash([5, 5]);
                            ctx.stroke();
                            ctx.setLineDash([]);
                        }
                    }
                }
            }

            animationFrameId = requestAnimationFrame(render);
        };

        render();

        return () => {
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const cueBall = ballsRef.current.find(b => b.number === 0);
        if (cueBall) {
            const cx = cueBall.x + RAIL_WIDTH;
            const cy = cueBall.y + RAIL_WIDTH;
            const dist = Math.hypot(x - cx, y - cy);

            // Only allow dragging if ball is mostly stopped
            if (dist < BALL_RADIUS * 2 && Math.abs(cueBall.vx) < STOP_VELOCITY && Math.abs(cueBall.vy) < STOP_VELOCITY) {
                isDraggingRef.current = true;
                mousePosRef.current = { x, y };
            }
        }
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDraggingRef.current) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        mousePosRef.current = { x, y };
    };

    const handleMouseUp = () => {
        if (isDraggingRef.current) {
            isDraggingRef.current = false;

            const cueBall = ballsRef.current.find(b => b.number === 0);
            if (cueBall) {
                const cx = cueBall.x + RAIL_WIDTH;
                const cy = cueBall.y + RAIL_WIDTH;

                const dx = cx - mousePosRef.current.x;
                const dy = cy - mousePosRef.current.y;

                // Apply velocity proportional to drag distance
                cueBall.vx = dx * POWER_MULTIPLIER;
                cueBall.vy = dy * POWER_MULTIPLIER;
            }
        }
    };

    return (
        <div className="flex justify-center items-center py-8">
            <canvas
                ref={canvasRef}
                width={TABLE_WIDTH + RAIL_WIDTH * 2}
                height={TABLE_HEIGHT + RAIL_WIDTH * 2}
                className="cursor-crosshair shadow-lg"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            />
        </div>
    );
};

export default PoolTable;
