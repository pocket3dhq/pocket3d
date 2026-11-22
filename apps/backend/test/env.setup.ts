import { TEST_DATABASE_URL, TEST_UPLOAD_DIRECTORY } from './test.env';

// Before any app module is imported
process.env.TZ = 'UTC';
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.MAIN_URL = 'http://localhost:4200';
process.env.STORAGE_PROVIDER = 'local';
process.env.UPLOAD_DIRECTORY = TEST_UPLOAD_DIRECTORY;
delete process.env.RESEND_API_KEY;
delete process.env.DISABLE_REGISTRATION;
