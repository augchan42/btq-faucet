# Testing Guide - BTQ Faucet

This guide covers testing the faucet in different environments.

## Quick Test (Regtest)

The fastest way to test the faucet locally:

```bash
# 1. Start btqd in regtest mode
btqd -regtest -daemon -rpcuser=test -rpcpassword=test

# 2. Run the start script (does everything else)
./start-regtest.sh
```

This script will:
- Create the faucet wallet if needed
- Generate blocks to fund it
- Install dependencies
- Start the faucet server

Then open http://localhost:3000 in your browser.

## Manual Testing Steps

### 1. Environment Setup

**Regtest:**
```bash
btqd -regtest -daemon -rpcuser=test -rpcpassword=test
btq-cli -regtest createwallet faucet
```

**Testnet:**
```bash
btqd -testnet -daemon -rpcuser=btqrpc -rpcpassword=yourpass
btq-cli -testnet createwallet faucet
```

### 2. Fund the Wallet

Generate Dilithium address and mine blocks to it:

```bash
# Regtest (instant)
ADDR=$(btq-cli -regtest -rpcwallet=faucet getnewdilithiumaddress)
btq-cli -regtest -rpcwallet=faucet generatetoaddress 101 $ADDR

# Testnet (requires waiting for blocks)
ADDR=$(btq-cli -testnet -rpcwallet=faucet getnewdilithiumaddress)
btq-cli -testnet -rpcwallet=faucet generatetoaddress 101 $ADDR
```

Verify balance:
```bash
btq-cli -regtest -rpcwallet=faucet getbalance
```

### 3. Start Faucet

**Regtest:**
```bash
cd contrib/faucet/server
npm install
RPC_PORT=18443 RPC_USER=test RPC_PASS=test DIFFICULTY_BASE=3 npm start
```

**Testnet:**
```bash
cd contrib/faucet/server
npm install
export RPC_PORT=18334
export RPC_USER=btqrpc
export RPC_PASS=yourpass
npm start
```

### 4. Test in Browser

1. Open http://localhost:3000
2. Generate a test address:
   ```bash
   btq-cli -regtest getnewdilithiumaddress
   ```
3. Paste address into faucet form
4. Click "Get Testnet BTQ"
5. Wait for mining to complete
6. Verify transaction was created

### 5. Verify Transaction

```bash
# List transactions in receiving wallet
btq-cli -regtest listtransactions

# Check specific transaction
btq-cli -regtest gettransaction <txid>

# Generate a block to confirm (regtest only)
btq-cli -regtest -rpcwallet=faucet generatetoaddress 1 $ADDR
```

## Test Cases

### Basic Flow (Happy Path)

1. **Test: Successful claim**
   - Enter valid Dilithium address
   - Complete PoW mining
   - Verify transaction sent
   - Check TXID returned
   - Confirm funds received

   **Expected:** Success, TXID displayed, funds appear in wallet

2. **Test: Health check**
   - Visit http://localhost:3000/api/health
   - Verify response shows `status: "ok"`, `rpc: "ok"`, wallet loaded

   **Expected:** 200 OK with wallet status

### Error Handling

3. **Test: Invalid address**
   - Enter invalid address (e.g., "test123")
   - Click submit

   **Expected:** Error: "Invalid Dilithium address format"

4. **Test: Cooldown enforcement**
   - Claim successfully once
   - Try to claim again immediately with same address

   **Expected:** 429 error with cooldown message and remaining time

5. **Test: Wallet locked**
   ```bash
   # Encrypt wallet
   btq-cli -regtest -rpcwallet=faucet encryptwallet "testpass"
   # Restart btqd
   btqd -regtest -daemon -rpcuser=test -rpcpassword=test
   # Try to claim
   ```

   **Expected:** 503 error: "Wallet is locked. Please unlock with: btq-cli -rpcwallet=faucet walletpassphrase <passphrase> 60"

6. **Test: Insufficient funds**
   ```bash
   # Send all funds away
   btq-cli -regtest -rpcwallet=faucet sendtoaddress <someaddr> $(btq-cli -regtest -rpcwallet=faucet getbalance)
   # Try to claim
   ```

   **Expected:** 503 error: "Faucet has insufficient funds" with current balance

7. **Test: Expired challenge**
   - Start mining
   - Wait 6+ minutes (longer than 5-minute expiry)
   - Submit solution

   **Expected:** 400 error: "Challenge expired"

8. **Test: Invalid solution**
   - Get challenge
   - Submit with counter=0 (unlikely to be valid)

   **Expected:** 400 error: "Invalid solution"

### Security Tests

9. **Test: Challenge replay (same IP)**
   - Complete a claim
   - Try to submit the same solution again

   **Expected:** 400 error: "Challenge already solved"

