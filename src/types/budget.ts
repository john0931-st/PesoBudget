/**
 * @file budget.ts
 * @description Core TypeScript type definitions and interfaces for PesoBudget & Salary Monitoring 2026.
 * Includes complete models for spreadsheet rows, cells, monthly periods, 2FA Google security, and automated cloud backups.
 * Zero personal information or hardcoded credentials are stored.
 */

// Unique identifier for fixed standard spreadsheet rows
export type StandardRowId =
  | 'rent'
  | 'loan'
  | 'water_bill'
  | 'electric_bill'
  | 'gas'
  | 'meal'
  | 'mobile_load'
  | 'others'
  | 'lazada'
  | 'qr_ph'
  | 'metrobank'
  | 'total'
  | 'salary'
  | 'balance'
  | 'mp2'
  | 'gotyme';

// Standard row IDs that are merged across Monthly and Kinsenas columns
export const MERGED_ROW_IDS: StandardRowId[] = [
  'qr_ph',
  'metrobank',
  'total',
  'salary',
  'balance',
  'mp2',
  'gotyme',
];

// String representation of row keys (supports dynamic loan lines like loan_172900000)
export type RowId = string;

// Standard remarks options for expense and payroll items
export type StandardRemarkOption = 'OK' | 'Next Payroll' | '';

// Standard column identifiers across the budget spreadsheet
export type StandardCellColumn = 'payments' | 'monthly' | 'cutoff15th' | 'remarks';

// Column identifiers (includes dynamic custom column IDs like col_172900000)
export type CellColumn = StandardCellColumn | string;

// Data formatting type for custom columns
export type CustomColumnType = 'currency' | 'text';

// Definition of a user-added spreadsheet column
export interface CustomColumnDef {
  id: string;
  label: string;
  type: CustomColumnType;
}

/**
 * Interface representing individual cell data in the spreadsheet.
 */
export interface CellData {
  // Evaluated numeric value used for calculations and totals
  value: number;
  // Raw input string as entered by the user (e.g. "=100+100", "2500", or "")
  rawInput: string;
  // Preserved formula expression if a formula was evaluated
  formula?: string;
  // Excel-compatible cell comment / note
  note?: string;
}

/**
 * Breakdown of monthly salary and previous balance carry-over.
 */
export interface SalaryBreakdown {
  // Base take-home salary for the period
  baseSalary: number;
  // Unspent or deficit balance carried over from previous payroll
  previousBalance: number;
  // Optional note for payroll adjustment or deduction
  note?: string;
}

// Horizontal merge range spanning contiguous columns inside a row
export interface CellMergeRange {
  startCol: CellColumn;
  endCol: CellColumn;
}

/**
 * Complete state for each spreadsheet row.
 */
export interface BudgetRowState {
  // Unique row identifier
  id: RowId;
  // Display label shown in the Payments column (editable by user)
  label: string;
  // Note attached to the Payments label cell
  labelNote?: string;
  // Cell data for the Monthly column
  monthly: CellData;
  // Cell data for the Kinsenas (15th cutoff) column
  cutoff15th: CellData;
  // Remarks content: 'OK' | 'Next Payroll' for expenses, numeric for withdrawn money, auto for totals
  remarks: string;
  // Note attached to the Remarks cell
  remarksNote?: string;
  // Cell data map for user-added dynamic columns keyed by custom column ID
  customCells?: Record<string, CellData>;
  /**
   * Explicit horizontal cell merges on this row (each entry spans from startCol to endCol).
   * When undefined on a standard row in MERGED_ROW_IDS, Monthly + Kinsenas is merged by default.
   * Setting mergedRanges to [] explicitly unmerges the row.
   */
  mergedRanges?: CellMergeRange[];
  // Flag indicating whether this row's value is summed into Metrobank auto-computation
  isAutoMetrobank?: boolean;
  // Classification category for styling and aggregation
  rowType: 'expense' | 'savings' | 'bank_subtotal' | 'digital_payment' | 'grand_total' | 'income' | 'balance';
  // If true, user cannot manually edit the monthly cell (auto-computed)
  readOnlyMonthly?: boolean;
  // If true, user cannot manually edit the kinsenas cell (auto-computed)
  readOnly15th?: boolean;
  // Flag indicating this row was dynamically added by user (e.g. additional loan line)
  isCustomRow?: boolean;
}

/**
 * Complete state for a single calendar month's budget sheet.
 */
