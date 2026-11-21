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
  - Adaptive screen-resolution table sizing and typography from mobile to desktop with clean vertical-only scrolling.
  - Drag-and-drop and floating bar Up/Down arrow controls to reorder expense rows manually with smooth animations.
  - Inline formula editing (`=1200+450`), dedicated **Edit Formula (`fx`)** modal, **Merge & Unmerge Cells**, custom rows/columns, cell sticky notes, international **Currency Switcher**, and modern fintech **Settled / Deferred / Clear (`—`)** bill remarks.
- **Analytics, Sync & Audit History**: Interactive **Summary** cards, **Charts** visualizations, centered live KPI metrics strip, real-time **Auto-Save & Sync** status badge, and a timestamped **Audit Change Log**.
- **Light / Dark Theme & PWA Support**: Instant Light/Dark mode switch, offline queue, and installable Progressive Web App support.
- **Automatic Release Updates**: Builds automatically compute semantic versions, Asia/Manila timestamps, and release changelogs (`dist/version.json`) with a public-link **What Changed** popup.

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
