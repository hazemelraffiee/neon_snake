import React, {
  useState,
  useEffect,
  useReducer,
  useCallback,
  useRef,
} from "react";
import {
  Square,
  Apple,
  RotateCcw,
  Trophy,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
} from "lucide-react";
import "./home.css";

// --- Constants ---
const GRID_SIZE = 20;
const CELL_SIZE = 20;
const INITIAL_SPEED = 200;
const SPEED_INCREMENT = 5;
const MIN_SPEED = 80;
const MAX_INPUT_QUEUE_SIZE = 2; // Limit how many moves can be buffered

const DIRECTIONS = {
  UP: { dx: 0, dy: -1, name: "UP" }, // Add names for easier comparison
  DOWN: { dx: 0, dy: 1, name: "DOWN" },
  LEFT: { dx: -1, dy: 0, name: "LEFT" },
  RIGHT: { dx: 1, dy: 0, name: "RIGHT" },
};

// --- Helper Functions ---
const getRandomPosition = (exclude = []) => {
  let position;
  do {
    position = {
      x: Math.floor(Math.random() * GRID_SIZE),
      y: Math.floor(Math.random() * GRID_SIZE),
    };
  } while (
    exclude.some((seg) => seg.x === position.x && seg.y === position.y)
  );
  return position;
};

const getInitialState = () => ({
  snake: [{ x: Math.floor(GRID_SIZE / 2), y: Math.floor(GRID_SIZE / 2) }],
  food: getRandomPosition([
    { x: Math.floor(GRID_SIZE / 2), y: Math.floor(GRID_SIZE / 2) },
  ]),
  direction: DIRECTIONS.RIGHT, // Current actual direction of movement
  directionQueue: [], // Queue for upcoming directions
  speed: INITIAL_SPEED,
  score: 0,
  highScore: parseInt(localStorage.getItem("snakeHighScore") || "0", 10), // Ensure number
  isGameOver: false,
  isPaused: false,
  justAteFood: false,
  flashEffect: false,
});

// --- Reducer ---
function gameReducer(state, action) {
  switch (action.type) {
    case "CHANGE_DIRECTION": {
      const newDir = action.payload;
      // Determine the last direction the snake will move based on queue or current direction
      const lastQueuedDir = state.directionQueue.length > 0
          ? state.directionQueue[state.directionQueue.length - 1]
          : state.direction;

      // Prevent immediate reversal based on the *next* effective move
      if (
        (lastQueuedDir === DIRECTIONS.UP && newDir === DIRECTIONS.DOWN) ||
        (lastQueuedDir === DIRECTIONS.DOWN && newDir === DIRECTIONS.UP) ||
        (lastQueuedDir === DIRECTIONS.LEFT && newDir === DIRECTIONS.RIGHT) ||
        (lastQueuedDir === DIRECTIONS.RIGHT && newDir === DIRECTIONS.LEFT)
      ) {
        return state; // Ignore reversal attempts
      }

      // Add to queue if it's not full and the new direction is different
      if (
        state.directionQueue.length < MAX_INPUT_QUEUE_SIZE &&
        newDir !== lastQueuedDir // Avoid queuing the same direction multiple times
      ) {
        const newQueue = [...state.directionQueue, newDir];
        return { ...state, directionQueue: newQueue };
      }
      return state; // Queue full or same direction, ignore
    }
    case "MOVE_SNAKE": {
      if (state.isGameOver || state.isPaused) return state;

      let currentDirection = state.direction;
      const newQueue = [...state.directionQueue];

      // Consume the next direction from the queue if available
      if (newQueue.length > 0) {
        // Anti-reversal check against the *actual* current direction before dequeuing
        const nextDir = newQueue[0];
        if (
          !(
            (state.direction === DIRECTIONS.UP && nextDir === DIRECTIONS.DOWN) ||
            (state.direction === DIRECTIONS.DOWN && nextDir === DIRECTIONS.UP) ||
            (state.direction === DIRECTIONS.LEFT && nextDir === DIRECTIONS.RIGHT) ||
            (state.direction === DIRECTIONS.RIGHT && nextDir === DIRECTIONS.LEFT)
          )
        ) {
          currentDirection = newQueue.shift(); // Dequeue and use as current direction
        } else {
          // If the queued move is an invalid reversal, clear the queue
          // to prevent getting stuck trying to reverse.
          newQueue.length = 0;
        }
      }

      const snake = [...state.snake];
      const head = { ...snake[0] };

      head.x += currentDirection.dx;
      head.y += currentDirection.dy;

      // Wall Collision Check
      if (
        head.x < 0 ||
        head.x >= GRID_SIZE ||
        head.y < 0 ||
        head.y >= GRID_SIZE
      ) {
        return { ...state, isGameOver: true, flashEffect: true };
      }

      // Self Collision Check (exclude the tail if it's about to move)
      const checkCollisionAgainst = snake.length > 1 ? snake.slice(0, -1) : snake;
      for (let i = 0; i < checkCollisionAgainst.length; i++) {
        if (checkCollisionAgainst[i].x === head.x && checkCollisionAgainst[i].y === head.y) {
          return { ...state, isGameOver: true, flashEffect: true };
        }
      }


      snake.unshift(head);

      // Food Eating Check
      let newFood = state.food;
      let newScore = state.score;
      let newSpeed = state.speed;
      let ateFood = false;
      let newHighScore = state.highScore;

      if (head.x === state.food.x && head.y === state.food.y) {
        ateFood = true;
        newScore += 1;
        if (newScore > newHighScore) { // Use '>' for high score check
          newHighScore = newScore;
          localStorage.setItem("snakeHighScore", newHighScore.toString()); // Store as string
        }
        newSpeed = Math.max(MIN_SPEED, state.speed - SPEED_INCREMENT);
        newFood = getRandomPosition(snake); // Pass the new snake state
      } else {
        snake.pop(); // Only pop if food wasn't eaten
      }

      return {
        ...state,
        snake,
        food: newFood,
        score: newScore,
        highScore: newHighScore,
        speed: newSpeed,
        direction: currentDirection, // Update the actual direction
        directionQueue: newQueue, // Update the queue
        justAteFood: ateFood,
        flashEffect: ateFood,
      };
    }
    case "RESET_EFFECTS":
      return {
        ...state,
        justAteFood: false,
        flashEffect: false,
      };
    case "RESTART_GAME":
      // Preserve high score when restarting
      const preservedHighScore = state.highScore;
      return {
        ...getInitialState(),
        highScore: preservedHighScore,
      };
    case "TOGGLE_PAUSE":
      // Don't allow pausing if game is over
      if (state.isGameOver) return state;
      return { ...state, isPaused: !state.isPaused };
    default:
      return state;
  }
}

