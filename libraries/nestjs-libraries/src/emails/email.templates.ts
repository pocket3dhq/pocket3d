const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const layout = (title: string, body: string, link: string, action: string) => `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5;color:#111">
<h2 style="margin:0 0 12px">${escapeHtml(title)}</h2>
<p>${body}</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#8b5cf6;color:#fff;text-decoration:none">${escapeHtml(action)}</a></p>
<p style="color:#666;font-size:13px">Or open this link: ${escapeHtml(link)}</p>
<p style="color:#666;font-size:13px">If you didn't ask for this, ignore this email.</p>
</body></html>`;

export const activationEmail = (link: string) => ({
  subject: 'Activate your pocket3d account',
  html: layout('Welcome to pocket3d', 'Confirm your email to start publishing 3D models. The link works for 48 hours.', link, 'Activate my account'),
});

export const resetEmail = (link: string) => ({
  subject: 'Reset your pocket3d password',
  html: layout('Reset your password', 'Someone asked to reset the password of your pocket3d account. The link works for 30 minutes, once.', link, 'Choose a new password'),
});
