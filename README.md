## Portfolio

## What I did
- Built Linux environment(WSL2)
- Practiced basic commands
- Configured SSH server
- Configured firewall(ufw)
- Built web server using nginx
- Built portfolio web server using Docker
- Built monitoring stack with Prometheus and Grafana using Docker Compose
- Added node_exporter to monitor home PC memory usage, with a Grafana dashboard
- Made the dashboard viewable from a smartphone, both on the home Wi-Fi and from
  outside the house over a Tailscale VPN
## Environment
- OS: Ubuntu 24.04
- Platform: WSL2 on Windows

## Memory monitoring (viewable from a smartphone)

This stack includes `node-exporter`, which exposes the host's memory metrics
to Prometheus. Grafana is provisioned automatically with a Prometheus
datasource and a "Home PC - Memory Usage" dashboard, so no manual dashboard
setup is needed after the containers start.

1. On the home PC, start the stack:
   ```
   docker compose up -d --build
   ```
   (If Docker Compose is installed as the older standalone `docker-compose`
   instead of the `docker compose` plugin, use `docker-compose up -d --build`
   instead. Also make sure your user is in the `docker` group, e.g.
   `sudo usermod -aG docker $USER`, then reopen the terminal — otherwise
   Docker commands fail with a permission error.)
2. Find the PC's LAN IP address (`ipconfig` on Windows, look at the Ethernet
   or Wi-Fi adapter's IPv4 address). On WSL2, published container ports are
   generally reachable through the Windows host's LAN IP without extra setup;
   if not, forward the port from Windows to WSL2's IP (`hostname -I` inside
   WSL2) with:
   ```
   netsh interface portproxy add v4tov4 listenport=3000 listenaddress=0.0.0.0 connectport=3000 connectaddress=<WSL2-IP>
   New-NetFirewallRule -DisplayName "Grafana (WSL2)" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
   ```
   (run both in an **administrator** PowerShell). Note the WSL2 IP can change
   after a reboot, so the portproxy rule may need to be re-added.
3. On the smartphone, connect to the same Wi-Fi and open
   `http://<PC-LAN-IP>:3000` in a browser, then log in with `admin` and the
   password set in `GF_SECURITY_ADMIN_PASSWORD` (you'll be asked to set a new
   password on first login). Open the "Home PC - Memory Usage" dashboard.

### Access from outside the home network (Tailscale)

Rather than exposing port 3000 to the internet, this uses
[Tailscale](https://tailscale.com/), a free private VPN, so the phone can
reach Grafana from any network (e.g. mobile data) without opening any router
ports.

1. Install [Tailscale for Windows](https://tailscale.com/download/windows) on
   the home PC and sign in.
2. Install the Tailscale app on the smartphone and sign in with the same
   account.
3. Note the PC's Tailscale IP (`100.x.x.x`), shown in the Tailscale tray icon
   on Windows.
4. With Tailscale enabled on the phone (Wi-Fi or mobile data, doesn't
   matter), open `http://<PC-Tailscale-IP>:3000` to reach the same Grafana
   dashboard from anywhere.

### Resetting the Grafana admin password

If Grafana's data volume already has an admin password set from a previous
run, `GF_SECURITY_ADMIN_PASSWORD` in `docker-compose.yml` only applies to a
fresh install and won't override it. Reset it directly instead:
```
docker compose exec grafana grafana-cli admin reset-admin-password <new-password>
```
