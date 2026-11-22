# HALA CHAT — PHASE 4.1.8: STAGE A
## GCP PROJECT & INFRASTRUCTURE ISOLATION PLAN

**Phase:** 4.1.8  
**Mode:** Stage A — Staging Environment Design  
**Status:** DESIGN COMPLETE — PENDING STAGE B AUTHORIZATION  

---

## 1. MANDATORY NAMING CONVENTIONS

To ensure 100% technical and visual distinction between production and staging resources, all staging assets strictly adhere to the following naming specification:

```
+-----------------------------------------------------------------------------------+
|                           STAGING RESOURCE NAMING SPEC                            |
+-----------------------------------------------------------------------------------+
 1. Staging GCP Project ID     : hala-chat-staging-efac1993
 2. Staging GCS Bucket Name    : hala-chat-staging-media-efac1993
 3. Dedicated Service Account  : v5-migration-tester@hala-chat-staging-efac1993.iam.gserviceaccount.com
 4. Root Test Namespace        : test_runs/<test_run_id>/
 5. Synthetic Media Namespace  : test_runs/<test_run_id>/synthetic_media/
 6. Migration Simulation Path  : test_runs/<test_run_id>/migration_simulation/
 7. Failure Injection Path     : test_runs/<test_run_id>/failure_injection/
+-----------------------------------------------------------------------------------+
```

---

## 2. STRUCTURAL ISOLATION BOUNDARIES

```
+--------------------------------------+      +--------------------------------------+
|       PRODUCTION ENVIRONMENT         |      |         STAGING ENVIRONMENT          |
|  (STRICTLY BLOCKED & UNTOUCHED)      |      |     (PROPOSED FOR STAGE B SETUP)     |
+--------------------------------------+      +--------------------------------------+
| Project ID: gen-lang-client-0446...  |      | Project ID: hala-chat-staging-efac...|
| Firebase DB: ai-studio-hala-efac...  |  X   | Staging DB: hala-staging-db          |
| Storage: ai-studio-hala-...appspot   |  X   | Storage: hala-chat-staging-media-... |
| User Data: Real encrypted messages   |      | User Data: 100% Synthetic Test Data  |
| SA: Production Applet Default SA     |      | SA: v5-migration-tester (Scoped IAM) |
+--------------------------------------+      +--------------------------------------+
```

### Boundary Isolation Protections
1. **Network Boundary:** Staging scripts instantiate GCP SDK instances targeting strictly `hala-chat-staging-efac1993`.
2. **Credential Boundary:** Staging credentials possess **zero IAM permissions** on production project `gen-lang-client-0446181078`.
3. **Data Boundary:** Zero production Firestore documents, user accounts, or GCS objects will be read, copied, or referenced.
4. **Safety Interlock:** Test execution scripts verify `process.env.GCP_PROJECT === 'hala-chat-staging-efac1993'`. If `GCP_PROJECT` matches production or is undefined, execution terminates instantly.
