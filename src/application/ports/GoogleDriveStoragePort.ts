import { GoogleDriveConfig } from '../../domain/entities/GoogleDriveConfig';
import { CloudSong } from '../../domain/entities/CloudSong';

export interface GoogleDriveStoragePort {
  saveConfig(config: GoogleDriveConfig): Promise<void>;
  getConfig(): Promise<GoogleDriveConfig | null>;
  syncDriveFolder(folderIdOrUrl: string): Promise<CloudSong[]>;
  downloadDriveStem(fileId: string, downloadUrl?: string): Promise<ArrayBuffer>;
  uploadStemToDrive(folderId: string, file: File): Promise<string>;
}
