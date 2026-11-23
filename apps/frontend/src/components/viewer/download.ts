// Downloading a model's .glb from the viewer (when its owner allows it) and
// from the dashboard (always, for the owner), and the counts shown next to it

const FILE_NAME_MAX = 80;

// "My model.glb" from the title: no path separators, characters Windows
// refuses or control characters, so the name works on every system. A
// version that isn't the live one says which it is ("My model-v2.glb")
export const downloadFileName = (title: string, number: number, live: number | null) => {
  const base =
    title
      .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^[.\s]+/, '')
      .slice(0, FILE_NAME_MAX)
      .trim() || 'model';
  return `${base}${number === live ? '' : `-v${number}`}.glb`;
};

export const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 * 1024
    ? `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
    : bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

// 1234 → "1,234 views"
export const formatCount = (count: number, one: string, many: string) =>
  `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`;

// Saves the file under `name`. Files can live on another origin (the
// storage bucket's domain), where <a download> ignores the name, so it goes
// through a blob. The viewer has just loaded the same URL and files never
// change at their URL, so this normally comes from the browser cache. If
// the fetch fails, the browser opens the file itself (it still downloads,
// under the storage name)
export const downloadFile = async (url: string, name: string) => {
  const link = document.createElement('a');
  link.download = name;
  link.rel = 'noopener';
  let objectUrl: string | null = null;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status}`);
    objectUrl = URL.createObjectURL(await res.blob());
    link.href = objectUrl;
  } catch {
    link.href = url;
  }
  document.body.appendChild(link);
  link.click();
  link.remove();
  // the click has started the download; give slow browsers a moment
  if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl as string), 60_000);
};

// The share page's view and download counts. sendBeacon survives the page
// closing and needs no answer; the server answers 204 whatever happens
export const sendStat = (id: string, kind: 'views' | 'downloads') => {
  try {
    const url = `/api/public/assets/${encodeURIComponent(id)}/${kind}`;
    if (!navigator.sendBeacon?.(url)) {
      fetch(url, { method: 'POST', keepalive: true }).catch(() => {});
    }
  } catch {
    // counting must never break the viewer
  }
};

// One view per model per tab: reloading or stepping through versions
// doesn't count again. Storage can be blocked (private modes, embeds):
// then each load counts
export const firstViewInTab = (id: string) => {
  const key = `p3d_viewed_${id}`;
  try {
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, '1');
  } catch {
    // no storage: count it
  }
  return true;
};
