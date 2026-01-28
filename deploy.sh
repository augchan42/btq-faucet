#!/bin/bash
# BTQ Faucet Deployment Script
# Run this script on your production server

set -e

echo "BTQ Faucet Deployment"
echo "====================="
echo

# Check if running as root for nginx/systemd operations
check_root() {
    if [ "$EUID" -ne 0 ]; then
        echo "Some operations require root. Run with sudo for full setup."
        return 1
    fi
    return 0
}

# Install dependencies
install_deps() {
    echo "Installing Node.js dependencies..."
    npm ci --production
    echo "Done."
    echo
}

# Setup PM2
setup_pm2() {
    echo "Setting up PM2..."

    if ! command -v pm2 &> /dev/null; then
        echo "Installing PM2 globally..."
        npm install -g pm2
    fi

    pm2 start ecosystem.config.js
    pm2 save

    echo "Setting up PM2 startup script..."
    pm2 startup systemd -u $USER --hp $HOME

    echo "PM2 setup complete."
    echo
}

# Setup nginx
setup_nginx() {
    if ! check_root; then
        echo "Skipping nginx setup (requires root)"
        return
    fi

    echo "Setting up nginx..."

    # Copy config
    cp nginx/faucet.conf /etc/nginx/sites-available/faucet

    # Create symlink if not exists
    if [ ! -L /etc/nginx/sites-enabled/faucet ]; then
        ln -s /etc/nginx/sites-available/faucet /etc/nginx/sites-enabled/faucet
    fi

    # Test config
    nginx -t

    # Reload nginx
    systemctl reload nginx

    echo "nginx setup complete."
    echo
}

# Setup SSL with certbot
setup_ssl() {
    if ! check_root; then
        echo "Skipping SSL setup (requires root)"
        return
    fi

    read -p "Enter your domain (e.g., faucet.example.com): " DOMAIN

    echo "Setting up SSL for $DOMAIN..."

    # Update nginx config with domain
    sed -i "s/faucet.example.com/$DOMAIN/g" /etc/nginx/sites-available/faucet

    # Create certbot webroot directory
    mkdir -p /var/www/certbot

    # Get certificate
    certbot certonly --webroot -w /var/www/certbot -d $DOMAIN

    # Reload nginx
    systemctl reload nginx

    echo "SSL setup complete."
    echo
}

# Secure .env file
secure_env() {
    echo "Securing .env file..."
    chmod 600 .env
    echo "Done."
    echo
}

# Verify deployment
verify() {
    echo "Verifying deployment..."
    echo

    # Check PM2 status
    if command -v pm2 &> /dev/null; then
        echo "PM2 Status:"
        pm2 status
        echo
    fi

    # Check health endpoint
    echo "Health check:"
    curl -s http://localhost:3000/api/health || echo "Failed to reach health endpoint"
    echo
    echo

    # Check nginx (if root)
    if check_root 2>/dev/null; then
        echo "nginx status:"
        systemctl status nginx --no-pager -l
        echo
    fi
}

# Main menu
echo "Select deployment step:"
echo "  1) Install dependencies"
echo "  2) Setup PM2"
echo "  3) Setup nginx (requires root)"
echo "  4) Setup SSL (requires root)"
echo "  5) Secure .env file"
echo "  6) Verify deployment"
echo "  7) Full setup (all steps)"
echo "  0) Exit"
echo

read -p "Choice: " choice

case $choice in
    1) install_deps ;;
    2) setup_pm2 ;;
    3) setup_nginx ;;
    4) setup_ssl ;;
    5) secure_env ;;
    6) verify ;;
    7)
        install_deps
        secure_env
        setup_pm2
        setup_nginx
        setup_ssl
        verify
        ;;
    0) exit 0 ;;
    *) echo "Invalid choice" ;;
esac

echo
echo "Deployment script complete."
