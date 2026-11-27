import {
  ancestors,
  DEFAULT_MESH_VIEW,
  expandedNodes,
  filterNodes,
  formatCount,
  hideTarget,
  isDefaultMeshView,
  isHidden,
  isolate,
  MeshNode,
  parsePartId,
  partId,
  shownTriangles,
  showsWire,
  toggleHidden,
} from './mesh.settings';
import { summarize } from './mesh.stats';

const node = (id: string, name: string, kind: MeshNode['kind'], triangles = 0): MeshNode => {
  const parts = id.split('/');
  const stats = summarize([]);
  stats.triangles = triangles;
  return {
    id,
    name,
    depth: parts.length - 1,
    parent: parts.length > 1 ? parts.slice(0, -1).join('/') : null,
    kind,
    hasChildren: false,
    stats,
  };
};

// car (body, wheels (front, back)), ground
const TREE = [
  node('0', 'Car', 'group', 30),
  node('0/0', 'Body', 'mesh', 10),
  node('0/1', 'Wheels', 'group', 20),
  node('0/1/0', 'Front wheel', 'mesh', 10),
  node('0/1/1', 'Back wheel', 'mesh', 10),
  node('1', 'Ground', 'mesh', 2),
  // a mesh in two material parts
  node('2', 'Sign', 'mesh', 6),
  node('2/~0', 'Paint', 'part', 4),
  node('2/~1', 'Metal', 'part', 2),
];

describe('mesh settings', () => {
  it('starts with nothing on', () => {
    expect(isDefaultMeshView(DEFAULT_MESH_VIEW)).toBe(true);
    expect(isDefaultMeshView({ ...DEFAULT_MESH_VIEW, bounds: 'model' })).toBe(false);
    expect(isDefaultMeshView({ ...DEFAULT_MESH_VIEW, surface: 'solid' })).toBe(false);
    expect(showsWire(DEFAULT_MESH_VIEW)).toBe(false);
    expect(showsWire({ ...DEFAULT_MESH_VIEW, surface: 'off' })).toBe(true);
  });

  it('formats counts short', () => {
    expect(formatCount(999)).toBe('999');
    expect(formatCount(12_400)).toBe('12.4k');
    expect(formatCount(1_000)).toBe('1k');
    expect(formatCount(124_000)).toBe('124k');
    expect(formatCount(1_240_000)).toBe('1.24M');
  });

  it('reads the tree from ids', () => {
    expect(ancestors('0/1/1')).toEqual(['0', '0/1']);
    expect(isHidden('0/1/1', ['0/1'])).toBe(true);
    expect(isHidden('0/10', ['0/1'])).toBe(false);
  });

  it('isolates a part with the fewest hidden ids', () => {
    expect(isolate(TREE, '0/1/0').sort()).toEqual(['0/0', '0/1/1', '1', '2']);
    expect(isolate(TREE, '1')).toEqual(['0', '2']);
    // a group keeps its own contents
    expect(isolate(TREE, '0/1').sort()).toEqual(['0/0', '1', '2']);
    // a part isolates its mesh
    expect(isolate(TREE, '2/~1').sort()).toEqual(['0', '1']);
  });

  it('shows a part inside a hidden parent by hiding its siblings instead', () => {
    expect(toggleHidden(TREE, [], '0/1')).toEqual(['0/1']);
    expect(toggleHidden(TREE, ['0/1'], '0/1')).toEqual([]);
    // hiding a parent drops the hidden ids inside it
    expect(toggleHidden(TREE, ['0/1/0'], '0')).toEqual(['0']);
    expect(toggleHidden(TREE, ['0'], '0/1/0').sort()).toEqual(['0/0', '0/1/1']);
    // a part hides its mesh
    expect(toggleHidden(TREE, [], '2/~0')).toEqual(['2']);
    expect(toggleHidden(TREE, ['2'], '2/~0')).toEqual([]);
  });

  it('counts the triangles on screen once', () => {
    expect(shownTriangles(TREE, [])).toBe(38);
    expect(shownTriangles(TREE, ['0/1'])).toBe(18);
    expect(shownTriangles(TREE, ['2'])).toBe(32);
  });

  it('names parts by their mesh and group', () => {
    expect(partId('0/2', 1)).toBe('0/2/~1');
    expect(parsePartId('0/2/~1')).toEqual({ mesh: '0/2', group: 1 });
    expect(parsePartId('0/2/1')).toBeNull();
    expect(hideTarget('0/2/~1')).toBe('0/2');
    expect(hideTarget('0/2')).toBe('0/2');
  });

  it('filters by name and collapses', () => {
    expect(filterNodes(TREE, 'back').map((n) => n.id)).toEqual(['0', '0/1', '0/1/1']);
    expect(expandedNodes(TREE, new Set(['0/1', '2'])).map((n) => n.id)).toEqual(['0', '0/0', '0/1', '1', '2']);
  });
});
