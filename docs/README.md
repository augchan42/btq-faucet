# Bitcoin Quantum Testnet PoW Faucet

A web-based Proof-of-Work (PoW) faucet for Bitcoin Quantum testnet. Users mine continuously in the browser, accrue rewards over a session, then stop and claim. The faucet serves a static frontend, exposes a session API, and accepts PoW shares over WebSocket. It communicates with `btqd` via JSON-RPC and uses browser-based SHA-256 mining to reduce abuse.

## Features

- **Continuous browser mining** - Submit PoW shares over WebSocket
- **Session rewards** - Accrue BTQ over time, stop, then claim
- **Difficulty ramp** - Exponentially harder work over long sessions
- **Dilithium signatures** - Uses quantum-resistant Dilithium by default
- **SQLite storage** - Minimal dependencies, no Redis needed
- **Clean UI** - Mobile-responsive, live mining stats

## Prerequisites

- Node.js 18+ (for fetch API)
- Running `btqd` instance with:
  - Testnet mode enabled
  - RPC server enabled
  - Wallet named `faucet` created and loaded
  - Wallet unlocked (or use `walletpassphrase` before claims)

## Quick Start

### 1. Setup btqd (testnet)

```bash
# Start btqd in testnet mode
btqd -testnet -daemon -rpcuser=btqrpc -rpcpassword=yourpassword

# Create and load faucet wallet
btq-cli -testnet createwallet faucet

# Generate Dilithium address and fund it
ADDR=$(btq-cli -testnet -rpcwallet=faucet getnewdilithiumaddress)
btq-cli -testnet -rpcwallet=faucet generatetoaddress 101 $ADDR

# Unlock wallet (if encrypted)
btq-cli -testnet -rpcwallet=faucet walletpassphrase "yourpassphrase" 0
```

### 2. Install and Run Faucet

```bash
cd contrib/faucet/server
npm install

# Set RPC credentials
export RPC_PASS=yourpassword

# Start faucet
npm start
```

The faucet will be available at http://localhost:3000

## Configuration

All configuration is done via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `RPC_HOST` | 127.0.0.1 | Bitcoin Quantum RPC host |
| `RPC_PORT` | 18334 | RPC port (18334=testnet, 18443=regtest) |
| `RPC_USER` | btqrpc | RPC username |
| `RPC_PASS` | *(required)* | RPC password |
| `RPC_WALLET` | faucet | Wallet name |
| `FAUCET_FEE` | 0.0001 | Transaction fee (BTQ) |
| `REWARD_PER_MINUTE` | 0.01 | Reward rate per active minute (BTQ) |
| `MIN_CLAIM` | 0.01 | Minimum accrued amount to claim (BTQ) |
| `DIFFICULTY_BASE` | 4 | Base PoW difficulty (leading zeros) |
| `DIFFICULTY_STEP_SECONDS` | 300 | Seconds of active mining before difficulty increases by 1 |
| `ACTIVE_SHARE_WINDOW` | 30 | Seconds of inactivity allowed between shares |
| `SESSION_EXPIRE_SECONDS` | 3600 | Session expiry since last share |
| `IP_SALT` | *(random)* | Salt for IP hashing |
| `PORT` | 3000 | Server port |

### Example Production Config

```bash
export RPC_HOST=127.0.0.1
export RPC_PORT=18334
export RPC_USER=btqrpc
export RPC_PASS=your_secure_password
export RPC_WALLET=faucet
export REWARD_PER_MINUTE=0.01
export MIN_CLAIM=0.01
export DIFFICULTY_BASE=5
export DIFFICULTY_STEP_SECONDS=300
export IP_SALT=your_random_salt_here

npm start
```

## Testing (Regtest)

For local testing with regtest:

```bash
# Start btqd in regtest
btqd -regtest -daemon -rpcuser=test -rpcpassword=test

# Create and fund wallet
btq-cli -regtest createwallet faucet
ADDR=$(btq-cli -regtest -rpcwallet=faucet getnewdilithiumaddress)
btq-cli -regtest -rpcwallet=faucet generatetoaddress 101 $ADDR

# Start faucet with regtest config
cd contrib/faucet/server
npm install
RPC_PORT=18443 RPC_USER=test RPC_PASS=test DIFFICULTY_BASE=3 npm start
```

Open http://localhost:3000 and test claiming.

## Architecture

```
Browser (PoW Worker) ── WebSocket shares ──► Node.js (Express + ws)
        │                                            │
        └─ REST API (start/stop/claim/health)        ├─ SQLite (sessions, shares, payouts)
                                                     └─ JSON-RPC to btqd
                                                        └─ Dilithium signing flow
```

## API Endpoints

### POST /api/mining/start

Start a mining session for an address.