export interface MonthData {
  // Unique identifier for the month (e.g. "2026-10")
  id: string;
  // Human-readable month title (e.g. "October 2026")
  name: string;
  // Editable spreadsheet header title (e.g. "SALARY MONITORING 2026")
  sheetTitle?: string;
  // Calendar year of the sheet (e.g. 2025, 2026)
  year?: number;
  // Custom display order of rows in the spreadsheet
  rowOrder?: string[];
  // Salary and carry-over configuration for both Monthly and 15th Kinsenas
  salaryBreakdown: {
    monthly: SalaryBreakdown;
    cutoff15th: SalaryBreakdown;
  };
  // Map of all row states keyed by rowId
  rows: Record<RowId, BudgetRowState>;
  // Editable column headers (PAYMENTS, MONTHLY, KINSENAS, REMARKS) + custom columns & order
  columnHeaders?: {
    payments?: string;
    monthly?: string;
    cutoff15th?: string;
    remarks?: string;
    columnOrder?: string[];
    customColumns?: CustomColumnDef[];
  };
  // ISO timestamp of last update
  updatedAt: string;
}

// Navigation tabs for the application
export type ActiveTab = 'sheet' | 'charts' | 'summary' | 'changelog';

/**
 * User security and Google account authentication profile.
 * Supports authentic Google Sign-In with 2FA verification via Email or SMS Text Message,
 * followed by WebAuthn platform biometrics (Fingerprint / Face ID) and automated cloud sync.
 */
export interface UserSecurityProfile {
  // Flag indicating whether user has signed in with Google
  isAuthenticated: boolean;
  // User's Google email address (no personal info hardcoded)
  email: string;
  // User's Google account display name
  name: string;
  // User's Google profile picture URL or placeholder
  picture?: string;
  // User's registered phone number for SMS 2-step verification
  phoneNumber?: string;
  // Whether Two-Factor Authentication is enabled (mandatory for APK security)
  has2FA: boolean;
  // Current active 2FA method: email verification, text message (SMS), or biometrics
  twoFactorMethod?: 'email' | 'sms' | 'biometric';
  // Flag whether email was verified via 6-digit OTP
  isEmailVerified?: boolean;
  // Flag whether phone number was verified via 6-digit OTP
  isPhoneVerified?: boolean;
  // 6-digit 2FA Security PIN / TOTP backup code
  twoFactorPin?: string;
  // Whether biometric authentication (Fingerprint / Face ID via WebAuthn) is registered
  hasBiometrics: boolean;
  // Whether biometrics are actively bound to the authenticated Google account
  biometricBound?: boolean;
  // WebAuthn registered credential ID if available
  biometricCredentialId?: string;
  // Flag tracking whether the current app session has passed 2FA verification
  isSessionUnlocked?: boolean;
  // Whether automatic cloud backup is enabled on every data change
  autoBackupEnabled?: boolean;
  // Whether automatic cloud restore is enabled when opening on a new device
  autoRestoreEnabled?: boolean;
  // Real-time synchronization status
  backupSyncStatus?: 'synced' | 'syncing' | 'offline' | 'idle';
  // ISO timestamp of the most recent automated cloud backup
  lastBackupTime?: string;
  // Total number of cloud backup snapshots stored
  backupCount: number;
  // Server-verified role ('admin' | 'user')
  role?: 'admin' | 'user';
  // Admin-managed account access status
  accessStatus?: 'pending' | 'approved' | 'blocked';
  // ISO timestamp when 6-digit Gmail OTP verification succeeded
  otpVerifiedAt?: string;
  // Authenticated Firebase UID
  firebaseUid?: string;
}

export type UserRole = 'admin' | 'user';
export type UserAccessStatus = 'pending' | 'approved' | 'blocked';

export interface AdminUserRecord {
  uid: string;
  email: string;
  displayName: string;
  photoUrl?: string;
  role: UserRole;
  status: UserAccessStatus;
  otpVerifiedAt?: string;
  lastLoginAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TopToastItem {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  title: string;
  message?: string;
  durationMs?: number;
}

/**
 * Timestamped snapshot of budget data backed up to Google Cloud.
 */
export interface CloudBackupRecord {
  // Unique backup snapshot identifier
  id: string;
  // ISO timestamp when backup was generated
  timestamp: string;
  // Device and platform metadata (e.g. Android APK, Desktop Browser)
  deviceInfo: string;
  // Number of months included in the backup
  monthsCount: number;
  // Complete snapshot of all months data
  data: Record<string, MonthData>;
  // Checksum or version marker
  version?: string;
}
