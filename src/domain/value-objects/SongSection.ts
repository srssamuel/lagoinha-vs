export type SectionType =
  | 'intro'
  | 'verse'
  | 'pre-chorus'
  | 'chorus'
  | 'bridge'
  | 'vamp'
  | 'interlude'
  | 'outro';

export interface SongSectionProps {
  id: string;
  name: string;
  type: SectionType;
  startBar: number;
  barCount: number;
  startTime: number; // in seconds
  endTime: number;   // in seconds
}

export class SongSection {
  public readonly id: string;
  public readonly name: string;
  public readonly type: SectionType;
  public readonly startBar: number;
  public readonly barCount: number;
  public readonly startTime: number;
  public readonly endTime: number;

  constructor(props: SongSectionProps) {
    if (props.endTime <= props.startTime) {
      throw new Error(`Section "${props.name}" must have endTime > startTime.`);
    }
    this.id = props.id;
    this.name = props.name;
    this.type = props.type;
    this.startBar = props.startBar;
    this.barCount = props.barCount;
    this.startTime = props.startTime;
    this.endTime = props.endTime;
  }

  public containsTime(time: number): boolean {
    return time >= this.startTime && time < this.endTime;
  }

  public get duration(): number {
    return this.endTime - this.startTime;
  }
}
