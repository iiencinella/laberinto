const LEVELS = [
  { name: 'Fácil', title: 'Primeros pasos', rows: 11, cols: 11 },
  { name: 'Medio', title: 'Mantén el ritmo', rows: 17, cols: 17 },
  { name: 'Difícil', title: 'Pulso de precisión', rows: 23, cols: 23 }
];
const STORAGE_KEY = 'laberinto-registros-v1';
const canvas = document.querySelector('#maze');
const context = canvas.getContext('2d');
const gameStatus = document.querySelector('.game-status');
const statusMessage = document.querySelector('#status-message');
const timerDisplay = document.querySelector('#timer');
const timerIndicator = document.querySelector('#timer-indicator');
const wallCountDisplay = document.querySelector('#wall-count');
const nextLevelButton = document.querySelector('#next-level');
const finishDialog = document.querySelector('#finish-dialog');
const finishForm = document.querySelector('#finish-form');
const playerNameInput = document.querySelector('#player-name');
const dialogFeedback = document.querySelector('#dialog-feedback');
const state = {
  levelIndex: 0,
  maze: null,
  active: false,
  waitingForEntry: false,
  levelComplete: false,
  levelStartedAt: 0,
  levelElapsed: 0,
  wallHits: 0,
  player: null,
  lastPointer: null,
  currentTrack: [],
  pastTracks: [],
  collisionMarks: [],
  levelTimes: [null, null, null],
  levelWallHits: [0, 0, 0],
  viewWidth: 0,
  viewHeight: 0,
  isTouchInput: window.matchMedia('(pointer: coarse)').matches
};

function makeMaze(rows, cols) {
  const grid = Array.from({ length: rows }, () => Array(cols).fill('#'));
  const stack = [[1, 1]];
  grid[1][1] = '.';

  while (stack.length) {
    const [row, col] = stack[stack.length - 1];
    const directions = [[-2, 0], [2, 0], [0, -2], [0, 2]];
    for (let index = directions.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [directions[index], directions[swapIndex]] = [directions[swapIndex], directions[index]];
    }
    const next = directions.find(([rowStep, colStep]) => {
      const nextRow = row + rowStep;
      const nextCol = col + colStep;
      return nextRow > 0 && nextRow < rows - 1 && nextCol > 0 && nextCol < cols - 1 && grid[nextRow][nextCol] === '#';
    });

    if (!next) {
      stack.pop();
      continue;
    }

    const [rowStep, colStep] = next;
    grid[row + rowStep / 2][col + colStep / 2] = '.';
    grid[row + rowStep][col + colStep] = '.';
    stack.push([row + rowStep, col + colStep]);
  }

  grid[0][1] = 'S';
  grid[rows - 1][cols - 2] = 'E';
  return grid;
}

function cellCenter(row, col) {
  const cellWidth = state.viewWidth / state.maze[0].length;
  const cellHeight = state.viewHeight / state.maze.length;
  return { x: (col + 0.5) * cellWidth, y: (row + 0.5) * cellHeight };
}

