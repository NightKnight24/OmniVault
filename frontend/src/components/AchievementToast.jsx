import React, { useEffect } from 'react';
import { Trophy, Award, Sparkles, X } from 'lucide-react';
import { playAchievementSound } from '../utils/soundEffects';

export default function AchievementToast({ achievement, onClose, onViewDetails }) {
  useEffect(() => {
    if (achievement) {
      playAchievementSound(achievement.sound_style || 'playstation');
      const timer = setTimeout(() => {
        onClose();
      }, 4500);
      return () => clearTimeout(timer);
    }
  }, [achievement, onClose]);

  if (!achievement) return null;

  return (
    <div className="fixed top-6 right-6 z-50 max-w-sm w-full animate-in slide-in-from-top-4 duration-300 pointer-events-auto">
      <div className="p-4 rounded-2xl bg-[#090d18]/95 border border-cyan-400/50 shadow-glow-cyan backdrop-blur-xl flex items-center gap-3.5 relative overflow-hidden group">
        
        {/* Shimmer Background Beam */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-500/10 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />

        {/* Trophy Icon or Badge Image */}
        <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-amber-500 via-yellow-400 to-amber-600 p-0.5 flex-shrink-0 shadow-md">
          {achievement.badge ? (
            <img 
              src={achievement.badge} 
              alt={achievement.title} 
              className="w-full h-full object-cover rounded-[10px] bg-black"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          ) : (
            <div className="w-full h-full rounded-[10px] bg-slate-950 flex items-center justify-center">
              <Trophy className="w-6 h-6 text-amber-400" />
            </div>
          )}
        </div>

        {/* Text Details */}
        <div className="flex-1 min-w-0" onClick={onViewDetails}>
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1">
              <Award className="w-3 h-3" />
              Trophy Unlocked
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-700/50">
              +{achievement.points || 15} PTS
            </span>
          </div>
          <h4 className="font-bold text-xs md:text-sm text-white truncate">
            {achievement.title || 'Master Milestone'}
          </h4>
          <p className="text-[11px] text-slate-300 truncate">
            {achievement.description || 'Achieved a legendary gaming milestone!'}
          </p>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>

      </div>
    </div>
  );
}
