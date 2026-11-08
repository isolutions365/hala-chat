# HALA CHAT — COMMUNITY AND BUSINESS ECOSYSTEM V1.0

**Document Class:** Product Division Architecture Specification  
**Author:** Principal Systems Architect & Senior Product Manager  
**Scope:** Community Servers, Channels, Business Profiles, Mini App Sandbox & Developer APIs  
**Status:** COMPLETE & REGULATION-AWARE  

---

## 1. COMMUNITY ECOSYSTEM ARCHITECTURE (DIVISION C)

```
+-----------------------------------------------------------------------------------+
|                        COMMUNITY ARCHITECTURE HIERARCHY                           |
+-----------------------------------------------------------------------------------+
 [GROUPS]          ───► 1 to 1,000 members; E2EE symmetric group keys; admin roles
 [CHANNELS]        ───► Unlimited subscribers; Storage V5 public/private access rules
 [COMMUNITY SERVERS]──► Discord-style servers; organized Category Text & Voice Rooms
+-----------------------------------------------------------------------------------+
```

### 1.1 Discord-Style Community Servers (`/servers/{serverId}`)
- **Server Structure:** Custom icon, banner, and description. Organized into category folders (e.g., `#general`, `#announcements`, `🔊 Lounge Voice Room`).
- **Always-On Ambient Voice Rooms:** Members join/leave voice rooms without initiating a call invitation. Powered by low-latency WebRTC SFU nodes.
- **Role Permission Inheritance:** Custom roles (e.g. `@Admin`, `@Moderator`, `@VIP Member`) with granular permission flags (`CAN_SEND_MESSAGES`, `CAN_MANAGE_ROLES`, `CAN_MUTE_MEMBERS`).

---

## 2. BUSINESS & DIGITAL SERVICES ECOSYSTEM (DIVISION F)

1. **Verified Business Profiles (`/business/{businessId}`):**  
   - Business category label, verified checkmark, physical store address, operating hours, and customer support chat button.
2. **Product & Service Catalogs:**  
   - In-app catalog showing products with photos, prices, descriptions, and "Order in Chat" action.
3. **PWA Mini Application Container Framework:**  
   - Sandboxed WebApp container (similar to Telegram Mini Apps / WeChat Mini Programs) allowing third-party developers to embed interactive services (food ordering, ticket booking, games) directly inside Hala Chat tabs.
4. **Developer APIs & Webhooks:**  
   - Secure REST and WebSocket APIs enabling business backends to send order updates, support messages, and automated receipts.
5. **Regulatory & Compliance Isolation:**  
   - Financial transactions and payment processing are isolated to licensed regional payment providers per country regulation.
