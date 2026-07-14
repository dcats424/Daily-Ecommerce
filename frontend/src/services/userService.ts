import api from "./api";

export type Role = "USER" | "STAFF" | "ADMIN" | "SUPERADMIN";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  createdBy?: string | null;
  createdAt?: string;
}

export interface AuditLog {
  id: string;
  actorId: string;
  targetId: string;
  action: string;
  metadata?: any;
  createdAt: string;
  actor: { email: string; role: string };
  target: { email: string; role: string };
}

export async function getUsers(): Promise<User[]> {
  const res = await api.get("/v1/user");
  return res.data;
}

export async function createUser(data: {
  email: string;
  name: string;
  role: string;
}): Promise<User> {
  const res = await api.post("/v1/user", data);
  return res.data;
}

export async function updateUser(
  id: string,
  data: { name?: string; role?: string; isActive?: boolean },
): Promise<User> {
  const res = await api.patch(`/v1/user/${id}`, data);
  return res.data;
}

export async function deleteUser(id: string): Promise<void> {
  await api.delete(`/v1/user/${id}`);
}

export async function getAuditLogs(): Promise<AuditLog[]> {
  const res = await api.get("/v1/user/audit");
  return res.data;
}
