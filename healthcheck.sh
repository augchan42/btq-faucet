#!/bin/bash
# Health check script for monitoring

FAUCET_URL=${FAUCET_URL:-"http://localhost:3000"}
MIN_BALANCE=${MIN_BALANCE:-1.0}

# Check health endpoint
RESPONSE=$(curl -s "${FAUCET_URL}/api/health")

if [ -z "$RESPONSE" ]; then
    echo "ERROR: No response from faucet"
    exit 1
fi

# Parse response
STATUS=$(echo "$RESPONSE" | jq -r '.status // "unknown"')
BALANCE=$(echo "$RESPONSE" | jq -r '.balance // 0')
RPC=$(echo "$RESPONSE" | jq -r '.rpc // "unknown"')
WALLET_LOADED=$(echo "$RESPONSE" | jq -r '.walletLoaded // false')
WALLET_UNLOCKED=$(echo "$RESPONSE" | jq -r '.walletUnlocked // false')

echo "=== Faucet Health Check ==="
echo "Status: $STATUS"
echo "Balance: $BALANCE BTQ"
echo "RPC: $RPC"
echo "Wallet Loaded: $WALLET_LOADED"
echo "Wallet Unlocked: $WALLET_UNLOCKED"
echo ""

# Check status
if [ "$STATUS" != "ok" ]; then
    echo "ERROR: Faucet status is not OK"
    exit 1
fi

# Check RPC
if [ "$RPC" != "ok" ]; then
    echo "ERROR: RPC connection failed"
    exit 1
fi

# Check wallet
if [ "$WALLET_LOADED" != "true" ]; then
    echo "ERROR: Wallet not loaded"
    exit 1
fi

if [ "$WALLET_UNLOCKED" != "true" ]; then
    echo "WARNING: Wallet is locked"
    exit 2
fi

# Check balance
if (( $(echo "$BALANCE < $MIN_BALANCE" | bc -l) )); then
    echo "WARNING: Low balance ($BALANCE < $MIN_BALANCE)"
    exit 2
fi

echo "✓ All checks passed"
exit 0
