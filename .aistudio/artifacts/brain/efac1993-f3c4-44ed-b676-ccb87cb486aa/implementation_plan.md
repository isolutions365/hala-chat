# Implementation Plan: Remove Voice Note Upload UI Feedback

The user has requested to remove the "Compressing & uploading..." text and progress bar when a voice note is being uploaded, preferring that this process happens silently in the background while still maintaining correct functionality.

## Changes Required

### 1. `src/components/ConversationScreen.tsx`
- Locate the rendering logic for voice messages (`isVoice` branch).
- Remove the conditional rendering block that displays the upload progress bar and text:
  ```tsx
  {(msg.status === 'sending' || (voiceProgress !== undefined && voiceProgress < 100)) && (
    <div className="w-full px-1 py-0.5">
      ...
    </div>
  )}
  ```
- Ensure the message remains visible in the list with `status: 'sending'` to represent the ongoing upload without the intrusive UI.

## Verification Plan
- Record a voice note and send it.
- Observe that the upload completes successfully (as verified by message status updating) without the "Compressing & uploading..." UI appearing.
- Run `compile_applet` and `lint_applet` to ensure no regression or type issues.
