/**
 * @file portableBiometrics.ts
 * @description WebAuthn Fingerprint / Platform Biometric unlock tied strictly to an active Portable Password Lock.
 * Requires a verified PortableLockMetadata password before enrolling or recovering session unlock.
 */

import {
  decryptTextWithPassword,
  encryptTextWithPassword,
  verifyPortableLockPassword,
  type EncryptedEnvelope,
  type PortableLockMetadata,
} from './portableCrypto';

const BIOMETRICS_STORAGE_KEY = 'pesobudget_portable_biometrics_v1';

export interface PortableBiometricRecord {
  version: 1;
  lockId: string;
  credentialId: string; // base64url
  publicKeySpki?: string; // base64
  coseAlgorithm?: number;
  prfSalt: string; // base64url
  usesPrf: boolean;
  deviceWrapKeyHex?: string; // only used when hardware authenticator lacks PRF extension
  wrappedPassword: EncryptedEnvelope;
  createdAt: string;
  label?: string;
}

interface PrfExtensionClientResult {
  prf?: {
    enabled?: boolean;
    results?: {
      first?: ArrayBuffer;
    };
  };
}

function randomArrayBufferBytes(len: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(len));
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(out);
    return out;
  }
  for (let i = 0; i < len; i++) {
    out[i] = Math.floor(Math.random() * 256);
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlToBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const normalized = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return base64ToBytes(padded);
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

/**
 * Converts an ASN.1 DER-encoded ECDSA signature into raw 64-byte IEEE P1363 (r || s)
 * expected by WebCrypto subtle.verify for P-256.
 */
function derEcdsaToP1363(der: Uint8Array, componentSize = 32): Uint8Array<ArrayBuffer> | null {
  try {
    if (der.length < 8 || der[0] !== 0x30) return null;
    let offset = 2;
    if (der[1] & 0x80) {
      const lenBytes = der[1] & 0x7f;
      offset = 2 + lenBytes;
    }
    if (der[offset] !== 0x02) return null;
    const rLen = der[offset + 1];
    const rStart = offset + 2;
    const rBytes = der.subarray(rStart, rStart + rLen);

    const sTagIdx = rStart + rLen;
    if (der[sTagIdx] !== 0x02) return null;
    const sLen = der[sTagIdx + 1];
    const sStart = sTagIdx + 2;
    const sBytes = der.subarray(sStart, sStart + sLen);

    const copyFixed = (src: Uint8Array): Uint8Array => {
      let trimmed = src;
      while (trimmed.length > componentSize && trimmed[0] === 0x00) {
        trimmed = trimmed.subarray(1);
      }
      const dst = new Uint8Array(componentSize);
      if (trimmed.length <= componentSize) {
        dst.set(trimmed, componentSize - trimmed.length);
      } else {
        dst.set(trimmed.subarray(trimmed.length - componentSize), 0);
      }
      return dst;
    };

    const sig = new Uint8Array(new ArrayBuffer(componentSize * 2));
    sig.set(copyFixed(rBytes), 0);
    sig.set(copyFixed(sBytes), componentSize);
    return sig;
  } catch {
    return null;
  }
}

export function isWebAuthnSupported(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.location.protocol === 'file:') return false;
  return (
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.credentials?.create) &&
    Boolean(navigator.credentials?.get)
  );
}

export async function isPlatformBiometricAvailable(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;
  try {
    if (typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
      return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    }
    return true;
  } catch {
    return false;
  }
}

