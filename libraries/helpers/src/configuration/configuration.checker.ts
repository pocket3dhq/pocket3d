// Prints what is missing or wrong in the environment when the backend boots,
// so a self-hoster sees an obvious list instead of a stack trace later
export class ConfigurationChecker {
  cfg: Record<string, string | undefined> = {};
  issues: string[] = [];

  readEnvFromProcess() {
    this.cfg = process.env;
  }

  check() {
    this.checkIsValidUrl('DATABASE_URL');
    this.checkIsValidUrl('MAIN_URL', 'Share links are MAIN_URL/m/<id>.');
    this.checkStorage();
    this.checkEmail();
  }

  checkStorage() {
    const provider = this.get('STORAGE_PROVIDER');
    if (!provider || provider === 'local') {
      this.checkNonEmpty('UPLOAD_DIRECTORY', 'Needed for STORAGE_PROVIDER="local".');
      return;
    }
    if (provider === 'cloudflare') {
      for (const key of [
        'CLOUDFLARE_ACCOUNT_ID',
        'CLOUDFLARE_ACCESS_KEY',
        'CLOUDFLARE_SECRET_ACCESS_KEY',
        'CLOUDFLARE_BUCKETNAME',
      ]) {
        this.checkNonEmpty(key, 'Needed for STORAGE_PROVIDER="cloudflare".');
      }
      this.checkIsValidUrl('CLOUDFLARE_BUCKET_URL', 'The public URL of the bucket.');
      return;
    }
    this.issues.push(`STORAGE_PROVIDER must be "local" or "cloudflare", got "${provider}".`);
  }

  // Optional: with RESEND_API_KEY, signup needs email activation and password
  // reset works; it then needs a sender
  checkEmail() {
    if (!this.get('RESEND_API_KEY')) {
      return;
    }
    this.checkNonEmpty('EMAIL_FROM_ADDRESS', 'Needed with RESEND_API_KEY (a sender on a domain verified in Resend).');
    this.checkNonEmpty('EMAIL_FROM_NAME', 'Needed with RESEND_API_KEY (the sender name, e.g. "pocket3d").');
  }

  checkNonEmpty(key: string, description = ''): boolean {
    const v = this.get(key);
    if (!v || v.length === 0) {
      this.issues.push(`${key} not set. ${description}`.trim());
      return false;
    }
    return true;
  }

  checkIsValidUrl(key: string, description = '') {
    if (!this.checkNonEmpty(key, description)) {
      return;
    }
    try {
      new URL(this.get(key)!);
    } catch {
      this.issues.push(`${key} is not a valid URL. ${description}`.trim());
    }
  }

  get(key: string): string | undefined {
    return this.cfg[key];
  }

  hasIssues() {
    return this.issues.length > 0;
  }

  getIssues() {
    return this.issues;
  }

  getIssuesCount() {
    return this.issues.length;
  }
}
