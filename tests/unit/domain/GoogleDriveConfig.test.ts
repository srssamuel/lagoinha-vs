import { describe, it, expect } from 'vitest';
import { GoogleDriveConfig } from '../../../src/domain/entities/GoogleDriveConfig';

describe('GoogleDriveConfig & URL Parser', () => {
  it('extracts folder ID from standard Google Drive URL', () => {
    const url = 'https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVwXyZ';
    const folderId = GoogleDriveConfig.extractFolderId(url);
    expect(folderId).toBe('1aBcDeFgHiJkLmNoPqRsTuVwXyZ');
  });

  it('extracts folder ID from Google Drive URL with user index and query params', () => {
    const url = 'https://drive.google.com/drive/u/1/folders/1ABC_XYZ-1234567890abcdef?usp=sharing';
    const folderId = GoogleDriveConfig.extractFolderId(url);
    expect(folderId).toBe('1ABC_XYZ-1234567890abcdef');
  });

  it('extracts folder ID from drive.google.com/open?id=...', () => {
    const url = 'https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUvWxYz';
    const folderId = GoogleDriveConfig.extractFolderId(url);
    expect(folderId).toBe('1AbCdEfGhIjKlMnOpQrStUvWxYz');
  });

  it('accepts raw folder ID directly without URL prefix', () => {
    const rawId = '1aBcDeFgHiJkLmNoPqRsTuVwXyZ123';
    const folderId = GoogleDriveConfig.extractFolderId(rawId);
    expect(folderId).toBe('1aBcDeFgHiJkLmNoPqRsTuVwXyZ123');
  });

  it('returns null for invalid or empty inputs', () => {
    expect(GoogleDriveConfig.extractFolderId('')).toBeNull();
    expect(GoogleDriveConfig.extractFolderId('https://google.com')).toBeNull();
    expect(GoogleDriveConfig.extractFolderId('curto')).toBeNull();
    expect(GoogleDriveConfig.extractFolderId('https://evil.example/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVwXyZ')).toBeNull();
    expect(GoogleDriveConfig.extractFolderId("1aBcDeFgHiJkLmNoPqRsTuVwXyZ' or '1")).toBeNull();
  });
});
