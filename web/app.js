// State
let miningWorker = null;
let miningActive = false;
let ws = null;
let currentSession = null;
let currentDifficulty = 0;
let activeSeconds = 0;
let accrued = 0;
let minClaim = 0.01;

// DOM Elements
const form = document.getElementById('faucet-form');
const addressInput = document.getElementById('address');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const claimBtn = document.getElementById('claim-btn');
const miningStatus = document.getElementById('mining-status');
const statusText = document.getElementById('status-text');
const progressFill = document.getElementById('progress-fill');
const hashRateEl = document.getElementById('hash-rate');
const attemptsEl = document.getElementById('attempts');
const difficultyEl = document.getElementById('difficulty');
const activeTimeEl = document.getElementById('active-time');
const accruedEl = document.getElementById('accrued');
const messageEl = document.getElementById('message');

// Validate Dilithium address format
function validateAddress(address) {
  return address && address.length > 0;
}

function formatSeconds(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function updateStats() {
  difficultyEl.textContent = `Difficulty: ${currentDifficulty}`;
  activeTimeEl.textContent = `Active time: ${formatSeconds(activeSeconds)}`;
  accruedEl.textContent = `Accrued: ${accrued.toFixed(4)} BTQ`;

  if (!miningActive && accrued >= minClaim && currentSession) {
    claimBtn.disabled = false;
  }
}

function setStatus(text) {
  statusText.textContent = text;
}

function resetUI() {
  miningStatus.classList.remove('active');
  progressFill.style.width = '0%';
  hashRateEl.textContent = 'Hash rate: 0 H/s';
  attemptsEl.textContent = 'Attempts: 0';
  difficultyEl.textContent = 'Difficulty: -';
  activeTimeEl.textContent = 'Active time: 0m 0s';
  accruedEl.textContent = 'Accrued: 0.0000 BTQ';
  currentDifficulty = 0;
  activeSeconds = 0;
  accrued = 0;
  minClaim = 0.01;
}

function displaySuccess(txid) {
  messageEl.className = 'message success show';
  messageEl.innerHTML = `
    ✅ Success! Transaction sent.<br>
    <strong>TXID:</strong> <span style="word-break: break-all; font-family: monospace;">${txid}</span><br>
    <small>Check your wallet for confirmation.</small>
  `;
}

function displayError(message, isRetriable = true) {
  messageEl.className = 'message error show';
  messageEl.innerHTML = `❌ ${message}`;

  if (isRetriable) {
    startBtn.disabled = false;
    startBtn.textContent = 'Start Mining';
  }
}

function connectWebSocket() {
  return new Promise((resolve, reject) => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);

    socket.addEventListener('open', () => resolve(socket));
    socket.addEventListener('error', (event) => reject(event));
  });
}

async function startSession(address) {
  const response = await fetch('/api/mining/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to start mining');
  }

  return data;
}

async function stopSession(sessionId) {
  const response = await fetch('/api/mining/stop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to stop mining');
  }

  return data;
}

async function claimSession(sessionId) {
  const response = await fetch('/api/mining/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to claim');
  }

  return data;
}

function createWorker(session, address) {
  miningWorker = new Worker('worker.js');

  miningWorker.addEventListener('message', (event) => {
    const { type, counter, hashRate } = event.data;

    if (type === 'progress') {
      hashRateEl.textContent = `Hash rate: ${hashRate.toLocaleString()} H/s`;
      attemptsEl.textContent = `Attempts: ${counter.toLocaleString()}`;
      const progress = Math.min((counter / 1000000) * 100, 99);
      progressFill.style.width = `${progress}%`;
    }

    if (type === 'share') {
      hashRateEl.textContent = `Hash rate: ${hashRate.toLocaleString()} H/s`;
      attemptsEl.textContent = `Attempts: ${counter.toLocaleString()}`;

      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'share',
          sessionId: session.sessionId,
          counter
        }));
      }
    }
  });

  miningWorker.postMessage({
    type: 'start',
    nonce: session.nonce,
    address,
    difficulty: session.difficulty
  });
}

function stopWorker() {
  if (miningWorker) {
    miningWorker.postMessage({ type: 'stop' });
    miningWorker.terminate();
    miningWorker = null;
  }
}

