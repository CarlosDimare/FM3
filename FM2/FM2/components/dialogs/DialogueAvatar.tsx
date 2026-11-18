import React from 'react';
import { User } from 'lucide-react';

export type AvatarPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

interface DialogueAvatarProps {
  clubColor: string;
  cargo: string;
  badge?: boolean;
  onClick: () => void;
  position?: AvatarPosition;
  className?: string;
}

const positionClasses: Record<AvatarPosition, string> = {
  'bottom-right': 'fixed bottom-4 right-4 z-[100]',
  'bottom-left': 'fixed bottom-4 left-4 z-[100]',
  'top-right': 'fixed top-4 right-4 z-[100]',
  'top-left': 'fixed top-4 left-4 z-[100]',
};

export const DialogueAvatar: React.FC<DialogueAvatarProps> = ({
  clubColor, cargo, badge = false, onClick, position = 'bottom-right', className,
}) => {
  return (
    <div className={`${className || positionClasses[position]} flex flex-col items-center gap-1`}>
      {badge && (
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
        </span>
      )}
      <button
        onClick={onClick}
        aria-label={`Hablar con ${cargo}`}
        className={`w-10 h-10 rounded-full flex items-center justify-center text-white shadow-lg border-2 border-white hover:scale-110 transition-transform ${clubColor}`}
        title={cargo}
      >
        <User size={20} />
      </button>
    </div>
  );
};
