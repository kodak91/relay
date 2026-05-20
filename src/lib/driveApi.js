import { GoogleAuthProvider, reauthenticateWithPopup, signInWithPopup } from 'firebase/auth';
import { auth } from './firebase';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const API = 'https://www.googleapis.com/drive/v3';
const TOKEN_KEY = 'relay_drive_token';
const TOKEN_EXP_KEY = 'relay_drive_token_exp';

// ── OAuth ──────────────────────────────────────────────────────────────────
export async function requestDriveAccess() {
  const provider = new GoogleAuthProvider();
  provider.addScope(DRIVE_SCOPE);
  provider.setCustomParameters({ prompt: 'consent' });

  let result;
  if (auth.currentUser) {
    result = await reauthenticateWithPopup(auth.currentUser, provider);
  } else {
    result = await signInWithPopup(auth, provider);
  }

  const credential = GoogleAuthProvider.credentialFromResult(result);
  const token = credential?.accessToken;
  if (!token) throw new Error('Drive 접근 토큰을 받지 못했습니다.');

  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(TOKEN_EXP_KEY, (Date.now() + 55 * 60 * 1000).toString());
  return token;
}

export function getStoredToken() {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const exp = parseInt(sessionStorage.getItem(TOKEN_EXP_KEY) || '0', 10);
  if (!token || Date.now() > exp) {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_EXP_KEY);
    return null;
  }
  return token;
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_EXP_KEY);
}

// ── API helpers ────────────────────────────────────────────────────────────
async function driveGet(token, path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err.error?.message || `Drive API 오류 (${res.status})`;
    if (res.status === 401) clearToken();
    throw new Error(msg);
  }
  return res.json();
}

export async function getFolderInfo(token, folderId) {
  return driveGet(token, `/files/${folderId}?fields=id,name,webViewLink`);
}

export async function listFolderFiles(token, folderId) {
  const fields = encodeURIComponent(
    'nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink,thumbnailLink,iconLink,owners)'
  );
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const all = [];
  let pageToken = '';
  do {
    const pt = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
    const data = await driveGet(token, `/files?q=${q}&fields=${fields}&pageSize=100${pt}`);
    all.push(...(data.files || []));
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return all;
}

// ── Utils ──────────────────────────────────────────────────────────────────
export function parseFolderIdFromUrl(input) {
  const m = input.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) return trimmed;
  return null;
}

export function getMimeExt(mimeType, fileName) {
  if (fileName.includes('.')) return fileName.split('.').pop().toLowerCase();
  const map = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
    'image/webp': 'webp', 'image/svg+xml': 'svg',
    'application/vnd.google-apps.document': 'gdoc',
    'application/vnd.google-apps.spreadsheet': 'gsheet',
    'application/vnd.google-apps.presentation': 'gslide',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'application/zip': 'zip', 'text/plain': 'txt', 'text/markdown': 'md',
    'application/illustrator': 'ai',
  };
  return map[mimeType] || mimeType.split('/').pop();
}

export function formatDriveSize(bytes) {
  if (!bytes) return '—';
  const b = parseInt(bytes, 10);
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / (1024 * 1024)).toFixed(1) + ' MB';
}
