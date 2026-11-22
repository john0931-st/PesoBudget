# PesoBudget — Smart Philippine Payroll & Expense Tracker

An offline-ready spreadsheet and personal budget workbook built specifically for **Philippine payroll cycles** (**Monthly** and **15th Kinsenas** cutoffs), with automatic cash/digital calculations, Light & Dark themes, cell merging, cloud sync, portable HTML export, Android APK project export, and an interactive searchable PDF User Manual.

---

## Key Features

- **Dual-Cutoff Payroll Spreadsheet**: Track **Monthly** and **15th Kinsenas** obligations, base salaries, and carried-over previous balances side by side.
- **Automatic Budget Formulas**:
  - **Metrobank**: Auto-sums cash obligations (House/Rent, Loans, Utilities, Meals, Load, Others) and tracks actual ATM cash withdrawn in Remarks.
  - **QR PH**: Tracks digital / QR PH payments included automatically in combined totals.
  - **Total**: Automatically computes `Metrobank + QR PH`.
  - **Salary Breakdown & Balance**: Displays a distinct Violet **Salary** row (tap to open **Breakdown** in the floating action bar) and automatically computes `(Salary - Total) - (Pag-IBIG MP2 + GoTyme)` on the **Balance** row with a soft pulsing Rose alert whenever negative.
- **Flexible & Adaptive Sheet Workspace**:
  - Centered table titles, keyboard-first `Ctrl+Z` / `Ctrl+Y` Undo & Redo, and centered Remarks Filter Strip & Quick Settle controls.
  - Inline formula editing (`=1200+450`), dynamic category renaming across sheets/summaries/charts/reports, **Merge & Unmerge Cells**, cell sticky notes, international **Currency Switcher**, and modern fintech **Settled / Deferred / Clear (`—`)** bill remarks.
- **Analytics, Sync & Audit History**: Interactive **Summary** cards, **Charts** visualizations (keeping locked Pag-IBIG MP2 and withdrawable savings separated), centered live KPI metrics strip, top-anchored toast notifications, background public link health monitoring, and a timestamped **Audit Change Log**.
- **True Offline PWA & Verified Cloud Auth**: Full offline accessibility with protected offline edit queuing (prompting Upload vs Discard on reconnect), strict 6-digit Gmail OTP verification on Google Sign-In, Interactive Welcome Tour, Developer Admin Console, and Dark Mode default.
- **Automatic Releases & GitHub Sync**: Builds automatically compute semantic versions, sync `package.json` & `README.md`, update the User Manual (PDF), and publish automated GitHub releases, labels, and repo descriptions via `.github/workflows/auto-release.yml`.

---

## Latest Releases (Auto-Updated)

<!-- AUTO-RELEASE-START -->
**Current Version:** `v2.5.0` — *Workspace, Offline Sync & Strict Auth Release*

- Dynamically updates renamed category labels across sheets, summaries, charts, and exports.
- Enables true offline mode on the public link with permanent offline edit upload & discard controls.
- Adds 6-digit Gmail OTP verification for Google Sign-In, Onboarding Tour, Top Toasts, Public Link Monitor, and Developer Admin Console.
<!-- AUTO-RELEASE-END -->

---

## Included Downloads & Deliverables (Generated via In-App Settings)

Open **Settings** inside the app to export the ready-to-distribute packages directly:

1. **Portable App ZIP (`PesoBudget/` Offline HTML Bundle)**
   - Location: **Settings → Download `PesoBudget/` ZIP**
   - Self-contained offline `index.html` + `data/*.json` folder with optional AES password encryption for Windows, macOS, Android, and iPhone browsers.
2. **Android Studio Project ZIP (APK Builder)**
   - Location: **Settings → Export Project for Android Studio**
   - Ready-to-open Gradle Android WebView/offline asset project; unzip and open in Android Studio → **Build → Build APK(s)**.
3. **Searchable User Manual & Quick-Start Guide (PDF)**
   - Location: **Settings → User Manual & Quick-Start Guide (PDF) → Download Manual (PDF)**
   - Natively searchable (`Ctrl+F` / `Cmd+F`) portrait A4 PDF with visual screen diagrams, one-sentence explanations for every function, new-user step-by-step guidelines, and auto-synced release notes.

> **Tip for GitHub Releases**: Download the Portable App ZIP, Android Studio ZIP, and User Manual PDF from **Settings** and attach all three files to a **GitHub Release** tag alongside your repository code so visitors can download them directly from the Releases page.

---

## Local Development & Build

### Prerequisites
- Node.js 20+ and `npm`

### Commands

```bash
# Install dependencies
npm install

# Start development server on port 3000
npm run dev

# Type-check source code
npm run lint

# Build production web bundle (outputs to dist/ including version.json)
npm run build
```

---

## Publishing to GitHub from Your Computer

If you downloaded this project folder to your computer, run the following commands inside the project directory to push the source code to your GitHub repository:

```bash
git init
git add .
git commit -m "Initial commit: PesoBudget app with README, portable export, Android export, and PDF manual"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```
