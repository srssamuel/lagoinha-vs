import React from 'react';
import { Headphones, Mic, Disc, Layers, Music, Sliders, Sparkles, Guitar } from 'lucide-react';
import { StemType } from '../../../domain/entities/TrackStem';

export const STEM_ICONS: Record<StemType, React.ReactNode> = {
  click: <Headphones className="w-3.5 h-3.5 text-blue-400" />,
  guide: <Mic className="w-3.5 h-3.5 text-amber-400" />,
  drums: <Disc className="w-3.5 h-3.5 text-rose-400" />,
  loop: <Disc className="w-3.5 h-3.5 text-orange-400" />,
  bass: <Layers className="w-3.5 h-3.5 text-emerald-400" />,
  violao: <Guitar className="w-3.5 h-3.5 text-amber-300" />,
  guitars: <Guitar className="w-3.5 h-3.5 text-cyan-400" />,
  strings: <Music className="w-3.5 h-3.5 text-teal-300" />,
  keys: <Sliders className="w-3.5 h-3.5 text-purple-400" />,
  pad: <Sparkles className="w-3.5 h-3.5 text-indigo-400" />,
  vocals: <Mic className="w-3.5 h-3.5 text-pink-400" />,
  fx: <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
};