function closeWebSocket() {
  if (ws) {
    ws.close();
    ws = null;
  }
}

async function startMining(address) {
  miningActive = true;
  miningStatus.classList.add('active');
  messageEl.classList.remove('show');

  startBtn.disabled = true;
  stopBtn.disabled = false;
  claimBtn.disabled = true;

  setStatus('Connecting...');

  try {
    currentSession = await startSession(address);
    minClaim = currentSession.minClaim || minClaim;

    ws = await connectWebSocket();
    ws.addEventListener('close', () => {
      if (miningActive) {
        miningActive = false;
        stopWorker();
        stopBtn.disabled = true;
        startBtn.disabled = false;
        setStatus('Connection closed.');
        displayError('WebSocket connection closed.', false);
      }
    });
    ws.addEventListener('error', () => {
      if (miningActive) {
        miningActive = false;
        stopWorker();
        stopBtn.disabled = true;
        startBtn.disabled = false;
        setStatus('Connection error.');
        displayError('WebSocket connection error.', false);
      }
    });
    ws.addEventListener('message', (event) => {
      const data = JSON.parse(event.data || '{}');

      if (data.type === 'accepted') {
        activeSeconds = data.activeSeconds;
        accrued = data.accrued;
        if (data.difficulty !== currentDifficulty) {
          currentDifficulty = data.difficulty;
          if (miningWorker) {
            miningWorker.postMessage({
              type: 'difficulty',
              difficulty: currentDifficulty
            });
          }
        }
        updateStats();
      }

      if (data.type === 'error') {
        miningActive = false;
        stopWorker();
        closeWebSocket();
        stopBtn.disabled = true;
        startBtn.disabled = false;
        displayError(data.error, false);
        setStatus('Stopped due to error.');
      }
    });

    currentDifficulty = currentSession.difficulty;
    updateStats();

    createWorker(currentSession, address);
    setStatus('Mining (submitting shares)...');
  } catch (error) {
    miningActive = false;
    stopWorker();
    closeWebSocket();
    startBtn.disabled = false;
    stopBtn.disabled = true;
    setStatus('Ready');
    displayError(error.message);
  }
}

async function stopMining() {
  if (!currentSession) {
    return;
  }

  setStatus('Stopping mining...');
  stopBtn.disabled = true;

  stopWorker();
  closeWebSocket();

  try {
    const data = await stopSession(currentSession.sessionId);
    miningActive = false;

    activeSeconds = data.activeSeconds;
    accrued = data.accrued;
    currentDifficulty = data.difficulty;
    minClaim = data.minClaim || minClaim;

    updateStats();
    setStatus('Stopped. Ready to claim.');
    startBtn.disabled = false;
    claimBtn.disabled = accrued < minClaim;
  } catch (error) {
    displayError(error.message, true);
  }
}

async function claimRewards() {
  if (!currentSession) {
    return;
  }

  claimBtn.disabled = true;
  setStatus('Claiming rewards...');

  try {
    const result = await claimSession(currentSession.sessionId);
    displaySuccess(result.txid);
    setStatus('Claimed.');
  } catch (error) {
    displayError(error.message, true);
    claimBtn.disabled = false;
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (miningActive) {
    return;
  }

  const address = addressInput.value.trim();
  if (!validateAddress(address)) {
    displayError('Please enter a valid BTQ address.');
    return;
  }

  resetUI();
  await startMining(address);
});

stopBtn.addEventListener('click', async () => {
  if (!miningActive) {
    return;
  }

  await stopMining();
});

claimBtn.addEventListener('click', async () => {
  if (miningActive) {
    displayError('Stop mining before claiming.', false);
    return;
  }

  await claimRewards();
});

window.addEventListener('beforeunload', () => {
  stopWorker();
  closeWebSocket();
});

fetch('/api/health')
  .then(r => r.json())
  .then(data => {
    if (data.rpc !== 'ok') {
      displayError('Faucet is offline. Please try again later.', false);
      startBtn.disabled = true;
    }
  })
  .catch(() => {
    displayError('Cannot connect to faucet. Please try again later.', false);
    startBtn.disabled = true;
  });

resetUI();
setStatus('Ready');
stopBtn.disabled = true;
claimBtn.disabled = true;
