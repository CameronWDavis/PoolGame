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
    const [gamePhase, setGamePhase] = React.useState<'aiming' | 'moving' | 'turn-end' | 'placing'>('aiming');
    const [message, setMessage] = React.useState<string>('Player\'s Turn');
    const [playerGroup, setPlayerGroup] = React.useState<'solids' | 'stripes' | null>(null);
    const [isBallInHand, setIsBallInHand] = React.useState<boolean>(false);

    // Track if a ball was potted this turn to decide if turn continues
    const pottedBallsThisTurnRef = useRef<number[]>([]);
    // Track if scratch occurred
    const scratchRef = useRef<boolean>(false);
    // Track first hit to detect fouls
    const firstHitRef = useRef<number | null>(null);

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
                        firstHitRef.current = null;
                    }
                } else {
                    setTurn('player');
                    setMessage("Player's Turn");
                }
            }, 1000 + Math.random() * 1000);
            return () => clearTimeout(timer);
        } else if (gamePhase === 'placing' && turn === 'ai') {
            const timer = setTimeout(() => {
                // AI Placement Logic
                const balls = ballsRef.current;

                // Possible spots to try: Center, then offset left/right
                // Try to find a valid spot
                const tryPositions = [
                    { x: 200, y: 200 },
                    { x: 250, y: 200 },
                    { x: 150, y: 200 },
                    { x: 200, y: 150 },
                    { x: 200, y: 250 },
                    { x: 300, y: 200 }
                ];

                let validPos = { x: 200, y: 200 };
                let found = false;

                for (const pos of tryPositions) {
                    let overlapping = false;
                    for (const b of balls) {
                        if (b.number === 0) continue; // Skip self if present
                        const dist = Math.hypot((b.x + RAIL_WIDTH) - (pos.x + RAIL_WIDTH), (b.y + RAIL_WIDTH) - (pos.y + RAIL_WIDTH));
                        if (dist < BALL_RADIUS * 2) {
                            overlapping = true;
                            break;
                        }
                    }
                    if (!overlapping) {
                        validPos = pos;
                        found = true;
                        break;
                    }
                }

                // If no spot found (extremely rare), just overlap, physics will resolve

                const cueBallIndex = balls.findIndex(b => b.number === 0);
                const newBall = { x: validPos.x, y: validPos.y, vx: 0, vy: 0, number: 0 };

                if (cueBallIndex >= 0) {
                    // Update existing
                    balls[cueBallIndex].x = validPos.x;
                    balls[cueBallIndex].y = validPos.y;
                    balls[cueBallIndex].vx = 0;
                    balls[cueBallIndex].vy = 0;
                } else {
                    // Add if missing (e.g. from scratch)
                    balls.push(newBall);
                }

                setIsBallInHand(false);
                setGamePhase('aiming');
            }, 1000);
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
                            // Scratch! 
                            // Don't reset immediately, mark as scratch and remove from play temporarily
                            // We will respawn it on next turn
                            ballsToRemove.push(i);
                            scratchRef.current = true;
                        } else {
                            // Pot object ball
                            ballsToRemove.push(i);
                            pottedBallsThisTurnRef.current.push(ball.number);
                        }
                        break; // Ball handled
                    }
                }
            }

            // Remove potted balls (and scratched cue ball)
            if (ballsToRemove.length > 0) {
                ballsRef.current = balls.filter((_, index) => !ballsToRemove.includes(index));
            }

            // 2. Ball-Ball Collisions
            const activeBalls = ballsRef.current;
            for (let i = 0; i < activeBalls.length; i++) {
                for (let j = i + 1; j < activeBalls.length; j++) {
                    const b1 = activeBalls[i];
                    const b2 = activeBalls[j];

                    // Detect collision for events
                    const dx = b2.x - b1.x;
                    const dy = b2.y - b1.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < BALL_RADIUS * 2) {
                        // Collision handling
                        resolveBallCollision(b1, b2);

                        // First Hit Detection (for fouls)
                        const cueBall = (b1.number === 0 ? b1 : (b2.number === 0 ? b2 : null));
                        const objectBall = (b1.number === 0 ? b2 : (b2.number === 0 ? b1 : null));

                        if (cueBall && objectBall && firstHitRef.current === null) {
                            firstHitRef.current = objectBall.number;
                        }
                    }
                }
            }

            // Game Logic: Check for movement stop
            if (gamePhase === 'moving' && !moving) {
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

            // 4.5 Draw Placement Ghost Cue Ball
            if (gamePhase === 'placing' && turn === 'player') {
                // Check validity (no overlap)
                let valid = true;
                const mx = mousePosRef.current.x;
                const my = mousePosRef.current.y;

                // Constrain to table
                if (mx < RAIL_WIDTH + BALL_RADIUS || mx > TABLE_WIDTH + RAIL_WIDTH - BALL_RADIUS ||
                    my < RAIL_WIDTH + BALL_RADIUS || my > TABLE_HEIGHT + RAIL_WIDTH - BALL_RADIUS) {
                    valid = false;
                }

                // Check overlap
                for (const ball of ballsRef.current) {
                    if (ball.number === 0) continue; // Skip self if present
                    const cx = ball.x + RAIL_WIDTH;
                    const cy = ball.y + RAIL_WIDTH;
                    const dist = Math.hypot(cx - mx, cy - my);
                    if (dist < BALL_RADIUS * 2) {
                        valid = false;
                        break;
                    }
                }

                ctx.beginPath();
                ctx.arc(mx, my, BALL_RADIUS, 0, Math.PI * 2);
                ctx.fillStyle = valid ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 0, 0, 0.5)';
                ctx.fill();
                ctx.strokeStyle = valid ? '#fff' : '#f00';
                ctx.lineWidth = 2;
                ctx.stroke();
            }


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

                        // ... Line Drawing same as before but abbreviated here for update ...
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
                        if (targetBall && tMin > maxDistance) targetBall = null;

                        ctx.beginPath();
                        ctx.moveTo(cx, cy);
                        if (targetBall) {
                            const tx = cx + ndx * tMin;
                            const ty = cy + ndy * tMin;
                            ctx.lineTo(tx, ty);
                            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
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
                            ctx.stroke();
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
            const firstHit = firstHitRef.current;

            let nextTurn = turn;
            let nextMessage = "";
            let nextPlayerGroup = playerGroup;
            let foul = false;

            // Helper to check ball type
            const hasStripe = pottedBalls.some(n => isStripe(n) && n !== 8);
            const hasSolid = pottedBalls.some(n => !isStripe(n) && n !== 8 && n !== 0);
            const has8Ball = pottedBalls.includes(8);

            // Foul Logic: No Hit
            if (!firstHit && !isScratch) {
                foul = true;
                nextMessage = "Foul! No ball hit.";
            }

            // Turn Logic
            if (has8Ball) {
                // 8-Ball Logic (Handling Wins/Losses)
                if (isScratch) {
                    nextMessage = turn === 'player' ? "GAME OVER - You Lost (Scratch on 8)" : "GAME OVER - You Won (AI Scratch on 8)";
                } else {
                    // Check if 8-ball was valid (all group balls cleared)
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
                }

            } else if (isScratch) {
                foul = true;
                nextMessage = turn === 'player' ? "Scratch! Ball in Hand for AI." : "AI Scratched! Ball in Hand.";
                nextTurn = turn === 'player' ? 'ai' : 'player';
            } else if (foul) {
                nextTurn = turn === 'player' ? 'ai' : 'player';
                if (!nextMessage) nextMessage = "Foul! Ball in Hand.";
            } else if (hasPotted) {
                // Potting Logic
                if (!playerGroup) {
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
                    // Check if potted wrong ball (Opponent's ball)
                    // Note: Potting opponent's ball is a foul in rare rules, usually just loss of turn.
                    // But hitting it FIRST is a foul. 

                    // Check First Hit Correctness
                    const firstHitStripe = isStripe(firstHit!);
                    const isFirstHitCorrect = currentGroup === 'stripes' ? firstHitStripe : !firstHitStripe;
                    if (firstHit !== 8 && !isFirstHitCorrect) {
                        foul = true;
                        nextMessage = "Foul! Hit wrong group first. Ball in Hand.";
                        nextTurn = turn === 'player' ? 'ai' : 'player';
                    } else {
                        // Check Potted Balls
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
                        } else {
                            // Hit own, but missed pot OR potted opponent
                            nextTurn = turn === 'player' ? 'ai' : 'player';
                            nextMessage = "Turn Over.";
                        }
                    }
                }

            } else {
                // No Pot, No Foul
                // Check if hit wrong group first?
                if (playerGroup) {
                    const currentGroup = turn === 'player' ? playerGroup : (playerGroup === 'solids' ? 'stripes' : 'solids');
                    const firstHitStripe = isStripe(firstHit!);
                    const isFirstHitCorrect = currentGroup === 'stripes' ? firstHitStripe : !firstHitStripe;

                    if (firstHit !== 8 && !isFirstHitCorrect) {
                        foul = true;
                        nextMessage = "Foul! Hit wrong group first.";
                    }
                }

                if (foul) {
                    nextTurn = turn === 'player' ? 'ai' : 'player';
                } else {
                    nextTurn = turn === 'player' ? 'ai' : 'player';
                    nextMessage = "Turn Over.";
                }
            }

            setPlayerGroup(nextPlayerGroup);
            setTurn(nextTurn);
            setMessage(nextMessage);

            // Handle Ball in Hand
            if (foul) {
                setIsBallInHand(true);
                setGamePhase('placing');

                // If AI turn, it will auto-place in effect/timeout
                // If Player turn, they need to place.
            } else {
                setIsBallInHand(false);
                setGamePhase('aiming');
            }
        }
    }, [gamePhase, turn, playerGroup]);

    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (turn !== 'player') return;

        if (gamePhase === 'placing') {
            // Place ball if valid
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;

            // Check validity
            if (mx < RAIL_WIDTH + BALL_RADIUS || mx > TABLE_WIDTH + RAIL_WIDTH - BALL_RADIUS ||
                my < RAIL_WIDTH + BALL_RADIUS || my > TABLE_HEIGHT + RAIL_WIDTH - BALL_RADIUS) {
                return;
            }
            for (const ball of ballsRef.current) {
                if (ball.number === 0) continue;
                const cx = ball.x + RAIL_WIDTH;
                const cy = ball.y + RAIL_WIDTH;
                if (Math.hypot(cx - mx, cy - my) < BALL_RADIUS * 2) return; // Overlap
            }

            // Place it!
            // Check if cue ball exists in array, if not add it
            const cueBallIndex = ballsRef.current.findIndex(b => b.number === 0);
            const newBall = { x: mx - RAIL_WIDTH, y: my - RAIL_WIDTH, vx: 0, vy: 0, number: 0 };

            if (cueBallIndex >= 0) {
                ballsRef.current[cueBallIndex] = newBall;
            } else {
                ballsRef.current.push(newBall);
            }

            setIsBallInHand(false);
            setGamePhase('aiming');
            return;
        }

        if (gamePhase !== 'aiming') return;

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

                // Initialize foul tracking for this shot
                firstHitRef.current = null;

                setGamePhase('moving');
                pottedBallsThisTurnRef.current = [];
                scratchRef.current = false;
            }
        }
    };

    // State for balls visual list (updated on render/turn changess)
    const [activeBallsList, setActiveBallsList] = React.useState<Ball[]>([]);

    useEffect(() => {
        // Update active balls whenever game phase changes or turn changes
        // This ensures the sidebar list is accurate
        setActiveBallsList([...ballsRef.current]);
    }, [gamePhase, turn, message]);

    const renderCSSBall = (number: number) => {
        const color = getBallColor(number);
        const stripe = isStripe(number);

        if (number === 0) return null; // Don't render cue ball in list

        if (stripe) {
            return (
                <div key={number} className="css-ball stripe" data-number={number}>
                    <div className="stripe-band" style={{ backgroundColor: color }}></div>
                </div>
            );
        } else {
            return (
                <div key={number} className="css-ball" style={{ backgroundColor: color }} data-number={number}>
                </div>
            );
        }
    };

    // Calculate balls to show in sidebar
    const ballsToShow = activeBallsList.filter(b => {
        if (b.number === 0) return false;

        // Always show 8 ball if it's the target or game over
        if (b.number === 8) {
            // Show 8 ball only if group is cleared or table open? 
            // Better to show all relevant balls.
            // If table open, show all non-8? Or show 8 at bottom?
            return true;
        }

        if (!playerGroup) return true; // Show all if open

        const stripe = isStripe(b.number);
        // Show ONLY player's group
        if (playerGroup === 'solids') return !stripe;
        return stripe;
    }).sort((a, b) => a.number - b.number);


    return (
        <div className="pool-container">
            {/* Corner Group Indicator */}
            {playerGroup && (
                <div className="corner-indicator">
                    {playerGroup === 'solids' ? renderCSSBall(1) : renderCSSBall(9)}
                    <div className="corner-label">
                        <span className="corner-text-small">YOU ARE</span>
                        <span className={`corner-text-large ${playerGroup === 'solids' ? 'text-yellow-400' : 'text-purple-400'}`}>
                            {playerGroup.toUpperCase()}
                        </span>
                    </div>
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

            {/* Left Side: Canvas */}
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

            {/* Right Side: Ball List (Now Absolute Positioned) */}
            <div className="side-panel">
                <div className="panel-title">
                    {playerGroup ? "Your Targets" : "Remaining Balls"}
                </div>
                <div className="ball-grid">
                    {ballsToShow.map(b => renderCSSBall(b.number))}
                </div>
                {ballsToShow.length === 0 && (
                    <div className="text-gray-500 text-sm mt-4 italic">
                        No balls remaining! Go for the 8-Ball!
                    </div>
                )}
            </div>

            <div className="helper-text">
                {gamePhase === 'placing' && turn === 'player'
                    ? "BALL IN HAND: Move mouse to position cue ball, click to place."
                    : (turn === 'player' ? "Click and drag from the cue ball (white) to aim and shoot." : "Wait for the AI to take its shot.")
                }
            </div>
        </div>
    );
};

export default PoolTable;
