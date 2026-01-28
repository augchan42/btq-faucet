# Bitcoin Quantum Testnet Faucet

A web-based Proof-of-Work faucet for Bitcoin Quantum testnet. Users mine continuously in the browser, accrue rewards over a session, then stop and claim.

## Features

- ⚛️ **Browser-based Mining** - Submit PoW shares over WebSocket in real-time
- 💰 **Session Rewards** - Accrue BTQ over time, stop mining, then claim
- 📈 **Difficulty Ramp** - Work gets harder over long sessions to prevent abuse
- 🔐 **Dilithium Signatures** - Quantum-resistant transaction signing
- 💾 **SQLite Storage** - Minimal dependencies, no Redis required
- 📱 **Mobile Responsive** - Clean UI that works on all devices

## Quick Start

### Prerequisites

- Node.js 18+
- Running `btqd` instance (testnet mode)
- `faucet` wallet created and funded

### Installation

```bash
# Clone repository
git clone https://github.com/bitcoinquantum/btq-faucet.git
cd btq-faucet

# Install dependencies
cd server
npm install

# Configure
cp ../.env.example .env
# Edit .env with your RPC credentials

# Start faucet
npm start
```

Visit http://localhost:3000

## Configuration

Create a `.env` file in the project root:

```bash
# Bitcoin Quantum RPC
RPC_HOST=127.0.0.1
RPC_PORT=18334
RPC_USER=btqrpc
RPC_PASS=your_password_here
RPC_WALLET=faucet

# Faucet Settings
REWARD_PER_MINUTE=0.01
MIN_CLAIM=0.01
DIFFICULTY_BASE=5
DIFFICULTY_STEP_SECONDS=300

# Security
IP_SALT=generate_random_string_here

# Server
PORT=3000
```

See [docs/README.md](docs/README.md) for full documentation.

## Documentation

- [Architecture](docs/ARCHITECTURE.md) - Technical design and flow
- [Testing Guide](docs/TESTING.md) - How to test the faucet
- [Quick Reference](docs/QUICKREF.md) - Common commands and queries

## How It Works

1. User enters their Dilithium address and starts mining
2. Browser solves PoW puzzles and submits shares via WebSocket
3. Server verifies shares and tracks active mining time
4. Rewards accrue at a configurable rate (default: 0.01 BTQ/minute)
5. Difficulty increases over time to discourage long sessions
6. User stops mining to finalize their session
7. User claims rewards once minimum threshold is reached

## API Endpoints

- **POST /api/mining/start** - Start a new mining session
- **WebSocket /ws** - Submit PoW shares in real-time
- **POST /api/mining/stop** - Stop session and finalize accrual
- **POST /api/mining/claim** - Claim rewards for stopped session
- **GET /api/health** - Check faucet status and wallet balance

See [docs/README.md](docs/README.md) for full API documentation.

## Development

```bash
# Run in development mode with auto-reload
npm run dev

# Check database
sqlite3 server/faucet.db
```

## Security

- Sessions are IP-bound to prevent replay attacks
- Difficulty ramps over time to prevent abuse
- IP addresses are hashed with secret salt
- All database queries use parameterized statements

Found a security issue? Please email security@bitcoinquantum.org

## License

MIT License - see [LICENSE](LICENSE) file for details

## Related Projects

- [btq-core](https://github.com/bitcoinquantum/btq-core) - Bitcoin Quantum node implementation

---

Made with ⚛️ by the Bitcoin Quantum community
