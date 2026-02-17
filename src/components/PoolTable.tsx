import React, { useRef, useEffect } from 'react';
import './PoolTable.css';
import {
    TABLE_WIDTH, TABLE_HEIGHT, RAIL_WIDTH, POCKET_RADIUS, BALL_RADIUS,
    FELT_COLOR, RAIL_COLOR, POCKET_COLOR,
    FRICTION, STOP_VELOCITY, POWER_MULTIPLIER, TRAJECTORY_POWER_MULTIPLIER,
    POCKETS
} from '../utils/constants';
import type { Ball } from '../utils/types';
import { getBallColor, isStripe, getRackBalls } from '../utils/ball-utils';
import { resolveWallCollision, resolveBallCollision } from '../utils/physics-utils';
import { calculateAIShot } from '../utils/ai-utils';

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

    // Turn Management
    const [turn, setTurn] = React.useState<'player' | 'ai'>('player');
    const [gamePhase, setGamePhase] = React.useState<'aiming' | 'moving' | 'turn-end'>('aiming');
    const [message, setMessage] = React.useState<string>('Player\'s Turn');
    const [playerGroup, setPlayerGroup] = React.useState<'solids' | 'stripes' | null>(null);

    // Track if a ball was potted this turn to decide if turn continues
    const pottedBallsThisTurnRef = useRef<number[]>([]);
    // Track if scratch occurred
    const scratchRef = useRef<boolean>(false);

    useEffect(() => {
        if (gamePhase === 'aiming' && turn === 'ai') {
            const timer = setTimeout(() => {
                const aiGroup = playerGroup ? (playerGroup === 'solids' ? 'stripes' : 'solids') : null;
                const shot = calculateAIShot(ballsRef.current, aiGroup);
                if (shot) {
                    const cueBall = ballsRef.current.find(b => b.number === 0);
                    if (cueBall) {
                        cueBall.vx = shot.vx;
                        cueBall.vy = shot.vy;
                        setGamePhase('moving');
                        pottedBallsThisTurnRef.current = [];
                        scratchRef.current = false;
                    }
                } else {
                    // key part: if AI is stuck or no balls, switch back? 
                    // Technically game over if no balls, but let's just pass turn if it fails
                    setTurn('player');
                    setMessage("Player's Turn");
                }
            }, 1000 + Math.random() * 1000); // 1-2s delay
            return () => clearTimeout(timer);
        }
    }, [turn, gamePhase, playerGroup]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;

        const updatePhysics = () => {
            const balls = ballsRef.current;
            const ballsToRemove: number[] = [];
            let moving = false;

            // 1. Movement, Friction, Rails, Pockets
            for (let i = 0; i < balls.length; i++) {
                const ball = balls[i];

                // Check if moving
                if (Math.abs(ball.vx) > 0 || Math.abs(ball.vy) > 0) {
                    moving = true;
                }

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
                            scratchRef.current = true;
                        } else {
                            // Pot object ball
                            ballsToRemove.push(i);
                            pottedBallsThisTurnRef.current.push(ball.number);
                        }
                        break; // Ball handled, move to next ball
                    }
                }
            }

            // Remove potted balls
            if (ballsToRemove.length > 0) {
                ballsRef.current = balls.filter((_, index) => !ballsToRemove.includes(index));
            }

            // 2. Ball-Ball Collisions
            const activeBalls = ballsRef.current;
            for (let i = 0; i < activeBalls.length; i++) {
                for (let j = i + 1; j < activeBalls.length; j++) {
                    resolveBallCollision(activeBalls[i], activeBalls[j]);
                }
            }

            // Game Logic: Check for movement stop
            if (gamePhase === 'moving' && !moving) {
                // All balls stopped
                // Decide next turn
                setGamePhase('turn-end');
            }
        };


        const render = () => {
            if (gamePhase === 'moving') {
                updatePhysics();
            }

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

            // 5. Draw Aim Line (if dragging and Player turn)
            if (isDraggingRef.current && turn === 'player' && gamePhase === 'aiming') {
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
    }, [gamePhase, turn, playerGroup]);

    // Effect to handle turn transitions
    useEffect(() => {
        if (gamePhase === 'turn-end') {
            const isScratch = scratchRef.current;
            const pottedBalls = pottedBallsThisTurnRef.current;
            const hasPotted = pottedBalls.length > 0;

            let nextTurn = turn;
            let nextMessage = "";
            let nextPlayerGroup = playerGroup;

            // Helper to check ball type
            const hasStripe = pottedBalls.some(n => isStripe(n) && n !== 8);
            const hasSolid = pottedBalls.some(n => !isStripe(n) && n !== 8 && n !== 0);
            const has8Ball = pottedBalls.includes(8);

            // Turn Logic
            if (isScratch) {
                nextTurn = turn === 'player' ? 'ai' : 'player';
                nextMessage = nextTurn === 'player' ? "Player's Turn (Scratch!)" : "AI's Turn (Player Scratched!)";

                if (has8Ball) {
                    nextMessage = turn === 'player' ? "GAME OVER - You Lost (8-Ball Scratch)" : "GAME OVER - You Won (AI Scratch on 8)";
                }
            } else if (has8Ball) {
                const balls = ballsRef.current;

                if (!playerGroup) {
                    nextMessage = turn === 'player' ? "GAME OVER - You Lost (Early 8-Ball)" : "GAME OVER - You Won (AI Early 8)";
                } else {
                    const currentGroup = turn === 'player' ? playerGroup : (playerGroup === 'solids' ? 'stripes' : 'solids');
                    const hasRemainingGroupBalls = balls.some(b => {
                        if (b.number === 0 || b.number === 8) return false;
                        const isS = isStripe(b.number);
                        return currentGroup === 'stripes' ? isS : !isS;
                    });

                    if (hasRemainingGroupBalls) {
                        nextMessage = turn === 'player' ? "GAME OVER - You Lost (Early 8-Ball)" : "GAME OVER - You Won (AI Early 8)";
                    } else {
                        nextMessage = turn === 'player' ? "GAME OVER - You Won!" : "GAME OVER - AI Won!";
                    }
                }
            } else if (hasPotted) {
                // Handle Group Assignment
                if (!playerGroup && !has8Ball) {
                    const firstBall = pottedBalls[0];
                    if (firstBall !== 8) {
                        const isFirstStripe = isStripe(firstBall);
                        if (turn === 'player') {
                            nextPlayerGroup = isFirstStripe ? 'stripes' : 'solids';
                            nextMessage = `You are ${nextPlayerGroup.toUpperCase()}!`;
                        } else {
                            nextPlayerGroup = isFirstStripe ? 'solids' : 'stripes';
                            nextMessage = `AI is ${isFirstStripe ? 'STRIPES' : 'SOLIDS'}. You are ${nextPlayerGroup.toUpperCase()}.`;
                        }
                    }
                }

                // Determine if turn continues
                const currentGroup = turn === 'player' ? nextPlayerGroup : (nextPlayerGroup ? (nextPlayerGroup === 'solids' ? 'stripes' : 'solids') : null);

                if (!currentGroup) {
                    nextMessage = turn === 'player' ? "Player's Turn (Table Open)" : "AI's Turn (Table Open)";
                } else {
                    const pottedOwnGroup = pottedBalls.some(n => {
                        if (n === 8) return false;
                        return currentGroup === 'stripes' ? isStripe(n) : !isStripe(n);
                    });
                    const pottedOpponentGroup = pottedBalls.some(n => {
                        if (n === 8) return false;
                        return currentGroup === 'stripes' ? !isStripe(n) : isStripe(n);
                    });

                    if (pottedOwnGroup && !pottedOpponentGroup) {
                        nextMessage = turn === 'player' ? "Player's Turn (Nice Shot!)" : "AI's Turn (Nice Shot!)";
                    } else if (pottedOwnGroup && pottedOpponentGroup) {
                        nextMessage = turn === 'player' ? "Player's Turn (Messy Shot!)" : "AI's Turn (Messy Shot!)";
                    } else {
                        nextTurn = turn === 'player' ? 'ai' : 'player';
                        nextMessage = turn === 'player' ? "AI's Turn (Wrong Ball!)" : "Player's Turn (AI Wrong Ball!)";
                    }
                }
            } else {
                nextTurn = turn === 'player' ? 'ai' : 'player';
                nextMessage = nextTurn === 'player' ? "Player's Turn" : "AI's Turn";
            }

            setPlayerGroup(nextPlayerGroup);
            setTurn(nextTurn);
            setMessage(nextMessage);
            setGamePhase('aiming');
        }
    }, [gamePhase, turn, playerGroup]);

    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (turn !== 'player' || gamePhase !== 'aiming') return;

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

            if (dist < BALL_RADIUS * 2) {
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

            if (turn !== 'player' || gamePhase !== 'aiming') return;

            const cueBall = ballsRef.current.find(b => b.number === 0);
            if (cueBall) {
                const cx = cueBall.x + RAIL_WIDTH;
                const cy = cueBall.y + RAIL_WIDTH;

                const dx = cx - mousePosRef.current.x;
                const dy = cy - mousePosRef.current.y;

                // Apply velocity proportional to drag distance
                cueBall.vx = dx * POWER_MULTIPLIER;
                cueBall.vy = dy * POWER_MULTIPLIER;

                setGamePhase('moving');
                pottedBallsThisTurnRef.current = [];
                scratchRef.current = false;
            }
        }
    };

    return (
        <div className="pool-container">
            {/* Corner Group Indicator */}
            {playerGroup && (
                <div className="corner-indicator">
                    <span className={`indicator-dot ${playerGroup === 'solids' ? 'dot-solids' : 'dot-stripes'}`}></span>
                    {playerGroup === 'solids' ? "SOLIDS" : "STRIPES"}
                </div>
            )}

            {/* HUD */}
            <div className="pool-hud">
                <div className="pool-message">
                    {message}
                </div>
                <div className={`pool-turn-indicator ${turn === 'player' ? 'turn-player' : 'turn-ai'}`}>
                    {turn === 'player' ? "YOUR SHOT" : "AI THINKING..."}
                </div>
                <div className="pool-phase">
                    Phase: {gamePhase}
                </div>
                {playerGroup ? (
                    <div className={`pool-group-status ${playerGroup === 'solids' ? 'group-solids' : 'group-stripes'}`}>
                        YOU ARE {playerGroup.toUpperCase()}
                    </div>
                ) : (
                    <div className="pool-group-status group-open">
                        TABLE OPEN
                    </div>
                )}
            </div>

            <div className="canvas-wrapper">
                <canvas
                    ref={canvasRef}
                    width={TABLE_WIDTH + RAIL_WIDTH * 2}
                    height={TABLE_HEIGHT + RAIL_WIDTH * 2}
                    className={`pool-canvas ${turn === 'player' && gamePhase === 'aiming' ? 'aiming' : 'waiting'}`}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                />
            </div>

            <div className="helper-text">
                {turn === 'player' ? "Click and drag from the cue ball (white) to aim and shoot." : "Wait for the AI to take its shot."}
            </div>
        </div>
    );
};

export default PoolTable;
