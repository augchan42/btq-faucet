#!/bin/bash
# Start script for testing faucet on testnet

set -e

echo "=== Bitcoin Quantum Faucet - Testnet Setup ==="
echo ""

# Configuration
RPC_USER=${RPC_USER:-"btqrpc"}
RPC_PASS=${RPC_PASS:-""}

if [ -z "$RPC_PASS" ]; then
    echo "Error: RPC_PASS environment variable not set"
    echo "Set it with: export RPC_PASS=your_rpc_password"
    exit 1
fi

# Check if btqd is running
if ! btq-cli -testnet -rpcuser="$RPC_USER" -rpcpassword="$RPC_PASS" getblockchaininfo &>/dev/null; then
    echo "Error: btqd not running in testnet mode"
    echo ""
    echo "Start it with:"
    echo "  btqd -testnet -daemon -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS"
    echo ""
    exit 1
fi

echo "✓ btqd is running"

# Check if wallet exists
if ! btq-cli -testnet -rpcuser="$RPC_USER" -rpcpassword="$RPC_PASS" -rpcwallet=faucet getwalletinfo &>/dev/null; then
    echo "Creating faucet wallet..."
    btq-cli -testnet -rpcuser="$RPC_USER" -rpcpassword="$RPC_PASS" createwallet faucet
    echo "✓ Wallet created"
else
    echo "✓ Wallet exists"
fi

# Check balance
BALANCE=$(btq-cli -testnet -rpcuser="$RPC_USER" -rpcpassword="$RPC_PASS" -rpcwallet=faucet getbalance)
echo "Current balance: $BALANCE BTQ"

if (( $(echo "$BALANCE < 1" | bc -l) )); then
    echo ""
    echo "⚠ Wallet has low balance!"
    echo ""
    echo "To fund the wallet, you have two options:"
    echo ""
    echo "1. Generate blocks locally (if you have a miner):"
    echo "   ADDR=\$(btq-cli -testnet -rpcwallet=faucet getnewdilithiumaddress)"
    echo "   btq-cli -testnet -rpcwallet=faucet generatetoaddress 101 \$ADDR"
    echo ""
    echo "2. Get testnet coins from another faucet or peer"
    echo ""
    read -p "Do you want to generate blocks now? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Generating 101 blocks..."
        ADDR=$(btq-cli -testnet -rpcuser="$RPC_USER" -rpcpassword="$RPC_PASS" -rpcwallet=faucet getnewdilithiumaddress)
        btq-cli -testnet -rpcuser="$RPC_USER" -rpcpassword="$RPC_PASS" -rpcwallet=faucet generatetoaddress 101 "$ADDR" > /dev/null
        BALANCE=$(btq-cli -testnet -rpcuser="$RPC_USER" -rpcpassword="$RPC_PASS" -rpcwallet=faucet getbalance)
        echo "✓ Generated blocks, new balance: $BALANCE BTQ"
    else
        echo "Continuing with current balance..."
    fi
fi

# Check if wallet is encrypted
WALLET_INFO=$(btq-cli -testnet -rpcuser="$RPC_USER" -rpcpassword="$RPC_PASS" -rpcwallet=faucet getwalletinfo)
if echo "$WALLET_INFO" | grep -q "unlocked_until"; then
    UNLOCKED_UNTIL=$(echo "$WALLET_INFO" | grep -o '"unlocked_until":[^,}]*' | cut -d':' -f2)
    if [ "$UNLOCKED_UNTIL" = "0" ] || [ "$UNLOCKED_UNTIL" = "null" ]; then
        echo "⚠ Wallet is encrypted and locked!"
        echo ""
        echo "The faucet needs an unlocked wallet to send transactions."
        echo "Unlock it with:"
        echo "  btq-cli -testnet -rpcwallet=faucet walletpassphrase <passphrase> 0"
        echo ""
        echo "(Use timeout=0 to unlock indefinitely)"
        echo ""
        read -p "Press Enter when wallet is unlocked, or Ctrl+C to exit..."
    else
        echo "✓ Wallet is unlocked"
    fi
fi

echo ""
echo "=== Starting Faucet Server ==="
echo ""

cd "$(dirname "$0")/server"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Start server with testnet configuration
export RPC_PORT=18334
export RPC_USER="$RPC_USER"
export RPC_PASS="$RPC_PASS"
export DIFFICULTY_BASE=${DIFFICULTY_BASE:-4}
export DIFFICULTY_STEP_SECONDS=${DIFFICULTY_STEP_SECONDS:-300}
export REWARD_PER_MINUTE=${REWARD_PER_MINUTE:-0.01}
export MIN_CLAIM=${MIN_CLAIM:-0.01}

echo "Configuration:"
echo "  RPC Port: $RPC_PORT (testnet)"
echo "  Difficulty base: $DIFFICULTY_BASE"
echo "  Difficulty step seconds: $DIFFICULTY_STEP_SECONDS"
echo "  Reward per minute: $REWARD_PER_MINUTE BTQ"
echo "  Minimum claim: $MIN_CLAIM BTQ"
echo ""
echo "Starting server on http://localhost:3000"
echo "Press Ctrl+C to stop"
echo ""

npm start