10. **Test: Challenge replay (different IP)**
    - Get challenge from one IP
    - Try to submit solution from different IP (use proxy/VPN)

    **Expected:** 400 error: "IP mismatch"

11. **Test: Database isolation**
    - Create two challenges
    - Verify they have different nonces and challenge IDs
    - Verify solutions for one don't work for the other

    **Expected:** Each challenge requires unique solution

### Performance Tests

12. **Test: Mining time (difficulty=4)**
    - Start mining with difficulty 4
    - Measure time to solution

    **Expected:** ~1-10 seconds on modern hardware

13. **Test: Mining time (difficulty=5)**
    - Start mining with difficulty 5
    - Measure time to solution

    **Expected:** ~10-60 seconds on modern hardware

14. **Test: Hash rate reporting**
    - Watch hash rate during mining
    - Verify it updates every 2 seconds or 100k hashes

    **Expected:** Consistent hash rate (100k-1M H/s depending on device)

### Edge Cases

15. **Test: Concurrent mining**
    - Open faucet in two browser tabs
    - Start mining in both
    - Verify both work independently

    **Expected:** Both complete successfully if different addresses

16. **Test: Page refresh during mining**
    - Start mining
    - Refresh page
    - Start mining again

    **Expected:** Old session expires or stops accruing, new session works

17. **Test: Worker termination**
    - Start mining
    - Close tab
    - Verify server doesn't crash

    **Expected:** Session remains until expiry, accrual stops without shares

18. **Test: Cleanup job**
    - Create multiple sessions
    - Wait 1+ hour
    - Verify inactive sessions are marked expired

    **Expected:** `expireStaleSessions()` runs hourly, expires stale sessions

## Database Inspection

View sessions and payouts:

```bash
cd contrib/faucet/server
sqlite3 faucet.db

# List all challenges
SELECT * FROM sessions ORDER BY started_at DESC LIMIT 10;

# List all payouts
SELECT * FROM payouts ORDER BY timestamp DESC LIMIT 10;

# Check session status for address
SELECT * FROM sessions WHERE address = 'btq1...' ORDER BY started_at DESC LIMIT 1;

# Share counts per session
SELECT session_id, COUNT(*) FROM shares
GROUP BY session_id
ORDER BY COUNT(*) DESC;
```

## Load Testing

For production deployment, test under load:

```bash
# Install apache bench
sudo apt-get install apache2-utils

# Test health endpoint
ab -n 1000 -c 10 http://localhost:3000/api/health

# WebSocket share flow requires a custom load test client
```

Expected performance:
- Health: 500+ req/s
- Challenge: 100+ req/s
- Claim: 10+ req/s (limited by RPC)

## Monitoring in Production

Check health periodically:

```bash
# Run health check script
./healthcheck.sh

# Expected output:
# === Faucet Health Check ===
# Status: ok
# Balance: 10.5 BTQ
# RPC: ok
# Wallet Loaded: true
# Wallet Unlocked: true
#
# ✓ All checks passed
```

Set up a cron job to alert on low balance:

```bash
# Add to crontab
*/15 * * * * /path/to/faucet/healthcheck.sh || echo "Faucet health check failed" | mail -s "Faucet Alert" admin@example.com
```

## Troubleshooting

### Faucet won't start

**Symptom:** Server exits immediately

**Check:**
1. Is btqd running?
   ```bash
   btq-cli -regtest getblockchaininfo
   ```
2. Are RPC credentials correct?
3. Is port 3000 already in use?
   ```bash
   lsof -i :3000
   ```

### Wallet errors

**Symptom:** "Wallet not found" errors

**Fix:**
```bash
# Load wallet manually
btq-cli -regtest loadwallet faucet

# Or restart faucet (auto-loads wallet)
```

**Symptom:** "Wallet is locked"

**Fix:**
```bash
# Unlock for 1 hour
btq-cli -regtest -rpcwallet=faucet walletpassphrase "yourpass" 3600

# Or unlock indefinitely
btq-cli -regtest -rpcwallet=faucet walletpassphrase "yourpass" 0
```

### Mining stuck

**Symptom:** Mining runs forever

**Check:**
1. Is difficulty too high?
   - Difficulty 6+ can take minutes
   - Lower to 4-5 for testing
2. Is worker running?
   - Check browser console for errors
   - Verify SHA-256 library loads from CDN

### Database locked

**Symptom:** "database is locked" errors

**Fix:**
```bash
# Stop faucet
# Check for lingering processes
ps aux | grep server.js

# Remove journal file
rm server/faucet.db-journal

# Restart faucet
```

## Cleanup

After testing, clean up:

```bash
# Stop faucet
Ctrl+C

# Stop btqd
btq-cli -regtest stop

# Remove test database
rm contrib/faucet/server/faucet.db

# Remove test wallet (optional)
rm -rf ~/.bitcoin-quantum/regtest/wallets/faucet
```
