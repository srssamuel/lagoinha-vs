export type MidiActionId =
  | 'play-pause'
  | 'next-song'
  | 'prev-song'
  | 'next-sec'
  | 'prev-sec'
  | 'loop-sec'
  | 'solo-click'
  | 'tap-tempo'
  | 'panic';

export interface MidiBinding {
  actionId: MidiActionId;
  actionName: string;
  defaultKey: string;
  currentKey: string;
  midiType: 'CC' | 'NOTE' | 'PC';
  midiNumber: number; // CC number or Note number
  midiChannel?: number; // 1-16 or undefined (any)
  description: string;
}

export interface MidiDeviceStatus {
  isSupported: boolean;
  isConnected: boolean;
  deviceNames: string[];
  lastMessage: string | null;
}

const STORAGE_KEY = 'lagoinha_vs_midi_bindings';

export class WebMidiHardwareService {
  private static instance: WebMidiHardwareService | null = null;
  private midiAccess: MIDIAccess | null = null;
  private actionHandlers: Map<MidiActionId, () => void> = new Map();
  private statusListeners: Set<(status: MidiDeviceStatus) => void> = new Set();
  private learningActionId: MidiActionId | null = null;

  private bindings: MidiBinding[] = [
    {
      actionId: 'play-pause',
      actionName: 'Play / Pausar Música',
      defaultKey: 'Espaço',
      currentKey: 'Espaço',
      midiType: 'CC',
      midiNumber: 64, // Sustain Pedal CC 64
      description: 'Pedal Sustain ou Switch 1'
    },
    {
      actionId: 'next-sec',
      actionName: 'Próxima Seção (Downbeat Jump)',
      defaultKey: 'N',
      currentKey: 'N',
      midiType: 'CC',
      midiNumber: 21,
      description: 'Pedal Switch 2'
    },
    {
      actionId: 'prev-sec',
      actionName: 'Seção Anterior',
      defaultKey: 'P',
      currentKey: 'P',
      midiType: 'CC',
      midiNumber: 22,
      description: 'Pedal Switch 3'
    },
    {
      actionId: 'loop-sec',
      actionName: 'Repetir Seção Atual (Loop)',
      defaultKey: 'R',
      currentKey: 'R',
      midiType: 'CC',
      midiNumber: 23,
      description: 'Pedal Switch 4'
    },
    {
      actionId: 'solo-click',
      actionName: 'Solo Click (Modo Resgate no Fone)',
      defaultKey: 'C',
      currentKey: 'C',
      midiType: 'CC',
      midiNumber: 24,
      description: 'Pedal Switch 5'
    },
    {
      actionId: 'tap-tempo',
      actionName: 'Tap Tempo (Ajuste de BPM)',
      defaultKey: 'T',
      currentKey: 'T',
      midiType: 'CC',
      midiNumber: 25,
      description: 'Pedal Switch 6'
    },
    {
      actionId: 'next-song',
      actionName: 'Próxima Música do Culto',
      defaultKey: 'Shift + N',
      currentKey: 'Shift+N',
      midiType: 'CC',
      midiNumber: 26,
      description: 'Pedal Bank Up'
    },
    {
      actionId: 'prev-song',
      actionName: 'Música Anterior do Culto',
      defaultKey: 'Shift + P',
      currentKey: 'Shift+P',
      midiType: 'CC',
      midiNumber: 27,
      description: 'Pedal Bank Down'
    },
    {
      actionId: 'panic',
      actionName: 'Pânico / Fade Out de Emergência',
      defaultKey: 'ESC',
      currentKey: 'ESC',
      midiType: 'CC',
      midiNumber: 28,
      description: 'Pânico Geral (Corta PA)'
    }
  ];

  private lastMessage: string | null = null;

  public static getInstance(): WebMidiHardwareService {
    if (!this.instance) {
      this.instance = new WebMidiHardwareService();
      this.instance.loadSavedBindings();
    }
    return this.instance;
  }

  private constructor() {
    // Inicialização atrasada no init()
  }

  public async init(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !('requestMIDIAccess' in navigator)) {
      this.notifyStatus();
      return false;
    }