**Request:**
```json
{
  "address": "btq1q..."
}
```

**Response:**
```json
{
  "sessionId": "abc123...",
  "nonce": "def456...",
  "difficulty": 4,
  "startedAt": 1234567890
}
```

### WebSocket /ws

Submit PoW shares for the session.

**Client → Server:**
```json
{
  "type": "share",
  "sessionId": "abc123...",
  "counter": 123456
}
```

**Server → Client:**
```json
{
  "type": "accepted",
  "sessionId": "abc123...",
  "activeSeconds": 120,
  "accrued": 0.02,
  "difficulty": 5
}
```

### POST /api/mining/stop

Stop an active session and finalize accrual.

**Request:**
```json
{
  "sessionId": "abc123..."
}
```

**Response:**
```json
{
  "sessionId": "abc123...",
  "activeSeconds": 180,
  "accrued": 0.03,
  "difficulty": 5,
  "minClaim": 0.01
}
```

### POST /api/mining/claim

Claim rewards for a stopped session.

**Request:**
```json
{
  "sessionId": "abc123..."
}
```

**Response (success):**
```json
{
  "success": true,
  "txid": "789xyz...",
  "amount": 0.03
}
```

### GET /api/health

Check faucet status.

**Response:**
```json
{
  "status": "ok",
  "balance": 10.5,
  "rpc": "ok",
  "walletLoaded": true,
  "walletUnlocked": true
}
```

## How It Works

### Mining Session Flow

1. User enters Dilithium address and starts mining
2. Server creates a session with a random nonce and base difficulty
3. Frontend spawns a Web Worker to mine:
   - Computes `SHA256(nonce:address:counter)` with incrementing counter
   - Submits a share when the hash meets the current difficulty
4. Server verifies each share and updates:
   - Active mining time (based on valid shares)
   - Current difficulty (ramped over time)
   - Accrued reward (`activeSeconds / 60 * REWARD_PER_MINUTE`)
5. User stops mining to finalize the session
6. If accrued ≥ `MIN_CLAIM`, user claims and receives BTQ

### Security Features

- **Session-bound shares** - Shares are tied to a session nonce and address
- **Difficulty ramp** - Work increases over long sessions
- **Session expiration** - Inactive sessions expire automatically
- **Hashed IPs** - IP addresses hashed with secret salt for privacy

## File Structure

```
contrib/faucet/
├── server/
│   ├── server.js          # Main Express app + RPC client
│   ├── db.js              # SQLite database wrapper
│   ├── package.json       # Dependencies
│   └── faucet.db          # SQLite database (created on first run)
├── web/
│   ├── index.html         # Frontend UI
│   ├── app.js             # Main app logic + API calls
│   └── worker.js          # Web Worker for PoW mining
└── README.md
```

## Troubleshooting

### Wallet Locked Error

If you see "Wallet is locked" errors:

```bash
# Unlock wallet indefinitely (timeout=0)
btq-cli -testnet -rpcwallet=faucet walletpassphrase "yourpassphrase" 0
```

### Insufficient Funds

Generate more blocks to the faucet address:

```bash
ADDR=$(btq-cli -testnet -rpcwallet=faucet getnewdilithiumaddress)
btq-cli -testnet -rpcwallet=faucet generatetoaddress 10 $ADDR
```

### RPC Connection Failed

Check that btqd is running and RPC credentials match:

```bash
# Test RPC connection
btq-cli -testnet -rpcuser=btqrpc -rpcpassword=yourpassword getblockchaininfo
```

### Mining Too Slow

Lower the base difficulty for testing:

```bash
DIFFICULTY_BASE=3 npm start
```

If mining stalls, also reduce the difficulty ramp rate:

```bash
DIFFICULTY_STEP_SECONDS=600 npm start
```

## Production Deployment

For production deployment:

1. **Use a process manager** (PM2, systemd)
2. **Set secure RPC password**
3. **Use environment file** for secrets
4. **Enable HTTPS** (reverse proxy with nginx/caddy)
5. **Monitor wallet balance**
6. **Backup SQLite database** periodically
7. **Adjust difficulty** based on abuse patterns

### Example PM2 Config

```json
{
  "apps": [{
    "name": "btq-faucet",
    "cwd": "/path/to/btq-core/contrib/faucet/server",
    "script": "server.js",
    "env": {
      "NODE_ENV": "production",
      "RPC_PASS": "secure_password_here",
      "DIFFICULTY_BASE": "5",
      "DIFFICULTY_STEP_SECONDS": "300",
      "REWARD_PER_MINUTE": "0.01",
      "MIN_CLAIM": "0.01",
      "IP_SALT": "random_salt_here"
    }
  }]
}
```

Start with: `pm2 start ecosystem.json`

## License

MIT - Same as Bitcoin Quantum Core
