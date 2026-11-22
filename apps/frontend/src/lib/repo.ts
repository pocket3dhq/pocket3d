// Where pocket3d's source code lives: REPO_URL (a self-hoster's fork), else
// the public repository. Read at request time, so no rebuild is needed
export const PUBLIC_REPO_URL = 'https://github.com/pocket3dhq/pocket3d';

export const repoUrl = () => process.env.REPO_URL || PUBLIC_REPO_URL;
