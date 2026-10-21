import { TimeSignature } from './Song';
import { LicenseRef, RightsClass } from '../services/AccessPolicy';

export interface CloudStemInfo {
  id: string;
  name: string;
  type: string;
  fileSizeMb: number;
  downloadUrl?: string;
}

export interface CloudSongProps {
  id: string;
  title: string;
  artist: string;
  originalKey: string;
  bpm: number;
  timeSignature: TimeSignature;
  duration: number; // in seconds
  stemsCount: number;
  stems: CloudStemInfo[];
  tags: string[];
  uploadedBy: string;
  uploadedAt: string;
  storageFolder: string;
  source?: 'google_drive' | 'cloud_preset' | 'local_upload';
  driveFileId?: string;
  driveFolderId?: string;
  driveDownloadUrl?: string;
  /** Direito de distribuição; padrão `unknown` (só biblioteca da igreja, nunca catálogo global). */
  rightsClass?: RightsClass;
  licenseRef?: LicenseRef;
  /** Biblioteca online: pacote pronto para tocar ou pendente com motivo explícito. */
  status?: 'ready' | 'pending';
  pendingReason?: string;
  currentVersionId?: string;
  kind?: 'song' | 'pad';
}

export class CloudSong {
  public readonly id: string;
  public readonly title: string;
  public readonly artist: string;
  public readonly originalKey: string;
  public readonly bpm: number;
  public readonly timeSignature: TimeSignature;
  public readonly duration: number;
  public readonly stemsCount: number;
  public readonly stems: CloudStemInfo[];
  public readonly tags: string[];
  public readonly uploadedBy: string;
  public readonly uploadedAt: string;
  public readonly storageFolder: string;
  public readonly source: 'google_drive' | 'cloud_preset' | 'local_upload';
  public readonly driveFileId?: string;
  public readonly driveFolderId?: string;
  public readonly driveDownloadUrl?: string;
  public readonly rightsClass: RightsClass;
  public readonly licenseRef?: LicenseRef;
  public readonly status: 'ready' | 'pending';
  public readonly pendingReason?: string;
  public readonly currentVersionId?: string;
  public readonly kind: 'song' | 'pad';

  constructor(props: CloudSongProps) {
    this.id = props.id;
    this.title = props.title;
    this.artist = props.artist;
    this.originalKey = props.originalKey;
    this.bpm = props.bpm;
    this.timeSignature = props.timeSignature;
    this.duration = props.duration;
    this.stemsCount = props.stemsCount;
    this.stems = props.stems;
    this.tags = props.tags;
    this.uploadedBy = props.uploadedBy;
    this.uploadedAt = props.uploadedAt;
    this.storageFolder = props.storageFolder;
    this.source = props.source || 'cloud_preset';
    this.driveFileId = props.driveFileId;
    this.driveFolderId = props.driveFolderId;
    this.driveDownloadUrl = props.driveDownloadUrl;
    this.rightsClass = props.rightsClass ?? 'unknown';
    this.licenseRef = props.licenseRef;
    this.status = props.status ?? 'ready';
    this.pendingReason = props.pendingReason;
    this.currentVersionId = props.currentVersionId;
    this.kind = props.kind ?? 'song';
  }
}
