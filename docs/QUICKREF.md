# BTQ Faucet - Quick Reference

## Quick Start

```bash
# Start btqd (testnet)
btqd -testnet -daemon -rpcuser=btqrpc -rpcpassword=yourpass

# Create wallet
btq-cli -testnet createwallet faucet

# Fund wallet
ADDR=$(btq-cli -testnet -rpcwallet=faucet getnewdilithiumaddress)
btq-cli -testnet -rpcwallet=faucet generatetoaddress 101 $ADDR

# Start faucet
cd contrib/faucet/server
npm install
export RPC_PASS=yourpass
npm start

# Open browser
open http://localhost:3000
```

## Common Commands

### Check Status

```bash
# Faucet health
curl http://localhost:3000/api/health | jq

# Wallet balance
btq-cli -testnet -rpcwallet=faucet getbalance

# Recent payouts
sqlite3 server/faucet.db "SELECT * FROM payouts ORDER BY timestamp DESC LIMIT 10"
```

### Maintenance

```bash
# Unlock wallet (1 hour)
btq-cli -testnet -rpcwallet=faucet walletpassphrase "pass" 3600

# Generate more funds
ADDR=$(btq-cli -testnet -rpcwallet=faucet getnewdilithiumaddress)
btq-cli -testnet -rpcwallet=faucet generatetoaddress 10 $ADDR

# Backup database
sqlite3 server/faucet.db ".backup faucet-backup.db"
```

### Monitoring

```bash
# Run health check
./healthcheck.sh

# Watch logs (systemd)
journalctl -u btq-faucet -f

# Watch logs (PM2)
pm2 logs btq-faucet

# Count active sessions
sqlite3 server/faucet.db "SELECT COUNT(*) FROM sessions WHERE status = 'active'"
```

### Troubleshooting

```bash
# Restart faucet (systemd)
sudo systemctl restart btq-faucet

# Restart faucet (PM2)
pm2 restart btq-faucet

# Check if btqd is running
btq-cli -testnet getblockchaininfo

# Load wallet manually
btq-cli -testnet loadwallet faucet

# Check RPC connection
curl -u btqrpc:yourpass --data-binary '{"jsonrpc":"1.0","id":"test","method":"getwalletinfo","params":[]}' http://127.0.0.1:18334/wallet/faucet
```

## Configuration Cheatsheet

| Variable | Default | Testnet | Regtest |
|----------|---------|---------|---------|
| RPC_PORT | 18334 | 18334 | 18443 |
| RPC_USER | btqrpc | btqrpc | test |
| DIFFICULTY_BASE | 4 | 4-5 | 2-3 |
| DIFFICULTY_STEP_SECONDS | 300 | 300 | 600 |
| REWARD_PER_MINUTE | 0.01 | 0.01 | 0.05 |
| MIN_CLAIM | 0.01 | 0.01 | 0.01 |

## Error Messages

| Error | Cause | Fix |
|-------|-------|-----|
| Wallet is locked | Encrypted wallet | `walletpassphrase <pass> 3600` |
| Wallet not found | Not loaded | `loadwallet faucet` or restart faucet |
| Insufficient funds | Balance low | Generate more blocks |
| Session expired | Inactive too long | Start mining again |
| Session must be stopped | Tried to claim early | Stop mining first |
| Invalid share | Difficulty mismatch | Refresh page or restart mining |

## File Locations

```
contrib/faucet/
├── server/
│   ├── server.js      # Main server
│   ├── db.js          # Database wrapper
│   └── faucet.db      # SQLite database
├── web/
│   ├── index.html     # UI
│   ├── app.js         # Frontend logic
│   └── worker.js      # Mining worker
├── README.md          # Main docs
├── TESTING.md         # Test guide
└── ARCHITECTURE.md    # Technical details
```

## API Quick Reference

### POST /api/mining/start

Start a mining session.

```bash
curl -X POST http://localhost:3000/api/mining/start \
  -H "Content-Type: application/json" \
  -d '{
    "address": "btq1q..."
  }'
```

### WebSocket /ws

Submit shares over WebSocket:

```json
{
  "type": "share",
  "sessionId": "abc...",
  "counter": 123456
}
```

### POST /api/mining/stop

Stop a session and finalize accrual.

```bash
curl -X POST http://localhost:3000/api/mining/stop \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "abc..."
  }'
```

### POST /api/mining/claim

Claim a stopped session.

```bash
curl -X POST http://localhost:3000/api/mining/claim \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "abc..."
  }'
```

### GET /api/health

Check faucet status.

```bash
curl http://localhost:3000/api/health
```

## Database Queries

```sql
-- Active sessions
SELECT session_id, address, status, active_seconds, accrued
FROM sessions
ORDER BY started_at DESC
LIMIT 10;

-- Recent payouts
SELECT address, amount, txid, datetime(timestamp, 'unixepoch')
FROM payouts
ORDER BY timestamp DESC
LIMIT 10;

-- Share counts per session
SELECT session_id, COUNT(*) as shares
FROM shares
GROUP BY session_id
ORDER BY shares DESC
LIMIT 10;
```

## Performance Tuning

| Setting | Low Traffic | Medium Traffic | High Traffic |
|---------|-------------|----------------|--------------|
| DIFFICULTY_BASE | 3-4 | 4-5 | 5-6 |
| DIFFICULTY_STEP_SECONDS | 600 | 300 | 180 |
| REWARD_PER_MINUTE | 0.02 | 0.01 | 0.005 |

## Links

- Main README: `README.md`
- Testing Guide: `TESTING.md`
- Architecture: `ARCHITECTURE.md`
- Example Config: `.env.example`
- Nginx Config: `nginx.conf.example`
- Systemd Service: `btq-faucet.service`