function formatTime(milliseconds, tenths = false) {
  const totalTenths = Math.floor(milliseconds / 100);
  const seconds = Math.floor(totalTenths / 10);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  const base = `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  return tenths ? `${base}.${totalTenths % 10}` : base;
}

function setStatus(message, kind = '') {
  statusMessage.textContent = message;
  gameStatus.classList.toggle('is-active', kind === 'active');
  gameStatus.classList.toggle('is-alert', kind === 'alert');
}

function updateInputMode(pointerType) {
  if (pointerType === 'touch') state.isTouchInput = true;
  if (pointerType === 'mouse' || pointerType === 'pen') state.isTouchInput = false;
  document.querySelector('#input-mode').textContent = state.isTouchInput ? 'TACTO' : 'MOUSE';
}

function updateTimer() {
  const elapsed = state.active ? Date.now() - state.levelStartedAt : state.levelElapsed;
  timerDisplay.innerHTML = `${formatTime(elapsed)}<span>.${Math.floor((elapsed % 1000) / 100)}</span>`;
  timerDisplay.dateTime = `PT${(elapsed / 1000).toFixed(1)}S`;
}

function updateScoreboard() {
  wallCountDisplay.textContent = String(state.wallHits).padStart(2, '0');
  document.querySelector('#level-count-current').textContent = String(state.levelIndex + 1).padStart(2, '0');
  document.querySelectorAll('.level-steps .step').forEach((step, index) => {
    step.classList.toggle('is-current', index === state.levelIndex);
    step.classList.toggle('is-done', index < state.levelIndex || state.levelTimes[index] !== null);
  });
  document.querySelector('#level-times-list').innerHTML = state.levelTimes.map((time, index) => {
    const value = time === null ? '—' : formatTime(time);
    return `<li><span>0${index + 1} · ${LEVELS[index].name}</span><span>${value}</span></li>`;
  }).join('');
}

function prepareLevel(index, keepMaze = false) {
  state.levelIndex = index;
  const level = LEVELS[index];
  if (!keepMaze || !state.maze) state.maze = makeMaze(level.rows, level.cols);
  state.active = false;
  state.waitingForEntry = false;
  state.levelComplete = false;
  state.levelStartedAt = 0;
  state.levelElapsed = 0;
  state.wallHits = 0;
  state.levelWallHits[index] = 0;
  state.player = cellCenter(0, 1);
  state.lastPointer = null;
  state.currentTrack = [];
  state.pastTracks = [];
  state.collisionMarks = [];
  state.levelTimes[index] = null;
  document.querySelector('#level-eyebrow').textContent = `NIVEL 0${index + 1} · ${level.name.toUpperCase()}`;
  document.querySelector('#level-title').textContent = level.title;
  nextLevelButton.hidden = true;
  timerIndicator.textContent = 'EN ESPERA';
  timerIndicator.classList.remove('is-running');
  updateScoreboard();
  updateTimer();
  setStatus('Lleva el cursor a la entrada para empezar.');
  drawMaze();
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const pixelRatio = window.devicePixelRatio || 1;
  state.viewWidth = rect.width;
  state.viewHeight = rect.height;
  canvas.width = Math.round(rect.width * pixelRatio);
  canvas.height = Math.round(rect.height * pixelRatio);
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  if (state.maze) {
    if (!state.active && !state.levelComplete) state.player = cellCenter(0, 1);
    drawMaze();
  }
}

function drawMaze() {
  if (!state.maze || !state.viewWidth || !state.viewHeight) return;
  const rows = state.maze.length;
  const cols = state.maze[0].length;
  const cellWidth = state.viewWidth / cols;
  const cellHeight = state.viewHeight / rows;
  context.clearRect(0, 0, state.viewWidth, state.viewHeight);
  context.fillStyle = '#294143';
  context.fillRect(0, 0, state.viewWidth, state.viewHeight);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const cell = state.maze[row][col];
      if (cell === '#') continue;
      context.fillStyle = cell === 'S' ? '#79b28f' : cell === 'E' ? '#dcae52' : '#f4f0e6';
      context.fillRect(col * cellWidth, row * cellHeight, cellWidth, cellHeight);
      if (cell === '.' && (row + col) % 2 === 0) {
        context.fillStyle = '#20323408';
        context.fillRect(col * cellWidth, row * cellHeight, cellWidth, cellHeight);
      }
    }
  }

  state.pastTracks.forEach((track) => drawTrack(track, cellWidth * 0.22, '#477e6866'));
  drawTrack(state.currentTrack, cellWidth * 0.22, '#477e68');

  state.collisionMarks.forEach(({ x, y }) => {
    const radius = Math.max(2, cellWidth * 0.16);
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fillStyle = '#d66a4e';
    context.fill();
    context.strokeStyle = '#fbf9f3';
    context.lineWidth = Math.max(1, cellWidth * 0.045);
    context.stroke();
  });

  drawMarker(cellCenter(0, 1), '#203234', cellWidth * 0.17, '›');
  drawMarker(cellCenter(rows - 1, cols - 2), '#203234', cellWidth * 0.17, '✦');
  if (state.player) drawMarker(state.player, state.waitingForEntry ? '#d66a4e' : '#203234', cellWidth * 0.2, '');
}

function drawTrack(track, width, color) {
  if (!track.length) return;
  context.beginPath();
  context.moveTo(track[0].x, track[0].y);
  for (let index = 1; index < track.length; index += 1) context.lineTo(track[index].x, track[index].y);
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.stroke();
}

function drawMarker(point, color, radius, symbol) {
  context.beginPath();
  context.arc(point.x, point.y, radius, 0, Math.PI * 2);
  context.fillStyle = color;
  context.fill();
  if (symbol) {
    context.fillStyle = '#fbf9f3';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `bold ${Math.max(8, radius * 1.7)}px sans-serif`;
    context.fillText(symbol, point.x, point.y + 0.3);
  }
}

function pointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) return null;
  return { x, y };
}

function cellAt(point) {
  const row = Math.floor(point.y / (state.viewHeight / state.maze.length));
  const col = Math.floor(point.x / (state.viewWidth / state.maze[0].length));
  return { row, col };
}

function isStartCell(cell) { return cell.row === 0 && cell.col === 1; }
function isExitCell(cell) { return cell.row === state.maze.length - 1 && cell.col === state.maze[0].length - 2; }

function beginLevel(point) {
  state.active = true;
  state.waitingForEntry = false;
  state.levelStartedAt = Date.now();
  state.lastPointer = point;
  state.player = cellCenter(0, 1);
  state.currentTrack = [state.player];
  timerIndicator.textContent = 'EN CURSO';
  timerIndicator.classList.add('is-running');
  setStatus('Sigue el pasillo hasta la salida.', 'active');
  updateTimer();
  drawMaze();
}

function markCollision(point) {
  state.wallHits += 1;
  state.levelWallHits[state.levelIndex] = state.wallHits;
  state.collisionMarks.push(point);
  if (state.currentTrack.length) state.pastTracks.push(state.currentTrack);
  state.currentTrack = [];
  state.waitingForEntry = true;
  state.player = cellCenter(0, 1);
  state.lastPointer = point;
  updateScoreboard();
  setStatus('Has tocado un muro. Vuelve a la entrada para continuar.', 'alert');
  drawMaze();
}

function completeLevel() {
  state.active = false;
  state.levelComplete = true;
  state.levelElapsed = Date.now() - state.levelStartedAt;
  state.levelTimes[state.levelIndex] = state.levelElapsed;
  state.levelWallHits[state.levelIndex] = state.wallHits;
  timerIndicator.textContent = 'COMPLETADO';
  timerIndicator.classList.remove('is-running');
  updateTimer();
  updateScoreboard();
  if (state.levelIndex < LEVELS.length - 1) {
    nextLevelButton.hidden = false;
    setStatus(`Nivel superado en ${formatTime(state.levelElapsed)}. Prepárate para el siguiente.`, 'active');
  } else {
    setStatus(`Los tres niveles superados en ${formatTime(totalGameTime())}.`, 'active');
    document.querySelector('#final-time').textContent = formatTime(totalGameTime());
    dialogFeedback.textContent = '';
    finishDialog.showModal();
    playerNameInput.focus();
  }
  drawMaze();
}

function totalGameTime() {
  return state.levelTimes.reduce((sum, time) => sum + (time || 0), 0);
}

function handlePointerMove(event) {
  updateInputMode(event.pointerType);
  const point = pointerPosition(event);
  if (!point || state.levelComplete) return;
  const cell = cellAt(point);

  if (!state.active) {
    if (isStartCell(cell) && !state.levelComplete) beginLevel(point);
    return;
  }

  if (state.waitingForEntry) {
    if (isStartCell(cell)) {
      state.waitingForEntry = false;
      state.player = cellCenter(0, 1);
      state.currentTrack = [state.player];
      state.lastPointer = point;
      setStatus('Sigue el pasillo hasta la salida.', 'active');
      drawMaze();
    }
    return;
  }

  const cellWidth = state.viewWidth / state.maze[0].length;
  const cellHeight = state.viewHeight / state.maze.length;
  const from = state.lastPointer || point;
  const distance = Math.hypot(point.x - from.x, point.y - from.y);
  const steps = Math.max(1, Math.ceil(distance / (Math.min(cellWidth, cellHeight) * 0.14)));
  for (let step = 1; step <= steps; step += 1) {
    const sample = {
      x: from.x + ((point.x - from.x) * step) / steps,
      y: from.y + ((point.y - from.y) * step) / steps
    };
    const sampleCell = cellAt(sample);
    if (state.maze[sampleCell.row][sampleCell.col] === '#') {
      markCollision(sample);
      return;
    }
    state.player = sample;
    const previous = state.currentTrack[state.currentTrack.length - 1];
    if (!previous || Math.hypot(sample.x - previous.x, sample.y - previous.y) > Math.min(cellWidth, cellHeight) * 0.16) {
      state.currentTrack.push(sample);
    }
    if (isExitCell(sampleCell)) {
      state.currentTrack.push(cellCenter(sampleCell.row, sampleCell.col));
      state.lastPointer = point;
      completeLevel();
      return;
    }
  }

  state.lastPointer = point;
  drawMaze();
}

function readRecords() {
  try {
    const records = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

function renderRecords() {
  const records = readRecords().sort((first, second) => second.completedAt.localeCompare(first.completedAt)).slice(0, 5);
  const list = document.querySelector('#records-list');
  document.querySelector('#records-empty').hidden = records.length > 0;
  list.innerHTML = records.map((record) => `<li><span class="record-name" title="${escapeHTML(record.name)}">${escapeHTML(record.name)}</span><time class="record-time">${formatTime(record.totalMs)}</time></li>`).join('');
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function saveRecord(name) {
  const records = readRecords();
  records.push({
    name,
    totalMs: totalGameTime(),
    completedAt: new Date().toISOString(),
    levels: state.levelTimes.map((time, index) => ({ level: index + 1, milliseconds: time, wallHits: state.levelWallHits[index] }))
  });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(-30)));
    renderRecords();
    return true;
  } catch {
    return false;
  }
}

canvas.addEventListener('pointerdown', (event) => {
  updateInputMode(event.pointerType);
  if (event.pointerType === 'touch') event.preventDefault();
  canvas.focus({ preventScroll: true });
  handlePointerMove(event);
});
canvas.addEventListener('pointermove', handlePointerMove);
canvas.addEventListener('pointerup', (event) => {
  if (event.pointerType === 'touch') event.preventDefault();
});

document.querySelector('#restart-level').addEventListener('click', () => prepareLevel(state.levelIndex, true));
document.querySelector('#restart-game').addEventListener('click', () => {
  state.levelTimes = [null, null, null];
  state.levelWallHits = [0, 0, 0];
  prepareLevel(0);
});
nextLevelButton.addEventListener('click', () => prepareLevel(state.levelIndex + 1));
finishForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = playerNameInput.value.trim();
  if (!name) {
    playerNameInput.focus();
    return;
  }
  if (!saveRecord(name)) {
    dialogFeedback.textContent = 'No se pudo guardar. Revisa el almacenamiento del navegador.';
    return;
  }
  finishDialog.close();
  setStatus('Resultado guardado en este dispositivo. Puedes empezar un nuevo juego.', 'active');
});
finishDialog.addEventListener('cancel', (event) => event.preventDefault());
window.addEventListener('resize', resizeCanvas);

document.querySelector('#input-mode').textContent = state.isTouchInput ? 'TACTO' : 'MOUSE';
prepareLevel(0);
resizeCanvas();
renderRecords();
window.setInterval(updateTimer, 100);