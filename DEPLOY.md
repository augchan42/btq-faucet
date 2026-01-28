# BTQ Faucet Production Deployment

## Prerequisites

- Ubuntu 20.04+ or similar Linux server
- Node.js 18+ installed
- nginx installed
- BTQ RPC node running locally
- Domain name pointed to your server

## Quick Start

1. Clone the repository to your server:
   ```bash
   git clone <repo-url> /var/www/btq-faucet
   cd /var/www/btq-faucet
   ```

2. Create and configure `.env`:
   ```bash
   cp .env.production .env
   nano .env  # Edit with your production values
   ```

3. Run the deployment script:
   ```bash
   sudo ./deploy.sh
   # Select option 7 for full setup
   ```

## Manual Setup

### 1. Install Dependencies

```bash
npm ci --production
```

### 2. Configure Environment

```bash
cp .env.production .env
chmod 600 .env
```

Edit `.env` with your production values:
- Set RPC credentials matching your BTQ node
- Set your faucet address
- Generate IP_SALT: `openssl rand -hex 32`
- Add hCaptcha keys from https://www.hcaptcha.com/

### 3. Setup PM2

```bash
# Install PM2 globally
npm install -g pm2

# Start the application
pm2 start ecosystem.config.js

# Save PM2 process list
pm2 save

# Setup PM2 to start on boot
pm2 startup systemd
```

### 4. Setup nginx

```bash
# Copy nginx config
sudo cp nginx/faucet.conf /etc/nginx/sites-available/faucet

# Edit domain name
sudo nano /etc/nginx/sites-available/faucet
# Replace faucet.example.com with your domain

# Enable the site
sudo ln -s /etc/nginx/sites-available/faucet /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

### 5. Setup SSL with Let's Encrypt

```bash
# Install certbot if needed
sudo apt install certbot python3-certbot-nginx

# Get certificate (replace with your domain)
sudo certbot --nginx -d faucet.example.com

# Certificate auto-renewal is configured automatically
```

### Alternative: Systemd Service

If you prefer systemd over PM2:

```bash
# Edit the service file with correct paths
sudo cp btq-faucet.service /etc/systemd/system/

# Edit paths in the service file
sudo nano /etc/systemd/system/btq-faucet.service

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable btq-faucet
sudo systemctl start btq-faucet
```

## Verification

```bash
# Check PM2 status
pm2 status

# Check health endpoint
curl http://localhost:3000/api/health

# Check logs
pm2 logs btq-faucet

# Check nginx status
sudo systemctl status nginx

# Test HTTPS (replace with your domain)
curl https://faucet.example.com/api/health
```

## Security Checklist

- [ ] Firewall configured (only 80/443 open)
  ```bash
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
  sudo ufw enable
  ```
- [ ] `.env` file secured: `chmod 600 .env`
- [ ] SSL certificate installed and working
- [ ] hCaptcha enabled in `.env`
- [ ] RPC not exposed to internet (127.0.0.1 only)
- [ ] Strong IP_SALT generated

## Maintenance

### Updating

```bash
cd /var/www/btq-faucet
git pull
npm ci --production
pm2 restart btq-faucet
```

### Logs

```bash
# PM2 logs
pm2 logs btq-faucet

# nginx logs
sudo tail -f /var/log/nginx/faucet.access.log
sudo tail -f /var/log/nginx/faucet.error.log
```

### Monitoring

```bash
# Process status
pm2 monit

# Quick status
pm2 status
```

## Troubleshooting

### Application won't start
- Check logs: `pm2 logs btq-faucet`
- Verify `.env` exists and is readable
- Verify RPC node is running: `curl http://127.0.0.1:18334`

### WebSocket connection issues
- Ensure nginx has WebSocket upgrade headers (check `/ws` location block)
- Check browser console for connection errors

### SSL issues
- Verify certificate: `sudo certbot certificates`
- Renew if needed: `sudo certbot renew`
