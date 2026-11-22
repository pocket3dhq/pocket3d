# Security

Please report vulnerabilities privately, not in public issues: use GitHub's "Report a vulnerability" (Security tab) on this repository. Include what you found, how to reproduce it, and its impact. You'll get an answer within a few days.

What matters most here:
- Anything that lets someone publish without a valid API key, read a key, or use a revoked one.
- Anything that lets one account see, change or delete another account's models or keys, or sign in as someone else (sessions, activation and reset links).
- Uploads that store something other than a .glb or a PNG/JPEG/WebP image, or escape the upload directory.
- Script injection through a model title or file name on the viewer page.
- Guessing share links (ids are 12 crypto-random base62 characters).

Out of scope: rate limiting and denial of service on self-hosted instances.
