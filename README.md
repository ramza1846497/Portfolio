## Portfolio

## What I did
- Built Linux environment(WSL2)
- Practiced basic commands
- Configured SSH server
- Configured firewall(ufw)
- Built web server using nginx
- Built portfolio web server using Docker
- Built monitoring stack with Prometheus and Grafana using Docker Compose
- Added node_exporter to monitor home PC memory usage and a Grafana dashboard viewable from a smartphone
## Environment
- OS: Ubuntu 24.04
- Platform: WSL2 on Windows

## Memory monitoring (viewable from a smartphone)

This stack now includes `node-exporter`, which exposes the host's memory
metrics to Prometheus. Grafana is provisioned automatically with a
Prometheus datasource and a "Home PC - Memory Usage" dashboard, so no manual
setup is needed after the containers start.

1. On the home PC, start the stack:
   ```
   docker compose up -d --build
   ```
2. Find the PC's LAN IP address (e.g. `ip addr` inside WSL2, or `ipconfig`
   on Windows). Docker Desktop's WSL2 integration forwards published ports
   (3000, 9090) to the Windows host automatically, so devices on the same
   Wi-Fi can reach them via the Windows host's LAN IP.
3. If a firewall is enabled (e.g. `ufw` or Windows Defender Firewall),
   allow the Grafana port from the local network, for example:
   ```
   sudo ufw allow from 192.168.0.0/24 to any port 3000
   ```
4. On the smartphone, connect to the same Wi-Fi and open
   `http://<PC-LAN-IP>:3000` in a browser, log in (`admin` / the password
   set in `GF_SECURITY_ADMIN_PASSWORD`), and open the
   "Home PC - Memory Usage" dashboard.
5. For access from outside the home network, avoid exposing port 3000
   directly to the internet. Use a private VPN such as
   [Tailscale](https://tailscale.com/) or [WireGuard](https://www.wireguard.com/)
   to reach the home network securely from the phone instead.