// --- Component ---
function SnakeGame() {
  const [state, dispatch] = useReducer(gameReducer, getInitialState());
  const boardRef = useRef(null);
  const touchStartRef = useRef(null);
  const [showControls, setShowControls] = useState(false);

  // Game Loop Timer
  useEffect(() => {
    if (state.isGameOver || state.isPaused) {
      return;
    }

    const timerId = setInterval(() => {
      dispatch({ type: "MOVE_SNAKE" });
    }, state.speed);

    return () => clearInterval(timerId);
  }, [state.speed, state.isGameOver, state.isPaused]); // Dependencies are correct

  // Reset visual effects
  useEffect(() => {
    if (state.justAteFood || state.flashEffect) {
      const timeout = setTimeout(() => {
        dispatch({ type: "RESET_EFFECTS" });
      }, 150); // Shorten effect duration slightly
      return () => clearTimeout(timeout);
    }
  }, [state.justAteFood, state.flashEffect]);

  // Keyboard Input Handler
  const handleKeyDown = useCallback(
    (e) => {
      let newDirection = null;
      switch (e.key) {
        case "ArrowUp":
        case "w":
          newDirection = DIRECTIONS.UP;
          break;
        case "ArrowDown":
        case "s":
          newDirection = DIRECTIONS.DOWN;
          break;
        case "ArrowLeft":
        case "a":
          newDirection = DIRECTIONS.LEFT;
          break;
        case "ArrowRight":
        case "d":
          newDirection = DIRECTIONS.RIGHT;
          break;
        case " ": // Space bar
        case "p": // P key
          e.preventDefault(); // Prevent space bar scrolling
          if (state.isGameOver) {
            dispatch({ type: "RESTART_GAME" });
          } else {
            dispatch({ type: "TOGGLE_PAUSE" });
          }
          return; // Exit early for pause/restart
        case "Enter":
          if (state.isGameOver) {
            e.preventDefault();
            dispatch({ type: "RESTART_GAME" });
          }
          return; // Exit early for restart
        default:
          return; // Ignore other keys
      }

      if (newDirection && !state.isPaused) { // Only change direction if not paused
        e.preventDefault(); // Prevent arrow keys scrolling
        dispatch({ type: "CHANGE_DIRECTION", payload: newDirection });
      }
    },
    [state.isGameOver, state.isPaused] // Add isPaused dependency
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]); // Dependency is correct

  // Touch/Swipe Input Handlers
  const handleTouchStart = useCallback((e) => {
    // Allow touch interaction even when paused to potentially unpause or restart
    if (e.touches.length === 1) { // Handle single touch
        const touch = e.touches[0];
        touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    }
  }, []);

  const handleTouchMove = useCallback((e) => {
    // Prevent scrolling while swiping on the board
    e.preventDefault();
  }, []);

  const handleTouchEnd = useCallback((e) => {
    if (!touchStartRef.current || state.isPaused || state.isGameOver) {
        // Ignore swipes if paused, game over, or touch didn't start properly
        touchStartRef.current = null; // Reset ref
        return;
    }

    if (e.changedTouches.length === 1) { // Handle single touch end
        const touch = e.changedTouches[0];
        const touchEnd = { x: touch.clientX, y: touch.clientY };
        const touchStart = touchStartRef.current;

        const dx = touchEnd.x - touchStart.x;
        const dy = touchEnd.y - touchStart.y;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        // Determine direction based on the dominant axis and minimum swipe distance
        const minSwipeDistance = 30;
        let newDirection = null;

        if (Math.max(absDx, absDy) > minSwipeDistance) { // Check if swipe is long enough
            if (absDx > absDy) {
                // Horizontal swipe
                newDirection = dx > 0 ? DIRECTIONS.RIGHT : DIRECTIONS.LEFT;
            } else {
                // Vertical swipe
                newDirection = dy > 0 ? DIRECTIONS.DOWN : DIRECTIONS.UP;
            }
        }

        if (newDirection) {
            dispatch({ type: "CHANGE_DIRECTION", payload: newDirection });
        }
    }

    touchStartRef.current = null; // Reset ref after processing
  }, [state.isPaused, state.isGameOver]); // Add dependencies

  // Add touch listeners to the board
  useEffect(() => {
    const boardElement = boardRef.current;
    if (boardElement) {
      // Use passive: false ONLY for touchmove where preventDefault is called
      boardElement.addEventListener("touchstart", handleTouchStart, { passive: true });
      boardElement.addEventListener("touchmove", handleTouchMove, { passive: false });
      boardElement.addEventListener("touchend", handleTouchEnd, { passive: true });

      return () => {
        boardElement.removeEventListener("touchstart", handleTouchStart);
        boardElement.removeEventListener("touchmove", handleTouchMove);
        boardElement.removeEventListener("touchend", handleTouchEnd);
      };
    }
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]); // Dependencies are correct

  // Direction change handlers for on-screen controls
  const changeDirection = (direction) => {
    if (!state.isPaused && !state.isGameOver) { // Check if game is active
        dispatch({ type: "CHANGE_DIRECTION", payload: DIRECTIONS[direction] });
    }
  };

  // Calculate snake head rotation based on direction
  const getHeadRotation = () => {
    // Use state.direction for visual rotation, reflecting the last executed move
    if (state.direction === DIRECTIONS.UP) return "rotate(0deg)";
    if (state.direction === DIRECTIONS.RIGHT) return "rotate(90deg)";
    if (state.direction === DIRECTIONS.DOWN) return "rotate(180deg)";
    if (state.direction === DIRECTIONS.LEFT) return "rotate(270deg)";
    return "rotate(0deg)"; // Default
  };

  // --- Rendering ---
  const cells = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const isSnakeHead = state.snake[0].x === x && state.snake[0].y === y;
      const segmentIndex = state.snake.findIndex(
        (seg) => seg.x === x && seg.y === y
      );
      const isSnakeBody = segmentIndex > 0; // Body is any segment except the head
      const isFood = state.food.x === x && state.food.y === y;

      let cellClass = "cell";
      let cellContent = null;

      if (isSnakeHead) {
        cellClass += " snake-head-cell";
        cellContent = (
          <div
            className="snake-head"
            style={{ transform: getHeadRotation() }} // Rotate the head visually
          />
        );
      } else if (isSnakeBody) {
        cellClass += " snake-body-cell";
        // Apply different colors based on position in the snake
        const colorIndex = segmentIndex % 5; // Cycle through 5 colors
        cellContent = (
          <div
            className={`snake-body snake-body-${colorIndex}`}
            // Optional: Add animation delay for a slithering effect
            // style={{ animationDelay: `${segmentIndex * 0.03}s` }}
          />
        );
      } else if (isFood) {
        cellClass += " food-cell";
        cellContent = (
          <Apple
            className={`food ${state.justAteFood ? "food-pulse" : ""}`} // Add pulse effect
            size={CELL_SIZE * 0.8} // Scale food size with cell size
            strokeWidth={1.5}
          />
        );
      }

      cells.push(
        <div
          key={`${x}-${y}`}
          className={cellClass}
          style={{
            width: `${CELL_SIZE}px`,
            height: `${CELL_SIZE}px`,
          }}
        >
          {cellContent}
        </div>
      );
    }
  }

  return (
    <div
      className={`snake-game-container ${state.flashEffect ? "flash" : ""} ${
        state.justAteFood ? "food-eaten" : "" // Class for potential background pulse on eat
      }`}
    >
      <div className="game-header">
        <h1>NEON SNAKE</h1>
        <div className="score-container">
          <div className="score-display">
            <div className="score-value">{state.score}</div>
            <div className="score-label">SCORE</div>
          </div>
          <div className="score-display high-score">
            <div className="score-value">{state.highScore}</div>
            <div className="score-label">
              <Trophy size={14} strokeWidth={2} /> BEST
            </div>
          </div>
        </div>
      </div>

      <div
        ref={boardRef}
        className={`game-board ${state.isPaused ? "paused" : ""} ${
          state.isGameOver ? "game-over" : ""
        }`}
        style={{
          gridTemplateColumns: `repeat(${GRID_SIZE}, ${CELL_SIZE}px)`,
          gridTemplateRows: `repeat(${GRID_SIZE}, ${CELL_SIZE}px)`,
          width: `${GRID_SIZE * CELL_SIZE}px`,
          height: `${GRID_SIZE * CELL_SIZE}px`,
          // Add perspective for 3D effects if desired
          // perspective: '1000px',
        }}
      >
        <div className="grid-background"></div> {/* For styling the grid lines */}
        {cells}
        {state.isGameOver && (
          <div className="game-over-overlay">
            <div className="game-over-content">
              <div className="game-over-title">GAME OVER</div>
              <div className="final-score">
                <div>Score: {state.score}</div>
                <div className="best-score">
                  Best: {state.highScore}
                  {state.score === state.highScore && state.score > 0 && (
                    <span className="new-record"> NEW RECORD!</span>
                  )}
                </div>
              </div>
              <button
                className="overlay-button"
                onClick={() => dispatch({ type: "RESTART_GAME" })}
              >
                <RotateCcw size={16} /> PLAY AGAIN
              </button>
            </div>
          </div>
        )}
        {state.isPaused && !state.isGameOver && (
          <div className="pause-overlay">
            <div className="pause-content">
              <div className="pause-title">PAUSED</div>
              <button
                className="overlay-button resume-button"
                onClick={() => dispatch({ type: "TOGGLE_PAUSE" })}
              >
                <Play size={16} /> RESUME
              </button>
              <button
                className="overlay-button restart-button"
                onClick={() => dispatch({ type: "RESTART_GAME" })}
              >
                <RotateCcw size={16} /> RESTART
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Controls Area */}
      <div className="controls-area">
        <div className="game-controls">
          <button
            className="control-btn pause-btn"
            onClick={() => dispatch({ type: "TOGGLE_PAUSE" })}
            disabled={state.isGameOver} // Disable pause when game over
            aria-label={state.isPaused ? "Resume Game" : "Pause Game"}
          >
            {state.isPaused ? <Play size={20} /> : <Pause size={20} />}
          </button>

          {/* Toggle for on-screen controls - more accessible */}
          <button
            className="control-btn mobile-controls-toggle"
            onClick={() => setShowControls(!showControls)}
            aria-pressed={showControls}
            aria-label={showControls ? "Hide direction controls" : "Show direction controls"}
          >
            {/* Icon could change based on state */}
            Controls
          </button>
        </div>

        {/* On-Screen Directional Controls */}
        {showControls && (
          <div className="direction-controls" aria-label="Directional Controls">
            <button
              className="direction-btn up-btn"
              onClick={() => changeDirection("UP")}
              aria-label="Move Up"
            >
              <ChevronUp size={24} />
            </button>
            <div className="horizontal-controls">
              <button
                className="direction-btn left-btn"
                onClick={() => changeDirection("LEFT")}
                aria-label="Move Left"
              >
                <ChevronLeft size={24} />
              </button>
              <button
                className="direction-btn right-btn"
                onClick={() => changeDirection("RIGHT")}
                aria-label="Move Right"
              >
                <ChevronRight size={24} />
              </button>
            </div>
            <button
              className="direction-btn down-btn"
              onClick={() => changeDirection("DOWN")}
              aria-label="Move Down"
            >
              <ChevronDown size={24} />
            </button>
          </div>
        )}
      </div>


      <div className="instructions">
        <div>Use Arrow Keys, WASD, or Swipe to move.</div>
        <div>Space/P to Pause/Resume. Enter to Restart (after Game Over).</div>
      </div>
    </div>
  );
}

export default SnakeGame;
