# HALA CHAT — PHASE 4.1.8.3: MANUAL PROVISIONING GUIDE
## STEP-BY-STEP GOOGLE CLOUD CONSOLE PROVISIONING INSTRUCTIONS

**Phase:** Phase 4.1.8.3  
**Mode:** Guided Manual Provisioning & Verification Workflow  
**Target Project ID:** `hala-chat-staging-efac1993`  
**Target GCS Bucket:** `gs://hala-chat-staging-media-efac1993`  
**Status:** GUIDE COMPLETE — AWAITING USER CONSOLE EXECUTION & LIFECYCLE SELECTION (OPTION A vs OPTION B)  

---

## 1. SAFETY & ISOLATION PRE-CHECK

Before performing any console operation, verify:
- You are logged into the correct Google Cloud account with permissions to create projects and billing budgets.
- The active GCP Console project selector does **NOT** display any production project (e.g., `gen-lang-client-...`).

---

## 2. STEP-BY-STEP CONSOLE INSTRUCTIONS

### Step A — GCP Project Creation
1. **Console Navigation:** Go to [Google Cloud Console Project Selector](https://console.cloud.google.com/projectselector2/home/dashboard).
2. **Action:** Click **Create Project**.
3. **Configuration Values:**
   - **Project Name:** `Hala Chat Staging`
   - **Project ID:** `hala-chat-staging-efac1993` *(Ensure exact match; do not substitute).*
   - **Billing Account:** Select your intended non-production billing account.
   - **Location / Organization:** Select your organization or leave as No organization.
4. **Action:** Click **Create**. Switch to the newly created project `hala-chat-staging-efac1993`.

### Step B — Billing Budget Alert Setup
1. **Console Navigation:** Go to **Billing** > **Budgets & alerts**.
2. **Action:** Click **Create Budget**.
3. **Configuration Values:**
   - **Name:** `Hala Staging Monthly Cap ($5)`
   - **Projects:** Select `hala-chat-staging-efac1993`.
   - **Scope:** All services.
   - **Amount:** Target amount -> Currency: USD, Amount: `5.00`.
   - **Thresholds:** Set alerts at `40%` ($2.00), `80%` ($4.00), and `100%` ($5.00).
4. **Action:** Click **Save**. *(Note: Budget alerts are notification-only mechanisms and do NOT constitute hard spending caps).*

### Step C — GCS Bucket Creation
1. **Console Navigation:** Go to **Cloud Storage** > **Buckets**.
2. **Action:** Click **Create Bucket**.
3. **Configuration Values:**
   - **Name your bucket:** `hala-chat-staging-media-efac1993`.
   - **Where to store your data:** Region -> `europe-west1` (Belgium).
   - **Choose how to control access to objects:** Enforce public access prevention on this bucket (**Checked** / Enabled) & Enforce uniform bucket-level access (**Checked** / Enabled).
   - **Choose how to protect objects:** Select **Object Versioning** (Enabled).
4. **Action:** Click **Create**. *(Do not apply lifecycle rules until you select Option A or Option B in `PHASE_4_1_8_3_COST_AND_LIFECYCLE_DECISION.md`).*

### Step D — IAM Service Account Creation
1. **Console Navigation:** Go to **IAM & Admin** > **Service Accounts**.
2. **Action:** Click **Create Service Account**.
3. **Configuration Values:**
   - **Service account name:** `v5-migration-tester`.
   - **Service account ID:** `v5-migration-tester` (resulting in `v5-migration-tester@hala-chat-staging-efac1993.iam.gserviceaccount.com`).
4. **Action:** Click **Create and Continue**.
5. **Grant Role:** Select `Storage Object User` (`roles/storage.objectUser`). Click **Continue** and **Done**.
6. **Add IAM Condition:** Click on the service account, go to **Permissions**, locate `Storage Object User`, and add the conditional expression:
   ```json
   resource.type == 'storage.googleapis.com/Bucket' || (resource.type == 'storage.googleapis.com/Object' && resource.name.startsWith('projects/_/buckets/hala-chat-staging-media-efac1993/objects/test_runs/'))
   ```
7. **Action:** Click **Save**.

### Step E — Firebase & Firestore Database Creation
1. **Console Navigation:** Go to [Firebase Console](https://console.firebase.google.com/).
2. **Action:** Click **Add project** (or **Create project**), select existing project `hala-chat-staging-efac1993`, and follow prompts.
3. **Firestore Setup:** In Firebase Console, navigate to **Firestore Database** > **Create Database**.
4. **Configuration Values:**
   - **Database ID:** `hala-staging-db` *(Exact match required).*
   - **Location:** `europe-west1`.
   - **Security Rules:** Start in **locked mode** (rules will be deployed later via test runner).
5. **Action:** Click **Enable**.
