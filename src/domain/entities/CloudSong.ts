import { TimeSignature } from './Song';

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
  }
}
