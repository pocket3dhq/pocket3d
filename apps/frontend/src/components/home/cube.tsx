import { CSSProperties } from 'react';

// A spinning wireframe cube in pure CSS (styles in global.scss): the "3D model"
// of the home page illustrations, without loading three.js there
export function Cube({ size = 56 }: { size?: number }) {
  return (
    <div className="p3d-cube-wrap">
      <div className="p3d-cube" style={{ '--s': `${size}px` } as CSSProperties}>
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}