    try {
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      this.bindInputs();
      this.midiAccess.onstatechange = () => {
        this.bindInputs();
        this.notifyStatus();
      };
      this.notifyStatus();
      return true;
    } catch (err) {
      console.warn('Web MIDI Access não concedido ou indisponível:', err);
      this.notifyStatus();
      return false;
    }
  }

  private bindInputs(): void {
    if (!this.midiAccess) return;
    const inputs = this.midiAccess.inputs.values();
    for (const input of inputs) {
      input.onmidimessage = (msg) => this.handleMidiMessage(msg);
    }
  }

  private handleMidiMessage(event: MIDIMessageEvent): void {
    const data = event.data;
    if (!data || data.length < 2) return;

    const statusByte = data[0]!;
    const messageType = statusByte >> 4;
    const channel = (statusByte & 0x0f) + 1;
    const param1 = data[1]!;
    const param2 = data.length > 2 ? data[2]! : 0;

    let type: 'CC' | 'NOTE' | 'PC' | null = null;
    let number = param1;

    // Control Change (0xB)
    if (messageType === 0x0b) {
      type = 'CC';
      number = param1;
      // Trata botões de pedal momentâneo (só dispara em valor > 0 ou toggle)
      if (param2 === 0 && !this.learningActionId) {
        return;
      }
      this.lastMessage = `CC ${number} (Val ${param2}) Ch ${channel}`;
    }
    // Note On (0x9) com velocity > 0
    else if (messageType === 0x09 && param2 > 0) {
      type = 'NOTE';
      number = param1;
      this.lastMessage = `Note On ${number} (Vel ${param2}) Ch ${channel}`;
    }
    // Program Change (0xC)
    else if (messageType === 0x0c) {
      type = 'PC';
      number = param1;
      this.lastMessage = `PC ${number} Ch ${channel}`;
    }

    this.notifyStatus();

    // Modo MIDI Learn ativo
    if (this.learningActionId && type) {
      this.bindActionToMidi(this.learningActionId, type, number, channel);
      this.learningActionId = null;
      return;
    }

    // Execução de ação mapeada
    if (type) {
      const match = this.bindings.find(
        (b) =>
          b.midiType === type &&
          b.midiNumber === number &&
          (b.midiChannel === undefined || b.midiChannel === channel)
      );

      if (match) {
        const handler = this.actionHandlers.get(match.actionId);
        if (handler) {
          handler();
        }
      }
    }
  }

  public registerActionHandler(actionId: MidiActionId, handler: () => void): () => void {
    this.actionHandlers.set(actionId, handler);
    return () => {
      this.actionHandlers.delete(actionId);
    };
  }

  public startLearning(actionId: MidiActionId): void {
    this.learningActionId = actionId;
    this.notifyStatus();
  }

  public cancelLearning(): void {
    this.learningActionId = null;
    this.notifyStatus();
  }

  public getLearningActionId(): MidiActionId | null {
    return this.learningActionId;
  }

  public bindActionToMidi(
    actionId: MidiActionId,
    type: 'CC' | 'NOTE' | 'PC',
    number: number,
    channel?: number
  ): void {
    const item = this.bindings.find((b) => b.actionId === actionId);
    if (item) {
      item.midiType = type;
      item.midiNumber = number;
      item.midiChannel = channel;
      item.description = `${type} ${number}${channel ? ` (Ch ${channel})` : ''}`;
      this.saveBindings();
      this.notifyStatus();
    }
  }

  public getBindings(): MidiBinding[] {
    return [...this.bindings];
  }

  public resetDefaultBindings(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.loadSavedBindings();
    this.notifyStatus();
  }

  private saveBindings(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.bindings));
    } catch {
      // Ignora falha de storage
    }
  }

  private loadSavedBindings(): void {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as MidiBinding[];
        if (Array.isArray(parsed)) {
          this.bindings = parsed;
        }
      }
    } catch {
      // Ignora falha de storage
    }
  }

  public getStatus(): MidiDeviceStatus {
    const isSupported = typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
    const deviceNames: string[] = [];
    if (this.midiAccess) {
      for (const input of this.midiAccess.inputs.values()) {
        if (input.name) {
          deviceNames.push(input.name);
        }
      }
    }
    return {
      isSupported,
      isConnected: deviceNames.length > 0,
      deviceNames,
      lastMessage: this.lastMessage
    };
  }

  public subscribeStatus(listener: (status: MidiDeviceStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.getStatus());
    return () => this.statusListeners.delete(listener);
  }

  private notifyStatus(): void {
    const status = this.getStatus();
    this.statusListeners.forEach((l) => l(status));
  }
}
