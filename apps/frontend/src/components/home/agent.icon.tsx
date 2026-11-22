import { CSSProperties, FC } from 'react';

// A brand mark from public/agents, painted in the current text colour (the
// SVG is used as a mask, so every mark matches the monochrome UI). Without
// one: the first letter on a tile. `cli` is drawn here, it isn't a brand
export const AgentIcon: FC<{
  name: string;
  icon?: string;
  // px, or any CSS length ("0.8em" follows the text around it)
  size?: number | string;
  className?: string;
}> = ({ name, icon, size = 20, className = '' }) => {
  const box = { width: size, height: size };
  if (icon === 'cli') {
    return (
      <svg
        viewBox="0 0 24 24"
        style={box}
        aria-hidden
        className={`shrink-0 ${className}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <rect x="2.5" y="4" width="19" height="16" rx="2" />
        <path d="M6.5 9l3 3-3 3M12 15h5" />
      </svg>
    );
  }
  if (!icon) {
    return (
      <span
        aria-hidden
        style={{
          ...box,
          fontSize: `calc(${
            typeof size === 'number' ? `${size}px` : size
          } * 0.6)`,
        }}
        className={`flex shrink-0 items-center justify-center rounded-control border border-current font-mono leading-none ${className}`}
      >
        {name[0]}
      </span>
    );
  }
  return (
    <MaskIcon src={`/agents/${icon}.svg`} size={size} className={className} />
  );
};

// Any single-colour SVG from public/, painted in the current text colour
export const MaskIcon: FC<{
  src: string;
  size?: number | string;
  className?: string;
}> = ({ src, size = 20, className = '' }) => {
  const mask = `url(${src}) center / contain no-repeat`;
  return (
    <span
      aria-hidden
      style={
        { width: size, height: size, mask, WebkitMask: mask } as CSSProperties
      }
      className={`inline-block shrink-0 bg-current ${className}`}
    />
  );
};
