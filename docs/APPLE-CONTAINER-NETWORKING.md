# Apple Container Networking Setup (macOS 26)

This document is maintained upstream. See the full guide at:

👉 **[NanoClaw — Apple Container Networking](https://github.com/qwibitai/nanoclaw/blob/main/docs/APPLE-CONTAINER-NETWORKING.md)**

## Quick Summary

Apple Container's vmnet networking requires manual configuration for internet access from containers. Two commands:

```bash
sudo sysctl -w net.inet.ip.forwarding=1
echo "nat on en0 from 192.168.64.0/24 to any -> (en0)" | sudo pfctl -ef -
```

> Replace `en0` with your active interface: `route get 8.8.8.8 | grep interface`

See the upstream doc for persistence, IPv6 DNS workarounds, verification steps, and troubleshooting.
