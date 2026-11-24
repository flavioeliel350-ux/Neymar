import React, { useEffect, useState } from 'react';
import {
  Coffee,
  CupSoda,
  Sparkles,
  Snowflake,
  Croissant,
  Package,
} from 'lucide-react';
import { Category } from '../types/product';

interface ProductVisualProps {
  category: Category;
  weightLabel?: string;
  imageUrl?: string;
  alt?: string;
  size?: 'sm' | 'md' | 'lg';
}

const CATEGORY_STYLES: Record<
  Category,
  { bg: string; iconColor: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  Mercearia: {
    bg: 'bg-[#eaedff]',
    iconColor: 'text-[#004ac6]',
    Icon: Coffee,
  },
  Bebidas: {
    bg: 'bg-[#e0f2fe]',
    iconColor: 'text-[#0369a1]',
    Icon: CupSoda,
  },
  Limpeza: {
    bg: 'bg-[#ccfbf1]',
    iconColor: 'text-[#006058]',
    Icon: Sparkles,
  },
  Frios: {
    bg: 'bg-[#e2e7ff]',
    iconColor: 'text-[#3730a3]',
    Icon: Snowflake,
  },
  Padaria: {
    bg: 'bg-[#fef3c7]',
    iconColor: 'text-[#b45309]',
    Icon: Croissant,
  },
  Outros: {
    bg: 'bg-[#f2f3ff]',
    iconColor: 'text-[#434655]',
    Icon: Package,
  },
};

export function ProductVisual({
  category,
  weightLabel,
  imageUrl,
  alt = 'Produto',
  size = 'md',
}: ProductVisualProps) {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [imageUrl]);

  const style = CATEGORY_STYLES[category] || CATEGORY_STYLES.Outros;
  const Icon = style.Icon;

  const boxSize =
    size === 'sm'
      ? 'w-10 h-10 rounded-lg'
      : size === 'lg'
        ? 'w-20 h-20 rounded-xl'
        : 'w-12 h-12 rounded-xl';

  const iconSize =
    size === 'sm' ? 'w-5 h-5' : size === 'lg' ? 'w-9 h-9' : 'w-6 h-6';

  const showImage = Boolean(imageUrl && !imgFailed);

  return (
    <div
      className={`relative flex items-center justify-center shrink-0 overflow-hidden ${boxSize} ${
        showImage ? 'bg-white border border-[#e2e7ff]' : style.bg
      }`}
    >
      {showImage ? (
        <img
          src={imageUrl}
          alt={alt}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="w-full h-full object-contain p-1"
        />
      ) : (
        <Icon className={`${iconSize} ${style.iconColor}`} />
      )}
      {size === 'lg' && weightLabel ? (
        <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-[#131b2e]/85 text-white text-[10px] font-bold tracking-tight uppercase">
          {weightLabel}
        </span>
      ) : null}
    </div>
  );
}
