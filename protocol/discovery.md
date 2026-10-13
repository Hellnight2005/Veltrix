# LocalDrop Protocol — Discovery & Identity Specification

## 1. Overview

LocalDrop requires devices on the same local network to discover each other effortlessly without cloud mediation, directory servers, or user IP configuration. 

Because local networks vary widely (multicast filtering on enterprise Wi-Fi, AP isolation, VPN adapters), LocalDrop adopts a **tri-tiered discovery strategy**:
1. **Primary:** Multicast DNS (mDNS) / DNS-SD.
2. **Fallback:** UDP broadcast discovery.
3. **Manual Direct Connection:** Direct `ip:port` input when all multicast/broadcast discovery is suppressed by network equipment.

---

## 2. Device Identity

Every LocalDrop installation possesses a persistent, cryptographically generated UUID (version 4) saved in the user configuration directory:

```text
Identity Model:
- device_id: UUID (128-bit / 16 bytes)
- device_name: UTF-8 String (e.g. "Abhijeet-PC", max 64 bytes)
- platform: UTF-8 String ("windows" | "android" | "linux" | "macos" | "ios")
```

> **Strict Privacy Rule:** Hardware MAC addresses, IMEIs, or identifiable hardware serial numbers **must never** be broadcast, logged, or used as identifiers.

---

## 3. Primary Discovery: mDNS (DNS-SD)

### 3.1 Service Registration

Each active engine instance advertises a DNS-SD service instance:

* **Service Type:** `_localdrop._tcp.local.`
* **Instance Name:** `<device_name> (<short_id>)` (e.g. `Abhijeet-PC (a1b2)`)
* **Transport Protocol:** `TCP`
* **Default Port:** `8080` (or dynamically allocated port if bound)

### 3.2 TXT Record Attributes

| Key | Example Value | Description |
|---|---|---|
| `id` | `550e8400-e29b-41d4-a716-446655440000` | Device UUID. |
| `name` | `Abhijeet-PC` | Sanitized display name. |
| `platform` | `windows` | Host operating system. |
| `proto` | `1.0` | Supported protocol version (`major.minor`). |
| `port` | `8080` | TCP engine listening port. |

### 3.3 Browsing & Resolution

The engine runs a background mDNS browser querying for `_localdrop._tcp.local.`:
* When a service instance is resolved, the engine extracts the TXT records and socket addresses.
* If the `id` matches the local node's own `device_id`, the advertisement is ignored (loopback suppression).
* If a new peer is discovered, a `DeviceFound` event is dispatched.

---

## 4. Fallback Discovery: UDP Broadcast

When mDNS multicast packets are dropped by routers, UDP broadcast serves as a lightweight fallback.

* **Broadcast Port:** `8765` (UDP)
* **Target Address:** `255.255.255.255:8765` (or subnet broadcast address)

### 4.1 Discovery Request (`DISCOVER_LOCALDROP`)

Sent periodically or on-demand when user opens the device discovery view:

```json
{
  "type": "DISCOVER",
  "protocol_version": 1,
  "sender_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

### 4.2 Discovery Response (`ANNOUNCE_LOCALDROP`)

Listening peers reply directly (unicast) to the requester's IP and port:

```json
{
  "type": "ANNOUNCE",
  "protocol_version": 1,
  "device_id": "7b2d56a1-872e-4b69-9df8-01142981beef",
  "device_name": "LivingRoom-Laptop",
  "platform": "windows",
  "tcp_port": 8080
}
```

---

## 5. Device Registry & Lifecycle

The engine maintains an in-memory `DeviceRegistry` to prevent stale entries and avoid duplicate connection attempts:

| Event | Trigger | Registry Action |
|---|---|---|
| **Discovered** | mDNS resolve or UDP announce received | Insert device record; start/refresh TTL timer; emit `DeviceFound`. |
| **Heartbeat** | Periodic advertisement refreshed | Reset TTL countdown to `60` seconds. |
| **Expired** | No advertisement received within `60` seconds | Mark unreachable; emit `DeviceLost`; remove entry. |
| **Explicit Goodbye** | Peer engine shutting down cleanly | Immediately remove entry; emit `DeviceLost`. |

---

## 6. Network Diagnostics & Failure Explanations

If discovery produces zero results, the engine executes local network heuristics and reports diagnostics:

1. **AP / Client Isolation:** Detectable when engine binds successfully to Wi-Fi adapter and receives no replies to broadcast, but local gateway responds. The UI informs: *"Your Wi-Fi router may have Client Isolation enabled. Try connecting directly via manual IP or use a mobile hotspot."*
2. **Active VPN Adapter:** If a TUN/TAP virtual adapter is active, mDNS multicast may be routed into the VPN tunnel rather than local Wi-Fi. The engine recommends: *"VPN detected. LocalDrop may need local network traffic exempted in your VPN settings."*
3. **Firewall Blocking:** If incoming binding or UDP broadcast fails with permission denied, guide the user to Windows Defender Firewall rules.
