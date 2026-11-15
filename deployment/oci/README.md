# CareOS — OCI Always Free ARM64 Background Worker Deployment Guide

> **Target Architecture:** Oracle Cloud Infrastructure (OCI) Always Free Ampere A1 Compute Instance (ARM64).
> **Role:** Asynchronous background processing, SLA evaluation clock, durable ERP outbox synchronization, telematics event processing, and notifications.
> **Security Posture:** **Strict Outbound-Only Networking.** Zero public web ports exposed. The worker polls Supabase PostgreSQL (`job_queue`) and pushes out to external APIs.

---

## 1. OCI Always Free Compute Specifications & Quotas

| Parameter | Specification | Notes |
| :--- | :--- | :--- |
| **Processor Architecture** | Arm (Ampere Altra A1) | Supported natively via multi-stage Dockerfile (`linux/arm64`). |
| **Always Free Quota** | Up to 4 OCPUs and 24 GB RAM | CareOS worker requires only **1–2 OCPUs and 4–8 GB RAM**. |
| **Operating System** | Ubuntu 22.04 LTS (AArch64) or Oracle Linux 9 (aarch64) | Standard LTS distribution with cloud-init support. |
| **Boot Volume** | 50 GB to 100 GB (Always Free allows up to 200 GB total) | Standard balanced performance block storage. |
| **Cost** | **$0.00 / month (Always Free)** | Eligible within standard OCI Always Free tier limits. |

### ⚠️ Critical Notice: OCI Always Free Idle Instance Reclamation Policy
Oracle reclaims idle Always Free compute instances if, over a 7-day rolling window:
1. CPU utilization across the 95th percentile is less than 20%.
2. Network utilization is less than 20%.
3. Memory utilization is less than 20% (for A1 shapes).

**CareOS Operational Mitigation:**
- The CareOS worker runs a continuous 3-second polling interval against PostgreSQL `job_queue` and an SLA evaluation sweep every 60 seconds.
- Memory reservations in `docker-compose.yml` (`reservations: memory: 512M`, `limits: memory: 2048M`) and standard telemetry logging provide consistent background activity.
- The administrator can optionally run a lightweight systemd resource monitoring script if CPU utilization falls below threshold during quiet operational periods.

---

## 2. Infrastructure Setup: Minimal Firewall & Network Security

Because the worker initiates **only outbound connections** to Supabase Cloud Singapore (`vbckrirksziluvwqpamx.supabase.co:443` and `5432`) and external HTTPS APIs:

### VCN Ingress Security Rules (OCI Console)
| Source CIDR | Protocol | Port Range | Purpose |
| :--- | :--- | :--- | :--- |
| `YOUR_ADMIN_OFFICE_IP/32` (or Bastion) | TCP | `22` (SSH) | Administrative access only. **Do not open 0.0.0.0/0 to port 22.** |
| **All Other Ingress** | - | - | **DROP / BLOCK ALL INBOUND PORTS (No port 80, 443, 3000, 8080).** |

### VCN Egress Security Rules (OCI Console)
| Destination CIDR | Protocol | Port Range | Purpose |
| :--- | :--- | :--- | :--- |
| `0.0.0.0/0` | TCP | `443` (HTTPS) | Outbound connection to Supabase API and external webhooks (ERP/SMS/Email). |
| `0.0.0.0/0` | TCP | `5432` / `6543` | Outbound PostgreSQL connection to Supabase database. |

---

## 3. Host Hardening & Prerequisites on OCI VM

Connect via SSH:
```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@<OCI_VM_PUBLIC_IP>
```

Execute baseline hardening and Docker installation:
```bash
# 1. Update OS packages
sudo apt update && sudo apt upgrade -y

# 2. Install Docker Engine and Docker Compose Plugin
sudo apt install -y ca-certificates curl gnupg lsb-release
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin git ufw

# 3. Add deploy user to docker group
sudo usermod -aG docker $USER

# 4. Enable host-level UFW firewall
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw enable
```

---

## 4. Directory Structure & Secret Configuration

Create application directory on OCI instance:
```bash
sudo mkdir -p /opt/careos
sudo chown -R $USER:$USER /opt/careos
cd /opt/careos
```

Create `/opt/careos/.env` with strict permissions:
```bash
cat << 'EOF' > /opt/careos/.env
NODE_ENV=production
LOG_LEVEL=info
SUPABASE_URL=https://vbckrirksziluvwqpamx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<SECRET_SERVICE_ROLE_KEY>
POLL_INTERVAL_MS=3000
LEASE_DURATION_SECONDS=60
WORKER_CONCURRENCY=3
EOF

chmod 600 /opt/careos/.env
```

---

## 5. Deployment & Execution via Docker Compose

Transfer `docker-compose.yml` and repository source (or pre-built ARM64 Docker image from private registry) to `/opt/careos/`.

Build and start the container:
```bash
cd /opt/careos
docker compose up -d --build
```

Verify running container:
```bash
docker ps
```
Output should show `careos-worker` with status `Up (healthy)` and **no published ports**.

---

## 6. Systemd Integration for Automatic Boot Restart

Create `/etc/systemd/system/careos-worker.service`:
```ini
[Unit]
Description=CareOS Background Worker Container
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/careos
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable careos-worker.service
```

---

## 7. Logs, Monitoring & Updates

### Viewing Realtime Worker Logs
```bash
docker logs -f careos-worker
```

### Resource Utilization Inspection
```bash
docker stats careos-worker --no-stream
```

### Applying Worker Code Updates
```bash
cd /opt/careos
git pull origin main
docker compose build --no-cache
docker compose up -d --force-recreate
```

### Crash Recovery Verification
- If the OCI VM restarts unexpectedly, Docker and systemd automatically restart `careos-worker`.
- The worker executes crash recovery on boot: any jobs left in `processing` status whose leases expired (`lease_expires_at < now()`) are reclaimed and re-executed.
