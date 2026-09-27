# Firebase and GitHub

Firebase project: `gen-lang-client-0446181078` (Hala-Chat).
Repository: `isolutions365/hala-chat`.

The application already uses this project's SDK configuration, including its named Firestore database. The Hosting config serves Vite's `dist` output with an SPA fallback. It does not deploy database rules.

The standard Firebase GitHub wizard was blocked by the organization's service-account key policy. Deployment instead uses Workload Identity Federation, with no service-account private key in GitHub. Trust is limited to repository ID `1389588981`, owner ID `218146967`, `refs/heads/main`, and `workflow_dispatch` events. The deployment account has Hosting Admin and Service Usage Consumer roles only.

After merging, open GitHub Actions, select **Firebase Hosting preview**, and run it on `main`. It installs dependencies from `bun.lock`, type-checks, builds, authenticates, and deploys a one-day `github-preview` channel. The deploy log contains the preview URL. No automatic production deployment is enabled.

Preview hosting still uses the app's configured Firebase backend; it is not an isolated test database. Do not use real user data for testing until the existing permissive Firestore rules and OTP demo fallback are fixed. The OTP fix is tracked separately in PR #1. This integration does not merge that patch or change deployed Firebase rules.

The organization policy prohibiting private-key creation remains unchanged. IAM changes should preserve the repository/owner numeric ID and main-branch restrictions.
