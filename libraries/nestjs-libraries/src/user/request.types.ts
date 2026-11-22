// What the auth middlewares put on the request. Never the password hash
export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
}

export interface AuthOrg {
  id: string;
  name: string;
}

export interface AuthApiKey {
  id: string;
  name: string;
  prefix: string;
}