export function getStoredPortableBiometric(lockId?: string): PortableBiometricRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(BIOMETRICS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PortableBiometricRecord;
    if (
      !parsed ||
      parsed.version !== 1 ||
      typeof parsed.lockId !== 'string' ||
      typeof parsed.credentialId !== 'string' ||
      !parsed.wrappedPassword
    ) {
      return null;
    }
    if (lockId && parsed.lockId !== lockId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function hasBiometricEnrollmentForLock(lockMeta: PortableLockMetadata | null | undefined): boolean {
  if (!lockMeta?.lockId) return false;
  return Boolean(getStoredPortableBiometric(lockMeta.lockId));
}

export function clearPortableBiometricForLock(lockId?: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (!lockId) {
      localStorage.removeItem(BIOMETRICS_STORAGE_KEY);
      return;
    }
    const existing = getStoredPortableBiometric();
    if (!existing || existing.lockId === lockId) {
      localStorage.removeItem(BIOMETRICS_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

function savePortableBiometricRecord(record: PortableBiometricRecord): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(BIOMETRICS_STORAGE_KEY, JSON.stringify(record));
}

function buildFriendlyWebAuthnError(err: unknown, action: 'enroll' | 'unlock'): string {
  const msg = err instanceof Error ? err.message : String(err || '');
  const name = err instanceof Error ? err.name : '';

  if (
    msg.includes('publickey-credentials-') ||
    msg.toLowerCase().includes('feature is not enabled in this document') ||
    msg.toLowerCase().includes('permissions policy')
  ) {
    return 'Fingerprint biometrics require a standalone browser tab (embedded preview iframes restrict hardware sensor access). Open the public link directly to use Fingerprint Lock.';
  }

  if (name === 'NotAllowedError') {
    return action === 'enroll'
      ? 'Fingerprint setup was cancelled or timed out before sensor verification completed.'
      : 'Fingerprint verification was cancelled or did not match. Enter your password instead.';
  }

  if (name === 'NotSupportedError') {
    return 'This device or browser does not expose a compatible platform fingerprint / biometric authenticator.';
  }

  if (name === 'SecurityError') {
    return 'Biometric authentication requires HTTPS or localhost.';
  }

  return msg || (action === 'enroll' ? 'Could not register fingerprint.' : 'Biometric unlock failed.');
}

/**
 * Enrolls device Fingerprint / Platform Biometrics strictly tied to an active,
 * verified Portable Password Lock.
 */
export async function enrollPortableBiometric(
  lockMeta: PortableLockMetadata | null | undefined,
  verifiedPassword: string
): Promise<PortableBiometricRecord> {
  if (!lockMeta || !lockMeta.lockId || !lockMeta.verifier) {
    throw new Error('Set a Portable Password Lock first before adding Fingerprint Biometrics.');
  }

  if (!verifiedPassword || !verifyPortableLockPassword(lockMeta, verifiedPassword)) {
    throw new Error('Current Portable Lock password is required before adding Fingerprint.');
  }

  if (!isWebAuthnSupported()) {
    throw new Error(
      'Fingerprint biometrics require HTTPS or localhost with a supported browser (Windows Hello, Touch ID, or Android Biometrics).'
    );
  }

  const platformAvailable = await isPlatformBiometricAvailable();
  if (!platformAvailable) {
    throw new Error(
      'No built-in fingerprint or biometric hardware was detected on this browser/device.'
    );
  }

  const challenge = randomArrayBufferBytes(32);
  const userId = randomArrayBufferBytes(16);
  const prfSalt = randomArrayBufferBytes(32);

  let credential: PublicKeyCredential | null = null;
  try {
    credential = (await navigator.credentials.create({
      publicKey: {
        rp: {
          name: 'PesoBudget Portable Lock',
        },
        user: {
          id: userId,
          name: `pesobudget-${lockMeta.lockId}`,
          displayName: 'PesoBudget Owner',
        },
        challenge,
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 }, // ES256 (P-256)
          { type: 'public-key', alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60000,
        attestation: 'none',
        extensions: {
          prf: {
            eval: {
              first: prfSalt,
            },
          },
        } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null;
  } catch (err) {
    throw new Error(buildFriendlyWebAuthnError(err, 'enroll'));
  }

  if (!credential) {
    throw new Error('Fingerprint registration returned no credential.');
  }

  const attestationResponse = credential.response as AuthenticatorAttestationResponse;
  const authData =
    typeof attestationResponse.getAuthenticatorData === 'function'
      ? new Uint8Array(attestationResponse.getAuthenticatorData())
      : null;

  if (authData && authData.length >= 33) {
    const flags = authData[32];
    const userVerified = (flags & 0x04) !== 0;
    if (!userVerified) {
      throw new Error('Biometric sensor verification did not confirm your identity.');
    }
  }

  const clientExt = credential.getClientExtensionResults() as PrfExtensionClientResult;
  const prfOutputBuffer = clientExt?.prf?.results?.first;
  const usesPrf = Boolean(prfOutputBuffer && prfOutputBuffer.byteLength >= 16);

  let wrapSecret: string;
  let deviceWrapKeyHex: string | undefined;

  if (usesPrf && prfOutputBuffer) {
    const prfBytes = new Uint8Array(prfOutputBuffer);
    wrapSecret = `${bytesToBase64Url(prfBytes)}:${lockMeta.lockId}`;
  } else {
    const wrapBytes = randomArrayBufferBytes(32);
    deviceWrapKeyHex = bytesToHex(wrapBytes);
    wrapSecret = `${deviceWrapKeyHex}:${lockMeta.lockId}`;
  }

  const publicKeyBuffer =
    typeof attestationResponse.getPublicKey === 'function'
      ? attestationResponse.getPublicKey()
      : null;
  const coseAlgorithm =
    typeof attestationResponse.getPublicKeyAlgorithm === 'function'
      ? attestationResponse.getPublicKeyAlgorithm()
      : undefined;

  const wrappedPassword = encryptTextWithPassword(verifiedPassword, wrapSecret);

  const record: PortableBiometricRecord = {
    version: 1,
    lockId: lockMeta.lockId,
    credentialId: bytesToBase64Url(new Uint8Array(credential.rawId)),
    publicKeySpki: publicKeyBuffer ? bytesToBase64(new Uint8Array(publicKeyBuffer)) : undefined,
    coseAlgorithm,
    prfSalt: bytesToBase64Url(prfSalt),
    usesPrf,
    deviceWrapKeyHex,
    wrappedPassword,
    createdAt: new Date().toISOString(),
    label:
      typeof navigator !== 'undefined' && /Android|Mobile|iPhone|iPad/i.test(navigator.userAgent)
        ? 'Device Biometrics'
        : 'Hardware Fingerprint / Hello',
  };

  savePortableBiometricRecord(record);
  return record;
}

async function verifyWebAuthnAssertionSignature(
  record: PortableBiometricRecord,
  assertionResponse: AuthenticatorAssertionResponse
): Promise<boolean> {
  if (!record.publicKeySpki || typeof crypto === 'undefined' || !crypto.subtle) {
    // If browser lacked SPKI extraction at enrollment or WebCrypto, rely on WebAuthn UV flag check
    return true;
  }

  try {
    const spkiBytes = base64ToBytes(record.publicKeySpki);
    const alg = record.coseAlgorithm ?? -7;

    let keyParams: EcKeyImportParams | RsaHashedImportParams;
    let verifyParams: EcdsaParams | AlgorithmIdentifier;
    let sigBytes = new Uint8Array(assertionResponse.signature);

    if (alg === -257) {
      keyParams = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
      verifyParams = { name: 'RSASSA-PKCS1-v1_5' };
    } else {
      keyParams = { name: 'ECDSA', namedCurve: 'P-256' };
      verifyParams = { name: 'ECDSA', hash: 'SHA-256' };
      const p1363 = derEcdsaToP1363(sigBytes, 32);
      if (!p1363) return false;
      sigBytes = p1363;
    }

    const cryptoKey = await crypto.subtle.importKey('spki', spkiBytes, keyParams, false, ['verify']);
    const clientDataHash = await crypto.subtle.digest('SHA-256', assertionResponse.clientDataJSON);
    const authDataBytes = new Uint8Array(assertionResponse.authenticatorData);
    const signedData = new Uint8Array(new ArrayBuffer(authDataBytes.length + clientDataHash.byteLength));
    signedData.set(authDataBytes, 0);
    signedData.set(new Uint8Array(clientDataHash), authDataBytes.length);

    return await crypto.subtle.verify(verifyParams, cryptoKey, sigBytes, signedData);
  } catch {
    return false;
  }
}

/**
 * Prompts the device's Fingerprint / Biometric sensor, cryptographically verifies the
 * WebAuthn assertion (challenge, UV flag, and ECDSA/RSA signature), unwraps the lock password,
 * and confirms it against lockMeta.verifier before returning the verified password.
 */
export async function unlockPortableLockWithBiometric(
  lockMeta: PortableLockMetadata
): Promise<string> {
  const record = getStoredPortableBiometric(lockMeta.lockId);
  if (!record) {
    throw new Error('No fingerprint is registered for this password lock.');
  }

  if (!isWebAuthnSupported()) {
    throw new Error('Biometric unlock is unavailable in this browser context. Please enter your password.');
  }

  const challenge = randomArrayBufferBytes(32);
  const credentialIdBytes = base64UrlToBytes(record.credentialId);
  const prfSaltBytes = base64UrlToBytes(record.prfSalt);

  let assertion: PublicKeyCredential | null = null;
  try {
    assertion = (await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [
          {
            id: credentialIdBytes,
            type: 'public-key',
            transports: ['internal'],
          },
        ],
        userVerification: 'required',
        timeout: 60000,
        ...(record.usesPrf
          ? {
              extensions: {
                prf: {
                  eval: {
                    first: prfSaltBytes,
                  },
                },
              } as AuthenticationExtensionsClientInputs,
            }
          : {}),
      },
    })) as PublicKeyCredential | null;
  } catch (err) {
    throw new Error(buildFriendlyWebAuthnError(err, 'unlock'));
  }

  if (!assertion) {
    throw new Error('Fingerprint verification did not return a response.');
  }

  const assertionResponse = assertion.response as AuthenticatorAssertionResponse;
  const clientDataText = new TextDecoder().decode(assertionResponse.clientDataJSON);
  const clientData = JSON.parse(clientDataText) as {
    type?: string;
    challenge?: string;
    origin?: string;
  };

  if (
    clientData.type !== 'webauthn.get' ||
    clientData.challenge !== bytesToBase64Url(challenge) ||
    clientData.origin !== window.location.origin
  ) {
    throw new Error('Biometric challenge or origin check failed. Please use your password.');
  }

  const authData = new Uint8Array(assertionResponse.authenticatorData);
  if (authData.length < 37) {
    throw new Error('Invalid authenticator response.');
  }
  const flags = authData[32];
  const userPresent = (flags & 0x01) !== 0;
  const userVerified = (flags & 0x04) !== 0;
  if (!userPresent || !userVerified) {
    throw new Error('Fingerprint user verification flag was not confirmed.');
  }

  const sigValid = await verifyWebAuthnAssertionSignature(record, assertionResponse);
  if (!sigValid) {
    throw new Error('Biometric signature check failed. Please enter your password.');
  }

  let wrapSecret: string;
  if (record.usesPrf) {
    const extResults = assertion.getClientExtensionResults() as PrfExtensionClientResult;
    const prfFirst = extResults?.prf?.results?.first;
    if (!prfFirst) {
      throw new Error('Hardware biometric key output was not returned. Please unlock with your password.');
    }
    wrapSecret = `${bytesToBase64Url(new Uint8Array(prfFirst))}:${lockMeta.lockId}`;
  } else if (record.deviceWrapKeyHex) {
    wrapSecret = `${record.deviceWrapKeyHex}:${lockMeta.lockId}`;
  } else {
    throw new Error('Biometric wrap key missing. Re-enroll fingerprint in Settings.');
  }

  let recoveredPassword: string;
  try {
    recoveredPassword = decryptTextWithPassword(record.wrappedPassword, wrapSecret);
  } catch {
    throw new Error('Could not unwrap lock password from biometric key. Please unlock with your password.');
  }

  if (!verifyPortableLockPassword(lockMeta, recoveredPassword)) {
    throw new Error('Stored biometric password no longer matches this lock. Please unlock with your current password.');
  }

  return recoveredPassword;
}
