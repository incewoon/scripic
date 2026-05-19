## Plan: Add file-type and size validation to photo upload

### Goal
When users upload photos on the album-creation screen, enforce:
- Only image files allowed (block video, audio, and other non-image types).
- Maximum file size of 10 MB.
- A modal popup (not just a toast) that clearly explains which restriction was violated.

### Scope
- **In scope:** Photo picker on `/create` (`src/routes/create.tsx`).
- **Out of scope:** Review-reward screenshot upload (`ReviewRewardDialog`) — not mentioned by the user.

### Implementation

#### 1. Add i18n strings (`src/lib/i18n.ts`)
New keys for both `en` and `ko`:
- `uploadLimitTitle` — popup title, e.g. "Unable to add file"
- `uploadLimitType` — message for non-image files, e.g. "Only image files can be uploaded."
- `uploadLimitSize` — message for oversized files, e.g. "File size must not exceed 10 MB."
- `uploadLimitOk` — confirmation button, e.g. "Got it"

#### 2. Create modal component (`src/components/UploadLimitDialog.tsx`)
Reuse the existing warm-modal style (rounded-3xl, gradient-warm icon, primary button). Accept props:
- `open: boolean`
- `onClose: () => void`
- `reason: "type" | "size"`

Render the corresponding i18n message based on `reason`.

#### 3. Update upload handler (`src/routes/create.tsx`)
In the `onPick` handler, before processing files:
1. Inspect each selected file:
   - Check `file.type.startsWith("image/")` and fall back to an allowed-extension list (e.g. jpg, jpeg, png, gif, webp, heic, heif).
   - Check `file.size <= 10 * 1024 * 1024`.
2. If **any** file fails either check:
   - Do **not** add any files yet.
   - Set popup state with the first violated reason (`type` or `size`).
   - Show `UploadLimitDialog`.
3. If the user dismisses the popup and picks again with valid files, proceed normally (resize, extract meta, add to grid).

`accept="image/*"` stays on the `<input>` as a first-line filter, but the JS validation is the real gate because mobile OS pickers can still slip through video/Live Photo items under `image/*`.

#### 4. No backend changes required
Validation is purely client-side before the app ever reads file contents.
