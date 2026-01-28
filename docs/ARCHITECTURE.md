# Bitcoin Quantum Faucet - Architecture

## Overview

The BTQ Faucet is a single-service application with four main components:

1. **Express HTTP Server** - Serves static files and REST endpoints
2. **WebSocket Server** - Receives PoW shares in real time
3. **SQLite Database** - Stores sessions, shares, and payouts
4. **Bitcoin Quantum RPC Client** - Communicates with btqd

```
┌──────────────────────────────────────────────────────────────┐
│                           Browser                            │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  UI (index.html + app.js)                              │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Web Worker (worker.js)                                │  │
│  │  - SHA-256 mining loop                                 │  │
│  │  - Submits PoW shares                                  │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
               │ REST (/api/mining/*, /api/health)
               ▼
┌──────────────────────────────────────────────────────────────┐
│                    Express + WebSocket                       │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  REST Routes                                             │  │
│  │  - POST /api/mining/start                                │  │
│  │  - POST /api/mining/stop                                 │  │
│  │  - POST /api/mining/claim                                │  │
│  │  - GET  /api/health                                      │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  WebSocket (/ws)                                        │  │
│  │  - Receives PoW share submissions                        │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
         │ SQL                                         │ JSON-RPC
         ▼                                             ▼
┌──────────────────┐                         ┌──────────────────────┐
│  SQLite DB       │                         │  btqd (Bitcoin       │
│  - sessions      │                         │   Quantum daemon)    │
│  - shares        │                         │  - Wallet: faucet    │
│  - payouts       │                         │  - Dilithium sigs    │
└──────────────────┘                         └──────────────────────┘
```

## Mining Session Flow

```
1. User enters address and clicks Start
   ↓
2. Browser → POST /api/mining/start { address }
   ↓
3. Server creates session:
   - session_id + nonce
   - base difficulty
   - status = active
   - stores in DB
   ↓
4. Browser connects to WebSocket /ws
   ↓
5. Worker mines: SHA256(nonce:address:counter)
   - On share: send { sessionId, counter }
   ↓
6. Server verifies share:
   - session exists + active
   - hash meets current difficulty
   - updates active time + accrued reward
   - ramps difficulty based on active seconds
   ↓
7. Server replies with updated stats
   ↓
8. User clicks Stop
   ↓
9. Browser → POST /api/mining/stop { sessionId }
   ↓
10. Server finalizes session accrual
   ↓
11. User clicks Claim
   ↓
12. Browser → POST /api/mining/claim { sessionId }
   ↓
13. Server sends BTQ via Dilithium-signed transaction
```

## Difficulty Ramp

- Base difficulty: `DIFFICULTY_BASE`
- Every `DIFFICULTY_STEP_SECONDS` of **active mining**, difficulty increases by 1
- Active mining time only advances when valid shares arrive within `ACTIVE_SHARE_WINDOW`

## Reward Calculation

```
accrued = active_seconds / 60 * REWARD_PER_MINUTE
```

Claims are allowed only after a session is stopped and `accrued >= MIN_CLAIM`.

## Database Schema

### sessions
- `session_id` (unique)
- `address`
- `nonce`
- `base_difficulty`
- `current_difficulty`
- `active_seconds`
- `last_share_at`
- `last_counter`
- `started_at`
- `stopped_at`
- `accrued`
- `status` (active/stopped/claimed/expired)
- `ip_hash`

### shares
- `session_id`
- `counter`
- `difficulty`
- `timestamp`

### payouts
- `session_id`
- `address`
- `amount`
- `txid`
- `timestamp`
- `status`

## Security Model

- **Session-bound shares**: share validity depends on session nonce + address
- **Difficulty ramp**: long sessions become more costly
- **Inactivity expiry**: sessions expire after `SESSION_EXPIRE_SECONDS` since last share
- **Hashed IPs**: IP addresses are stored as salted SHA-256 hashes
